# Application architecture

The portal uses a Node.js server and a direct, server-side Supabase PostgreSQL connection.

```text
Browser pages and assets
        |
        +-- assets/js/api-client.js
        |           |
        |           +-- /api (Express router)
        |                       |
        |                       +-- PostgreSQL pool --> Supabase
        |
        +-- Express static-file server (port 3000)
```

## Responsibilities

| Location | Responsibility |
| --- | --- |
| Root HTML files | Role-specific page markup and browser behavior. |
| `assets/css` | Shared, component, layout, and role-specific presentation. |
| `assets/js/api-client.js` | Browser-side data gateway and session-token handling. |
| `assets/js/modern-shell.js` | Shared navigation and API-health behavior. |
| `server.js` | Express startup, static-file hosting, CORS, and API mounting. |
| `api/index.js` | HTTP routes, role authorization, validation, and persistence. |
| `api/bootstrap.js` | PostgreSQL pool, authentication helpers, transactions, and audit helpers. |
| `database/schema.sql` | Idempotent Supabase/PostgreSQL schema and catalog seed. |
| `tools/init-database.js` | Applies the schema through the configured direct connection. |

## Maintenance rules

1. Keep database operations behind `ApiClient`; never expose the database URL to browser code.
2. Keep credentials in `.env`, which is ignored by Git.
3. Use parameterized PostgreSQL queries for all user-supplied values.
4. Archive business records through the API unless a workflow explicitly supports permanent deletion.
5. Apply schema changes through `database/schema.sql` and verify them with `npm run db:init`.
