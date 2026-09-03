import bcrypt from 'bcryptjs';
import { pool } from '../api/bootstrap.js';

const candidatePin = process.argv[2] || '';

try {
  const adminResult = await pool.query(
    'SELECT id, pin_number, must_change_pin FROM admins WHERE archived_at IS NULL ORDER BY id LIMIT 1'
  );
  const attemptsResult = await pool.query(
    "SELECT failure_count, locked_until, last_failed_at FROM auth_login_attempts WHERE role_name='admin' ORDER BY last_failed_at DESC LIMIT 1"
  );
  const admin = adminResult.rows[0];
  const attempts = attemptsResult.rows[0];
  const locked = Boolean(attempts?.locked_until && new Date(attempts.locked_until) > new Date());

  console.log(`Active administrator: ${admin ? 'yes' : 'no'}`);
  console.log(`Stored credential: ${admin && /^\$2[aby]\$/.test(admin.pin_number) ? 'valid bcrypt hash' : 'missing or unsupported'}`);
  console.log(`Candidate PIN matches: ${admin && candidatePin ? bcrypt.compareSync(candidatePin, admin.pin_number) : false}`);
  console.log(`Must change PIN: ${admin?.must_change_pin ?? 'unknown'}`);
  console.log(`Failed attempts: ${attempts?.failure_count ?? 0}`);
  console.log(`Currently locked: ${locked}`);
  console.log(`Locked until: ${locked ? new Date(attempts.locked_until).toISOString() : 'not locked'}`);
} catch (error) {
  console.error(`Administrator check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
