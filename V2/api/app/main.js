// KDCN Platform V2 — entrypoint

import './routes/health.js';
import './routes/auth.js';
import { startServer } from './server.js';

startServer();
