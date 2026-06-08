import * as db from "./db.js";

export const login = async (username, password) => {
  try {
      const user = await db.verifyPassword(username, password);
      return user;
    } catch (error) {
        throw error;
    }
};

//Usuarios
export const getUsuarios = async (req) => {
    try {
        const result = await db.getUsuarios(req);
        return result;
    }
    catch (error) {
        throw error;
    }
}

export const updateUsuario = async (id, updateData) => {
    try {
        const result = await db.updateUsuario(Number(id), updateData);
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const createUsuario = async (username, password, role) => {
    try {
        const result = await db.createUsuario(username, password, role);
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const deleteUsuario = async (id) => {
    try {
        const result = await db.deleteUsuario(Number(id));
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const getOneUsuario = async (id) => {
    try {
        const result = await db.getOneUsuario(Number(id));
        return result;
    }
    catch (error) {
        throw error;
    }
}   