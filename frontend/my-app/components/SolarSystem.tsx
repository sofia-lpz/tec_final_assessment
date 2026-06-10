"use client";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Environment, Edges } from "@react-three/drei";
import Planet from "@/components/Planet";
import Star from "@/components/Star";
import type { PlanetState } from "@/components/Planet";

// ── Grid config ──────────────────────────────────────────────
const STAR_SCALE = 10;
const CELL_SIZE = STAR_SCALE * 3;

// Grid dimensions — controls how many cells fan out from the centre.
const GRID_X = 10; // → HALF_X cells each side of centre
const GRID_Z = 10;

// Half-extents and total cell counts. An odd total keeps a real centre cell
// (where the star lives).
const HALF_X = Math.floor(GRID_X / 2); // 5
const HALF_Z = Math.floor(GRID_Z / 2); // 5
const COLS = HALF_X * 2 + 1; // 11 columns, indexed 0…10
const ROWS = HALF_Z * 2 + 1; // 11 rows,    indexed 0…10

// Index of the centre cell (the star) in the new top-left system.
const CENTER_COL = HALF_X; // 5
const CENTER_ROW = HALF_Z; // 5

// ── Coordinate system ────────────────────────────────────────
// Screen-style grid: [0,0] is the TOP-LEFT cell.
//   col (x): 0 → left,  increases to the RIGHT
//   row (y): 0 → top,   increases DOWNWARD (toward the camera / bottom of view)
// The star sits at [CENTER_COL, CENTER_ROW] = [5, 5].

// ── Planet definitions ───────────────────────────────────────
type PlanetDef = {
  name: string;
  grid: [number, number]; // [col, row] — [0,0] = top-left, star = [5,5]
  scale?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
};

const PLANETS: PlanetDef[] = [
  { name: "neptune", grid: [2, 5], scale: 2, state: "none",        glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [3, 5], scale: 2, state: "transmitting" },
  { name: "neptune", grid: [4, 5], scale: 2, state: "birthplus",   glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [6, 5], scale: 2, state: "scienceplus", glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [7, 5], scale: 2, state: "none" },
  { name: "neptune", grid: [8, 5], scale: 2, state: "transmitting" },
  { name: "neptune", grid: [0, 0], scale: 2, state: "transmitting" },
];

// Top-left grid coords → centred world coords.
// col grows +X (right); row grows +Z (down on screen). Y stays 0.
function gridToWorld(col: number, row: number): [number, number, number] {
  const x = (col - CENTER_COL) * CELL_SIZE;
  const z = (row - CENTER_ROW) * CELL_SIZE;
  return [x, 0, z];
}

// Every cell in the grid, addressed from the top-left.
function allCells(): [number, number][] {
  const cells: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push([col, row]);
    }
  }
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