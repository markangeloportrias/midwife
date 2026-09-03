import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionErrorMessage, pool } from '../api/bootstrap.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = path.join(root, 'database', 'schema.sql');

try {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Supabase PostgreSQL schema initialized successfully.');
} catch (error) {
  console.error('Schema initialization failed:', connectionErrorMessage(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
