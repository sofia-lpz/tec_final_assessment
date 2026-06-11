"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SolarSystem, {
  SolarSystemHandle,
  PlanetDef,
} from "@/components/SolarSystem";

// ── Config ───────────────────────────────────────────────────
const WS_URL = "ws://localhost:8765";
const START_CONFIG: Record<string, unknown> = {
  // Match the test client's defaults; tweak later as needed.
};

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
  // other fields ignored for now
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

// ── Galaxy ───────────────────────────────────────────────────
export default function Galaxy() {
  const solarRef = useRef<SolarSystemHandle>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [grid, setGrid] = useState<{ width: number; height: number } | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [planets, setPlanets] = useState<ServerPlanet[] | null>(null);
  const [civilizations, setCivilizations] = useState<ServerCiv[]>([]);
  const [status, setStatus] = useState<string>("Connecting…");

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
          // Capture grid + agents (in case "started" was missed) and
          // load planets on the first step.
          if (msg.grid) setGrid((g) => g ?? msg.grid);
          if (msg.agents && msg.agents.length) {
            setAgents((a) => (a.length ? a : msg.agents));
          }
          setPlanets((prev) => prev ?? msg.planets);
          setCivilizations(msg.civilizations || []);
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

  // ── Build PlanetDefs from the first step's planets ─────────
  const planetDefs = useMemo<PlanetDef[]>(() => {
    if (!planets) return [];
    return planets.map((p) => ({
      name: "neptune", // single model for now; we'll vary later
      grid: coordToGrid(p.coord),
      scale: 4,
      state: "none",
    }));
  }, [planets]);

  // ── Paint civ-owned cells using each civ's color ───────────
  useEffect(() => {
    const handle = solarRef.current;
    if (!handle || !civilizations.length || !Object.keys(civColors).length) return;

    handle.resetAllCellColors();

    const entries: Array<{ col: number; row: number; color: string }> = [];
    for (const civ of civilizations) {
      const color = civColors[civ.name];
      if (!color) continue;
      for (const owned of civ.owned_planets || []) {
        const [col, row] = coordToGrid(owned);
        entries.push({ col, row, color });
      }
    }
    if (entries.length) handle.setCellColors(entries);
  }, [civilizations, civColors]);

  // ── Render ─────────────────────────────────────────────────
  if (!grid || !planets) {
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

      {/* Small legend showing the civ → color mapping */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        {agents.map((name) => (
          <div key={name} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: civColors[name] }}
            />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}