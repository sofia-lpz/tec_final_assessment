

// Use relative paths to proxy through Next.js (no CORS issues)
const API_URL = '/api';
const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'auth_role';

export const getToken = () => localStorage.getItem(TOKEN_KEY);


export const getRole = () => localStorage.getItem(ROLE_KEY);

export const setAuth = (token, role) => {
    localStorage.setItem(TOKEN_KEY, token);
    if (role) localStorage.setItem(ROLE_KEY, role);
};

export const clearAuth = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
};

// ---------- core request wrapper ----------
const request = async (path, { method = 'GET', body, query, auth = true, headers = {} } = {}) => {
    let url = `${API_URL}${path}`;
    if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([k, v]) => {
            if (v !== undefined && v !== null) params.append(k, v);
        });
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
    }

    const finalHeaders = { 'Content-Type': 'application/json', ...headers };
    if (auth) {
        const token = getToken();
        if (!token) throw new Error('Not authenticated');
        finalHeaders.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
        clearAuth();
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
        const err = new Error(data?.error || data?.message || `Request failed (${res.status})`);
        err.status = res.status;
        err.body = data;
        throw err;
    }

    // Expose list metadata when present (matches X-Total-Count / Content-Range from controller)
    const total = res.headers.get('X-Total-Count');
    if (total !== null && Array.isArray(data)) {
        return { data, total: Number(total) };
    }
    return data;
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
    } finally {
        clearAuth();
    }
};

// ============================================================
// Users
// ============================================================

export const getUsers = async (params = {}) => {
    return request('/users', { query: params });
};

export const getOneUser = async (id) => {
    return request(`/users/${id}`);
};

export const createUser = async ({ username, password, role = 'user' }) => {
    return request('/users', {
        method: 'POST',
        body: { username, password, role },
    });
};

export const updateUser = async (id, patch) => {
    return request(`/users/${id}`, {
        method: 'PUT',
        body: patch,
    });
};

export const deleteUser = async (id) => {
    return request(`/users/${id}`, { method: 'DELETE' });
};

// ============================================================
// Scenarios
// ============================================================

export const createScenario = async (scenario) => {
    return request('/scenarios', {
        method: 'POST',
        body: { scenario },
    });
};

export const getScenariosByUser = async () => {
    return request('/scenarios');
};

export const getOneScenarioByUser = async (id) => {
    return request(`/scenarios/${id}`);
};

export const updateScenario = async (id, patch) => {
    return request(`/scenarios/${id}`, {
        method: 'PUT',
        body: patch,
    });
};

export const deleteScenario = async (id) => {
    return request(`/scenarios/${id}`, { method: 'DELETE' });
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
};

export default dataProvider;