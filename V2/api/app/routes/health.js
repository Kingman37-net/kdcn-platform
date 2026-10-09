import { route } from '../server.js';

route('GET', '/health', () => ({
  ok: true,
  data: {
    status: 'alive',
    service: 'kdcn-platform-v2',
    version: '0.1.0',
    phase: 'session-1',
    timestamp: new Date().toISOString(),
  },
}));

route('GET', '/', () => ({
  ok: true,
  data: {
    service: 'KDCN Platform V2',
    phase: 'session-1 — skeleton',
    endpoints: ['/health'],
  },
}));
