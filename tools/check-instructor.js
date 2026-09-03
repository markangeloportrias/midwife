import { pool } from '../api/bootstrap.js';

const username = String(process.argv[2] || '').trim();
if (!username) {
  console.error('Usage: node tools/check-instructor.js <username>');
  process.exit(1);
}

try {
  const result = await pool.query(
    `SELECT account_uid AS id, username, display_name, role_title, status,
            archived_at, created_at
       FROM instructor_accounts
      WHERE lower(username)=lower($1)
      ORDER BY created_at DESC`,
    [username]
  );
  console.log(`Matches: ${result.rowCount}`);
  for (const row of result.rows) {
    console.log(JSON.stringify(row));
  }
} catch (error) {
  console.error(`Instructor check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
