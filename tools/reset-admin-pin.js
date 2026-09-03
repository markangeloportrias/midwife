import { audit, hashPassword, pool, transaction } from '../api/bootstrap.js';

const newPin = String(process.env.ADMIN_RESET_PIN || '').trim();

if (!/^\d{6,12}$/.test(newPin)) {
  console.error('ADMIN_RESET_PIN must contain 6 to 12 digits.');
  process.exit(1);
}

try {
  const result = await transaction(async (client) => {
    const adminResult = await client.query(
      'SELECT id FROM admins WHERE archived_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE'
    );
    const admin = adminResult.rows[0];
    if (!admin) throw new Error('No active administrator exists.');

    await client.query(
      'UPDATE admins SET pin_number=$1, must_change_pin=true WHERE id=$2',
      [hashPassword(newPin), admin.id]
    );
    await client.query("DELETE FROM auth_login_attempts WHERE role_name='admin'");
    await client.query(
      "UPDATE api_sessions SET revoked_at=now() WHERE role='admin' AND revoked_at IS NULL"
    );
    await audit(
      client,
      { role: 'system', user_uid: null },
      'reset_admin_pin',
      'admin',
      admin.id,
      { must_change_pin: true }
    );
    return admin;
  });

  console.log(`Administrator ${result.id} PIN reset successfully.`);
  console.log('All previous administrator sessions were revoked.');
  console.log('The administrator must choose a new PIN after signing in.');
} catch (error) {
  console.error(`Administrator PIN reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
