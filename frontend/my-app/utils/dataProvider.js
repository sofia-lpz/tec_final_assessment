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

export const getScenariosByUser = async (options = {}) => {
    return request('/scenarios', options);
};

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

    // Browsers can't set headers on WebSockets, so auth goes in the query string
    const token = getToken();
    if (!token) {
        return Promise.reject(new ApiError('Not authenticated', { code: 'NOT_AUTHENTICATED', status: 401 }));
    }
    const url = `${baseUrl}?token=${encodeURIComponent(token)}`;

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
 * Sends the current PPO-controls configuration to the simulation server
 * over the WebSocket, asking it to apply the config and restart.
 *
 * @param {object} config - the ConfigState from PPOControls ({ ppo, env, rewards })
 */
export const applyAndRestart = async (config) => {
    await sendSocketMessage({
        type: 'apply_and_restart',
        config,
        sentAt: new Date().toISOString(),
    });
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
    updateScenario, deleteScenario,
    // simulation (websocket)
    applyAndRestart, onSimulationMessage, closeSimulationSocket,
};

export default dataProvider;