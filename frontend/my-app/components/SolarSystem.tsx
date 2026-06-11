"use client";
import { Suspense, useState, useEffect, useRef, RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Environment, Edges } from "@react-three/drei";
import { Group } from "three";
import Planet from "@/components/Planet";
import Star from "@/components/Star";
import type { PlanetState } from "@/components/Planet";

// ── Grid config ──────────────────────────────────────────────
const STAR_SCALE = 11;
const CELL_SIZE = STAR_SCALE * 3;

const GRID_X = 10;
const GRID_Z = 10;
const HALF_X = Math.floor(GRID_X / 2);
const HALF_Z = Math.floor(GRID_Z / 2);
const COLS = HALF_X * 2 + 1;
const ROWS = HALF_Z * 2 + 1;
const CENTER_COL = HALF_X;
const CENTER_ROW = HALF_Z;

// ── Planet definitions ───────────────────────────────────────
type PlanetDef = {
  name: string;
  grid: [number, number];
  scale?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
  /** For state="destroy": grid coord of the planet to fire at */
  targetGrid?: [number, number];
};

const PLANETS: PlanetDef[] = [
  { name: "neptune", grid: [2, 5], scale: 4, state: "none",        glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [3, 5], scale: 4, state: "transmitting" },
  { name: "neptune", grid: [4, 5], scale: 4, state: "birthplus",   glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [6, 5], scale: 4, state: "scienceplus", glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [7, 5], scale: 4, state: "none" },
  // Fires at the planet to its right
  { name: "neptune", grid: [8, 5], scale: 4, state: "destroy", targetGrid: [9, 5] },
  // Target — faded out by the laser
  { name: "neptune", grid: [9, 5], scale: 4, state: "none" },
  { name: "neptune", grid: [0, 0], scale: 4, state: "transmitting" },
];

function gridToWorld(col: number, row: number): [number, number, number] {
  return [(col - CENTER_COL) * CELL_SIZE, 0, (row - CENTER_ROW) * CELL_SIZE];
}

function gridKey(col: number, row: number) { return `${col},${row}`; }

function allCells(): [number, number][] {
  const cells: [number, number][] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      cells.push([col, row]);
  return cells;
}

function GridCells() {
  return (
    <>
      {allCells().map(([col, row], i) => {
        const [wx, wy, wz] = gridToWorld(col, row);
        return (
          <mesh key={i} position={[wx, wy, wz]} renderOrder={-1}>
            <boxGeometry args={[CELL_SIZE, CELL_SIZE, CELL_SIZE]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            <Edges color="#1a2a3a" threshold={1} />
          </mesh>
        );
      })}
    </>
  );
}

// ── Scene: wires planet refs + signals ready after Suspense ──
function Scene({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  useEffect(() => {
    // One rAF so the GPU finishes uploading textures before the clock starts.
    const id = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(id);
  }, [onReady]);

  // One stable ref object per planet slot, keyed by "col,row".
  const planetRefs = useRef<Record<string, RefObject<Group | null>>>(
    Object.fromEntries(PLANETS.map((p) => [gridKey(...p.grid), { current: null }]))
  ).current;

  return (
    <>
      <Star name="star" scale={STAR_SCALE} />
      {PLANETS.map((p, i) => {
        const key = gridKey(...p.grid);
        const targetRef = p.targetGrid ? planetRefs[gridKey(...p.targetGrid)] : undefined;

        return (
          <Planet
            key={i}
            ref={planetRefs[key]}
            name={p.name}
            scale={p.scale}
            position={gridToWorld(p.grid[0], p.grid[1])}
            state={p.state}
            glowColor={p.glowColor}
            glowSize={p.glowSize}
            rotationSpeed={0.2}
            ready={ready}
            targetPosition={p.targetGrid ? gridToWorld(p.targetGrid[0], p.targetGrid[1]) : undefined}
            targetRef={targetRef}
          />
        );
      })}
    </>
  );
}

export default function SolarSystem() {
  const [ready, setReady] = useState(false);

  return (
    <div className="h-full w-full bg-black border border-white/90 rounded-xl shadow-2xl">
      <Canvas camera={{ position: [0, CELL_SIZE * 3, CELL_SIZE * 4], fov: 50, near: 0.1, far: 2000 }}>
        <Environment preset="night" />
        <ambientLight intensity={0.2} />
        <Stars radius={300} depth={60} count={5000} factor={7} fade />

        <Suspense fallback={null}>
          <Scene ready={ready} onReady={() => setReady(true)} />
        </Suspense>

        <GridCells />

        <OrbitControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.05} />
      </Canvas>
    </div>
  );
}