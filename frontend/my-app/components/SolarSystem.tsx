"use client";
import {
  Suspense,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
  RefObject,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Environment } from "@react-three/drei";
import * as THREE from "three";
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

const DEFAULT_CELL_COLOR = "#1a2a3a";
const PLANET_CELL_COLOR = "#4a6a8a";

// ── Planet definitions ───────────────────────────────────────
type PlanetDef = {
  name: string;
  grid: [number, number];
  scale?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
  targetGrid?: [number, number];
};

const PLANETS: PlanetDef[] = [
  { name: "neptune", grid: [2, 5], scale: 4, state: "none",        glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [3, 5], scale: 4, state: "transmitting" },
  { name: "neptune", grid: [4, 5], scale: 4, state: "birthplus",   glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [6, 5], scale: 4, state: "scienceplus", glowColor: "#037028", glowSize: 0.7 },
  { name: "neptune", grid: [7, 5], scale: 4, state: "none" },
  { name: "neptune", grid: [8, 5], scale: 4, state: "destroy", targetGrid: [9, 5] },
  { name: "neptune", grid: [9, 5], scale: 4, state: "none" },
  { name: "neptune", grid: [0, 0], scale: 4, state: "transmitting" },
];

function gridToWorld(col: number, row: number): [number, number, number] {
  return [(col - CENTER_COL) * CELL_SIZE, 0, (row - CENTER_ROW) * CELL_SIZE];
}
function gridKey(col: number, row: number) {
  return `${col},${row}`;
}
function cellIndex(col: number, row: number) {
  return row * COLS + col;
}

const PLANET_CELLS = new Set(PLANETS.map((p) => gridKey(...p.grid)));

// ── Grid cells: deduplicated edge lattice ────────────────────
type GridCellsHandle = {
  setCellColor: (col: number, row: number, color: string) => void;
  resetCellColor: (col: number, row: number) => void;
  resetAll: () => void;
};

const GridCells = forwardRef<GridCellsHandle>(function GridCells(_, ref) {
  const { geometry, colorAttr, cellEdges } = useMemo(() => {
    // Lattice corner -> world position
    const cornerPos = (i: number, j: number, k: number): [number, number, number] => [
      (i - CENTER_COL - 0.5) * CELL_SIZE,
      (j - 0.5) * CELL_SIZE,
      (k - CENTER_ROW - 0.5) * CELL_SIZE,
    ];

    const edgeMap = new Map<string, number>();
    const positions: number[] = [];

    const getOrAddEdge = (
      a: [number, number, number],
      b: [number, number, number]
    ): number => {
      const key = `${a[0]},${a[1]},${a[2]}|${b[0]},${b[1]},${b[2]}`;
      const existing = edgeMap.get(key);
      if (existing !== undefined) return existing;
      const idx = edgeMap.size;
      edgeMap.set(key, idx);
      const pa = cornerPos(a[0], a[1], a[2]);
      const pb = cornerPos(b[0], b[1], b[2]);
      positions.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
      return idx;
    };

    const cellEdges: number[][] = new Array(COLS * ROWS);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const edges: number[] = [];
        // 4 X-edges (vary j, k; run along x from col → col+1)
        for (let j = 0; j < 2; j++)
          for (let k = row; k <= row + 1; k++)
            edges.push(getOrAddEdge([col, j, k], [col + 1, j, k]));
        // 4 Y-edges (vary i, k; run along y from 0 → 1)
        for (let i = col; i <= col + 1; i++)
          for (let k = row; k <= row + 1; k++)
            edges.push(getOrAddEdge([i, 0, k], [i, 1, k]));
        // 4 Z-edges (vary i, j; run along z from row → row+1)
        for (let i = col; i <= col + 1; i++)
          for (let j = 0; j < 2; j++)
            edges.push(getOrAddEdge([i, j, row], [i, j, row + 1]));
        cellEdges[cellIndex(col, row)] = edges;
      }
    }

    const numEdges = edgeMap.size;
    const colors = new Float32Array(numEdges * 6); // 2 verts * 3 channels per edge

    const writeEdge = (edgeIdx: number, c: THREE.Color) => {
      const off = edgeIdx * 6;
      colors[off + 0] = c.r; colors[off + 1] = c.g; colors[off + 2] = c.b;
      colors[off + 3] = c.r; colors[off + 4] = c.g; colors[off + 5] = c.b;
    };

    const defaultC = new THREE.Color(DEFAULT_CELL_COLOR);
    const planetC = new THREE.Color(PLANET_CELL_COLOR);

    // Initial fill: default for all, then planet cells overwrite shared edges
    for (let i = 0; i < numEdges; i++) writeEdge(i, defaultC);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (PLANET_CELLS.has(gridKey(col, row))) {
          for (const e of cellEdges[cellIndex(col, row)]) writeEdge(e, planetC);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geom.setAttribute("color", colorAttr);

    return { geometry: geom, colorAttr, cellEdges };
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Helpers operating on the shared color buffer
  const writeEdgeColor = useCallback(
    (edgeIdx: number, c: THREE.Color) => {
      const arr = colorAttr.array as Float32Array;
      const off = edgeIdx * 6;
      arr[off + 0] = c.r; arr[off + 1] = c.g; arr[off + 2] = c.b;
      arr[off + 3] = c.r; arr[off + 4] = c.g; arr[off + 5] = c.b;
    },
    [colorAttr]
  );

  const paintCell = useCallback(
    (col: number, row: number, c: THREE.Color) => {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      const edges = cellEdges[cellIndex(col, row)];
      for (const e of edges) writeEdgeColor(e, c);
      colorAttr.needsUpdate = true;
    },
    [cellEdges, writeEdgeColor, colorAttr]
  );

  const setCellColor = useCallback(
    (col: number, row: number, color: string) => paintCell(col, row, new THREE.Color(color)),
    [paintCell]
  );

  const resetCellColor = useCallback(
    (col: number, row: number) => {
      const base = PLANET_CELLS.has(gridKey(col, row)) ? PLANET_CELL_COLOR : DEFAULT_CELL_COLOR;
      paintCell(col, row, new THREE.Color(base));
    },
    [paintCell]
  );

  const resetAll = useCallback(() => {
    const d = new THREE.Color(DEFAULT_CELL_COLOR);
    const p = new THREE.Color(PLANET_CELL_COLOR);
    // Same two-pass logic as initial fill
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        paintCell(col, row, PLANET_CELLS.has(gridKey(col, row)) ? p : d);
      }
    }
  }, [paintCell]);

  useImperativeHandle(
    ref,
    () => ({ setCellColor, resetCellColor, resetAll }),
    [setCellColor, resetCellColor, resetAll]
  );

  return (
    <lineSegments geometry={geometry} renderOrder={-1}>
      <lineBasicMaterial vertexColors transparent opacity={1} />
    </lineSegments>
  );
});

// ── Scene ────────────────────────────────────────────────────
function Scene({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(id);
  }, [onReady]);

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

// ── Public handle ────────────────────────────────────────────
export type SolarSystemHandle = {
  setCellColor: (col: number, row: number, color: string) => void;
  setCellColors: (entries: Array<{ col: number; row: number; color: string }>) => void;
  resetCellColor: (col: number, row: number) => void;
  resetAllCellColors: () => void;
};

const SolarSystem = forwardRef<SolarSystemHandle>(function SolarSystem(_props, ref) {
  const [ready, setReady] = useState(false);
  const gridRef = useRef<GridCellsHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      setCellColor: (col, row, color) => gridRef.current?.setCellColor(col, row, color),
      setCellColors: (entries) => {
        for (const { col, row, color } of entries) {
          gridRef.current?.setCellColor(col, row, color);
        }
      },
      resetCellColor: (col, row) => gridRef.current?.resetCellColor(col, row),
      resetAllCellColors: () => gridRef.current?.resetAll(),
    }),
    []
  );

  return (
    <div className="h-full w-full bg-black border border-white/90 rounded-xl shadow-2xl">
      <Canvas camera={{ position: [0, CELL_SIZE * 3, CELL_SIZE * 4], fov: 50, near: 0.1, far: 2000 }}>
        <Environment preset="night" />
        <ambientLight intensity={0.2} />
        <Stars radius={300} depth={60} count={5000} factor={7} fade />

        <Suspense fallback={null}>
          <Scene ready={ready} onReady={() => setReady(true)} />
        </Suspense>

        <GridCells ref={gridRef} />

        <OrbitControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.05} />
      </Canvas>
    </div>
  );
});

export default SolarSystem;