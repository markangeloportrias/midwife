# Node.js API

`server.js` serves the static portal and mounts the Express API at `/api`. `api/index.js` preserves the existing browser API contract, while `api/bootstrap.js` manages the direct Supabase PostgreSQL pool, sessions, password hashing, transactions, and audit entries.

Configuration is read from the root `.env` file. Required: `DATABASE_URL`. Optional: `PORT`, `SESSION_HOURS`, `ALLOWED_ORIGIN`, and `INITIAL_ADMIN_PIN`.

Use `npm run db:init` to apply `database/schema.sql`, then `npm start`. Health check: `http://localhost:3000/api/health`.
