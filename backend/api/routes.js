import express from 'express';
import * as Controller from './controller.js';
import { verifyToken } from './middleware/auth.js';
import { checkAdminRole } from './middleware/role.js';

const router = express.Router();

//login endpoint (no token required)
router.post('/login', Controller.login);

//admin routes
router.get('/usuarios', verifyToken, checkAdminRole, Controller.getUsuarios);
router.put('/usuarios/:id', verifyToken, checkAdminRole, Controller.updateUsuario);
router.post('/usuarios', verifyToken, checkAdminRole, Controller.createUsuario);
router.delete('/usuarios/:id', verifyToken, checkAdminRole, Controller.deleteUsuario);
router.get('/usuarios/:id', verifyToken, checkAdminRole, Controller.getOneUsuario);

export { router };