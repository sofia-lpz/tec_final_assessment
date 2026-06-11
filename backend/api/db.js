import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

async function connectToDB() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
    });
}

export async function verifyPassword(username, password) {
    const user = await getUserByUsername(username);
    if (!user) {
        throw new Error('User not found');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid password');
    }
    return user;
}

export async function incrementTokenVersion(userId) {
    const conn = await connectToDB()
    await conn.execute(
        "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
        [userId]
    );
    conn.end()
}

//Users
export async function getUserByUsername(username) {
    const conn = await connectToDB();
    const [rows] = await conn.execute(
        "SELECT id, username, role, password FROM users WHERE username = ?",
        [username]
    );
    conn.end();
    return rows[0];
}

export async function getUsers(req) {
    try {
        const connection = await connectToDB();
        let query = "SELECT id, username, role FROM users";
        let params = [];
        let ids = [];

        const filters = [];

        if ("id" in req.query) {
            for (let index = 0; index < req.query.id.length; index++) {
                ids.push(Number(req.query.id[index]));
            }
            filters.push("id IN (" + ids.map(() => "?").join(",") + ")");
            params = params.concat(ids);
        }

        if ("q" in req.query) {
            const searchValue = `%${req.query.q}%`;
            filters.push("(username LIKE ? OR role LIKE ?)");
            params.push(searchValue, searchValue);
        }

        for (const [key, value] of Object.entries(req.query)) {
            if (key !== "_sort" && key !== "_order" && key !== "_start" && key !== "_end" && key !== "id" && key !== "q") {
                filters.push(`${connection.escapeId(key)} = ?`);
                params.push(value);
            }
        }

        if (filters.length > 0) {
            query += " WHERE " + filters.join(" AND ");
        }

        if ("_sort" in req.query) {
            let sortBy = req.query._sort;
            let sortOrder = req.query._order === "ASC" ? "ASC" : "DESC";
            let start = Number(req.query._start) || 0;
            let end = Number(req.query._end) || 10;

            query += ` ORDER BY ${connection.escapeId(sortBy)} ${sortOrder} LIMIT ?, ?`;
            params.push(start, end - start);
        }

        console.log(query);
        const [data] = await connection.query(query, params);
        return data;
    } catch (error) {
        throw error;
    }
}

export async function updateUser(id, updateData) {
    try {
        const conn = await connectToDB();

        const keys = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = keys.map(key => `${key} = ?`).join(', ');

        values.push(id);
        const query = `UPDATE users SET ${setClause} WHERE id = ?`;

        await conn.execute(query, values);

        const [updatedRow] = await conn.execute("SELECT id, username, role FROM users WHERE id = ?", [id]);
        conn.end();
        return updatedRow[0];
    } catch (error) {
        throw error;
    }
}

export async function deleteUser(id) {
    const conn = await connectToDB();
    const [result] = await conn.execute(
        "DELETE FROM users WHERE id = ?",
        [id]
    );
    conn.end();
    return result;
}

export async function getOneUser(id) {
    const conn = await connectToDB();
    const [rows] = await conn.execute(
        "SELECT id, username, role, token_version FROM users WHERE id = ?",
        [id]
    );
    conn.end();
    return rows[0];
}

export async function createUser(username, password, role) {
    if (!username || !password || !role) {
        throw new Error('Username, password, and role are required');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const conn = await connectToDB();
    try {
        const [result] = await conn.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, hashedPassword, role]
        );
        conn.end();
        return result.insertId;
    } catch (error) {
        conn.end();
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('Username already exists');
        }
        throw error;
    }
}

export async function countAdminUsers() {
    const conn = await connectToDB();
    const [rows] = await conn.execute(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );
    conn.end();
    return rows[0].count;
}

//Scenarios
export async function getScenarios(req) {
    try {
        const connection = await connectToDB();
        let query = "SELECT * FROM scenarios";
        let params = [];

        const filters = [];

        if ("id" in req.query) {
            let ids = [];
            for (let index = 0; index < req.query.id.length; index++) {
                ids.push(Number(req.query.id[index]));
            }
            filters.push("id IN (" + ids.map(() => "?").join(",") + ")");
            params = params.concat(ids);
        }

        if ("q" in req.query) {
            const searchValue = `%${req.query.q}%`;
            filters.push("(name LIKE ?)");
            params.push(searchValue);
        }

        for (const [key, value] of Object.entries(req.query)) {
            if (key !== "_sort" && key !== "_order" && key !== "_start" && key !== "_end" && key !== "id" && key !== "q") {
                filters.push(`${connection.escapeId(key)} = ?`);
                params.push(value);
            }
        }

        if (filters.length > 0) {
            query += " WHERE " + filters.join(" AND ");
        }

        if ("_sort" in req.query) {
            let sortBy = req.query._sort;
            let sortOrder = req.query._order === "ASC" ? "ASC" : "DESC";
            let start = Number(req.query._start) || 0;
            let end = Number(req.query._end) || 10;

            query += ` ORDER BY ${connection.escapeId(sortBy)} ${sortOrder} LIMIT ?, ?`;
            params.push(start, end - start);
        }

        const [data] = await connection.query(query, params);
        connection.end();
        return data;
    } catch (error) {
        throw error;
    }
}

export async function getScenariosByUser(userId) {
    const conn = await connectToDB();
    const [rows] = await conn.execute(
        "SELECT * FROM scenarios WHERE user_id = ?",
        [userId]
    );
    conn.end();
    return rows;
}

export async function createScenario(scenarioData) {
    if (!scenarioData.name || !scenarioData.user_id) {
        throw new Error('Name and user_id are required');
    }

    const conn = await connectToDB();
    try {
        const keys = Object.keys(scenarioData);
        const values = Object.values(scenarioData);
        const placeholders = keys.map(() => '?').join(', ');
        const columnNames = keys.join(', ');

        const [result] = await conn.execute(
            `INSERT INTO scenarios (${columnNames}) VALUES (${placeholders})`,
            values
        );
        conn.end();
        return result.insertId;
    } catch (error) {
        conn.end();
        throw error;
    }
}

export async function getOneScenarioByUser(scenarioId, userId) {
    const conn = await connectToDB();
    const [rows] = await conn.execute(
        "SELECT * FROM scenarios WHERE id = ? AND user_id = ?",
        [scenarioId, userId]
    );
    conn.end();
    return rows[0];
}

export async function updateScenario(id, updateData) {
    try {
        const conn = await connectToDB();

        const keys = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = keys.map(key => `${key} = ?`).join(', ');

        values.push(id);
        const query = `UPDATE scenarios SET ${setClause} WHERE id = ?`;

        await conn.execute(query, values);

        const [updatedRow] = await conn.execute("SELECT * FROM scenarios WHERE id = ?", [id]);
        conn.end();
        return updatedRow[0];
    } catch (error) {
        throw error;
    }
}

export async function deleteScenario(id) {
    const conn = await connectToDB();
    const [result] = await conn.execute(
        "DELETE FROM scenarios WHERE id = ?",
        [id]
    );
    conn.end();
    return result;
}
//Scenarios End
