import express from 'express';
import * as Controller from './controller.js';
import { verifyToken } from './middleware/auth.js';
import { checkAdminRole } from './middleware/role.js';

const router = express.Router();

//login endpoint (no token required)
router.post('/login', Controller.login);
router.post('/logout', verifyToken, Controller.logout);

//admin routes
router.get('/usuarios', verifyToken, checkAdminRole, Controller.getUsers);
router.put('/usuarios/:id', verifyToken, checkAdminRole, Controller.updateUser);
router.post('/usuarios', verifyToken, checkAdminRole, Controller.createUser);
router.delete('/usuarios/:id', verifyToken, checkAdminRole, Controller.deleteUser);
router.get('/usuarios/:id', verifyToken, checkAdminRole, Controller.getOneUser);

//scenarios routes
router.get('/scenarios', verifyToken, Controller.getScenariosByUser);
router.post('/scenarios', verifyToken, Controller.createScenario);
router.get('/scenarios/:id', verifyToken, Controller.getOneScenarioByUser);
router.put('/scenarios/:id', verifyToken, Controller.updateScenario);
router.delete('/scenarios/:id', verifyToken, Controller.deleteScenario);    

export { router };