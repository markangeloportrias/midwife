import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export function connectionErrorMessage(error) {
  let host = '';
  try {
    host = new URL(config.databaseUrl).hostname;
  } catch {
    return 'DATABASE_URL is not a valid PostgreSQL connection string.';
  }

  const directSupabaseHost = /^db\.[a-z0-9]+\.supabase\.co$/i.test(host);
  if (directSupabaseHost && ['ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'].includes(error?.code)) {
    return [
      `The Supabase direct host ${host} is IPv6-only and this computer has no working IPv6 route.`,
      'Open Supabase Dashboard > Connect > Session pooler, copy its port 5432 connection string,',
      'replace DATABASE_URL in .env with that string, then run npm run db:init again.'
    ].join(' ');
  }
  return error?.message || 'Unknown database connection error.';
}

export class HttpError extends Error {
  constructor(status, message, payload = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export function fail(status, message, payload = {}) {
  throw new HttpError(status, message, payload);
}

export function requireFields(data, fields) {
  for (const field of fields) {
    if (data[field] == null || String(data[field]).trim() === '') {
      fail(422, `${field} is required.`);
    }
  }
}

export const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const randomId = (prefix) => `${prefix}${crypto.randomBytes(8).toString('hex')}`;
export const strongCredential = (value, minimum = 8) => String(value || '').length >= minimum;
export const passwordMatches = (plain, stored) => Boolean(stored) && bcrypt.compareSync(String(plain), String(stored));
export const hashPassword = (plain) => bcrypt.hashSync(String(plain), 12);

export function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  return match ? match[1].trim() : '';
}

export async function currentUser(req, roles = [], allowPendingAdminPin = false, client = pool) {
  const token = bearerToken(req);
  if (!token) fail(401, 'Authentication required.');
  const result = await client.query(
    'SELECT role, user_uid, expires_at FROM api_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()',
    [hashToken(token)]
  );
  const user = result.rows[0];
  if (!user) fail(401, 'Session is invalid or expired.');
  if (roles.length && !roles.includes(user.role)) fail(403, 'Access denied.');
  if (user.role === 'admin' && !allowPendingAdminPin) {
    const admin = await client.query('SELECT must_change_pin FROM admins WHERE id=$1 AND archived_at IS NULL', [user.user_uid]);
    if (admin.rows[0]?.must_change_pin) fail(403, 'Your administrator PIN must be changed before continuing.');
  }
  return user;
}

export async function createSession(client, role, uid) {
  const token = randomToken();
  await client.query(
    "INSERT INTO api_sessions (token_hash,role,user_uid,expires_at) VALUES ($1,$2,$3,now()+($4 * interval '1 hour'))",
    [hashToken(token), role, String(uid), config.sessionHours]
  );
  return token;
}

export async function audit(client, user, action, entity, entityId = '', details = {}) {
  await client.query(
    'INSERT INTO audit_trail (actor_role,actor_uid,action_name,entity_type,entity_uid,details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
    [user.role, user.user_uid, action, entity, String(entityId || ''), JSON.stringify(details)]
  );
}

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureInitialAdministrator() {
  if (!/^\d{6,12}$/.test(config.initialAdminPin)) return;
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM admins WHERE archived_at IS NULL');
  if (count.rows[0].count > 0) return;
  await pool.query('INSERT INTO admins (pin_number,must_change_pin) VALUES ($1,false)', [hashPassword(config.initialAdminPin)]);
}

export function apiErrorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ ok: false, message: error.message, ...error.payload });
  }
  const databaseConnectionFailure = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ENOTFOUND'
  ].includes(error?.code) || /connection (?:terminated|timeout|refused)/i.test(error?.message || '');
  if (databaseConnectionFailure) {
    return res.status(503).json({
      ok: false,
      code: 'database_unavailable',
      message: 'Database connection unavailable. Check the network connection to Supabase and try again.'
    });
  }
  if (error?.code === '23505' && error?.constraint === 'uq_case_records_active_case') {
    return res.status(409).json({
      ok: false,
      code: 'duplicate_case_record',
      message: 'An identical clinical record already exists.'
    });
  }
  if (error?.code === '23505') return res.status(409).json({ ok: false, message: 'That record already exists.' });
  if (error?.code === '23503') return res.status(422).json({ ok: false, message: 'A related record is missing or still in use.' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, message: 'The request contains invalid JSON.' });
  console.error(error);
  return res.status(500).json({ ok: false, message: 'Database operation failed.' });
}
