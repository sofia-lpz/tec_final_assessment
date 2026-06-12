// Use relative paths to proxy through Next.js (no CORS issues)
const API_URL = '/api';
const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'auth_role';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;            // retries for transient failures (network / 5xx / timeout)
const RETRY_DELAY_MS = 500;           // base delay, doubles each attempt

// ============================================================
// Errors
// ============================================================

export class ApiError extends Error {
    constructor(message, { status = 0, body = null, code = 'API_ERROR', cause } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;   // HTTP status, 0 if no response received
        this.body = body;       // parsed response body, if any
        this.code = code;       // 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'HTTP' | 'NOT_AUTHENTICATED'
        if (cause) this.cause = cause;
    }

    get isTimeout() { return this.code === 'TIMEOUT'; }
    get isNetworkError() { return this.code === 'NETWORK'; }
    get isUnauthorized() { return this.status === 401; }
}

// ============================================================
// Auth storage (guarded for SSR — localStorage doesn't exist on the server)
// ============================================================

const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const getToken = () => (hasStorage() ? localStorage.getItem(TOKEN_KEY) : null);

export const getRole = () => (hasStorage() ? localStorage.getItem(ROLE_KEY) : null);

export const setAuth = (token, role) => {
    if (!hasStorage()) return;
    localStorage.setItem(TOKEN_KEY, token);
    if (role) localStorage.setItem(ROLE_KEY, role);
};

export const clearAuth = () => {
    if (!hasStorage()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
};

/**
 * Handle unauthorized (401) errors by stopping the simulation,
 * closing the socket, clearing auth, and redirecting to login.
 * Called when an API request or WebSocket receives a 401 response.
 */
export const handleUnauthorized = async () => {
    // Try to stop the simulation gracefully
    try {
        await stopSimulation();
    } catch {
        // Ignore errors — we're logging out anyway
    }

    // Close the WebSocket connection
    closeSimulationSocket();

    // Clear stored auth tokens
    clearAuth();

    // Redirect to login page
    if (typeof window !== 'undefined') {
        window.location.href = '/';
    }
};

// ============================================================
// Helpers
// ============================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUrl = (path, query) => {
    let url = `${API_URL}${path}`;
    if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([k, v]) => {
            if (v !== undefined && v !== null) params.append(k, v);
        });
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
    }
    return url;
};

const parseBody = async (res) => {
    const contentType = res.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) return await res.json();
        return await res.text();
    } catch {
        // Malformed JSON or empty body — don't blow up, just return null
        return null;
    }
};

// Retry only on errors that are plausibly transient
const isRetryable = (err, method) => {
    // Never retry non-idempotent writes by default
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
    if (err instanceof ApiError) {
        return err.isTimeout || err.isNetworkError || (err.status >= 500 && err.status <= 599);
    }
    return false;
};

// ---------- core request wrapper ----------
const request = async (
    path,
    {
        method = 'GET',
        body,
        query,
        auth = true,
        headers = {},
        timeout = DEFAULT_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
        signal: externalSignal,
    } = {}
) => {
    const url = buildUrl(path, query);

    const finalHeaders = { 'Content-Type': 'application/json', ...headers };
    if (auth) {
        const token = getToken();
        if (!token) {
            throw new ApiError('Not authenticated', { code: 'NOT_AUTHENTICATED', status: 401 });
        }
        finalHeaders.Authorization = `Bearer ${token}`;
    }

    let attempt = 0;
    // attempts = 1 initial try + `retries` retries (retries only apply to safe methods)
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Allow callers to pass their own AbortSignal (e.g. component unmount)
        const onExternalAbort = () => controller.abort();
        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }

        try {
            let res;
            try {
                res = await fetch(url, {
                    method,
                    headers: finalHeaders,
                    body: body !== undefined ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
            } catch (err) {
                // Distinguish timeout/cancel from network failure
                if (err.name === 'AbortError') {
                    if (externalSignal?.aborted) {
                        throw new ApiError('Request cancelled', { code: 'CANCELLED', cause: err });
                    }
                    throw new ApiError(`Request timed out after ${timeout}ms`, {
                        code: 'TIMEOUT',
                        cause: err,
                    });
                }
                throw new ApiError('Network error — check your connection', {
                    code: 'NETWORK',
                    cause: err,
                });
            }

            if (res.status === 401) {
                clearAuth();
                throw new ApiError('Unauthorized', { status: 401, code: 'UNAUTHORIZED' });
            }

            const data = await parseBody(res);

            if (!res.ok) {
                const message =
                    (data && typeof data === 'object' && (data.error || data.message)) ||
                    `Request failed (${res.status})`;
                throw new ApiError(message, { status: res.status, body: data, code: 'HTTP' });
            }

            // Expose list metadata when present (matches X-Total-Count / Content-Range)
            const total = res.headers.get('X-Total-Count');
            if (total !== null && Array.isArray(data)) {
                return { data, total: Number(total) };
            }
            return data;
        } catch (err) {
            const canRetry = attempt < retries && isRetryable(err, method) && !externalSignal?.aborted;
            if (!canRetry) throw err;
            attempt += 1;
            await sleep(RETRY_DELAY_MS * 2 ** (attempt - 1)); // 500ms, 1s, 2s...
        } finally {
            clearTimeout(timeoutId);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }
};

// ============================================================
// Auth
// ============================================================

export const login = async (username, password) => {
    const data = await request('/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
    });
    if (data?.token) setAuth(data.token, data.role);
    return data; // { status, token, role }
};

export const register = async (username, password) => {
    return request('/register', {
        method: 'POST',
        body: { username, password },
        auth: false,
    });
};

export const logout = async () => {
    try {
        return await request('/logout', { method: 'POST' });
    } catch (err) {
        // Logout should never throw to the UI — local auth is cleared regardless
        return null;
    } finally {
        clearAuth();
    }
};

// ============================================================
// Users
// ============================================================

export const getUsers = async (params = {}, options = {}) => {
    return request('/users', { query: params, ...options });
};

export const getOneUser = async (id, options = {}) => {
    return request(`/users/${encodeURIComponent(id)}`, options);
};

export const createUser = async ({ username, password, role = 'user' }, options = {}) => {
    return request('/users', {
        method: 'POST',
        body: { username, password, role },
        ...options,
    });
};

export const updateUser = async (id, patch, options = {}) => {
    return request(`/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: patch,
        ...options,
    });
};

export const deleteUser = async (id, options = {}) => {
    return request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE', ...options });
};

// ============================================================
// Scenarios
// ============================================================

export const createScenario = async (scenario, options = {}) => {
    return request('/scenarios', {
        method: 'POST',
        body: { scenario },
        ...options,
    });
};

/**
 * Fetch the current user's scenarios with optional pagination/sorting.
 * Matches the backend's react-admin-style params (_start/_end/_sort/_order).
 * When pagination params are sent, the response is { data, total } thanks to
 * the X-Total-Count handling in `request`.
 *
 * @param {object} [params]
 * @param {number} [params.start] - offset of the first row (inclusive)
 * @param {number} [params.end]   - offset of the last row (exclusive)
 * @param {string} [params.sort]  - column to sort by (e.g. 'name', 'id')
 * @param {'ASC'|'DESC'} [params.order]
 */
export const getScenariosByUser = async ({ start, end, sort, order } = {}, options = {}) => {
    const query = {};
    if (start !== undefined) query._start = start;
    if (end !== undefined) query._end = end;
    if (sort !== undefined) query._sort = sort;
    if (order !== undefined) query._order = order;
    const result = await request('/scenarios', { query, ...options });
    // Normalise: always return { data, total } so callers don't need to branch
    if (Array.isArray(result)) return { data: result, total: result.length };
    return result;
};

/**
 * Translate a flat scenario row from the database (snake_case columns) into
 * the nested camelCase ConfigState shape used by PPOControls. Inverse of the
 * flattening done when saving. Number() guards against MySQL DECIMAL columns
 * arriving as strings.
 */
export const scenarioToConfig = (row) => ({
    ppo: {
        learningRate: Number(row.learning_rate),
        gamma: Number(row.gamma),
        critic: row.critic,
    },
    env: {
        civilizations: Number(row.civilizations),
        width: Number(row.map_width),
        height: Number(row.map_height),
        planets: Number(row.planets),
        harvestRate: Number(row.harvest_rate),
        initialResources: Number(row.initial_resources),
        initialPopulation: Number(row.initial_population),
        maxSteps: Number(row.max_steps),
    },
    rewards: {
        broadcast: Number(row.broadcast_reward),
        destroyed: Number(row.destroyed_reward),
        conquer: Number(row.conquer_reward),
        colonize: Number(row.colonize_reward),
        survive: Number(row.survive_reward),
        population: Number(row.population_reward),
        science: Number(row.science_reward),
        explore: Number(row.explore_reward),
        invalid: Number(row.invalid_reward),
    },
});

export const getOneScenarioByUser = async (id, options = {}) => {
    return request(`/scenarios/${encodeURIComponent(id)}`, options);
};

export const updateScenario = async (id, patch, options = {}) => {
    return request(`/scenarios/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: patch,
        ...options,
    });
};

export const deleteScenario = async (id, options = {}) => {
    return request(`/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE', ...options });
};

// ============================================================
// WebSocket (simulation control channel)
// ============================================================

const WS_CONNECT_TIMEOUT_MS = 10000;

// Resolve ws:// vs wss:// from the page protocol. Override with
// NEXT_PUBLIC_WS_URL if the socket server lives somewhere else
// (the Next.js dev proxy does not forward WebSocket upgrades).
const getWsUrl = () => {
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window === 'undefined') return null;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/ws`;
};

let socket = null;          // the singleton WebSocket
let socketReady = null;     // promise that resolves when the socket is open
const messageListeners = new Set();

const connectSocket = () => {
    // Reuse a live or in-flight connection
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return socketReady;
    }

    const baseUrl = getWsUrl();
    if (!baseUrl) {
        return Promise.reject(new ApiError('WebSocket unavailable on the server', { code: 'NETWORK' }));
    }

    // Browsers can't set headers on WebSockets, so auth goes in the query string.
    // The sim server (vizWebsocket.py) currently doesn't validate the token, so
    // we attach it when available but don't refuse to connect without one.
    const token = getToken();
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

    socket = new WebSocket(url);

    socketReady = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            socket?.close();
            reject(new ApiError(`WebSocket connection timed out after ${WS_CONNECT_TIMEOUT_MS}ms`, { code: 'TIMEOUT' }));
        }, WS_CONNECT_TIMEOUT_MS);

        socket.onopen = () => {
            clearTimeout(timeoutId);
            resolve(socket);
        };

        socket.onerror = () => {
            clearTimeout(timeoutId);
            reject(new ApiError('WebSocket connection failed', { code: 'NETWORK' }));
        };

        socket.onclose = () => {
            clearTimeout(timeoutId);
            socket = null;
            socketReady = null;
        };

        socket.onmessage = (event) => {
            let payload = event.data;
            try { payload = JSON.parse(event.data); } catch { /* leave as raw text */ }
            messageListeners.forEach((listener) => listener(payload));
        };
    });

    return socketReady;
};

// Subscribe to messages pushed by the simulation server (status, metrics, ...).
// Returns an unsubscribe function.
/**
 * @param {(payload: any) => void} listener - callback to receive messages
 * @returns {() => void} unsubscribe function
 */
export const onSimulationMessage = (listener) => {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
};

export const closeSimulationSocket = () => {
    if (socket) socket.close();
    socket = null;
    socketReady = null;
};

const sendSocketMessage = async (message) => {
    const ws = await connectSocket();
    ws.send(JSON.stringify(message));
};

/**
 * Tells the simulation server to begin a training run with the given config.
 * Matches the {cmd: "start", config} contract in vizWebsocket.py. The server
 * will reply with a "started" message followed by a stream of "step",
 * "iteration", "episode", "done" frames over onSimulationMessage.
 *
 * @param {object} [config] - any train.py / config.py argument override
 *   (num_envs, width, height, names, total_timesteps, stream_every, ...)
 */
export const startSimulation = async (config = {}) => {
    await sendSocketMessage({ cmd: 'start', config });
};

/**
 * Asks the simulation server to abort the current run. Server replies with
 * a "stopping" then "stopped" message.
 */
export const stopSimulation = async () => {
    await sendSocketMessage({ cmd: 'stop' });
};

// ============================================================
// Training metrics (feeds <GraficasContainer />)
// ============================================================
//
// The sim server emits one {"type": "iteration", stats: {...}} frame per PPO
// iteration (see vizWebsocket.py). The functions below translate those frames
// into the IterationMetrics shape Graphics.tsx renders, and accumulate them
// into a chart-ready array that resets whenever a new run starts.

// Coerce server values: vizWebsocket sanitizes NaN/Inf to null, and fields
// like mean_episode_return are null for the first iterations (no episode has
// finished yet). Recharts simply skips null points, which is the honest
// rendering — so we pass nulls through rather than faking zeros.
const finiteOrNull = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Map one websocket "iteration" frame to the IterationMetrics shape used by
 * GraficasContainer. Returns null for any other message type.
 *
 * Server field          → chart field
 * broadcast_rate        → broadcastRate        (0..1, from the training batch)
 * mean_survivors        → avgSurvivors         (rolling mean, last 100 eps)
 * time_to_annihilation  → timeToAnnihilation   (replay episode: MEAN over civs
 *                                               of steps from a civ's first
 *                                               broadcast to ITS OWN death;
 *                                               null = no broadcaster died /
 *                                               no replay streamed this iter)
 * mean_episode_return   → avgReward            (rolling mean, last 100 eps)
 * policy_loss           → policyLoss
 * value_loss            → valueLoss
 * entropy               → entropy              (raw policy entropy, NOT loss_entropy)
 * approx_kl             → approxKL
 *
 * @param {any} msg - a payload delivered by onSimulationMessage
 * @returns {object|null} IterationMetrics point, or null if not an iteration frame
 */
export const toIterationMetrics = (msg) => {
    if (!msg || typeof msg !== 'object' || msg.type !== 'iteration') return null;
    const s = msg.stats || {};
    return {
        iteration: s.iteration ?? msg.iteration ?? 0,
        broadcastRate: finiteOrNull(s.broadcast_rate),
        avgSurvivors: finiteOrNull(s.mean_survivors),
        timeToAnnihilation: finiteOrNull(s.time_to_annihilation),
        avgReward: finiteOrNull(s.mean_episode_return),
        policyLoss: finiteOrNull(s.policy_loss),
        valueLoss: finiteOrNull(s.value_loss),
        entropy: finiteOrNull(s.entropy),
        approxKL: finiteOrNull(s.approx_kl),
        // Extras (not charted yet, but cheap to carry):
        nBroadcasterDeaths: finiteOrNull(s.n_broadcaster_deaths),
        globalStep: finiteOrNull(s.global_step ?? msg.global_step),
        learningRate: finiteOrNull(s.learning_rate),
        broadcastEma: finiteOrNull(s.broadcast_ema),
        stopReason: s.stop_reason ?? null,
    };
};

// Keep memory bounded on very long runs; well above anything Recharts can
// usefully draw anyway.
const MAX_METRIC_POINTS = 5000;

// EMA over timeToAnnihilation (alpha = weight of the newest sample). Computed
// client-side because it depends on accumulation order and must reset with
// each run. Carries the previous value forward through null gaps (iterations
// with no broadcaster death) so the trend line stays continuous.
const TTA_EMA_ALPHA = 0.2;

const withTtaEma = (point, prevPoint) => {
    const prevEma = prevPoint ? prevPoint.ttaEma : null;
    const v = point.timeToAnnihilation;
    let ttaEma;
    if (v == null) ttaEma = prevEma; // gap → hold the trend
    else if (prevEma == null) ttaEma = v; // first sample seeds the EMA
    else ttaEma = TTA_EMA_ALPHA * v + (1 - TTA_EMA_ALPHA) * prevEma;
    return { ...point, ttaEma };
};

/**
 * Create an accumulating metrics feed over the simulation socket.
 *
 * - Appends one point per "iteration" frame (replacing a point if the same
 *   iteration is re-emitted, e.g. after a reconnect).
 * - Clears itself when a "started" frame arrives (new run = fresh charts).
 * - Notifies subscribers with a NEW array reference on every change, so it is
 *   safe to hand straight to React state or useSyncExternalStore.
 *
 * Typical React usage:
 *
 *   const feed = useMemo(() => createMetricsFeed(), []);
 *   useEffect(() => () => feed.destroy(), [feed]);
 *   const metrics = useSyncExternalStore(feed.subscribe, feed.getMetrics, () => []);
 *   return <GraficasContainer data={metrics} />;
 *
 * (or the singleton below if several components share one chart source)
 *
 * @param {object} [options]
 * @param {number} [options.maxPoints] - cap on retained points (default 5000)
 */
export const createMetricsFeed = ({ maxPoints = MAX_METRIC_POINTS } = {}) => {
    let metrics = [];
    const subscribers = new Set();

    const notify = () => subscribers.forEach((fn) => fn(metrics));

    const unsubscribeSocket = onSimulationMessage((msg) => {
        if (!msg || typeof msg !== 'object') return;

        // New run → wipe the old curves.
        if (msg.type === 'started') {
            if (metrics.length) {
                metrics = [];
                notify();
            }
            return;
        }

        const point = toIterationMetrics(msg);
        if (!point) return;

        const lastPoint = metrics[metrics.length - 1];
        if (lastPoint && lastPoint.iteration === point.iteration) {
            // Same iteration re-emitted — replace instead of duplicating.
            // EMA chains from the point BEFORE the one being replaced.
            metrics = [
                ...metrics.slice(0, -1),
                withTtaEma(point, metrics[metrics.length - 2]),
            ];
        } else {
            metrics = [...metrics, withTtaEma(point, lastPoint)];
        }
        if (metrics.length > maxPoints) metrics = metrics.slice(-maxPoints);
        notify();
    });

    return {
        /** Current immutable snapshot (stable reference between changes). */
        getMetrics: () => metrics,
        /**
         * Subscribe to changes. Listener is called immediately with the
         * current snapshot, then on every new/updated point.
         * @param {(metrics: object[]) => void} fn
         * @returns {() => void} unsubscribe
         */
        subscribe: (fn) => {
            subscribers.add(fn);
            fn(metrics);
            return () => subscribers.delete(fn);
        },
        /** Manually clear accumulated points (e.g. a "reset charts" button). */
        clear: () => {
            metrics = [];
            notify();
        },
        /** Detach from the socket and drop all subscribers. */
        destroy: () => {
            unsubscribeSocket();
            subscribers.clear();
        },
    };
};

// Lazy app-wide singleton: every chart in the app shares one accumulation of
// the current run. Created on first use so importing dataProvider stays
// side-effect free (important for SSR).
let metricsFeed = null;

/** @returns {ReturnType<typeof createMetricsFeed>} */
export const getSimulationMetricsFeed = () => {
    if (!metricsFeed) metricsFeed = createMetricsFeed();
    return metricsFeed;
};

/**
 * Translate the nested camelCase config from PPOControls into the flat
 * snake_case shape that train.py / config.py expects (see _build_args in
 * vizWebsocket.py — it raises AttributeError on unknown keys).
 */
const toServerConfig = (config) => {
    const { ppo = {}, env = {}, rewards = {} } = config || {};
    const out = {};

    // PPO
    if (ppo.learningRate !== undefined) out.learning_rate = ppo.learningRate;
    if (ppo.gamma !== undefined) out.gamma = ppo.gamma;
    // train.py: centralised=(args.critic == "centralized")  → MAPPO vs IPPO
    if (ppo.critic !== undefined) {
        out.critic = ppo.critic === 'MAPPO' ? 'centralized' : 'independent';
    }

    // Env — civilizations is expressed as the `names` list length
    if (env.civilizations !== undefined) {
        out.names = Array.from({ length: env.civilizations }, (_, i) => `civ_${i + 1}`);
    }
    if (env.width !== undefined) out.width = env.width;
    if (env.height !== undefined) out.height = env.height;
    if (env.planets !== undefined) out.initial_planets = env.planets;
    if (env.harvestRate !== undefined) out.harvest_rate = env.harvestRate;
    if (env.initialResources !== undefined) out.initial_resources = env.initialResources;
    if (env.initialPopulation !== undefined) out.initial_population = env.initialPopulation;
    if (env.maxSteps !== undefined) out.max_steps = env.maxSteps;

    // Rewards — keys already match the GROUP reward dict in rewards.py
    if (rewards && Object.keys(rewards).length) out.reward_weights = { ...rewards };

    return out;
};

// Wait for the next message matching `predicate`, or resolve on timeout.
const waitForMessage = (predicate, timeoutMs = 5000) =>
    new Promise((resolve) => {
        const unsubscribe = onSimulationMessage((msg) => {
            if (msg && typeof msg === 'object' && predicate(msg)) {
                clearTimeout(timer);
                unsubscribe();
                resolve(msg);
            }
        });
        const timer = setTimeout(() => { unsubscribe(); resolve(null); }, timeoutMs);
    });

// How long to wait for the training thread to actually finish after we ask it
// to stop. Large grids (100×100, 5 civs) can take 30–60 s to complete one
// iteration, so we need a generous ceiling here.
const STOP_TIMEOUT_MS = 90_000;

// After sending start, the server echoes "started" immediately, or returns an
// "already running" error if the old thread hasn't exited yet. We retry a few
// times with a short back-off before giving up.
const START_MAX_RETRIES = 10;
const START_RETRY_DELAY_MS = 1_500;

/**
 * Stops the current run (if any), waits for confirmation that the training
 * thread has fully exited, then starts a new one with the PPOControls config.
 *
 * Race conditions addressed:
 *   1. The old training thread may take a long time to notice stop_event
 *      (it only checks at the top of each iteration). We wait up to 90 s.
 *   2. The thread emits "stopped" and then runs its `finally` block to clean
 *      up before truly exiting. If we fire start between those two moments the
 *      server still returns "training already running". We retry with back-off.
 *
 * @param {object} config - the ConfigState from PPOControls ({ ppo, env, rewards })
 */
export const applyAndRestart = async (config) => {
    const serverConfig = toServerConfig(config);

    // Arm the listener BEFORE sending stop so we don't miss "stopped"/"done"
    // arriving during the await below.
    //   "stopped" — training thread aborted by our stop command
    //   "done"    — training finished naturally (rare timing edge case)
    //   "error" /nothing to stop/ — no run was active, safe to start immediately
    const stopAck = waitForMessage(
        (m) => m.type === 'stopped' ||
               m.type === 'done' ||
               (m.type === 'error' && /nothing to stop/i.test(m.message || '')),
        STOP_TIMEOUT_MS,
    );

    await sendSocketMessage({ cmd: 'stop' });
    const stopResult = await stopAck;

    if (stopResult === null) {
        // Timed out — the thread may still be running. Throw so the UI can
        // show an error rather than silently proceeding.
        throw new ApiError(
            `Training did not stop within ${STOP_TIMEOUT_MS / 1000}s. ` +
            'Try again once the current iteration finishes.',
            { code: 'TIMEOUT' },
        );
    }

    // Small grace period: the thread emits "stopped" and then runs its
    // `finally` block. If we fire start immediately we can still hit
    // "training already running". 300 ms is usually enough; the retry loop
    // below handles the rest.
    await sleep(300);

    // Retry loop: send start, wait for "started" or "already running" error.
    for (let attempt = 1; attempt <= START_MAX_RETRIES; attempt++) {
        // Arm the start-ack listener before sending so we can't miss the reply.
        const startAck = waitForMessage(
            (m) => m.type === 'started' ||
                   (m.type === 'error' && /already running/i.test(m.message || '')),
            START_RETRY_DELAY_MS * 2,
        );

        await sendSocketMessage({ cmd: 'start', config: serverConfig });

        const startResult = await startAck;

        if (startResult && startResult.type === 'started') {
            // Server confirmed the new run — we're done.
            return;
        }

        if (startResult && startResult.type === 'error' &&
            /already running/i.test(startResult.message || '')) {
            // Old thread hasn't fully exited yet. Back off and retry.
            if (attempt < START_MAX_RETRIES) {
                await sleep(START_RETRY_DELAY_MS);
                continue;
            }
            throw new ApiError(
                'Could not start new training: server reports training is still running ' +
                `after ${START_MAX_RETRIES} attempts. Please wait and try again.`,
                { code: 'API_ERROR' },
            );
        }

        // startAck timed out (null) — send again.
        if (startResult === null && attempt < START_MAX_RETRIES) {
            await sleep(START_RETRY_DELAY_MS);
            continue;
        }

        if (startResult === null) {
            throw new ApiError(
                'No confirmation received from server after sending start.',
                { code: 'TIMEOUT' },
            );
        }
    }
};

// ============================================================
// Default export: grouped namespace
// ============================================================

const dataProvider = {
    // auth
    login, register, logout, getToken, getRole, clearAuth,
    // users
    getUsers, getOneUser, createUser, updateUser, deleteUser,
    // scenarios
    createScenario, getScenariosByUser, getOneScenarioByUser,
    updateScenario, deleteScenario, scenarioToConfig,
    // simulation (websocket)
    startSimulation, stopSimulation, applyAndRestart,
    onSimulationMessage, closeSimulationSocket,
    // training metrics (charts)
    toIterationMetrics, createMetricsFeed, getSimulationMetricsFeed,
};

export default dataProvider;