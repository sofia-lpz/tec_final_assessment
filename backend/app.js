import express from 'express'
import bodyParser from 'body-parser';
import {router} from './api/routes.js'
import 'dotenv/config'

const requiredEnv = ['DB_HOST', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8080;
app.use(bodyParser.json());
app.use("/api", router);
app.use(express.static('public'));
app.use('/', express.static('public'));
app.listen(PORT, () => {
  console.log(`backend escuchando en el puerto ${PORT}`);
});