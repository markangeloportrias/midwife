import { pool } from '../api/bootstrap.js';

const expectedTables = [
  'admins',
  'students',
  'instructor_accounts',
  'school_years',
  'student_blocks',
  'student_block_assignments',
  'api_sessions',
  'auth_login_attempts',
  'audit_trail',
  'procedures',
  'case_records',
  'case_comments',
  'edit_requests',
  'edit_permissions',
  'notification_history',
  'chat_messages',
  'school_year_archives',
  'school_year_archive_procedures',
  'school_year_archive_records',
  'system_meta'
];

try {
  const tableResult = await pool.query(
    'SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename'
  );
  const portalTables = tableResult.rows.filter((row) => expectedTables.includes(row.tablename));
  const found = new Set(portalTables.map((row) => row.tablename));
  const missing = expectedTables.filter((table) => !found.has(table));
  const adminResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM admins WHERE archived_at IS NULL'
  );
  const procedureResult = await pool.query('SELECT COUNT(*)::int AS count FROM procedures');
  const instructorUniqueIndexResult = await pool.query(
    `SELECT 1
       FROM pg_indexes
      WHERE schemaname=current_schema()
        AND tablename='instructor_accounts'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%(username)%'
      LIMIT 1`
  );
  const duplicateInstructorResult = await pool.query(
    `SELECT lower(username) AS username, COUNT(*)::int AS count
       FROM instructor_accounts
      GROUP BY lower(username)
     HAVING COUNT(*) > 1`
  );
  const caseUniqueIndexResult = await pool.query(
    `SELECT 1
       FROM pg_indexes
      WHERE schemaname=current_schema()
        AND tablename='case_records'
        AND indexname='uq_case_records_active_case'
      LIMIT 1`
  );
  const duplicateCaseResult = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM case_records
      WHERE archived_at IS NULL
        AND case_no IS NOT NULL
        AND btrim(case_no) <> ''
      GROUP BY
        student_id,
        COALESCE(academic_year,''),
        procedure_key,
        md5(lower(btrim(COALESCE(case_no,'')))),
        md5(lower(btrim(COALESCE(complete_diagnosis,'')))),
        COALESCE(date_time_performed,'-infinity'::timestamptz),
        md5(lower(btrim(COALESCE(patient_name,'')))),
        md5(lower(btrim(COALESCE(patient_address,'')))),
        md5(lower(btrim(COALESCE(facility_name,'')))),
        md5(lower(btrim(COALESCE(facility_address,'')))),
        md5(lower(btrim(COALESCE(facility_contact_number,'')))),
        md5(lower(btrim(COALESCE(supervisor_printed_name,'')))),
        md5(lower(btrim(COALESCE(supervisor_contact_number,'')))),
        md5(lower(btrim(COALESCE(supervisor_position_designation,'')))),
        md5(lower(btrim(COALESCE(supervisor_license_no,'')))),
        COALESCE(supervisor_license_expiry_date,'-infinity'::date)
     HAVING COUNT(*) > 1`
  );

  console.log(`Connection: OK (${pool.options.host || 'configured PostgreSQL host'})`);
  console.log(`Required tables: ${portalTables.length}/${expectedTables.length}`);
  console.log(`Missing tables: ${missing.join(', ') || 'none'}`);
  console.log(`RLS enabled: ${portalTables.filter((row) => row.rowsecurity).length}/${portalTables.length}`);
  console.log(`Active administrators: ${adminResult.rows[0].count}`);
  console.log(`Procedure catalog entries: ${procedureResult.rows[0].count}`);
  console.log(`Unique instructor username guard: ${instructorUniqueIndexResult.rowCount ? 'enabled' : 'missing'}`);
  console.log(`Duplicate instructor usernames: ${duplicateInstructorResult.rowCount}`);
  console.log(`Unique active case guard: ${caseUniqueIndexResult.rowCount ? 'enabled' : 'missing'}`);
  console.log(`Duplicate active clinical cases: ${duplicateCaseResult.rowCount}`);

  if (missing.length || !instructorUniqueIndexResult.rowCount || duplicateInstructorResult.rowCount ||
      !caseUniqueIndexResult.rowCount || duplicateCaseResult.rowCount) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
