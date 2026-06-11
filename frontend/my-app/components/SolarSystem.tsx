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

// ── Defaults ─────────────────────────────────────────────────
const STAR_SCALE = 11;
const CELL_SIZE = STAR_SCALE * 2;

const DEFAULT_CELL_COLOR = "#1a2a3a";
const PLANET_CELL_COLOR = "#4a6a8a";

// ── Planet definitions ───────────────────────────────────────
export type PlanetDef = {
  name: string;
  grid: [number, number]; // [col, row]
  scale?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
  targetGrid?: [number, number];
};

function gridKey(col: number, row: number) {
  return `${col},${row}`;
}

// ── Grid cells: deduplicated edge lattice ────────────────────
type GridCellsHandle = {
  setCellColor: (col: number, row: number, color: string) => void;
  resetCellColor: (col: number, row: number) => void;
  resetAll: () => void;
};

type GridCellsProps = {
  cols: number;
  rows: number;
  centerCol: number;
  centerRow: number;
  cellSize: number;
  planetCells: Set<string>;
};

// Priority order for resolving shared-edge conflicts:
//   civ color (custom) > planet color > default color
// We encode priority as: 2 = civ, 1 = planet, 0 = default.
// A shared edge is always rendered with the highest-priority
// color among all cells that share it.

const GridCells = forwardRef<GridCellsHandle, GridCellsProps>(function GridCells(
  { cols, rows, centerCol, centerRow, cellSize, planetCells },
  ref
) {
  const cellIndex = useCallback(
    (col: number, row: number) => row * cols + col,
    [cols]
  );

  const { geometry, colorAttr, cellEdges, edgeOwners } = useMemo(() => {
    const cornerPos = (i: number, j: number, k: number): [number, number, number] => [
      (i - centerCol - 0.5) * cellSize,
      (j - 0.5) * cellSize,
      (k - centerRow - 0.5) * cellSize,
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

    const cellEdges: number[][] = new Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const edges: number[] = [];
        for (let j = 0; j < 2; j++)
          for (let k = row; k <= row + 1; k++)
            edges.push(getOrAddEdge([col, j, k], [col + 1, j, k]));
        for (let i = col; i <= col + 1; i++)
          for (let k = row; k <= row + 1; k++)
            edges.push(getOrAddEdge([i, 0, k], [i, 1, k]));
        for (let i = col; i <= col + 1; i++)
          for (let j = 0; j < 2; j++)
            edges.push(getOrAddEdge([i, j, row], [i, j, row + 1]));
        cellEdges[row * cols + col] = edges;
      }
    }

    const numEdges = edgeMap.size;
    const colors = new Float32Array(numEdges * 6);

    // edgeOwners: for each edge, a list of cell indices that share it.
    // Used when repainting a cell to recompute the correct color on shared edges.
    const edgeOwners: number[][] = Array.from({ length: numEdges }, () => []);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const ci = row * cols + col;
        for (const e of cellEdges[ci]) edgeOwners[e].push(ci);
      }
    }

    const writeEdge = (edgeIdx: number, c: THREE.Color) => {
      const off = edgeIdx * 6;
      colors[off + 0] = c.r; colors[off + 1] = c.g; colors[off + 2] = c.b;
      colors[off + 3] = c.r; colors[off + 4] = c.g; colors[off + 5] = c.b;
    };

    const defaultC = new THREE.Color(DEFAULT_CELL_COLOR);
    const planetC = new THREE.Color(PLANET_CELL_COLOR);

    for (let i = 0; i < numEdges; i++) writeEdge(i, defaultC);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (planetCells.has(gridKey(col, row))) {
          for (const e of cellEdges[row * cols + col]) writeEdge(e, planetC);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geom.setAttribute("color", colorAttr);

    return { geometry: geom, colorAttr, cellEdges, edgeOwners };
  }, [cols, rows, centerCol, centerRow, cellSize, planetCells]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Per-cell custom color override (null = use default/planet color).
  const cellColors = useRef<Array<string | null>>(
    new Array(cols * rows).fill(null)
  );

  // Keep cellColors sized correctly if cols/rows ever change.
  useEffect(() => {
    cellColors.current = new Array(cols * rows).fill(null);
  }, [cols, rows]);

  const writeEdgeColor = useCallback(
    (edgeIdx: number, c: THREE.Color) => {
      const arr = colorAttr.array as Float32Array;
      const off = edgeIdx * 6;
      arr[off + 0] = c.r; arr[off + 1] = c.g; arr[off + 2] = c.b;
      arr[off + 3] = c.r; arr[off + 4] = c.g; arr[off + 5] = c.b;
    },
    [colorAttr]
  );

  // Resolve the correct color for a single edge by checking all cells
  // that share it and picking the highest-priority one.
  const resolveEdgeColor = useCallback(
    (edgeIdx: number) => {
      let bestPriority = -1;
      let bestColor: THREE.Color = new THREE.Color(DEFAULT_CELL_COLOR);

      for (const ci of edgeOwners[edgeIdx]) {
        const col = ci % cols;
        const row = Math.floor(ci / cols);
        const custom = cellColors.current[ci];

        if (custom !== null) {
          // Priority 2: civ / custom color
          if (bestPriority < 2) {
            bestPriority = 2;
            bestColor = new THREE.Color(custom);
          }
        } else if (planetCells.has(gridKey(col, row))) {
          // Priority 1: planet cell
          if (bestPriority < 1) {
            bestPriority = 1;
            bestColor = new THREE.Color(PLANET_CELL_COLOR);
          }
        } else {
          // Priority 0: default
          if (bestPriority < 0) {
            bestPriority = 0;
            bestColor = new THREE.Color(DEFAULT_CELL_COLOR);
          }
        }
      }

      writeEdgeColor(edgeIdx, bestColor);
    },
    [edgeOwners, cols, planetCells, writeEdgeColor]
  );

  // Paint a cell: record its color, then re-resolve every edge it touches
  // (including shared ones) so neighbors always display correctly.
  const paintCell = useCallback(
    (col: number, row: number, color: string | null) => {
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;
      const ci = cellIndex(col, row);
      cellColors.current[ci] = color;

      const edges = cellEdges[ci];
      if (!edges) return;
      for (const e of edges) resolveEdgeColor(e);
      colorAttr.needsUpdate = true;
    },
    [cellEdges, resolveEdgeColor, colorAttr, cols, rows, cellIndex]
  );

  const setCellColor = useCallback(
    (col: number, row: number, color: string) => paintCell(col, row, color),
    [paintCell]
  );

  const resetCellColor = useCallback(
    (col: number, row: number) => paintCell(col, row, null),
    [paintCell]
  );

  const resetAll = useCallback(() => {
    cellColors.current.fill(null);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const edges = cellEdges[cellIndex(col, row)];
        if (edges) for (const e of edges) resolveEdgeColor(e);
      }
    }
    colorAttr.needsUpdate = true;
  }, [cellEdges, resolveEdgeColor, colorAttr, cols, rows, cellIndex]);

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
type SceneProps = {
  ready: boolean;
  onReady: () => void;
  planets: PlanetDef[];
  centerCol: number;
  centerRow: number;
  cellSize: number;
};

function Scene({ ready, onReady, planets, centerCol, centerRow, cellSize }: SceneProps) {
  useEffect(() => {
    const id = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(id);
  }, [onReady]);

  const gridToWorld = useCallback(
    (col: number, row: number): [number, number, number] => [
      (col - centerCol) * cellSize,
      0,
      (row - centerRow) * cellSize,
    ],
    [centerCol, centerRow, cellSize]
  );

  const planetRefs = useRef<Record<string, RefObject<Group | null>>>({});
  // Ensure refs exist for all planet cells
  for (const p of planets) {
    const k = gridKey(...p.grid);
    if (!planetRefs.current[k]) planetRefs.current[k] = { current: null };
  }

  return (
    <>
      <Star name="star" scale={STAR_SCALE} />
      {planets.map((p, i) => {
        const key = gridKey(...p.grid);
        const targetRef = p.targetGrid
          ? planetRefs.current[gridKey(...p.targetGrid)]
          : undefined;
        return (
          <Planet
            key={`${key}-${i}`}
            ref={planetRefs.current[key]}
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

type SolarSystemProps = {
  planets?: PlanetDef[];
  gridWidth?: number;  // number of cells along X (col)
  gridHeight?: number; // number of cells along Z (row)
};

const SolarSystem = forwardRef<SolarSystemHandle, SolarSystemProps>(function SolarSystem(
  { planets = [], gridWidth = 11, gridHeight = 11 },
  ref
) {
  const [ready, setReady] = useState(false);
  const gridRef = useRef<GridCellsHandle>(null);

  const cols = gridWidth;
  const rows = gridHeight;
  const centerCol = Math.floor((cols - 1) / 2);
  const centerRow = Math.floor((rows - 1) / 2);

  const planetCells = useMemo(
    () => new Set(planets.map((p) => gridKey(...p.grid))),
    [planets]
  );

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
          <Scene
            ready={ready}
            onReady={() => setReady(true)}
            planets={planets}
            centerCol={centerCol}
            centerRow={centerRow}
            cellSize={CELL_SIZE}
          />
        </Suspense>

        <GridCells
          ref={gridRef}
          cols={cols}
          rows={rows}
          centerCol={centerCol}
          centerRow={centerRow}
          cellSize={CELL_SIZE}
          planetCells={planetCells}
        />

        <OrbitControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.05} />
      </Canvas>
    </div>
  );
});

export default SolarSystem;