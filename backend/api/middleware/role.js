import { getOneUser } from '../service.js';
import { logger } from '../../utils/logger/logger.js';

export const checkAdminRole = async (req, res, next) => {
    try {
        const userId = req.userId; // Assuming `verifyToken` middleware sets `req.userId`
        const user = await getOneUser(userId); // Fetch user details from the database

        if (user.role !== 'admin') {
            logger.warn({ event: 'unauthorized_admin_access', userId, ip: req.ip }, 'Non-admin attempted admin access');
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        next();
    } catch (error) {
        res.status(500).json({ message: 'Roles: Internal server error.' });
    }
};
