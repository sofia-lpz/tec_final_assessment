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
export const getUsers = async (req) => {
    try {
        const user = await db.getUsers(req);
        
        return user;
    }
    catch (error) {
        throw error;
    }
}

export const updateUser = async (id, updateData) => {
    try {
        const result = await db.updateUser(Number(id), updateData);
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const createUser = async (username, password, role) => {
    try {
        const result = await db.createUser(username, password, role);
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const deleteUser = async (id) => {
    try {
        const result = await db.deleteUser(Number(id));
        return result;
    }
    catch (error) {
        throw error;
    }
};

export const getOneUser = async (id) => {
    try {
        const result = await db.getOneUser(Number(id));
        return result;
    }
    catch (error) {
        throw error;
    }
}   