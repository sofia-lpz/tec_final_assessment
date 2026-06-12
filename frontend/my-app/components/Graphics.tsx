"use client";

import React, { useSyncExternalStore } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { getSimulationMetricsFeed } from "../utils/dataProvider"; // adjust path to wherever dataProvider.js lives

/* ============================================================
   DATA SHAPE
   One object per PPO iteration, produced by
   dataProvider.toIterationMetrics() from the server's
   {"type": "iteration"} websocket frames.

   By default the component subscribes itself to the shared
   metrics feed (getSimulationMetricsFeed). You can still inject
   data manually — e.g. for storybook/tests — via the `data` prop:

     <GraficasContainer data={myMetrics} />

   Fields are nullable because the server legitimately sends null
   early in a run (no episode finished yet → mean_episode_return
   is null) and timeToAnnihilation is null whenever there was no
   broadcast / no annihilation / no replay that iteration.
   Recharts simply skips null points.
   ============================================================ */

export type IterationMetrics = {
  iteration: number;
  broadcastRate: number | null; // 0..1
  avgSurvivors: number | null;
  // Mean over civs of (own death step − own first broadcast step) in the
  // replay episode. null = no broadcaster died / no replay this iteration.
  timeToAnnihilation: number | null;
  // EMA of timeToAnnihilation, computed by the metrics feed; carries through
  // null gaps so the trend line is continuous.
  ttaEma?: number | null;
  avgReward: number | null;
  policyLoss: number | null;
  valueLoss: number | null;
  entropy: number | null; // raw policy entropy (NOT loss_entropy)
  approxKL: number | null;
  // extras carried by the feed, not charted yet:
  globalStep?: number | null;
  learningRate?: number | null;
  broadcastEma?: number | null;
  stopReason?: string | null;
};

/* ============================================================
   PALETTE — signals in the dark forest
   ============================================================ */

const COLORS = {
  broadcast: "#22d3ee", // cyan — a signal leaving the system
  survivors: "#34d399", // emerald — life persisting
  annihilation: "#f87171", // red — the hunter's reply
  reward: "#fbbf24", // amber — what the policy chases
  policyLoss: "#a78bfa", // violet
  valueLoss: "#38bdf8", // sky
  entropy: "#fb7185", // rose — collapsing doctrine
  approxKL: "#fb923c", // orange
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.35)",
};

/* ============================================================
   LIVE FEED SUBSCRIPTION
   ============================================================ */

const EMPTY_METRICS: IterationMetrics[] = [];

/**
 * Subscribe to the app-wide metrics feed. The feed already:
 *   - appends one point per "iteration" frame,
 *   - resets when a new run emits "started",
 *   - notifies with a NEW immutable array reference on change,
 * which is exactly the contract useSyncExternalStore wants.
 */
function useSimulationMetrics(): IterationMetrics[] {
  const feed = getSimulationMetricsFeed();
  return useSyncExternalStore(
    feed.subscribe,
    feed.getMetrics,
    () => EMPTY_METRICS // SSR snapshot: no socket on the server
  );
}

/* ============================================================
   SHARED CHART CHROME
   ============================================================ */

const tooltipStyle = {
  contentStyle: {
    background: "rgba(8, 10, 20, 0.92)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "0.5rem",
    fontSize: "11px",
    letterSpacing: "0.05em",
  },
  labelStyle: { color: "rgba(255,255,255,0.5)" },
  itemStyle: { padding: 0 },
} as const;

const axisProps = {
  stroke: COLORS.axis,
  tick: { fill: COLORS.axis, fontSize: 10 },
  tickLine: false as const,
  axisLine: { stroke: COLORS.grid },
};

function Panel({
  title,
  accent,
  right,
  children,
}: {
  title: string;
  accent: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col border border-white/20 bg-white/5">
      <div className="flex items-baseline justify-between mb-3 sm:mb-4 gap-2">
        <span className="text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: accent }}
          />
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

const last = <T,>(arr: T[]) => arr[arr.length - 1];
const fmt = (v: number | null | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d);

/* ============================================================
   MAIN CONTAINER
   ============================================================ */

export default function GraficasContainer({
  data,
}: {
  /** Optional override (tests/storybook). Omit to use the live websocket feed. */
  data?: IterationMetrics[];
}) {
  const liveMetrics = useSimulationMetrics();
  const metrics = data ?? liveMetrics;

  const latest = last(metrics);
  return (
    <div className="w-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl">
      <h2 className="text-lg sm:text-2xl lg:text-3xl font-light tracking-[0.1em] sm:tracking-[0.2em] mb-6 lg:mb-8 text-center border-b border-white/20 pb-3 lg:pb-4 leading-tight">
        SIMULATION METRICS
      </h2>

      {metrics.length === 0 && (
        <p className="mb-6 text-center text-[10px] sm:text-xs tracking-widest text-gray-500">
          AWAITING FIRST ITERATION — START A TRAINING RUN TO POPULATE
        </p>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* 1 — Broadcast rate vs survivors (dual axis) */}
        <Panel title="BROADCAST RATE / SURVIVORS" accent={COLORS.broadcast}>
          <div className="h-36 sm:h-40 lg:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="iteration" {...axisProps} />
                <YAxis yAxisId="rate" domain={[0, 1]} {...axisProps} width={32} />
                <YAxis
                  yAxisId="surv"
                  orientation="right"
                  {...axisProps}
                  width={28}
                />
                <Tooltip {...tooltipStyle} />
                <Legend
                  wrapperStyle={{ fontSize: 10, letterSpacing: "0.1em" }}
                  iconType="plainline"
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="broadcastRate"
                  name="BROADCAST RATE"
                  stroke={COLORS.broadcast}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="surv"
                  type="monotone"
                  dataKey="avgSurvivors"
                  name="AVG SURVIVORS"
                  stroke={COLORS.survivors}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* 3 — Average reward per episode */}
        <Panel
          title="AVERAGE REWARD / EPISODE"
          accent={COLORS.reward}
          right={
            <span className="text-[10px] sm:text-xs tabular-nums text-gray-200">
              {fmt(latest?.avgReward, 1)}
            </span>
          }
        >
          <div className="h-36 sm:h-40 lg:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rewardFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.reward} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.reward} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="iteration" {...axisProps} />
                <YAxis {...axisProps} width={36} />
                <Tooltip {...tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="avgReward"
                  name="AVG REWARD"
                  stroke={COLORS.reward}
                  strokeWidth={2}
                  fill="url(#rewardFill)"
                  dot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>


      </div>
    </div>
  );
}