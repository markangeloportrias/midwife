# MIDWIFE Clinical Portal backend

This is a dependency-free PHP 8 REST API for XAMPP/MariaDB.

1. Place the project in `C:\xampp\htdocs\THESIS6`.
2. Import `xampp-sql-prompt.sql` in phpMyAdmin.
3. Start Apache and MySQL in XAMPP.
4. Open `http://localhost/THESIS6/api/health`.

Database settings are in `api/config.php`. Environment variables named
`THESIS_DB_HOST`, `THESIS_DB_PORT`, `THESIS_DB_NAME`, `THESIS_DB_USER`, and
`THESIS_DB_PASSWORD` override the defaults.

The API never accepts HTTP `DELETE`. Archive endpoints use
`PATCH /api/{resource}/{id}/archive`; retained records can be restored where
the workflow supports it.
