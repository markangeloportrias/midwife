# Application architecture

The portal follows a simple layered structure suitable for a PHP/XAMPP deployment.

```
Browser entry points (root HTML pages)
        |
        +-- assets/css     Shared and role-specific presentation
        +-- assets/js      Shared browser behavior and API client
        +-- assets/images  Institution and report images
        |
        +-- api            PHP REST endpoints and database bootstrap
                |
                +-- database/schema.sql
```

## Responsibilities

| Location | Responsibility |
| --- | --- |
| Root HTML files | Page markup and page-specific behavior for a role. |
| `assets/css/base` | Shared variables, reset rules, and typography defaults. |
| `assets/css/layout` | Application shell and sidebar behavior. |
| `assets/css/components` | Reusable hero, buttons, fields, modals, and shared data-table rules. |
| `assets/css/pages` | Role-specific styles for login, student, instructor, admin, and reports. |
| `assets/js/api-client.js` | The only browser-side gateway for data operations. It owns authentication tokens and calls `/api`. |
| `assets/js/modern-shell.js` | Shared navigation and database-health behavior. |
| `api` | HTTP routing, authentication, validation, persistence, and audit logging. |
| `database/schema.sql` | The database schema and seed data imported by XAMPP/MariaDB. |
| `tools` | Local-only operational utilities, such as the one-time legacy-data migration. |

## Maintenance rules

1. Keep database operations behind `ApiClient`; role pages must not create a second fetch layer.
2. Use `pages/` for a role layout, `components/` for reusable UI (including hero, buttons, forms, tables, and modals), `layout/` for shell/navigation, and `base/` for global primitives. Do not add new root-level asset files.
3. Keep page-specific markup close to the entry page until it is deliberately extracted as a complete feature module.
4. Archive business records through the API instead of adding browser-only data stores.
5. Do not expose `tools/migrate-local-to-mysql.php` publicly. It is localhost-only and should be used only when importing legacy browser data.

## Asset cleanup performed

- Removed `prc_logo.png`, which had no runtime or document references.
- Removed `instructor-ux.css`, an unlinked backup superseded by the instructor page's inlined styles.
- Retained `tools/migrate-local-to-mysql.php`: it is an explicit recovery utility, not unused application code.
