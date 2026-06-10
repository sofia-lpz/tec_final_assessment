"use client";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Environment, Edges } from "@react-three/drei";
import Planet from "@/components/Planet";
import Star from "@/components/Star";
import type { PlanetState } from "@/components/Planet";

// ── Grid config ──────────────────────────────────────────────
const STAR_SCALE = 4;
const CELL_SIZE = STAR_SCALE * 3;

// Grid dimensions — total cells in each axis
const GRID_X = 7; // columns  (odd = star sits in a real center cell)
const GRID_Z = 7; // rows
// Y is always 0 — all planets on the same plane like a solar system

// ── Planet definitions ───────────────────────────────────────
// grid coords are integers; [0,0] = star cell center
// only X and Z — no Y offset
type PlanetDef = {
  name: string;
  grid: [number, number]; // [col, row] — center is [0,0]
  scale?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
};

const PLANETS: PlanetDef[] = [
  { name: "neptune", grid: [-3, 0], scale: 2, state: "none",        glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [-2, 0], scale: 2, state: "transmitting" },
  { name: "neptune", grid: [-1, 0], scale: 2, state: "birthplus",   glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [ 1, 0], scale: 2, state: "scienceplus", glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [ 2, 0], scale: 2, state: "none" },
  { name: "neptune", grid: [ 3, 0], scale: 2, state: "transmitting" },
];

function gridToWorld(gx: number, gz: number): [number, number, number] {
  return [gx * CELL_SIZE, 0, gz * CELL_SIZE];
}

// All cells in the fixed grid
function allCells(): [number, number][] {
  const cells: [number, number][] = [];
  const halfX = Math.floor(GRID_X / 2);
  const halfZ = Math.floor(GRID_Z / 2);
  for (let x = -halfX; x <= halfX; x++) {
    for (let z = -halfZ; z <= halfZ; z++) {
      cells.push([x, z]);
    }
  }
  return cells;
}

function GridCells() {
  return (
    <>
      {allCells().map(([gx, gz], i) => {
        const [wx, wy, wz] = gridToWorld(gx, gz);
        return (
          <mesh key={i} position={[wx, wy, wz]}>
            <boxGeometry args={[CELL_SIZE, CELL_SIZE, CELL_SIZE]} />
            <meshBasicMaterial transparent opacity={0} />
            <Edges color="#1a2a3a" threshold={1} />
          </mesh>
        );
      })}
    </>
  );
}

export default function SolarSystem() {
  return (
    <div className="h-screen w-full bg-black">
      <Canvas camera={{ position: [0, CELL_SIZE * 3, CELL_SIZE * 4], fov: 50, near: 0.1, far: 2000 }}>
        <Environment preset="night" />
        <ambientLight intensity={0.2} />
        <Stars radius={300} depth={60} count={5000} factor={7} fade />

        <Suspense fallback={null}>
          <Star name="star" scale={STAR_SCALE} />

          {PLANETS.map((p, i) => (
            <Planet
              key={i}
              name={p.name}
              scale={p.scale}
              position={gridToWorld(p.grid[0], p.grid[1])}
              state={p.state}
              glowColor={p.glowColor}
              glowSize={p.glowSize}
              rotationSpeed={0.2}
            />
          ))}
        </Suspense>

        <GridCells />

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}