# MIDWIFE Clinical Portal

The portal now runs on Node.js and connects directly to Supabase PostgreSQL. XAMPP, Apache, PHP, and local MySQL are not required.

## First-time setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add the Supabase direct PostgreSQL connection string.
4. Run `npm run db:init` once to create/update the Supabase tables.
5. Optionally set a 6–12 digit `INITIAL_ADMIN_PIN` before the first start if the database has no administrator.
6. Run `npm start` and open `http://localhost:3000`.

The direct database password is server-side only. Never put `DATABASE_URL` in browser JavaScript or commit `.env`.

Supabase direct database hosts can be IPv6-only. The machine running this server must have working IPv6 connectivity; otherwise use a Supabase session-pooler connection string instead of the direct host.

Entry pages remain `login.html`, `student.html`, `instructor.html`, and `admin-dashboard.html`. See `docs/ARCHITECTURE.md` for structure and maintenance guidance.
