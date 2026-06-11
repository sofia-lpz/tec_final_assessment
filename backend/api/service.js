import * as db from "./db.js";

export const login = async (username, password) => {
    try {
        const user = await db.verifyPassword(username, password);
        return user;
    } catch (error) {
        throw error;
    }
};

export const incrementTokenVersion = async (id) => {
    try {
        const result = await db.incrementTokenVersion(Number(id));
        return result;
    } catch (error) {
        throw error;
    }
}

//Users
export const getUsers = async (req) => {
    try {
        const user = await db.getUsers(req);
        return user;
    } catch (error) {
        throw error;
    }
};

export const updateUser = async (id, updateData) => {
    try {
        const result = await db.updateUser(Number(id), updateData);
        return result;
    } catch (error) {
        throw error;
    }
};

export const createUser = async (username, password, role) => {
    try {
        const result = await db.createUser(username, password, role);
        return result;
    } catch (error) {
        throw error;
    }
};

export const deleteUser = async (id) => {
    try {
        const result = await db.deleteUser(Number(id));
        return result;
    } catch (error) {
        throw error;
    }
};

export const getOneUser = async (id) => {
    try {
        const result = await db.getOneUser(Number(id));
        return result;
    } catch (error) {
        throw error;
    }
};

export const countAdminUsers = async () => {
    try {
        const result = await db.countAdminUsers();
        return result;
    } catch (error) {
        throw error;
    }
};

//Scenarios
export const createScenario = async (scenarioData, userId) => {
    try {
        const result = await db.createScenario({ ...scenarioData, user_id: userId });
        return result;
    } catch (error) {
        throw error;
    }
};

export const getScenariosByUser = async (userId) => {
    try {
        const scenarios = await db.getScenariosByUser(userId);
        return scenarios;
    } catch (error) {
        throw error;
    }
};

export const getOneScenarioByUser = async (scenarioId, userId) => {
    try {
        const scenario = await db.getOneScenarioByUser(scenarioId, userId);
        return scenario;
    } catch (error) {
        throw error;
    }
};

export const updateScenario = async (id, updateData) => {
    try {
        const result = await db.updateScenario(Number(id), updateData);
        return result;
    } catch (error) {
        throw error;
    }
};

export const deleteScenario = async (id) => {
    try {
        const result = await db.deleteScenario(Number(id));
        return result;
    } catch (error) {
        throw error;
    }
};