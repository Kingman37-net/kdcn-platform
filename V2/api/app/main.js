// KDCN Platform V2 — entrypoint

import './routes/health.js';
import './routes/auth.js';
import './routes/clients.js';
import './routes/projects.js';
import './routes/services.js';
import './routes/dashboard.js';
import { startServer } from './server.js';

startServer();
