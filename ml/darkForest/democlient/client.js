#!/usr/bin/env node
/**
 * Dark Forest – WebSocket terminal client
 *
 * Two modes:
 *
 *  default   Visual board + civ table redraws on every "step".
 *            Every raw message is ALSO appended to ./darkforest.log so you can
 *            run  `tail -f darkforest.log`  in a second terminal to watch the
 *            exact JSON stream in parallel.
 *            A rolling message log (last 6 messages) is printed below the viz.
 *
 *  --raw     No viz at all. Every incoming message is pretty-printed as JSON
 *            directly to stdout (good for piping / inspecting wire format).
 *
 * Usage:
 *   node client.js [ws://localhost:8765] [--raw] [-- key=value ...]
 *
 * Examples:
 *   node client.js
 *   node client.js ws://localhost:8765 --raw
 *   node client.js ws://localhost:8765 -- total_timesteps=500000
 *   node client.js ws://localhost:8765 -- names=Alpha names=Beta names=Gamma
 */

const WebSocket = require("ws");
const fs        = require("fs");

// ── ANSI ──────────────────────────────────────────────────────────────────────
const esc  = s => `\x1b[${s}m`;
const bold = s => `${esc(1)}${s}${esc(0)}`;
const dim  = s => `${esc(2)}${s}${esc(0)}`;
const col  = (c, s) => `${c}${s}${esc(0)}`;

const RED     = esc(31), GREEN  = esc(32), YELLOW = esc(33);
const BLUE    = esc(34), MAGENTA= esc(35), CYAN   = esc(36);
const WHITE   = esc(37), BGBLUE = esc(44);

const AGENT_COLORS = [GREEN, CYAN, MAGENTA, YELLOW, RED, BLUE];
// Per-type colours for the message log
const TYPE_COLOR = {
  step:      CYAN,
  iteration: YELLOW,
  episode:   GREEN,
  started:   GREEN,
  done:      GREEN,
  stopped:   YELLOW,
  stopping:  YELLOW,
  error:     RED,
};

const W       = () => process.stdout.columns || 100;
const divider = () => dim("─".repeat(W()));

// ── small helpers ─────────────────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n === null || n === undefined || (typeof n === "number" && isNaN(n))) return dim("n/a");
  return typeof n === "number" ? n.toFixed(d) : String(n);
}
function fmtBig(n) {
  if (n == null) return dim("n/a");
  return Number(n).toLocaleString();
}
function bar(v, max, w = 20, c = GREEN) {
  const f = Math.round((Math.min(v ?? 0, max) / max) * w);
  return col(c, "█".repeat(f)) + dim("░".repeat(w - f));
}
function sparkline(arr, len = 40) {
  const B = " ▁▂▃▄▅▆▇█";
  const s = arr.slice(-len);
  if (!s.length) return dim("(no data)");
  const mn = Math.min(...s), mx = Math.max(...s), range = mx - mn || 1;
  return s.map(v => B[Math.floor(((v - mn) / range) * 8)]).join("");
}
function clearScreen() { process.stdout.write("\x1b[2J\x1b[H"); }
function header(title) {
  const pad = Math.max(0, W() - title.length - 2);
  return `${BGBLUE}${esc(1)} ${title} ${"─".repeat(pad)}\x1b[0m`;
}

// ── global state ──────────────────────────────────────────────────────────────
let gridCfg      = { width: 20, height: 20 };
let agentNames   = [];
let agentColorMap= {};

let lastStep     = null;
let lastItStats  = null;
let lastEpMeta   = null;
let stepCount    = 0;
let iterCount    = 0;
let connectedAt  = Date.now();

// Rolling log: store last N message summaries for display below the viz
const MSG_LOG_SIZE = 8;
const msgLog = [];   // array of { ts, type, summary }

function assignColors(names) {
  agentNames   = names || [];
  agentColorMap = {};
  agentNames.forEach((n, i) => { agentColorMap[n] = AGENT_COLORS[i % AGENT_COLORS.length]; });
}

// ── log file ──────────────────────────────────────────────────────────────────
const LOG_PATH   = "./darkforest.log";
const logStream  = fs.createWriteStream(LOG_PATH, { flags: "a" });

function logMessage(msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] ${JSON.stringify(msg, null, 2)}\n`;
  logStream.write(line);
}

// ── message summary for the rolling log ──────────────────────────────────────
function summarise(msg) {
  switch (msg.type) {
    case "step":
      return `step=${msg.step}  iter=${msg.iteration}  planets=${msg.planets?.length}  civs=${msg.civilizations?.length}  done=${msg.episode_done}`;
    case "iteration":
      return `iter=${msg.iteration}/${msg.stats?.num_iters}  gstep=${fmtBig(msg.global_step)}  ret=${fmt(msg.stats?.mean_episode_return)}  surv=${fmt(msg.stats?.mean_survivors,2)}  v_loss=${fmt(msg.stats?.value_loss)}`;
    case "episode":
      return `len=${msg.meta?.episode_length}  survivors=${msg.meta?.survivors}  annihilation=${msg.meta?.annihilation}`;
    case "started":
      return `run=${msg.config?.run_name}  grid=${msg.grid?.width}×${msg.grid?.height}  agents=${(msg.agents||[]).join(",")}`;
    case "done":
      return `iters=${msg.iterations}  gstep=${fmtBig(msg.global_step)}  stop=${msg.stop_reason||"none"}`;
    case "error":
      return msg.message;
    default:
      return JSON.stringify(msg).slice(0, 120);
  }
}

function pushLog(msg) {
  const ts = new Date().toLocaleTimeString();
  msgLog.push({ ts, type: msg.type, summary: summarise(msg) });
  if (msgLog.length > MSG_LOG_SIZE) msgLog.shift();
}

// ── board ─────────────────────────────────────────────────────────────────────
function renderBoard(planets, civilizations, actions, rewards, width, height) {
  const pmap = {};
  for (const p of (planets || [])) pmap[`${p.coord[0]},${p.coord[1]}`] = p;

  const rows = [];
  for (let r = 0; r < height; r++) {
    let row = "  ";
    for (let c = 0; c < width; c++) {
      const p = pmap[`${r},${c}`];
      if (!p)            { row += dim("·") + " "; }
      else if (p.destroyed) { row += col(RED, "✕") + " "; }
      else if (!p.owner)    { row += col(WHITE, "○") + " "; }
      else {
        const ac = agentColorMap[p.owner] || WHITE;
        row += col(ac, bold(p.owner[0].toUpperCase())) + " ";
      }
    }
    rows.push(row);
  }
  return rows;
}

function renderCivTable(civilizations, actions, rewards) {
  return (civilizations || []).map(civ => {
    const c   = agentColorMap[civ.name] || WHITE;
    const act = actions?.[civ.name];
    const rew = rewards?.[civ.name];
    const alive    = civ.alive ? col(GREEN, "●") : col(RED, "○");
    const actLabel = act
      ? (act.target ? `${act.type}@(${act.target[0]},${act.target[1]})` : act.type)
      : dim("—");
    const rewLabel = rew != null
      ? (rew >= 0 ? col(GREEN, `+${rew.toFixed(2)}`) : col(RED, rew.toFixed(2)))
      : dim("—");
    return (
      `  ${alive} ${col(c, bold(civ.name.padEnd(10)))}` +
      `  pop:${bold(String(Math.round(civ.population)).padStart(6))}` +
      `  sci:${bold(String(Math.round(civ.science)).padStart(6))}` +
      `  res:${bold(String(Math.round(civ.resources)).padStart(6))}` +
      `  str:${bold(String(Math.round(civ.strength)).padStart(6))}` +
      `  planets:${bold(String(civ.owned_planets?.length ?? 0))}` +
      `  r=${civ.exploration_radius}` +
      `  ${dim("act:")} ${actLabel}` +
      `  ${dim("rew:")} ${rewLabel}`
    );
  });
}

// ── message log section ───────────────────────────────────────────────────────
function renderMsgLog() {
  if (!msgLog.length) return;
  console.log();
  console.log(`  ${bold("RAW MESSAGE LOG")}  ${dim("(last " + MSG_LOG_SIZE + " · full JSON → " + LOG_PATH + ")")}`);
  console.log();
  for (const entry of msgLog) {
    const tc = TYPE_COLOR[entry.type] || WHITE;
    console.log(`  ${dim(entry.ts)}  ${col(tc, bold(entry.type.padEnd(10)))}  ${dim(entry.summary)}`);
  }
  console.log();
  console.log(divider());
}

// ── full-screen render (viz mode) ─────────────────────────────────────────────
function render() {
  clearScreen();
  const step  = lastStep;
  const stats = lastItStats;
  const ep    = lastEpMeta;

  const itLabel = stats
    ? `iter ${stats.iteration}/${stats.num_iters}  step ${fmtBig(stats.global_step)}`
    : "connecting…";
  console.log(header(`  🌑  DARK FOREST   ${itLabel}  `));
  console.log();

  // ── board section ──────────────────────────────────────────────────────────
  if (step) {
    const { planets, civilizations, actions, rewards } = step;
    const w = gridCfg.width, h = gridCfg.height;

    console.log(
      `  ${bold("BOARD")}  ${dim("step " + step.step)}` +
      (step.episode_done ? `  ${col(YELLOW, "episode done")}` : "")
    );
    console.log();
    renderBoard(planets, civilizations, actions, rewards, w, h).forEach(r => console.log(r));
    console.log();
    const legend = agentNames.map(n => col(agentColorMap[n], `■ ${n}`)).join("  ");
    console.log(`  ${legend}   ${dim("○")} empty   ${col(RED, "✕")} destroyed`);
    console.log();
    console.log(divider());
    console.log();
    console.log(`  ${bold("CIVILIZATIONS")}`);
    console.log();
    renderCivTable(civilizations, actions, rewards).forEach(l => console.log(l));
    console.log();
    console.log(divider());
  }

  // ── episode summary ────────────────────────────────────────────────────────
  if (ep) {
    console.log();
    console.log(
      `  ${bold("LAST EPISODE")}  ` +
      `length:${bold(ep.episode_length)}  ` +
      `survivors:${bold(ep.survivors)}  ` +
      (ep.annihilation ? col(RED, bold("ANNIHILATION")) : col(GREEN, "survived"))
    );
    console.log();
    console.log(divider());
  }

  // ── training stats ─────────────────────────────────────────────────────────
  if (stats) {
    const s       = stats;
    const stopper = s.stopper || {};
    const silColor= (stopper.silent_streak||0) > 5 ? RED
                  : (stopper.silent_streak||0) > 2 ? YELLOW : GREEN;
    const L = (label, val) => `  ${dim(label.padEnd(22))} ${val}`;
    const pct = s.num_iters > 0 ? (s.iteration / s.num_iters) * 100 : 0;

    console.log();
    console.log(`  ${bold("TRAINING STATS")}`);
    console.log();
    console.log(`  ${dim("Progress  ")} ${bar(s.iteration, s.num_iters, 35, CYAN)} ${fmt(pct,1)}%`);
    console.log();
    console.log(L("Global steps",        col(CYAN,   fmtBig(s.global_step))));
    console.log(L("SPS",                 col(YELLOW, fmtBig(s.sps))));
    console.log(L("Elapsed",             fmt(s.elapsed_seconds,1) + "s"));
    console.log(L("Learning rate",       fmt(s.learning_rate, 6)));
    console.log();
    console.log(`  ${dim("Broadcast rate")}  ${bar(s.broadcast_rate||0, 1, 25)} ${fmt((s.broadcast_rate||0)*100,2)}%`);
    console.log(`  ${dim("Broadcast EMA ")}  ${bar(s.broadcast_ema||0,  1, 25)} ${fmt((s.broadcast_ema||0)*100,2)}%  ${dim("peak "+fmt((stopper.peak||0)*100,2)+"%")}`);
    console.log(L("Silent streak",       col(silColor, (stopper.silent_streak||0) + " iters")));
    console.log(L("Annihilation rate",   col(RED, fmt((stopper.annihilation_rate||0)*100,1)+"%")));
    console.log();
    console.log(L("Mean return",         fmt(s.mean_episode_return)));
    console.log(L("Mean survivors",      fmt(s.mean_survivors, 2)));
    console.log();
    if (s.recent_returns?.length)   console.log(`  ${dim("Returns  ")} ${col(CYAN,    sparkline(s.recent_returns))}`);
    if (s.recent_survivors?.length) console.log(`  ${dim("Survivors")} ${col(MAGENTA, sparkline(s.recent_survivors))}`);
    console.log();
    console.log(L("Value loss",   fmt(s.value_loss)));
    console.log(L("Policy loss",  fmt(s.policy_loss)));
    console.log(L("Entropy loss", fmt(s.entropy_loss)));
    console.log(L("Approx KL",   fmt(s.approx_kl)));
    console.log();
    if (s.stop_reason)
      console.log(`  ${bold(col(RED, "⚠  STOPPING: " + s.stop_reason))}`);
    else
      console.log(`  ${dim("Stopper:")} ${col(YELLOW, stopper.mode||"?")}  ${dim("· iter " + s.iteration)}`);
    console.log();
    console.log(divider());
  }

  // ── rolling message log ────────────────────────────────────────────────────
  renderMsgLog();

  // ── footer ─────────────────────────────────────────────────────────────────
  const uptime = ((Date.now() - connectedAt) / 1000).toFixed(0);
  console.log(dim(`  steps: ${stepCount}   iters: ${iterCount}   uptime: ${uptime}s   log: ${LOG_PATH}   Ctrl-C to stop`));
}

// ── raw mode printer ──────────────────────────────────────────────────────────
function printRaw(msg) {
  const tc  = TYPE_COLOR[msg.type] || WHITE;
  const ts  = new Date().toLocaleTimeString();
  const sep = col(tc, "━".repeat(W()));
  console.log(sep);
  console.log(`${col(tc, bold(msg.type.toUpperCase()))}  ${dim(ts)}`);
  console.log(JSON.stringify(msg, null, 2));
}

// ── CLI parsing ───────────────────────────────────────────────────────────────
function parseArgs() {
  const argv   = process.argv.slice(2);
  let rawMode  = false;
  const rest   = [];
  for (const a of argv) {
    if (a === "--raw") rawMode = true;
    else               rest.push(a);
  }
  const url    = rest[0] && !rest[0].startsWith("--") ? rest[0] : "ws://localhost:8765";
  const config = {};
  const pairs  = (rest[0] && !rest[0].startsWith("--") ? rest.slice(1) : rest)
                 .filter(a => a !== "--");
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    let val;
    if      (raw === "true")  val = true;
    else if (raw === "false") val = false;
    else if (!isNaN(Number(raw)) && raw !== "") val = Number(raw);
    else    val = raw;
    if (key in config) config[key] = [].concat(config[key], val);
    else               config[key] = val;
  }
  return { url, config, rawMode };
}

// ── main ──────────────────────────────────────────────────────────────────────
const { url, config, rawMode } = parseArgs();

if (!rawMode) {
  clearScreen();
  console.log(header("  🌑  DARK FOREST  "));
  console.log();
  console.log(`  Connecting to ${col(CYAN, url)} …`);
  if (Object.keys(config).length) console.log(`  ${dim("Config:")} ${JSON.stringify(config)}`);
  console.log(`  ${dim("Log file:")} ${LOG_PATH}`);
  console.log();
} else {
  console.log(bold("Dark Forest – raw mode"));
  console.log(dim(`Connecting to ${url} …\n`));
}

const ws = new WebSocket(url);

ws.on("open", () => {
  if (!rawMode) console.log(col(GREEN, "  ✓  Connected.  Sending start …\n"));
  else          console.log(col(GREEN, "Connected. Sending start …\n"));
  ws.send(JSON.stringify({ cmd: "start", config }));
});

ws.on("message", raw => {
  let msg;
  try { msg = JSON.parse(raw); }
  catch { console.error(col(RED, "Bad JSON from server")); return; }

  // Always log to file
  logMessage(msg);

  if (rawMode) {
    // ── raw mode: just dump JSON ────────────────────────────────────────────
    printRaw(msg);
    if (msg.type === "done" || msg.type === "stopped") ws.close();
    return;
  }

  // ── viz mode ───────────────────────────────────────────────────────────────
  pushLog(msg);

  switch (msg.type) {
    case "started":
      if (msg.grid)   gridCfg = msg.grid;
      if (msg.agents) assignColors(msg.agents);
      clearScreen();
      console.log(header("  🌑  DARK FOREST  – training started  "));
      console.log();
      console.log(`  ${dim("run:")} ${msg.config?.run_name||"?"}   ${dim("grid:")} ${gridCfg.width}×${gridCfg.height}   ${dim("agents:")} ${agentNames.join(", ")}`);
      console.log(`  ${dim("envs:")} ${msg.config?.num_envs}   ${dim("steps:")} ${fmtBig(msg.config?.total_timesteps)}   ${dim("critic:")} ${msg.config?.critic}`);
      console.log(`  ${dim("log →")} ${LOG_PATH}`);
      console.log();
      break;

    case "step":
      stepCount++;
      if (msg.grid)   gridCfg = msg.grid;
      if (msg.agents) assignColors(msg.agents);
      lastStep = msg;
      render();
      break;

    case "episode":
      lastEpMeta = msg.meta;
      break;

    case "iteration":
      iterCount++;
      lastItStats = msg.stats;
      if (!lastStep || lastStep.iteration !== msg.iteration) render();
      break;

    case "done":
      clearScreen();
      console.log(header("  🌑  DARK FOREST  – TRAINING COMPLETE  "));
      console.log();
      console.log(`  ${col(GREEN, bold("✓  Done"))}   iterations: ${bold(String(msg.iterations))}   steps: ${bold(fmtBig(msg.global_step))}`);
      if (msg.stop_reason) console.log(`  ${dim("Stop reason:")} ${col(YELLOW, msg.stop_reason)}`);
      if (lastItStats) {
        console.log(`  ${dim("Mean return:")}    ${bold(fmt(lastItStats.mean_episode_return))}`);
        console.log(`  ${dim("Mean survivors:")} ${bold(fmt(lastItStats.mean_survivors,2))}`);
      }
      renderMsgLog();
      console.log();
      ws.close();
      break;

    case "stopped":
      console.log(`\n  ${col(YELLOW, bold("⏹  Stopped."))}\n`);
      ws.close();
      break;

    case "stopping":
      console.log(col(YELLOW, "\n  ⏸  Stop requested …"));
      break;

    case "error":
      console.log(`\n  ${col(RED, bold("✗  Error:"))} ${msg.message}\n`);
      break;

    default:
      console.log(dim(`  [unknown type: ${msg.type}]`));
  }
});

ws.on("error", err => { console.error(col(RED, `\n✗  ${err.message}`)); process.exit(1); });
ws.on("close", code => { console.log(dim(`\nConnection closed (${code}).`)); process.exit(0); });

process.on("SIGINT", () => {
  console.log(col(YELLOW, "\nCtrl-C – sending stop …"));
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ cmd: "stop" }));
    setTimeout(() => process.exit(0), 1500);
  } else {
    process.exit(0);
  }
});