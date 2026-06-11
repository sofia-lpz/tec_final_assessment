"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SolarSystem, {
  SolarSystemHandle,
  PlanetDef,
} from "@/components/SolarSystem";
import type { PlanetState } from "@/components/Planet";

// ── Config ───────────────────────────────────────────────────
const WS_URL = "ws://localhost:8765";
const START_CONFIG: Record<string, unknown> = {
  // Match the test client's defaults; tweak later as needed.
};

// Initial milliseconds between simulation steps during playback.
const DEFAULT_STEP_MS = 300;
// Min/max playback rates (used by the slider).
const MIN_STEP_MS = 50;
const MAX_STEP_MS = 2000;

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
 * Currently:
 *   - If the planet's owner broadcast this step → "transmitting"
 *   - Otherwise → "none"
 *
 * Extend here when adding other states (destroy, scienceplus, …).
 */
function planetStateFor(
  planet: ServerPlanet,
  step: StepMsg | null,
  broadcasters: Set<string>
): PlanetState {
  if (!step) return "none";
  if (planet.owner && broadcasters.has(planet.owner)) return "transmitting";
  return "none";
}

// ── Galaxy ───────────────────────────────────────────────────
export default function Galaxy() {
  const solarRef = useRef<SolarSystemHandle>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

  // Per-civilization color, derived from the agents list order.
  const civColors = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    agents.forEach((name, i) => {
      m[name] = CIV_PALETTE[i % CIV_PALETTE.length];
    });
    return m;
  }, [agents]);

  // ── WebSocket lifecycle ────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setStatus("Connected. Starting simulation…");
      ws.send(JSON.stringify({ cmd: "start", config: START_CONFIG }));
    });

    ws.addEventListener("message", (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "started": {
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
        default:
          break;
      }
    });

    ws.addEventListener("close", () => {
      setStatus((s) => (s.startsWith("Error") ? s : "Disconnected."));
    });

    ws.addEventListener("error", () => {
      setStatus("WebSocket error.");
    });

    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ cmd: "stop" }));
        }
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ── Playback loop: advance one buffered step per tick ──────
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = stepBuffer.current.shift();
      if (!next) return;
      setCurrentStep(next);
      setBufferedCount(stepBuffer.current.length);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);

  // ── Derived: who is broadcasting on the displayed step ─────
  const broadcasters = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    if (!currentStep?.actions) return s;
    for (const [name, action] of Object.entries(currentStep.actions)) {
      if (action?.type === "broadcast") s.add(name);
    }
    return s;
  }, [currentStep]);

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
      const state = planetStateFor(live, currentStep, broadcasters);
      return {
        name: "neptune",
        grid: coordToGrid(p.coord),
        scale: 4,
        state,
      };
    });
  }, [initialPlanets, currentStep, broadcasters]);

  // ── Paint civ-owned cells from the CURRENT displayed step ──
  useEffect(() => {
    const handle = solarRef.current;
    if (!handle || !currentStep || !Object.keys(civColors).length) return;

    handle.resetAllCellColors();

    const entries: Array<{ col: number; row: number; color: string }> = [];
    for (const civ of currentStep.civilizations) {
      const color = civColors[civ.name];
      if (!color) continue;
      for (const owned of civ.owned_planets || []) {
        const [col, row] = coordToGrid(owned);
        entries.push({ col, row, color });
      }
    }
    if (entries.length) handle.setCellColors(entries);
  }, [currentStep, civColors]);

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

      {/* Playback control */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
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