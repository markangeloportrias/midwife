import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and add the Supabase direct connection string.');
}

export const config = Object.freeze({
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT || 3000),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  allowedOrigin: (process.env.ALLOWED_ORIGIN || '').trim(),
  initialAdminPin: (process.env.INITIAL_ADMIN_PIN || '').trim(),
  databaseSsl: process.env.DATABASE_SSL !== 'false'
});
