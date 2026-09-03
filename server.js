import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './api/config.js';
import apiRouter from './api/index.js';
import { apiErrorHandler, connectionErrorMessage, ensureInitialAdministrator, pool } from './api/bootstrap.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (config.allowedOrigin && req.get('origin') === config.allowedOrigin) {
    res.set('Access-Control-Allow-Origin', config.allowedOrigin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '25mb' }));
app.use('/api', apiRouter);
app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny' }));
for (const page of ['index.html', 'login.html', 'student.html', 'instructor.html', 'admin-dashboard.html']) {
  app.get(`/${page}`, (_req, res) => res.sendFile(path.join(root, page)));
}
app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use(apiErrorHandler);

app.listen(config.port, () => {
  console.log(`MIDWIFE Clinical Portal: http://localhost:${config.port}`);
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function initializeDatabase() {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      await ensureInitialAdministrator();
      console.log('Supabase PostgreSQL connection ready.');
      return;
    } catch (error) {
      if (attempt === attempts) {
        console.error('Supabase PostgreSQL is not reachable:', connectionErrorMessage(error));
        return;
      }
      console.warn(`Supabase connection attempt ${attempt}/${attempts} failed. Retrying...`);
      await wait(2000);
    }
  }
}

await initializeDatabase();
