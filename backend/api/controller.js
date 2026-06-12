import jwt from 'jsonwebtoken';
import * as Service from './service.js';
import { logger } from '../utils/logger/logger.js';

// Validation helper for Scenario required fields
const validateScenarioData = (data) => {
    const requiredFields = [
        'name', 'broadcast_reward', 'destroyed_reward', 'conquer_reward',
        'colonize_reward', 'survive_reward', 'population_reward', 'science_reward',
        'explore_reward', 'invalid_reward', 'civilizations', 'map_width', 'map_height',
        'planets', 'harvest_rate', 'initial_resources', 'initial_population', 'max_steps', 'critic'
    ];

    const missingFields = requiredFields.filter(field => !(field in data) || data[field] === undefined);
    if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    return data;
};

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Service.login(username, password);
        if (user) {
            const token = jwt.sign({ id: user.id, username: user.username, tokenVersion: user.token_version }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const role = user.role;
            res.send({ status: "OK", token, role });
            logger.info({ event: 'login_success', userId: user.id, ip: req.ip }, 'User logged in');
        }
    } catch (error) {
        if (error.message === 'User not found' || error.message === 'Invalid password') {
            res.status(401).send({ status: "Error", message: "Invalid credentials" });
            logger.warn({ event: 'login_failure', username, ip: req.ip }, 'Failed login attempt');
        } else {
            console.error(error);
            res.status(500).send({ status: "Error", message: "Internal Server Error" });
        }
    }
};

export const register = async (req, res) => {
    try {
        const { username, password} = req.body;
        const role = 'user'
        const userId = await Service.createUser(username, password, role);
        res.json({ id: userId, username, role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        await Service.incrementTokenVersion(req.userId);
        res.send({ status: "OK", message: "Logged out"});
        logger.info({ event: 'logout', userId: req.userId }, 'User logged out');
    } catch (error) {
        res.status(500).send({ status: "Error", message: "Internal Server Error"});
    }
};

//Users
export const getUsers = async (req, res) => {
    try {
        if ("_sort" in req.query) {
            let start = Number(req.query._start);
            let end = Number(req.query._end);

            let data = await Service.getUsers(req);

            res.set("Access-Control-Expose-Headers", "X-Total-Count");
            res.set("X-Total-Count", data.length);
            res.set("Content-Range", `${start}-${end}/${data.length}`);
            data = data.slice(start, end);
            res.json(data);
        } else {
            let data = await Service.getUsers(req);
            res.set("Access-Control-Expose-Headers", "X-Total-Count");
            res.set("X-Total-Count", data.length);
            res.set("Content-Range", `0-${data.length}/${data.length}`);
            res.json(data);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateUser = async (req, res) => {
    try {
        const user = await Service.getOneUser(req.params.id);
        if (user.role === 'admin' && req.body.role !== 'admin') {
            const adminCount = await Service.countAdminUsers();
            if (adminCount <= 1) {
                res.status(400).json({ error: "Cannot demote the last admin user" });
                return;
            }
        }
        const data = await Service.updateUser(req.params.id, req.body);
        res.json(data);
        if (req.body.role) {
            logger.info({ event: 'user_role_updated', updatedBy: req.userId, targetUserId: req.params.id, newRole: req.body.role }, 'Admin updated user role');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUser = async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const userId = await Service.createUser(username, password, role);
        res.json({ id: userId, username, role });
        logger.info({ event: 'user_created', createdBy: req.userId, newUserId: userId, role }, 'Admin created user');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const user = await Service.getOneUser(req.params.id);
        if (user.role === 'admin') {
            const adminCount = await Service.countAdminUsers();
            if (adminCount <= 1) {
                res.status(400).json({ error: "Cannot delete the last admin user" });
                return;
            }
        }
        const data = await Service.deleteUser(req.params.id);
        logger.info({ event: 'user_deleted', deletedBy: req.userId, deletedUserId: req.params.id }, 'Admin deleted user');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOneUser = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const data = await Service.getOneUser(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

//Scenarios

export const createScenario = async (req, res) => {
    try {
        const scenarioData = req.body.scenario;
        try {
            validateScenarioData(scenarioData);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
        const userId = req.userId;
        const scenarioId = await Service.createScenario(scenarioData, userId);
        res.json({ id: scenarioId, name: scenarioData.name, user_id: userId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getScenariosByUser = async (req, res) => {
    try {
        const scenarios = await Service.getScenariosByUser(req.userId);
        res.json(scenarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOneScenarioByUser = async (req, res) => {
    try {
        const scenario = await Service.getOneScenarioByUser(req.params.id, req.userId);
        if (!scenario) {
            return res.status(404).json({ error: "Scenario not found" });
        }
        res.json(scenario);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateScenario = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const scenario = await Service.getOneScenarioByUser(req.params.id, req.userId);
        if (!scenario) {
            return res.status(403).json({ error: "Access denied" });
        }
        const data = await Service.updateScenario(req.params.id, req.body);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteScenario = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const scenario = await Service.getOneScenarioByUser(req.params.id, req.userId);
        if (!scenario) {
            return res.status(403).json({ error: "Access denied" });
        }
        const data = await Service.deleteScenario(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};