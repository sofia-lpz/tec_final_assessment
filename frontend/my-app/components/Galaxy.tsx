"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SolarSystem, {
  SolarSystemHandle,
  PlanetDef,
} from "@/components/SolarSystem";
import type { PlanetState } from "@/components/Planet";
import {
  startSimulation,
  stopSimulation,
  onSimulationMessage,
  closeSimulationSocket,
} from "@/utils/dataProvider";
// ── Config ───────────────────────────────────────────────────
const START_CONFIG: Record<string, unknown> = {
  // Match the test client's defaults; tweak later as needed.
};
// Initial milliseconds between simulation steps during playback.
const DEFAULT_STEP_MS = 1000;
// Min/max playback rates (used by the slider).
const MIN_STEP_MS = 50;
const MAX_STEP_MS = 2000;
// Minimum buffered steps before the Play button is enabled.
// Gives the buffer a head start so playback doesn't immediately stall.
const MIN_BUFFER_TO_PLAY = 200;
// Palette assigned to civilizations in the order they arrive.
const CIV_PALETTE = [
  "#22c55e", // green
  "#06b6d4", // cyan
  "#a855f7", // magenta/purple
  "#eab308", // yellow
  "#ef4444", // red
  "#3b82f6", // blue
];
// ── Server message types ─────────────────────────────────────
type ServerPlanet = {
  coord: [number, number]; // [row, col]
  resources: number;
  owner: string | null;
  destroyed: boolean;
};
type ServerCiv = {
  name: string;
  alive: boolean;
  home_coord: [number, number];
  owned_planets: [number, number][]; // each [row, col]
  explored_cells?: [number, number][]; // each [row, col]
};
type ServerAction = {
  id: number;
  type: "explore" | "broadcast" | "colonize_empty" | "destroy_planet" | "colonize_inhabited";
  target: [number, number] | null;
};
type StartedMsg = {
  type: "started";
  config: { run_name?: string; names?: string[]; width?: number; height?: number };
  grid: { width: number; height: number };
  agents: string[];
};
type StepMsg = {
  type: "step";
  iteration: number;
  step: number;
  grid: { width: number; height: number };
  agents: string[];
  planets: ServerPlanet[];
  civilizations: ServerCiv[];
  actions?: Record<string, ServerAction>;
  episode_done: boolean;
};
type ServerMsg =
  | StartedMsg
  | StepMsg
  | { type: "iteration"; [k: string]: unknown }
  | { type: "episode"; [k: string]: unknown }
  | { type: "done"; [k: string]: unknown }
  | { type: "stopped"; [k: string]: unknown }
  | { type: "stopping"; [k: string]: unknown }
  | { type: "error"; message: string };
// ── Helpers ──────────────────────────────────────────────────
// Server reports coords as [row, col]; SolarSystem grids are [col, row].
function coordToGrid([r, c]: [number, number]): [number, number] {
  return [c, r];
}
function coordKey(r: number, c: number) {
  return `${r},${c}`;
}
/**
 * Compute the visual state for a planet at a given simulation step.
 *
 * Priority (highest first):
 *   - "transmitting"  — owner broadcast this step (active action)
 *   - "scienceplus"   — owner explored this step (research pulse)
 *   - "none"
 */
function planetStateFor(
  planet: ServerPlanet,
  step: StepMsg | null,
  broadcasters: Set<string>,
  explorers: Set<string>
): PlanetState {
  if (!step) return "none";
  if (planet.owner && broadcasters.has(planet.owner)) return "transmitting";
  if (planet.owner && explorers.has(planet.owner)) return "scienceplus";
  return "none";
}
// ── Galaxy ───────────────────────────────────────────────────
export default function Galaxy() {
  const solarRef = useRef<SolarSystemHandle>(null);
  const [grid, setGrid] = useState<{ width: number; height: number } | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  // Snapshot of all planet *positions*, captured once from the first step.
  // Positions don't change during a run, so we lock them in for a stable layout.
  const [initialPlanets, setInitialPlanets] = useState<ServerPlanet[] | null>(null);
  // The step currently being displayed (playback head).
  const [currentStep, setCurrentStep] = useState<StepMsg | null>(null);
  const [status, setStatus] = useState<string>("Connecting…");
  // Step playback buffer + playback rate (mutable via the slider).
  const stepBuffer = useRef<StepMsg[]>([]);
  const [stepMs, setStepMs] = useState<number>(DEFAULT_STEP_MS);
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  // Playback gate — false until the user clicks Play.
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // Per-civilization color, derived from the agents list order.
  const civColors = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    agents.forEach((name, i) => {
      m[name] = CIV_PALETTE[i % CIV_PALETTE.length];
    });
    return m;
  }, [agents]);
  // ── Simulation subscription via dataProvider ───────────────
  // We no longer own a WebSocket directly. dataProvider keeps a singleton
  // socket; we just subscribe to messages and tell it to start/stop the run.
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onSimulationMessage((payload) => {
      // dataProvider already parses JSON for us — `payload` is the object,
      // or a raw string for non-JSON frames (which we ignore).
      if (!payload || typeof payload !== "object") return;
      const msg = payload as ServerMsg;
      switch (msg.type) {
        case "started": {
          // A new run is beginning — could be the first one, or a restart
          // triggered from PPOControls. Wipe everything tied to the old run
          // so the loading overlay reappears and the next "step" messages
          // populate a fresh layout.
          stepBuffer.current = [];
          setBufferedCount(0);
          setInitialPlanets(null);
          setCurrentStep(null);
          setIsPlaying(false);
          if (msg.grid) setGrid(msg.grid);
          if (msg.agents) setAgents(msg.agents);
          setStatus(`Started · grid ${msg.grid.width}×${msg.grid.height}`);
          break;
        }
        case "step": {
          // Capture grid + agents in case "started" was missed.
          if (msg.grid) setGrid((g) => g ?? msg.grid);
          if (msg.agents && msg.agents.length) {
            setAgents((a) => (a.length ? a : msg.agents));
          }
          // Lock in the planet layout from the first step we see.
          setInitialPlanets((prev) => prev ?? msg.planets);
          // Buffer the step for playback — DO NOT display immediately.
          stepBuffer.current.push(msg);
          setBufferedCount(stepBuffer.current.length);
          break;
        }
        case "error":
          setStatus(`Error: ${(msg as { message: string }).message}`);
          break;
        case "done":
          setStatus("Simulation complete.");
          break;
        case "stopped":
          // Restart is in progress (or user-initiated stop). Pause playback;
          // the next "started" message will reset state and reopen the
          // loading overlay for the new run.
          setIsPlaying(false);
          setStatus("Simulation stopped. Restarting…");
          break;
        default:
          break;
      }
    });

    // Kick off the run. startSimulation opens the socket on first use,
    // then sends {cmd: "start", config}. Errors here are connection /
    // auth / timeout failures from dataProvider.
    setStatus("Connecting…");
    startSimulation(START_CONFIG)
      .then(() => {
        if (!cancelled) setStatus("Connected. Starting simulation…");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`WebSocket error: ${message}`);
      });

    return () => {
      cancelled = true;
      unsubscribe();
      // Best-effort graceful stop, then drop the singleton socket so the
      // next mount opens a fresh one (important under React StrictMode).
      stopSimulation().catch(() => {
        /* socket may already be gone; nothing to do */
      });
      closeSimulationSocket();
    };
  }, []);
  // ── Playback loop: advance one buffered step per tick ──────
  // Only runs while isPlaying is true; user must click Play to start.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const next = stepBuffer.current.shift();
      if (!next) return;
      setCurrentStep(next);
      setBufferedCount(stepBuffer.current.length);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [stepMs, isPlaying]);
  // ── Derived: who is broadcasting on the displayed step ─────
  const broadcasters = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    if (!currentStep?.actions) return s;
    for (const [name, action] of Object.entries(currentStep.actions)) {
      if (action?.type === "broadcast") s.add(name);
    }
    return s;
  }, [currentStep]);
  // ── Derived: who explored this step ────────────────────────
  // Mirrors `broadcasters`: build a set of civ names whose action this
  // step was "explore". Their owned planets get the scienceplus pulse.
  const explorers = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    if (!currentStep?.actions) return s;
    for (const [name, action] of Object.entries(currentStep.actions)) {
      if (action?.type === "explore") s.add(name);
    }
    return s;
  }, [currentStep]);
  // ── Iteration boundary: refresh planet layout ──────────────
  // Within an iteration, planet positions are static — we lock them into
  // `initialPlanets` so `planetDefs` can look up live owner/state by
  // coord without flicker. But across iterations the env respawns planets
  // at new coordinates. When the *displayed* iteration changes, swap in
  // the new step's planets as the locked layout.
  useEffect(() => {
    if (currentStep) setInitialPlanets(currentStep.planets);
  }, [currentStep?.iteration]);
  // ── Build PlanetDefs: positions fixed, state per current step ──
  const planetDefs = useMemo<PlanetDef[]>(() => {
    if (!initialPlanets) return [];
    // Live owner per planet from the current step (owners can change),
    // falling back to the initial snapshot before the first step plays.
    const livePlanets = currentStep?.planets ?? initialPlanets;
    const liveByCoord = new Map<string, ServerPlanet>();
    for (const p of livePlanets) {
      liveByCoord.set(coordKey(p.coord[0], p.coord[1]), p);
    }
    return initialPlanets.map((p) => {
      const live = liveByCoord.get(coordKey(p.coord[0], p.coord[1])) ?? p;
      const state = planetStateFor(live, currentStep, broadcasters, explorers);
      return {
        name: "neptune",
        grid: coordToGrid(p.coord),
        scale: 6,
        state,
      };
    });
  }, [initialPlanets, currentStep, broadcasters, explorers]);
  // ── Paint civ-owned cells from the CURRENT displayed step ──
  useEffect(() => {
    const handle = solarRef.current;
    if (!handle || !currentStep || !Object.keys(civColors).length) return;
    handle.resetAllCellColors();
    // Paint explored cells first, then owned planets on top.
    // Both use the civ's color; ordering keeps owned planets authoritative
    // if the two ever diverge (e.g. different shades later).
    const exploredEntries: Array<{ col: number; row: number; color: string }> = [];
    const ownedEntries: Array<{ col: number; row: number; color: string }> = [];
    for (const civ of currentStep.civilizations) {
      const color = civColors[civ.name];
      if (!color) continue;
      for (const cell of civ.explored_cells || []) {
        const [col, row] = coordToGrid(cell);
        exploredEntries.push({ col, row, color });
      }
      for (const owned of civ.owned_planets || []) {
        const [col, row] = coordToGrid(owned);
        ownedEntries.push({ col, row, color });
      }
    }
    if (exploredEntries.length) handle.setCellColors(exploredEntries);
    if (ownedEntries.length) handle.setCellColors(ownedEntries);
  }, [currentStep, civColors]);
  // ── Readiness ──────────────────────────────────────────────
  // "Loaded" = grid known, planet layout received, and enough steps
  // buffered for smooth-ish initial playback. While the WS is still
  // connecting / before the first step arrives, we show the full-screen
  // loading panel (existing branch below). Once initialPlanets exists
  // we render the scene + an overlay with spinner-or-Play.
  const isLoaded =
    !!grid && !!initialPlanets && bufferedCount >= MIN_BUFFER_TO_PLAY;
  // ── Render ─────────────────────────────────────────────────
  if (!grid || !initialPlanets) {
    return (
      <div className="h-full w-full bg-black border border-white/90 rounded-xl shadow-2xl flex items-center justify-center text-white/70 text-sm">
        {status}
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      <SolarSystem
        ref={solarRef}
        planets={planetDefs}
        gridWidth={grid.width}
        gridHeight={grid.height}
      />
      {/* Legend — civ → color */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        {agents.map((name) => (
          <div key={name} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: civColors[name] }}
            />
            <span>{name}</span>
            {broadcasters.has(name) && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-white/60">
                broadcasting
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Pre-playback overlay: shows a spinner until enough steps are
          buffered, then a Play button. Disappears as soon as the user
          starts playback for the first time. */}
      {!isPlaying && currentStep === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
          {!isLoaded ? (
            <div className="flex flex-col items-center gap-3 text-white/85 text-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>
                Loading simulation… ({Math.min(bufferedCount, MIN_BUFFER_TO_PLAY)}/
                {MIN_BUFFER_TO_PLAY} steps buffered)
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              className="flex items-center gap-3 rounded-full bg-white/90 px-6 py-3 text-sm font-medium text-black shadow-2xl transition hover:bg-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Start playback</span>
            </button>
          )}
        </div>
      )}

      {/* Playback control */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        {/* Play / pause toggle — usable any time after the initial start. */}
        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          disabled={!isLoaded && currentStep === null}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <span className="whitespace-nowrap">
          step {currentStep?.step ?? 0} · buffer {bufferedCount}
        </span>
        <label className="flex flex-1 items-center gap-2">
          <span className="whitespace-nowrap">speed</span>
          <input
            type="range"
            min={MIN_STEP_MS}
            max={MAX_STEP_MS}
            step={10}
            // Invert visually: dragging right = faster (smaller ms).
            value={MAX_STEP_MS + MIN_STEP_MS - stepMs}
            onChange={(e) =>
              setStepMs(MAX_STEP_MS + MIN_STEP_MS - Number(e.target.value))
            }
            className="flex-1 accent-white"
          />
          <span className="whitespace-nowrap tabular-nums">{stepMs} ms</span>
        </label>
      </div>
    </div>
  );
}