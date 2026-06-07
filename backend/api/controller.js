import jwt from 'jsonwebtoken';
import * as Service from './service.js';
import { response } from 'express';

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Service.login(username, password);
        if (user) {
            // Generate a JWT token
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const role = user.role;
            res.send({ status: "OK", token, role });
            console.log(`User ${username} logged in`);
        }
    } catch (error) {
        if (error.message === 'User not found' || error.message === 'Invalid password') {
            res.status(401).send({ status: "Error", message: "Invalid credentials" });
        } else {
            console.error(error);
            res.status(500).send({ status: "Error", message: "Internal Server Error" });
        }
    }
};

//Usuarios
export const getUsuarios = async (req, res) => {
    try {
        if ("_sort" in req.query) {
            let start = Number(req.query._start);
            let end = Number(req.query._end);

            let data = await Service.getUsuarios(req);

            res.set("Access-Control-Expose-Headers", "X-Total-Count");
            res.set("X-Total-Count", data.length);
            res.set("Content-Range", `${start}-${end}/${data.length}`);
            data = data.slice(start, end);
            res.json(data);
        } else {
            let data = await Service.getUsuarios(req);
            res.set("Access-Control-Expose-Headers", "X-Total-Count");
            res.set("X-Total-Count", data.length);
            res.set("Content-Range", `0-${data.length}/${data.length}`);
            res.json(data);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const updateUsuario = async (req, res) => {
    try {
        const user = await Service.getOneUsuario(req.params.id);
        if (user.role === 'admin' && req.body.role !== 'admin') {
            const adminCount = await Service.countAdminUsers();
            if (adminCount <= 1) {
                res.status(400).json({ error: "Cannot demote the last admin user" });
                return;
            }
        }
        const data = await Service.updateUsuario(req.params.id, req.body);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUsuario = async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const userId = await Service.createUsuario(username, password, role);
        res.json({ id: userId, username, role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUsuario = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const user = await Service.getOneUsuario(req.params.id);
        if (user.role === 'admin') {
            const adminCount = await Service.countAdminUsers();
            if (adminCount <= 1) {
                res.status(400).json({ error: "Cannot delete the last admin user" });
                return;
            }
        }
        const data = await Service.deleteUsuario(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOneUsuario = async (req, res) => {
    if (!req.params.id) {
        res.status(400).json({ error: "ID is required" });
        return;
    }
    try {
        const data = await Service.getOneUsuario(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};