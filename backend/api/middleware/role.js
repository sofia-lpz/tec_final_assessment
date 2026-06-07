import { getOneUsuario } from '../service.js';

export const checkAdminRole = async (req, res, next) => {
    try {
        const userId = req.userId; // Assuming `verifyToken` middleware sets `req.userId`
        const user = await getOneUsuario(userId); // Fetch user details from the database

        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        next();
    } catch (error) {
        res.status(500).json({ message: 'Roles: Internal server error.' });
    }
};
