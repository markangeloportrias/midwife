import crypto from 'node:crypto';
import express from 'express';
import {
  audit,
  bearerToken,
  createSession,
  currentUser,
  fail,
  hashPassword,
  hashToken,
  passwordMatches,
  pool,
  randomId,
  requireFields,
  strongCredential,
  transaction
} from './bootstrap.js';

const router = express.Router();
const ALL_ROLES = ['admin', 'instructor', 'student'];
const STAFF_ROLES = ['admin', 'instructor'];
const BACKUP_TABLES = [
  'procedures', 'students', 'instructor_accounts', 'school_years', 'student_blocks',
  'student_block_assignments', 'case_records', 'case_comments', 'edit_requests',
  'edit_permissions', 'notification_history', 'chat_messages', 'school_year_archives',
  'school_year_archive_procedures', 'school_year_archive_records', 'system_meta', 'audit_trail'
];

const trim = (value) => String(value ?? '').trim();
const first = (result) => result.rows[0] || null;
const changed = (result) => result.rowCount > 0;

const CONTACT_FIELDS = new Map([
  ['contact_number', 'Contact number'],
  ['parent_contact', 'Parent or guardian contact number'],
  ['facility_contact_number', 'Facility contact number'],
  ['supervisor_contact_number', 'Supervisor contact number']
]);

function validateContactNumbers(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const [field, label] of CONTACT_FIELDS) {
    if (!Object.hasOwn(data, field)) continue;
    const value = trim(data[field]);
    if (value && !/^\d{1,11}$/.test(value)) {
      fail(422, `${label} must contain digits only and cannot exceed 11 digits.`);
    }
    data[field] = value;
  }
}

function normalizeCaseRoleValue(value) {
  return trim(value).replace(/\s+/g, '').toLowerCase();
}

function clinicalRoleForProcedure(procedure) {
  const value = trim(procedure).replace(/[^a-z0-9]+/gi, ' ').toLowerCase();
  if (['delivery handled', 'iv insertion', 'internal exam', 'internal examination', 'ie', 'i e'].includes(value)) return 'handle';
  if (['delivery assisted', 'suturing', 'perineal suturing'].includes(value)) return 'assist';
  return null;
}

const clinicalRoleLabel = (role) => role === 'assist' ? 'Assist' : 'Handle';

async function resolveCaseRoleContext(client, studentId, academicYear, caseNo, patientName, procedure) {
  const role = clinicalRoleForProcedure(procedure);
  const caseKey = normalizeCaseRoleValue(caseNo);
  const patientKey = normalizeCaseRoleValue(patientName);
  if (!role || (!caseKey && !patientKey)) return null;
  const result = await client.query(`
    SELECT a.block_id,b.label AS block_label,y.label AS academic_year
    FROM student_block_assignments a
    JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
    JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL
    WHERE a.student_id=$1 AND a.archived_at IS NULL
    ORDER BY (y.label=$2) DESC,(y.status='active') DESC,y.start_year DESC LIMIT 1`,
  [studentId, academicYear]);
  const group = first(result);
  if (!group) return null;
  return { role, case_key: caseKey, case_no: trim(caseNo), patient_key: patientKey, patient_name: trim(patientName), ...group };
}

async function getActiveCaseRoleRecords(client, context) {
  const result = await client.query(`
    SELECT c.id,c.student_id,c.student_name,c.procedure_key,c.procedure_name,c.case_no,c.patient_name
    FROM case_records c
    JOIN student_block_assignments a ON a.student_id=c.student_id AND a.archived_at IS NULL
    JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
    WHERE a.block_id=$1 AND c.academic_year=$2 AND c.archived_at IS NULL
    ORDER BY c.created_at,c.id`, [context.block_id, context.academic_year]);
  return result.rows.flatMap((record) => {
    const caseMatch = context.case_key && normalizeCaseRoleValue(record.case_no) === context.case_key;
    const patientMatch = context.patient_key && normalizeCaseRoleValue(record.patient_name) === context.patient_key;
    if (!caseMatch && !patientMatch) return [];
    const clinicalRole = clinicalRoleForProcedure(record.procedure_key) || clinicalRoleForProcedure(record.procedure_name);
    return clinicalRole ? [{ ...record, clinical_role: clinicalRole }] : [];
  });
}

function caseRoleConflict(records, role, studentId) {
  return records.find((record) => record.clinical_role === role && String(record.student_id) !== String(studentId));
}

function caseRoleConflictResponse(context) {
  const roleLabel = clinicalRoleLabel(context.role);
  fail(409, `The ${roleLabel} role is already assigned to another groupmate for this patient.`, {
    code: 'case_role_unavailable', role: context.role, role_label: roleLabel, case_no: context.case_no
  });
}

async function lockCaseRole(client, context) {
  if (!context) return;
  const keys = [context.case_key && `case:${context.case_key}`, context.patient_key && `patient:${context.patient_key}`].filter(Boolean).sort();
  for (const key of keys) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
      `${context.block_id}|${context.academic_year}|${context.role}`, key
    ]);
  }
}

async function lockActiveCaseIdentity(client, studentId, academicYear, procedureKey, caseNo) {
  const identity = [studentId, academicYear, procedureKey, caseNo]
    .map((value) => trim(value).toLowerCase())
    .join('|');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity]);
}

function duplicateCaseValues(data, studentId, academicYear, procedureKey) {
  return [
    trim(studentId), trim(academicYear), trim(procedureKey), trim(data.case_no),
    trim(data.complete_diagnosis), trim(data.date_time_performed), trim(data.patient_name),
    trim(data.patient_address), trim(data.facility_name), trim(data.facility_address),
    trim(data.facility_contact_number), trim(data.supervisor_printed_name),
    trim(data.supervisor_contact_number), trim(data.supervisor_position_designation),
    trim(data.supervisor_license_no), trim(data.supervisor_license_expiry_date)
  ];
}

function normalizeCaseDateField(field, value) {
  const raw = trim(value);
  if (!raw) return null;
  if (field === 'supervisor_license_expiry_date') {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) fail(422, 'License expiry date must be a valid date.');
    return match[1];
  }
  if (field === 'date_time_performed') {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) fail(422, 'Date and time performed must be valid.');
    return raw;
  }
  return value;
}

async function findDuplicateCase(client, data, studentId, academicYear, procedureKey, excludeId = null) {
  const values = duplicateCaseValues(data, studentId, academicYear, procedureKey);
  values.push(excludeId);
  return first(await client.query(`SELECT id FROM case_records
    WHERE student_id=$1
      AND COALESCE(academic_year,'')=$2
      AND procedure_key=$3
      AND lower(btrim(COALESCE(case_no,'')))=lower(btrim($4))
      AND lower(btrim(COALESCE(complete_diagnosis,'')))=lower(btrim($5))
      AND date_time_performed IS NOT DISTINCT FROM NULLIF($6,'')::timestamptz
      AND lower(btrim(COALESCE(patient_name,'')))=lower(btrim($7))
      AND lower(btrim(COALESCE(patient_address,'')))=lower(btrim($8))
      AND lower(btrim(COALESCE(facility_name,'')))=lower(btrim($9))
      AND lower(btrim(COALESCE(facility_address,'')))=lower(btrim($10))
      AND lower(btrim(COALESCE(facility_contact_number,'')))=lower(btrim($11))
      AND lower(btrim(COALESCE(supervisor_printed_name,'')))=lower(btrim($12))
      AND lower(btrim(COALESCE(supervisor_contact_number,'')))=lower(btrim($13))
      AND lower(btrim(COALESCE(supervisor_position_designation,'')))=lower(btrim($14))
      AND lower(btrim(COALESCE(supervisor_license_no,'')))=lower(btrim($15))
      AND supervisor_license_expiry_date IS NOT DISTINCT FROM NULLIF($16,'')::date
      AND archived_at IS NULL
      AND ($17::bigint IS NULL OR id<>$17::bigint)
    LIMIT 1`, values));
}

async function loginLocked(req, role, identity) {
  const identityHash = hashToken(trim(identity).toLowerCase());
  const ipHash = hashToken(req.ip || 'unknown');
  const result = await pool.query(
    'SELECT locked_until FROM auth_login_attempts WHERE role_name=$1 AND identity_hash=$2 AND ip_hash=$3',
    [role, identityHash, ipHash]
  );
  return Boolean(result.rows[0]?.locked_until && new Date(result.rows[0].locked_until) > new Date());
}

async function recordLoginFailure(req, role, identity) {
  await pool.query(`
    INSERT INTO auth_login_attempts (role_name,identity_hash,ip_hash,failure_count,first_failed_at,last_failed_at,locked_until)
    VALUES ($1,$2,$3,1,now(),now(),NULL)
    ON CONFLICT (role_name,identity_hash,ip_hash) DO UPDATE SET
      failure_count=CASE WHEN auth_login_attempts.last_failed_at < now()-interval '15 minutes' THEN 1 ELSE auth_login_attempts.failure_count+1 END,
      first_failed_at=CASE WHEN auth_login_attempts.last_failed_at < now()-interval '15 minutes' THEN now() ELSE auth_login_attempts.first_failed_at END,
      last_failed_at=now(),
      locked_until=CASE WHEN (CASE WHEN auth_login_attempts.last_failed_at < now()-interval '15 minutes' THEN 1 ELSE auth_login_attempts.failure_count+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END`,
  [role, hashToken(trim(identity).toLowerCase()), hashToken(req.ip || 'unknown')]);
}

async function clearLoginFailures(req, role, identity) {
  await pool.query('DELETE FROM auth_login_attempts WHERE role_name=$1 AND identity_hash=$2 AND ip_hash=$3',
    [role, hashToken(trim(identity).toLowerCase()), hashToken(req.ip || 'unknown')]);
}

async function createBackup(user) {
  const tables = {};
  for (const table of BACKUP_TABLES) tables[table] = (await pool.query(`SELECT * FROM public.${table}`)).rows;
  await audit(pool, user, 'export_backup', 'system');
  return { app: 'midwife-clinical-portal', format_version: 3, exported_at: new Date().toISOString(), tables };
}

async function restoreBackup(snapshot, user) {
  if (snapshot?.app !== 'midwife-clinical-portal' || !snapshot.tables || typeof snapshot.tables !== 'object') {
    fail(422, 'The selected file is not a valid MIDWIFE database backup.');
  }
  const tables = BACKUP_TABLES.filter((table) => Array.isArray(snapshot.tables[table]));
  if (!tables.length) fail(422, 'The backup does not contain portal records.');
  await transaction(async (client) => {
    for (const table of [...tables].reverse()) await client.query(`DELETE FROM public.${table}`);
    for (const table of tables) {
      const columnRows = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]
      );
      const allowed = new Set(columnRows.rows.map((row) => row.column_name));
      for (const source of snapshot.tables[table]) {
        const columns = Object.keys(source || {}).filter((column) => allowed.has(column));
        if (!columns.length) continue;
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(',');
        const quoted = columns.map((column) => `"${column}"`).join(',');
        await client.query(`INSERT INTO public.${table} (${quoted}) VALUES (${placeholders})`, columns.map((column) => source[column]));
      }
    }
  });
  await audit(pool, user, 'restore_backup', 'system', '', { exported_at: snapshot.exported_at || '' });
}

async function directoryRoutes(req, res, resource, method) {
  if (resource === 'sync-state' && method === 'GET') {
    await currentUser(req, ALL_ROLES);
    const tables = [
      ['students','updated_at'],['instructor_accounts','updated_at'],['school_years','updated_at'],['student_blocks','updated_at'],
      ['student_block_assignments','updated_at'],['case_records','updated_at'],['case_comments','COALESCE(archived_at,created_at)'],
      ['edit_requests','updated_at'],['edit_permissions','updated_at'],['notification_history','created_at'],['chat_messages','created_at'],['audit_trail','created_at']
    ];
    const parts = [];
    for (const [table,timestamp] of tables) {
      const result = await pool.query(`SELECT COUNT(*)::int AS count,COALESCE(MAX(${timestamp})::text,'') AS latest FROM ${table}`);
      parts.push(`${table}:${result.rows[0].count}:${result.rows[0].latest}`);
    }
    return res.json({ ok: true, version: hashToken(parts.join('|')) });
  }
  if (resource === 'dashboard-stats' && method === 'GET') {
    await currentUser(req, STAFF_ROLES);
    const result = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM students WHERE archived_at IS NULL) AS students,
      (SELECT COUNT(*)::int FROM instructor_accounts WHERE archived_at IS NULL AND status='active') AS instructors,
      (SELECT COUNT(*)::int FROM case_records WHERE archived_at IS NULL) AS records,
      (SELECT COUNT(*)::int FROM school_years WHERE archived_at IS NULL) AS school_years,
      (SELECT COUNT(*)::int FROM edit_requests WHERE archived_at IS NULL AND status='pending') AS pending_requests`);
    return res.json({ ok: true, counts: result.rows[0] });
  }
  if (resource === 'instructor-directory' && method === 'GET') {
    await currentUser(req, ALL_ROLES);
    const result = await pool.query("SELECT account_uid AS id,username,display_name,role_title,status FROM instructor_accounts WHERE archived_at IS NULL AND status='active' ORDER BY display_name");
    return res.json({ ok: true, accounts: result.rows });
  }
  if (resource === 'school-year-directory' && method === 'GET') {
    await currentUser(req, STAFF_ROLES);
    const result = await pool.query(`SELECT y.id,y.label,y.status,y.created_at,COUNT(DISTINCT b.id)::int AS block_count,COUNT(DISTINCT s.student_id)::int AS student_count
      FROM school_years y LEFT JOIN student_blocks b ON b.school_year_id=y.id AND b.archived_at IS NULL
      LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL
      WHERE y.archived_at IS NULL GROUP BY y.id ORDER BY y.start_year DESC`);
    return res.json({ ok: true, years: result.rows });
  }
  if (resource === 'block-directory' && method === 'GET') {
    await currentUser(req, STAFF_ROLES);
    const year = trim(req.query.school_year);
    const result = await pool.query(`SELECT b.id,b.label,y.label AS school_year,b.status,b.created_at,COUNT(DISTINCT s.student_id)::int AS student_count
      FROM student_blocks b JOIN school_years y ON y.id=b.school_year_id LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL
      LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE b.archived_at IS NULL AND ($1='' OR y.label=$1)
      GROUP BY b.id,y.label,y.start_year ORDER BY y.start_year DESC,b.label`, [year]);
    return res.json({ ok: true, blocks: result.rows });
  }
  if (resource === 'assignment-directory' && method === 'GET') {
    await currentUser(req, STAFF_ROLES);
    const result = await pool.query(`SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,y.label AS registered_school_year,b.id AS block_id,b.label AS block_label
      FROM student_block_assignments a JOIN students s ON s.student_id=a.student_id JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id
      WHERE a.archived_at IS NULL AND s.archived_at IS NULL AND ($1='' OR b.id::text=$1) AND ($2='' OR y.label=$2) ORDER BY s.student_name`,
    [trim(req.query.block_id), trim(req.query.school_year)]);
    return res.json({ ok: true, students: result.rows });
  }
  return false;
}

router.use(async (req, res) => {
  const [resource = 'health', id = '', action = ''] = req.path.split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  const data = req.body || {};
  validateContactNumbers(data);

  if (resource === 'health') {
    try {
      await pool.query('SELECT 1');
      return res.json({ ok: true, service: 'MIDWIFE Clinical Portal API', database: 'Supabase PostgreSQL' });
    } catch {
      fail(503, 'Supabase PostgreSQL is not reachable.');
    }
  }
  if (resource === 'backup') {
    const user = await currentUser(req, ['admin']);
    if (method === 'GET') return res.json({ ok: true, backup: await createBackup(user) });
    if (method === 'POST' && id === 'restore') {
      if (data.confirmation !== 'RESTORE') fail(422, 'Type RESTORE to confirm this database replacement.');
      await restoreBackup(data.backup, user);
      return res.json({ ok: true });
    }
    fail(404, 'Backup endpoint not found.');
  }
  if (await directoryRoutes(req, res, resource, method)) return;

  if (resource === 'auth') {
    if (id === 'session' && method === 'GET') {
      const user = await currentUser(req, ALL_ROLES, true);
      const payload = { ok: true, role: user.role, user_uid: user.user_uid, expires_at: user.expires_at };
      if (user.role === 'admin') payload.must_change_pin = first(await pool.query('SELECT must_change_pin FROM admins WHERE id=$1 AND archived_at IS NULL', [user.user_uid]))?.must_change_pin || false;
      return res.json(payload);
    }
    if (id === 'admin-pin' && method === 'PATCH') {
      const user = await currentUser(req, ['admin'], true);
      requireFields(data, ['current_pin', 'new_pin']);
      if (!/^\d{6,12}$/.test(String(data.new_pin))) fail(422, 'New PIN must contain 6 to 12 digits.');
      const admin = first(await pool.query('SELECT pin_number FROM admins WHERE id=$1 AND archived_at IS NULL', [user.user_uid]));
      if (!passwordMatches(data.current_pin, admin?.pin_number)) fail(403, 'Current PIN is incorrect.');
      await transaction(async (client) => {
        await client.query('UPDATE admins SET pin_number=$1,must_change_pin=false WHERE id=$2 AND archived_at IS NULL', [hashPassword(data.new_pin), user.user_uid]);
        await client.query("UPDATE api_sessions SET revoked_at=now() WHERE role='admin' AND user_uid=$1 AND token_hash<>$2 AND revoked_at IS NULL", [user.user_uid, hashToken(bearerToken(req))]);
        await audit(client, user, 'change_pin', 'admin', user.user_uid);
      });
      return res.json({ ok: true });
    }
    if (id === 'logout' && method === 'POST') {
      const token = bearerToken(req);
      if (token) await pool.query('UPDATE api_sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(token)]);
      return res.json({ ok: true });
    }
    if (method === 'POST') {
      const role = id;
      let identity;
      let result;
      if (role === 'student') {
        requireFields(data, ['student_id', 'password']); identity = data.student_id;
        result = await pool.query('SELECT student_id AS uid,student_id,student_name,parent_name,contact_number,parent_contact,profile_photo,password FROM students WHERE student_id=$1 AND archived_at IS NULL', [data.student_id]);
      } else if (role === 'instructor') {
        requireFields(data, ['username', 'password']); identity = data.username;
        result = await pool.query("SELECT account_uid AS uid,account_uid AS id,username,display_name,contact_number,profile_photo,role_title AS role,password FROM instructor_accounts WHERE username=$1 AND archived_at IS NULL AND status='active'", [data.username]);
      } else if (role === 'admin') {
        requireFields(data, ['pin_number']); identity = 'administrator';
        result = await pool.query('SELECT id::text AS uid,pin_number,must_change_pin FROM admins WHERE archived_at IS NULL ORDER BY id LIMIT 1');
      } else fail(404, 'Unknown authentication role.');
      if (await loginLocked(req, role, identity)) fail(429, 'Too many failed attempts. Please try again in 15 minutes.');
      const row = first(result);
      const credential = role === 'admin' ? data.pin_number : data.password;
      const stored = role === 'admin' ? row?.pin_number : row?.password;
      if (!row || !passwordMatches(credential, stored)) {
        await recordLoginFailure(req, role, identity);
        fail(401, 'Invalid credentials.');
      }
      await clearLoginFailures(req, role, identity);
      delete row.password; delete row.pin_number;
      return res.json({ ok: true, token: await createSession(pool, role, row.uid), role, user: row });
    }
  }

  if (resource === 'students') {
    const user = await currentUser(req, ALL_ROLES);
    const profileSql = `SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,s.parent_contact,s.profile_photo,s.status,s.archived_at,s.created_at,
      (SELECT y.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL
       WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS registered_school_year,
      (SELECT b.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL
       WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS block_label FROM students s`;
    if (method === 'GET') {
      if (id) {
        if (user.role === 'student' && user.user_uid !== id) fail(403, 'Access denied.');
        return res.json({ ok: true, student: first(await pool.query(`${profileSql} WHERE s.student_id=$1`, [id])) });
      }
      if (user.role === 'student') fail(403, 'Access denied.');
      const archived = req.query.archived === '1';
      const result = await pool.query(`${profileSql} WHERE s.archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY s.student_name`);
      return res.json({ ok: true, students: result.rows });
    }
    if (method === 'POST' && !id) {
      if (!STAFF_ROLES.includes(user.role)) fail(403, 'Access denied.');
      requireFields(data, ['student_id','student_name','password','parent_name','contact_number']);
      if (!strongCredential(data.password)) fail(422, 'Initial password must contain at least 8 characters.');
      await pool.query('INSERT INTO students (student_id,student_name,password,parent_name,contact_number) VALUES ($1,$2,$3,$4,$5)',
        [data.student_id, data.student_name, hashPassword(data.password), data.parent_name, data.contact_number]);
      await audit(pool, user, 'create', 'student', data.student_id);
      return res.status(201).json({ ok: true, student_id: data.student_id });
    }
    if (method === 'PATCH' && id && ['archive','restore'].includes(action)) {
      if (!STAFF_ROLES.includes(user.role)) fail(403, 'Access denied.');
      const result = await transaction(async (client) => {
        const account = action === 'archive'
          ? await client.query("UPDATE students SET archived_at=now(),status='archived' WHERE student_id=$1 AND archived_at IS NULL", [id])
          : await client.query("UPDATE students SET archived_at=NULL,status='active' WHERE student_id=$1 AND archived_at IS NOT NULL", [id]);
        if (changed(account) && action === 'archive') await client.query("UPDATE api_sessions SET revoked_at=now() WHERE role='student' AND user_uid=$1 AND revoked_at IS NULL", [id]);
        let assignments = { rowCount: 0 };
        if (action === 'restore') {
          assignments = await client.query(`UPDATE student_block_assignments a SET archived_at=NULL
            FROM student_blocks b,school_years y WHERE a.block_id=b.id AND b.school_year_id=y.id AND b.archived_at IS NULL AND y.archived_at IS NULL
            AND a.student_id=$1 AND a.archived_at IS NOT NULL`, [id]);
        }
        if (changed(account) || changed(assignments)) await audit(client, user, action, 'student', id, { assignments_restored: assignments.rowCount });
        return { ok: changed(account) || changed(assignments), assignments_restored: assignments.rowCount };
      });
      return res.json({ ...result, account_status: action === 'archive' ? 'paused' : 'active' });
    }
    if (method === 'PATCH' && id && !action) {
      if (!STAFF_ROLES.includes(user.role) && !(user.role === 'student' && user.user_uid === id)) fail(403, 'Access denied.');
      const values = [];
      const sets = [];
      for (const field of ['student_name','parent_name','contact_number','parent_contact','profile_photo']) {
        if (Object.hasOwn(data, field)) { values.push(data[field]); sets.push(`${field}=$${values.length}`); }
      }
      let passwordChanged = false;
      if (data.password) {
        if (!strongCredential(data.password)) fail(422, 'New password must contain at least 8 characters.');
        if (user.role === 'student') {
          requireFields(data, ['current_password']);
          const credential = first(await pool.query('SELECT password FROM students WHERE student_id=$1 AND archived_at IS NULL', [id]));
          if (!passwordMatches(data.current_password, credential?.password)) fail(403, 'Current password is incorrect.');
        }
        values.push(hashPassword(data.password)); sets.push(`password=$${values.length}`); passwordChanged = true;
      }
      if (!sets.length) fail(422, 'No student changes supplied.');
      values.push(id);
      await transaction(async (client) => {
        await client.query(`UPDATE students SET ${sets.join(',')} WHERE student_id=$${values.length} AND archived_at IS NULL`, values);
        if (passwordChanged) await client.query("UPDATE api_sessions SET revoked_at=now() WHERE role='student' AND user_uid=$1 AND token_hash<>$2 AND revoked_at IS NULL", [id, hashToken(bearerToken(req))]);
        await audit(client, user, passwordChanged ? 'change_password' : 'update', 'student', id);
      });
      return res.json({ ok: true, password_changed: passwordChanged });
    }
  }

  if (resource === 'instructors') {
    const user = await currentUser(req, ALL_ROLES);
    if (method === 'GET') {
      const result = await pool.query('SELECT account_uid AS id,username,display_name,contact_number,profile_photo,role_title AS role,status,archived_at,created_at FROM instructor_accounts WHERE archived_at IS NULL ORDER BY display_name');
      return res.json({ ok: true, accounts: result.rows });
    }
    if (method === 'POST' && !id) {
      if (user.role !== 'admin') fail(403, 'Access denied.');
      requireFields(data, ['username','password','display_name']);
      if (!strongCredential(data.password)) fail(422, 'Initial password must contain at least 8 characters.');
      const uid = randomId('ins_');
      await pool.query('INSERT INTO instructor_accounts (account_uid,username,password,display_name,contact_number,role_title) VALUES ($1,$2,$3,$4,$5,$6)',
        [uid, data.username, hashPassword(data.password), data.display_name, data.contact_number || null, data.role || 'Clinical Instructor']);
      await audit(pool, user, 'create', 'instructor', uid);
      return res.status(201).json({ ok: true, id: uid });
    }
    if (method === 'PATCH' && id && !action) {
      if (user.role === 'student' || (user.role === 'instructor' && user.user_uid !== id)) fail(403, 'Access denied.');
      const allowed = user.role === 'admin'
        ? { username:'username',display_name:'display_name',contact_number:'contact_number',profile_photo:'profile_photo',role:'role_title',status:'status' }
        : { contact_number:'contact_number',profile_photo:'profile_photo' };
      const values = []; const sets = [];
      for (const [input, column] of Object.entries(allowed)) if (Object.hasOwn(data, input)) { values.push(data[input]); sets.push(`${column}=$${values.length}`); }
      if (user.role === 'admin' && data.password) { values.push(hashPassword(data.password)); sets.push(`password=$${values.length}`); }
      if (!sets.length) fail(422, 'No instructor changes supplied.');
      values.push(id);
      const result = await pool.query(`UPDATE instructor_accounts SET ${sets.join(',')} WHERE account_uid=$${values.length} AND archived_at IS NULL`, values);
      await audit(pool, user, 'update', 'instructor', id);
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'school-years') {
    const user = await currentUser(req, STAFF_ROLES);
    if (method === 'GET') {
      const result = await pool.query(`SELECT y.id,y.label,y.status,y.created_at,COUNT(DISTINCT b.id)::int AS block_count,COUNT(DISTINCT s.student_id)::int AS student_count
        FROM school_years y LEFT JOIN student_blocks b ON b.school_year_id=y.id AND b.archived_at IS NULL LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL
        LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE y.archived_at IS NULL GROUP BY y.id ORDER BY y.start_year DESC`);
      return res.json({ ok: true, years: result.rows });
    }
    if (method === 'POST') {
      if (user.role !== 'admin') fail(403, 'Access denied.');
      requireFields(data, ['label']);
      const match = /^(\d{4})-(\d{4})$/.exec(data.label);
      if (!match || Number(match[2]) !== Number(match[1]) + 1) fail(422, 'Use a consecutive YYYY-YYYY school year.');
      const schoolYear = await transaction(async (client) => {
        await client.query("UPDATE school_years SET status='inactive' WHERE archived_at IS NULL AND status='active'");
        return first(await client.query("INSERT INTO school_years (label,start_year,end_year,status,created_by) VALUES ($1,$2,$3,'active',$4) RETURNING id", [data.label, match[1], match[2], user.user_uid]));
      });
      await audit(pool, user, 'create', 'school_year', schoolYear.id, { label: data.label });
      return res.status(201).json({ ok: true, id: schoolYear.id });
    }
    if (method === 'PATCH' && id) {
      if (user.role !== 'admin') fail(403, 'Access denied.');
      const status = trim(data.status).toLowerCase();
      if (!['active','inactive'].includes(status)) fail(422, 'Invalid academic year status.');
      const result = await transaction(async (client) => {
        if (status === 'inactive') {
          const count = first(await client.query("SELECT COUNT(*)::int AS count FROM school_years WHERE archived_at IS NULL AND status='active'"));
          const current = first(await client.query('SELECT status FROM school_years WHERE id=$1 AND archived_at IS NULL', [id]));
          if (current?.status === 'active' && count.count <= 1) fail(422, 'One academic year must remain active.');
        } else await client.query("UPDATE school_years SET status='inactive' WHERE archived_at IS NULL AND status='active' AND id<>$1", [id]);
        return client.query('UPDATE school_years SET status=$1 WHERE id=$2 AND archived_at IS NULL', [status, id]);
      });
      await audit(pool, user, 'update', 'school_year', id, { status });
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'blocks') {
    const user = await currentUser(req, STAFF_ROLES);
    if (method === 'GET') {
      const year = trim(req.query.school_year);
      const result = await pool.query(`SELECT b.id,b.label,y.label AS school_year,b.status,b.created_at,COUNT(DISTINCT s.student_id)::int AS student_count
        FROM student_blocks b JOIN school_years y ON y.id=b.school_year_id LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL
        LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE b.archived_at IS NULL AND ($1='' OR y.label=$1)
        GROUP BY b.id,y.label,y.start_year ORDER BY y.start_year DESC,b.label`, [year]);
      return res.json({ ok: true, blocks: result.rows });
    }
    if (method === 'POST') {
      requireFields(data, ['label','school_year']);
      const result = await pool.query(`INSERT INTO student_blocks (school_year_id,label,created_by)
        SELECT id,$1,$2 FROM school_years WHERE label=$3 AND archived_at IS NULL RETURNING id`, [data.label, user.user_uid, data.school_year]);
      if (!changed(result)) fail(422, 'The selected academic year is unavailable.');
      await audit(pool, user, 'create', 'student_block', result.rows[0].id, { label: data.label, school_year: data.school_year });
      return res.status(201).json({ ok: true, id: result.rows[0].id });
    }
    if (method === 'PATCH' && id) {
      requireFields(data, ['label']);
      const result = await pool.query('UPDATE student_blocks SET label=$1 WHERE id=$2 AND archived_at IS NULL', [data.label, id]);
      if (changed(result)) await audit(pool, user, 'update', 'student_block', id, { label: data.label });
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'assignments') {
    const user = await currentUser(req, STAFF_ROLES);
    if (method === 'GET') {
      const year = trim(req.query.school_year); const blockId = trim(req.query.block_id);
      if (req.query.unassigned === '1') {
        const result = await pool.query(`SELECT s.student_id,s.student_name,s.parent_name,s.contact_number FROM students s WHERE s.archived_at IS NULL AND NOT EXISTS
          (SELECT 1 FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id
           WHERE a.student_id=s.student_id AND a.archived_at IS NULL AND y.label=$1) ORDER BY s.student_name`, [year]);
        return res.json({ ok: true, students: result.rows });
      }
      const result = await pool.query(`SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,y.label AS registered_school_year,b.id AS block_id,b.label AS block_label
        FROM student_block_assignments a JOIN students s ON s.student_id=a.student_id JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id
        WHERE a.archived_at IS NULL AND s.archived_at IS NULL AND ($1='' OR b.id::text=$1) AND ($2='' OR y.label=$2) ORDER BY s.student_name`, [blockId, year]);
      return res.json({ ok: true, students: result.rows });
    }
    if (method === 'POST') {
      requireFields(data, ['student_id','block_id']);
      const result = await pool.query(`INSERT INTO student_block_assignments (student_id,block_id,school_year_id,assigned_by)
        SELECT $1,b.id,b.school_year_id,$2 FROM student_blocks b WHERE b.id=$3 AND b.archived_at IS NULL
        ON CONFLICT (student_id,school_year_id) DO UPDATE SET block_id=EXCLUDED.block_id,assigned_by=EXCLUDED.assigned_by,archived_at=NULL,updated_at=now() RETURNING id`,
      [data.student_id, user.user_uid, data.block_id]);
      if (!changed(result)) fail(422, 'The selected block is unavailable.');
      await audit(pool, user, 'assign', 'student_block', data.student_id, { block_id: data.block_id });
      return res.json({ ok: true });
    }
    if (method === 'PATCH' && id && action === 'archive') {
      const result = await pool.query('UPDATE student_block_assignments SET archived_at=now() WHERE student_id=$1 AND archived_at IS NULL', [id]);
      if (changed(result)) await audit(pool, user, 'unassign', 'student_block', id);
      return res.json({ ok: true });
    }
  }

  if (resource === 'case-comments') {
    const user = await currentUser(req, ALL_ROLES);
    const caseId = trim(req.query.case_id);
    if (method === 'GET') {
      if (!caseId) fail(422, 'case_id is required.');
      const caseRecord = first(await pool.query('SELECT id,student_id,instructor_uid,instructor_name,procedure_key,case_no,teacher_remarks FROM case_records WHERE id=$1', [caseId]));
      if (!caseRecord) fail(404, 'Case not found.');
      if (user.role === 'student' && user.user_uid !== caseRecord.student_id) fail(403, 'Access denied.');
      await transaction(async (client) => {
        const legacy = trim(caseRecord.teacher_remarks);
        const count = first(await client.query('SELECT COUNT(*)::int AS count FROM case_comments WHERE case_id=$1', [caseId])).count;
        if (!count && legacy && !/^(none|n\/?a|not applicable|null|undefined|-)$/i.test(legacy)) {
          await client.query(`INSERT INTO case_comments (case_id,author_uid,author_name,author_role,comment_text,source_key)
            VALUES ($1,$2,$3,'instructor',$4,$5) ON CONFLICT (source_key) DO NOTHING`,
          [caseId, caseRecord.instructor_uid || null, caseRecord.instructor_name || 'Clinical Instructor', legacy, `legacy-case:${caseId}`]);
        }
        const requests = await client.query("SELECT id,rejection_remarks,rejected_at,case_numbers FROM edit_requests WHERE student_id=$1 AND procedure_key=$2 AND status='rejected' AND rejection_remarks IS NOT NULL", [caseRecord.student_id, caseRecord.procedure_key]);
        for (const request of requests.rows) {
          const numbers = Array.isArray(request.case_numbers) ? request.case_numbers.map(String) : [];
          const remark = trim(request.rejection_remarks);
          if (!numbers.includes(String(caseRecord.case_no)) || !remark || /^(none|n\/?a|not applicable|null|undefined|-)$/i.test(remark)) continue;
          await client.query(`INSERT INTO case_comments (case_id,author_uid,author_name,author_role,comment_text,source_key,created_at)
            VALUES ($1,NULL,$2,'instructor',$3,$4,COALESCE($5,now())) ON CONFLICT (source_key) DO NOTHING`,
          [caseId, caseRecord.instructor_name || 'Clinical Instructor', remark, `edit-request:${request.id}`, request.rejected_at]);
        }
      });
      const archived = req.query.archived === '1';
      const result = await pool.query(`SELECT id,case_id,author_uid,author_name,author_role,comment_text,created_at,archived_at
        FROM case_comments WHERE case_id=$1 AND archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY created_at DESC,id DESC`, [caseId]);
      return res.json({ ok: true, comments: result.rows });
    }
    if (method === 'PATCH' && id && ['archive','restore'].includes(action)) {
      const owner = first(await pool.query('SELECT c.student_id FROM case_comments m JOIN case_records c ON c.id=m.case_id WHERE m.id=$1', [id]));
      if (!owner) fail(404, 'Comment not found.');
      if (user.role === 'student' && user.user_uid !== owner.student_id) fail(403, 'Access denied.');
      const result = action === 'archive'
        ? await pool.query('UPDATE case_comments SET archived_at=now(),archived_by=$1 WHERE id=$2 AND archived_at IS NULL', [user.user_uid, id])
        : await pool.query('UPDATE case_comments SET archived_at=NULL,archived_by=NULL WHERE id=$1 AND archived_at IS NOT NULL', [id]);
      if (changed(result)) await audit(pool, user, action, 'case_comment', id);
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'case-role-availability' && method === 'GET') {
    const user = await currentUser(req, ['student']);
    const caseNo = trim(req.query.case_no); const patientName = trim(req.query.patient_name); const procedureKey = trim(req.query.procedure_key);
    if (!caseNo || !patientName || !procedureKey) fail(422, 'case_no, patient_name, and procedure_key are required.');
    const context = await resolveCaseRoleContext(pool, user.user_uid, trim(req.query.academic_year), caseNo, patientName, procedureKey);
    const role = clinicalRoleForProcedure(procedureKey);
    if (!context) return res.json({ ok: true, enforced: false, available: true, role, role_label: role ? clinicalRoleLabel(role) : null });
    const records = await getActiveCaseRoleRecords(pool, context);
    const conflict = caseRoleConflict(records, context.role, user.user_uid);
    return res.json({ ok: true, enforced: true, available: !conflict, role: context.role, role_label: clinicalRoleLabel(context.role),
      case_no: caseNo, patient_name: patientName, owned_by_current_student: !conflict && records.some((r) => r.clinical_role === context.role && r.student_id === user.user_uid),
      message: conflict ? `The ${clinicalRoleLabel(context.role)} role is already assigned to another groupmate for this patient.` : '' });
  }

  if (resource === 'cases') {
    const user = await currentUser(req, ALL_ROLES);
    if (method === 'GET') {
      const values = []; const conditions = [`c.archived_at IS ${req.query.archived === '1' ? 'NOT ' : ''}NULL`];
      const add = (sql, value) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
      if (user.role === 'student') add('c.student_id=?', user.user_uid); else if (req.query.student_id) add('c.student_id=?', req.query.student_id);
      if (req.query.school_year) add('c.academic_year=?', req.query.school_year);
      if (req.query.procedure) add('c.procedure_key=?', req.query.procedure);
      const result = await pool.query(`SELECT c.*,(SELECT y.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
        JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=c.student_id AND a.archived_at IS NULL
        ORDER BY (y.label=c.academic_year) DESC,(y.status='active') DESC,y.start_year DESC LIMIT 1) AS assigned_school_year
        FROM case_records c WHERE ${conditions.join(' AND ')} ORDER BY c.date_time_performed DESC,c.id DESC`, values);
      return res.json({ ok: true, cases: result.rows });
    }
    if (method === 'POST') {
      requireFields(data, ['student_id','procedure_key','case_no','patient_name']);
      if (user.role === 'student' && user.user_uid !== String(data.student_id)) fail(403, 'Access denied.');
      const normalizedCaseData = {
        ...data,
        date_time_performed: normalizeCaseDateField('date_time_performed', data.date_time_performed),
        supervisor_license_expiry_date: normalizeCaseDateField('supervisor_license_expiry_date', data.supervisor_license_expiry_date)
      };
      const result = await transaction(async (client) => {
        const requestedYear = trim(normalizedCaseData.academic_year);
        const year = first(await client.query(`SELECT y.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
          JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=$1 AND a.archived_at IS NULL
          ORDER BY (y.label=$2) DESC,(y.status='active') DESC,y.start_year DESC LIMIT 1`, [data.student_id, requestedYear]));
        const academicYear = year?.label || requestedYear || null;
        const context = await resolveCaseRoleContext(client, data.student_id, academicYear, data.case_no, data.patient_name, data.procedure_key);
        await lockCaseRole(client, context);
        await lockActiveCaseIdentity(client, normalizedCaseData.student_id, academicYear, normalizedCaseData.procedure_key, normalizedCaseData.case_no);
        if (context && caseRoleConflict(await getActiveCaseRoleRecords(client, context), context.role, normalizedCaseData.student_id)) caseRoleConflictResponse(context);
        const duplicate = await findDuplicateCase(client, normalizedCaseData, normalizedCaseData.student_id, academicYear, normalizedCaseData.procedure_key);
        if (duplicate) fail(409, 'An identical clinical record already exists.', {
          code: 'duplicate_case_record', existing_case_id: duplicate.id
        });
        const inserted = await client.query(`INSERT INTO case_records
          (student_id,student_name,instructor_uid,instructor_name,academic_year,procedure_key,procedure_name,case_no,complete_diagnosis,date_time_performed,patient_name,patient_address,facility_name,facility_address,facility_contact_number,supervisor_printed_name,supervisor_contact_number,supervisor_position_designation,supervisor_license_no,supervisor_license_expiry_date)
          SELECT s.student_id,s.student_name,$1,$2,$3,p.procedure_key,p.procedure_name,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
          FROM students s JOIN procedures p ON p.procedure_key=$17 WHERE s.student_id=$18 AND s.archived_at IS NULL RETURNING id`,
        [normalizedCaseData.instructor_uid||null,normalizedCaseData.instructor_name||null,academicYear,trim(normalizedCaseData.case_no),normalizedCaseData.complete_diagnosis||null,normalizedCaseData.date_time_performed||null,normalizedCaseData.patient_name||null,normalizedCaseData.patient_address||null,
          normalizedCaseData.facility_name||null,normalizedCaseData.facility_address||null,normalizedCaseData.facility_contact_number||null,normalizedCaseData.supervisor_printed_name||null,normalizedCaseData.supervisor_contact_number||null,
          normalizedCaseData.supervisor_position_designation||null,normalizedCaseData.supervisor_license_no||null,normalizedCaseData.supervisor_license_expiry_date||null,normalizedCaseData.procedure_key,normalizedCaseData.student_id]);
        if (!changed(inserted)) fail(422, 'The student or procedure is unavailable.');
        await audit(client, user, 'create', 'case', inserted.rows[0].id, { student_id: data.student_id, procedure_key: data.procedure_key });
        return inserted.rows[0];
      });
      return res.status(201).json({ ok: true, id: result.id });
    }
    if (method === 'PATCH' && id && !action) {
      const ownerValues = user.role === 'student' ? [id, user.user_uid] : [id];
      const record = first(await pool.query(`SELECT id,student_id,academic_year,procedure_key,case_no,complete_diagnosis,date_time_performed,
        patient_name,patient_address,facility_name,facility_address,facility_contact_number,supervisor_printed_name,
        supervisor_contact_number,supervisor_position_designation,supervisor_license_no,supervisor_license_expiry_date
        FROM case_records WHERE id=$1 AND archived_at IS NULL${user.role === 'student' ? ' AND student_id=$2' : ''}`, ownerValues));
      if (!record) fail(404, 'Clinical record not found or access is denied.');
      if (user.role === 'student') {
        const permission = first(await pool.query('SELECT approved FROM edit_permissions WHERE student_id=$1 AND procedure_key=$2', [user.user_uid, record.procedure_key]));
        if (!permission?.approved) fail(403, 'Instructor correction approval is required before editing this record.');
      }
      const editable = ['case_no','complete_diagnosis','date_time_performed','patient_name','patient_address','facility_name','facility_address','facility_contact_number','supervisor_printed_name','supervisor_contact_number','supervisor_position_designation','supervisor_license_no','supervisor_license_expiry_date'];
      const supplied = editable.filter((field) => Object.hasOwn(data, field));
      if (!supplied.length) fail(422, 'No clinical changes were supplied.');
      const normalizedData = { ...data };
      for (const field of supplied) normalizedData[field] = normalizeCaseDateField(field, data[field]);
      const nextCaseNo = trim(normalizedData.case_no ?? record.case_no); const nextPatientName = trim(normalizedData.patient_name ?? record.patient_name);
      if (!nextCaseNo || !nextPatientName) fail(422, 'Case number and patient name are required.');
      await transaction(async (client) => {
        const context = await resolveCaseRoleContext(client, record.student_id, record.academic_year, nextCaseNo, nextPatientName, record.procedure_key);
        await lockCaseRole(client, context);
        await lockActiveCaseIdentity(client, record.student_id, record.academic_year, record.procedure_key, nextCaseNo);
        if (context && caseRoleConflict(await getActiveCaseRoleRecords(client, context), context.role, record.student_id)) caseRoleConflictResponse(context);
        const duplicate = await findDuplicateCase(client, { ...record, ...normalizedData }, record.student_id, record.academic_year, record.procedure_key, id);
        if (duplicate) fail(409, 'An identical clinical record already exists.', {
          code: 'duplicate_case_record', existing_case_id: duplicate.id
        });
        const values = supplied.map((field) => normalizedData[field]); const sets = supplied.map((field, i) => `${field}=$${i+1}`);
        values.push('submitted', null, id);
        await client.query(`UPDATE case_records SET ${sets.join(',')},record_status=$${values.length-2},teacher_remarks=$${values.length-1} WHERE id=$${values.length} AND archived_at IS NULL`, values);
        if (user.role === 'student') await client.query('UPDATE edit_permissions SET approved=false,updated_at=now() WHERE student_id=$1 AND procedure_key=$2', [user.user_uid, record.procedure_key]);
        await audit(client, user, 'update', 'case', id, { fields: supplied });
      });
      return res.json({ ok: true });
    }
    if (method === 'PATCH' && id && action === 'review') {
      if (!STAFF_ROLES.includes(user.role)) fail(403, 'Access denied.');
      const statusMap = { Draft:'submitted',Submitted:'submitted','Under Review':'reviewed','Changes Requested':'needs_revision',Resubmitted:'submitted',Verified:'verified',Invalid:'invalid',Archived:'archived' };
      const requested = trim(data.status); const status = statusMap[requested] || requested;
      if (!['submitted','reviewed','verified','needs_revision','invalid','archived'].includes(status)) fail(422, 'Invalid record status.');
      const instructorId = data.instructor_id ?? data.instructorId ?? null; const instructorName = data.instructor_name ?? data.instructorName ?? null;
      const updated = await pool.query(`UPDATE case_records SET record_status=$1,teacher_remarks=$2,checked_by=CASE WHEN $1='verified' THEN $3 ELSE NULL END,
        checked_at=CASE WHEN $1='verified' THEN now() ELSE NULL END,instructor_uid=COALESCE($4,instructor_uid),instructor_name=COALESCE($3,instructor_name)
        WHERE id=$5 AND archived_at IS NULL`, [status, data.remarks || null, instructorName, instructorId, id]);
      if (!changed(updated)) fail(404, 'Clinical record not found or already archived.');
      await audit(pool, user, 'review', 'case', id, { status: requested, remarks: data.remarks || null });
      return res.json({ ok: true, updated: updated.rowCount });
    }
    if (method === 'PATCH' && id && action === 'comment') {
      if (!STAFF_ROLES.includes(user.role)) fail(403, 'Access denied.');
      const remarks = trim(data.remarks); if (!remarks) fail(422, 'A comment is required.');
      const record = first(await pool.query('SELECT instructor_name FROM case_records WHERE id=$1 AND archived_at IS NULL', [id]));
      if (!record) fail(404, 'Case not found.');
      const comment = await transaction(async (client) => {
        const inserted = await client.query('INSERT INTO case_comments (case_id,author_uid,author_name,author_role,comment_text) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [id,user.user_uid,trim(data.checked_by)||record.instructor_name||'Clinical Instructor',user.role==='admin'?'admin':'instructor',remarks]);
        await client.query('UPDATE case_records SET teacher_remarks=$1 WHERE id=$2', [remarks,id]);
        await audit(client,user,'comment','case',id,{comment_id:inserted.rows[0].id,remarks}); return inserted.rows[0];
      });
      return res.json({ ok: true, id: comment.id });
    }
    if (method === 'PATCH' && id && ['archive','restore'].includes(action)) {
      const result = await transaction(async (client) => {
        const params = user.role === 'student' ? [id,user.user_uid] : [id];
        if (action === 'restore') {
          const record = first(await client.query(`SELECT id,student_id,academic_year,procedure_key,case_no,complete_diagnosis,date_time_performed,
            patient_name,patient_address,facility_name,facility_address,facility_contact_number,supervisor_printed_name,
            supervisor_contact_number,supervisor_position_designation,supervisor_license_no,supervisor_license_expiry_date
            FROM case_records WHERE id=$1 AND archived_at IS NOT NULL${user.role==='student'?' AND student_id=$2':''}`, params));
          if (!record) fail(404, 'Archived case not found.');
          const context = record.academic_year ? await resolveCaseRoleContext(client,record.student_id,record.academic_year,record.case_no,record.patient_name,record.procedure_key) : null;
          await lockCaseRole(client, context);
          await lockActiveCaseIdentity(client, record.student_id, record.academic_year, record.procedure_key, record.case_no);
          if (context && caseRoleConflict(await getActiveCaseRoleRecords(client,context),context.role,record.student_id)) caseRoleConflictResponse(context);
          const duplicate = await findDuplicateCase(client, record, record.student_id, record.academic_year, record.procedure_key, record.id);
          if (duplicate) fail(409, 'An identical clinical record is already active. Keep this copy archived or change the active record.', {
            code: 'duplicate_case_record', existing_case_id: duplicate.id
          });
        }
        const updated = await client.query(`UPDATE case_records SET archived_at=${action==='archive'?'now()':'NULL'},record_status='${action==='archive'?'archived':'submitted'}'
          WHERE id=$1 AND archived_at IS ${action==='archive'?'':'NOT '}NULL${user.role==='student'?' AND student_id=$2':''}`, params);
        if (changed(updated)) await audit(client,user,action,'case',id); return updated;
      });
      return res.json({ ok: changed(result) });
    }
    if (method === 'DELETE' && id) {
      const params = user.role === 'student' ? [id,user.user_uid] : [id];
      const result = await pool.query(`DELETE FROM case_records WHERE id=$1 AND archived_at IS NOT NULL${user.role==='student'?' AND student_id=$2':''}`, params);
      if (changed(result)) await audit(pool,user,'delete_permanently','case',id);
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'edit-requests') {
    const user = await currentUser(req, ALL_ROLES);
    if (method === 'GET') {
      const archived = req.query.archived === '1';
      const params = user.role === 'student' ? [user.user_uid] : [];
      const result = await pool.query(`SELECT * FROM edit_requests WHERE archived_at IS ${archived?'NOT ':''}NULL${user.role==='student'?' AND student_id=$1':''} ORDER BY requested_at DESC`, params);
      return res.json({ ok: true, requests: result.rows });
    }
    if (method === 'POST') {
      if (user.role !== 'student') fail(403, 'Access denied.');
      requireFields(data, ['procedure_key','procedure_name']);
      const result = await pool.query('INSERT INTO edit_requests (student_id,procedure_key,procedure_name,case_numbers) VALUES ($1,$2,$3,$4::jsonb) RETURNING id',
        [user.user_uid,data.procedure_key,data.procedure_name,JSON.stringify(data.case_numbers || [])]);
      return res.status(201).json({ ok: true, id: result.rows[0].id });
    }
    if (method === 'PATCH' && id && ['approve','reject','archive','restore'].includes(action)) {
      if (action !== 'archive' && !STAFF_ROLES.includes(user.role)) fail(403, 'Access denied.');
      const result = await transaction(async (client) => {
        let updated;
        if (action === 'approve') updated = await client.query("UPDATE edit_requests SET status='approved',approved_at=now() WHERE id=$1 AND archived_at IS NULL", [id]);
        else if (action === 'reject') updated = await client.query("UPDATE edit_requests SET status='rejected',rejection_remarks=$1,rejected_at=now() WHERE id=$2 AND archived_at IS NULL", [data.remarks || '',id]);
        else if (action === 'restore') updated = await client.query('UPDATE edit_requests SET archived_at=NULL WHERE id=$1 AND archived_at IS NOT NULL', [id]);
        else updated = await client.query('UPDATE edit_requests SET archived_at=now() WHERE id=$1 AND archived_at IS NULL', [id]);
        if (['approve','reject'].includes(action)) {
          const request = first(await client.query('SELECT student_id,procedure_key,procedure_name FROM edit_requests WHERE id=$1', [id]));
          if (request) {
            const approved = action === 'approve';
            await client.query(`INSERT INTO edit_permissions (student_id,procedure_key,approved,approved_at) VALUES ($1,$2,$3,CASE WHEN $3 THEN now() ELSE NULL END)
              ON CONFLICT (student_id,procedure_key) DO UPDATE SET approved=EXCLUDED.approved,approved_at=EXCLUDED.approved_at,updated_at=now()`,
            [request.student_id,request.procedure_key,approved]);
            await client.query('INSERT INTO notification_history (event_type,student_id,procedure_key,procedure_type,request_id,message,remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [`edit_request_${action}`,request.student_id,request.procedure_key,request.procedure_name,id,`Your edit request was ${action}.`,data.remarks||null]);
          }
        }
        await audit(client,user,action,'edit_request',id); return updated;
      });
      return res.json({ ok: changed(result) });
    }
  }

  if (resource === 'chat') {
    const user = await currentUser(req, ALL_ROLES);
    if (method === 'GET') {
      const conditions = ['archived_at IS NULL']; const params = [];
      const add = (condition,value) => { params.push(value); conditions.push(condition.replace('?',`$${params.length}`)); };
      if (user.role === 'student') add('student_id=?',user.user_uid); else if (req.query.student_id) add('student_id=?',req.query.student_id);
      if (req.query.instructor_id) add('(instructor_id=? OR instructor_id IS NULL)',req.query.instructor_id);
      const result = await pool.query(`SELECT * FROM chat_messages WHERE ${conditions.join(' AND ')} ORDER BY created_at,id`,params);
      return res.json({ ok: true, messages: result.rows });
    }
    if (method === 'POST') {
      requireFields(data,['student_id','message']);
      if (user.role === 'student' && user.user_uid !== String(data.student_id)) fail(403,'Access denied.');
      const senderRole = user.role === 'student' ? 'student' : 'instructor';
      const result = await pool.query(`INSERT INTO chat_messages (student_id,student_name,instructor_id,instructor_name,sender_role,sender_name,message,read_by_student,read_by_instructor)
        SELECT s.student_id,s.student_name,$1,$2,$3,$4,$5,$6,$7 FROM students s WHERE s.student_id=$8 AND s.archived_at IS NULL RETURNING id`,
      [data.instructor_id||null,data.instructor_name||null,senderRole,data.sender_name||(senderRole==='student'?'Student':'Instructor'),trim(data.message),senderRole==='instructor',senderRole==='student',data.student_id]);
      return res.status(201).json({ ok: changed(result), id: result.rows[0]?.id });
    }
    if (method === 'PATCH' && id && action === 'edit') {
      requireFields(data,['message']); const message=trim(data.message); if(!message) fail(422,'A message is required.');
      const params=[message,id]; let owner='TRUE';
      if(user.role==='student'){params.push(user.user_uid);owner=`sender_role='student' AND student_id=$3`;}
      else if(user.role==='instructor'){params.push(user.user_uid);owner=`sender_role='instructor' AND instructor_id=$3`;}
      const result=await pool.query(`UPDATE chat_messages SET message=$1 WHERE id=$2 AND archived_at IS NULL AND ${owner}`,params);
      return res.json({ok:changed(result)});
    }
    if (method === 'PATCH' && id && ['unsend','delete'].includes(action)) {
      const params=[id]; let owner='TRUE';
      if(user.role==='student'){params.push(user.user_uid);owner=`sender_role='student' AND student_id=$2`;}
      else if(user.role==='instructor'){params.push(user.user_uid);owner=`sender_role='instructor' AND instructor_id=$2`;}
      const result=await pool.query(`UPDATE chat_messages SET archived_at=now() WHERE id=$1 AND archived_at IS NULL AND ${owner}`,params);
      return res.json({ok:changed(result)});
    }
  }

  if (resource === 'notifications') {
    const user=await currentUser(req,ALL_ROLES);
    if(method==='GET'){
      const archived=req.query.archived==='1'; const params=user.role==='student'?[user.user_uid]:[];
      const result=await pool.query(`SELECT * FROM notification_history WHERE archived_at IS ${archived?'NOT ':''}NULL${user.role==='student'?' AND (student_id=$1 OR student_id IS NULL)':''} ORDER BY created_at DESC`,params);
      return res.json({ok:true,notifications:result.rows});
    }
    if(method==='POST'){
      requireFields(data,['event_type']);
      const result=await pool.query(`INSERT INTO notification_history (event_type,student_id,procedure_key,procedure_type,case_no,request_id,message,remarks,meta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,[data.event_type,data.student_id||null,data.procedure_key||null,data.procedure_type||null,data.case_no||null,data.request_id||null,data.message||null,data.remarks||null,JSON.stringify(data.meta??null)]);
      return res.status(201).json({ok:true,id:result.rows[0].id});
    }
    if(method==='PATCH'&&id&&action==='comment'){
      if(!STAFF_ROLES.includes(user.role))fail(403,'Access denied.'); const remarks=trim(data.remarks);if(!remarks)fail(422,'A comment is required.');
      const result=await pool.query('UPDATE case_records SET teacher_remarks=$1 WHERE id=$2 AND archived_at IS NULL',[remarks,id]);
      await audit(pool,user,'comment','case',id,{remarks});return res.json({ok:changed(result)});
    }
    if(method==='PATCH'&&id&&['archive','restore'].includes(action)){
      if(user.role!=='admin')fail(403,'Access denied.');
      const result=await pool.query(`UPDATE notification_history SET archived_at=${action==='archive'?'now()':'NULL'} WHERE id=$1 AND archived_at IS ${action==='archive'?'':'NOT '}NULL`,[id]);
      if(changed(result))await audit(pool,user,action,'notification',id);return res.json({ok:changed(result)});
    }
    if(method==='DELETE'&&id){
      if(user.role!=='admin')fail(403,'Access denied.');const result=await pool.query('DELETE FROM notification_history WHERE id=$1 AND archived_at IS NOT NULL',[id]);
      if(changed(result))await audit(pool,user,'delete','notification',id);return res.json({ok:changed(result)});
    }
  }

  if(resource==='audit'){
    const user=await currentUser(req,ALL_ROLES);
    if(method==='POST'){
      if(user.role!=='admin')fail(403,'Access denied.');const actionName=trim(data.action??data.action_name);const entity=trim(data.entity??data.entity_type)||'system';
      if(!actionName)fail(422,'An activity action is required.');await audit(pool,user,actionName.slice(0,80),entity.slice(0,80),'',typeof data.details==='object'&&data.details?data.details:{});
      return res.status(201).json({ok:true});
    }
    const recordId=trim(req.query.record_id);let result;
    if(user.role==='student'){
      const params=[user.user_uid];let extra='';if(recordId){params.push(recordId);extra=' AND c.id=$2';}
      result=await pool.query(`SELECT a.*,c.case_no,c.procedure_name FROM audit_trail a INNER JOIN case_records c ON a.entity_type='case' AND a.entity_uid=c.id::text
        WHERE c.student_id=$1${extra} ORDER BY a.created_at DESC LIMIT 200`,params);
    }else if(recordId)result=await pool.query("SELECT * FROM audit_trail WHERE entity_type='case' AND entity_uid=$1 ORDER BY created_at DESC",[recordId]);
    else result=await pool.query('SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT 500');
    return res.json({ok:true,entries:result.rows});
  }

  fail(404,'Endpoint not found.');
});

export default router;
