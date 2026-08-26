<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$parts = pathParts();
$resource = $parts[0] ?? 'health';
$id = $parts[1] ?? '';
$action = $parts[2] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$data = input();

try {
    if ($resource === 'health') respond(['ok' => true, 'service' => 'MIDWIFE Clinical Portal API']);

    if ($resource === 'sync-state' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor', 'student']);
        $parts = [];
        foreach ([
            ['students', 'updated_at'],
            ['instructor_accounts', 'updated_at'],
            ['school_years', 'updated_at'],
            ['student_blocks', 'updated_at'],
            ['student_block_assignments', 'updated_at'],
            ['case_records', 'updated_at'],
            ['case_comments', 'COALESCE(archived_at,created_at)'],
            ['edit_requests', 'updated_at'],
            ['edit_permissions', 'updated_at'],
            ['notification_history', 'created_at'],
            ['chat_messages', 'created_at'],
        ] as [$table, $timestampColumn]) {
            $row = $pdo->query("SELECT COUNT(*) AS row_count, COALESCE(MAX($timestampColumn), '') AS latest FROM $table")->fetch();
            $parts[] = $table . ':' . ($row['row_count'] ?? 0) . ':' . ($row['latest'] ?? '');
        }
        respond(['ok' => true, 'version' => hash('sha256', implode('|', $parts))]);
    }

    if ($resource === 'dashboard-stats' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor']);
        $counts = [];
        $queries = [
            'students' => 'SELECT COUNT(*) FROM students WHERE archived_at IS NULL',
            'instructors' => 'SELECT COUNT(*) FROM instructor_accounts WHERE archived_at IS NULL AND status = \'active\'',
            'records' => 'SELECT COUNT(*) FROM case_records WHERE archived_at IS NULL',
            'school_years' => 'SELECT COUNT(*) FROM school_years WHERE archived_at IS NULL',
            'pending_requests' => 'SELECT COUNT(*) FROM edit_requests WHERE archived_at IS NULL AND status = \'pending\'',
        ];
        foreach ($queries as $key => $sql) $counts[$key] = (int)$pdo->query($sql)->fetchColumn();
        respond(['ok' => true, 'counts' => $counts]);
    }

    if ($resource === 'instructor-directory' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor', 'student']);
        $rows=$pdo->query("SELECT account_uid AS id,username,display_name,role_title,status FROM instructor_accounts WHERE archived_at IS NULL AND status='active' ORDER BY display_name")->fetchAll();
        respond(['ok'=>true,'accounts'=>$rows]);
    }

    if ($resource === 'school-year-directory' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor']);
        $rows=$pdo->query("SELECT y.id,y.label,y.status,y.created_at,COUNT(DISTINCT b.id) AS block_count,COUNT(DISTINCT s.student_id) AS student_count FROM school_years y LEFT JOIN student_blocks b ON b.school_year_id=y.id AND b.archived_at IS NULL LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE y.archived_at IS NULL GROUP BY y.id,y.label,y.status,y.created_at,y.start_year ORDER BY y.start_year DESC")->fetchAll();
        respond(['ok'=>true,'years'=>$rows]);
    }

    if ($resource === 'block-directory' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor']);
        $year=trim((string)($_GET['school_year']??''));
        $stmt=$pdo->prepare("SELECT b.id,b.label,y.label AS school_year,b.status,b.created_at,COUNT(DISTINCT s.student_id) AS student_count FROM student_blocks b JOIN school_years y ON y.id=b.school_year_id LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE b.archived_at IS NULL AND (?='' OR y.label=?) GROUP BY b.id,b.label,y.label,b.status,b.created_at,y.start_year ORDER BY y.start_year DESC,b.label");
        $stmt->execute([$year,$year]);
        respond(['ok'=>true,'blocks'=>$stmt->fetchAll()]);
    }

    if ($resource === 'assignment-directory' && $method === 'GET') {
        currentUser($pdo, ['admin', 'instructor']);
        $year=trim((string)($_GET['school_year']??''));
        $blockId=trim((string)($_GET['block_id']??''));
        $stmt=$pdo->prepare("SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,y.label AS registered_school_year,b.id AS block_id,b.label AS block_label FROM student_block_assignments a JOIN students s ON s.student_id=a.student_id JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id WHERE a.archived_at IS NULL AND s.archived_at IS NULL AND (?='' OR b.id=?) AND (?='' OR y.label=?) ORDER BY s.student_name");
        $stmt->execute([$blockId,$blockId,$year,$year]);
        respond(['ok'=>true,'students'=>$stmt->fetchAll()]);
    }

    if ($resource === 'auth' && $method === 'POST' && $id !== 'logout') {
        $role = $id;
        if ($role === 'student') {
            requireFields($data, ['student_id', 'password']);
            $stmt = $pdo->prepare('SELECT student_id AS uid, student_id, student_name, password FROM students WHERE student_id = ? AND archived_at IS NULL');
            $stmt->execute([$data['student_id']]);
        } elseif ($role === 'instructor') {
            requireFields($data, ['username', 'password']);
            $stmt = $pdo->prepare('SELECT account_uid AS uid, account_uid AS id, username, display_name, password FROM instructor_accounts WHERE username = ? AND archived_at IS NULL AND status = \'active\'');
            $stmt->execute([$data['username']]);
        } elseif ($role === 'admin') {
            requireFields($data, ['pin_number']);
            $stmt = $pdo->query('SELECT CAST(id AS CHAR) AS uid, pin_number FROM admins WHERE archived_at IS NULL ORDER BY id LIMIT 1');
        } else respond(['ok' => false, 'message' => 'Unknown authentication role.'], 404);
        $row = $stmt->fetch();
        $credential = $role === 'admin' ? (string)$data['pin_number'] : (string)$data['password'];
        $stored = $role === 'admin' ? ($row['pin_number'] ?? '') : ($row['password'] ?? '');
        if (!$row) {
            $message = $role === 'student' ? 'Student ID not found.' : 'Invalid credentials.';
            respond(['ok' => false, 'message' => $message], 401);
        }
        if (!passwordMatches($credential, $stored)) respond(['ok' => false, 'message' => 'Invalid credentials.'], 401);
        unset($row['password'], $row['pin_number']);
        $token = createSession($pdo, $role, (string)$row['uid'], (int)$config['session_hours']);
        respond(['ok' => true, 'token' => $token, 'role' => $role, 'user' => $row]);
    }

    if ($resource === 'auth' && $id === 'logout' && $method === 'POST') {
        $token = bearerToken();
        if ($token !== '') {
            $stmt = $pdo->prepare('UPDATE api_sessions SET revoked_at = NOW() WHERE token_hash = ?');
            $stmt->execute([hash('sha256', $token)]);
        }
        respond(['ok' => true]);
    }

    if ($resource === 'students') {
        $user = currentUser($pdo, ['admin', 'instructor', 'student']);
        if ($method === 'GET') {
            if ($id !== '') {
                if ($user['role']==='student' && $user['user_uid']!==$id) respond(['ok'=>false,'message'=>'Access denied.'],403);
                // Include the current assignment so profile screens can render the
                // academic year and block even when opened outside the roster flow.
                $stmt=$pdo->prepare("SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,s.profile_photo,s.status,s.archived_at,s.created_at,
                    (SELECT y.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS registered_school_year,
                    (SELECT b.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS block_label
                    FROM students s WHERE s.student_id=?");$stmt->execute([$id]);
                respond(['ok'=>true,'student'=>$stmt->fetch()?:null]);
            }
            if ($user['role']==='student') respond(['ok'=>false,'message'=>'Access denied.'],403);
            $archived = ($_GET['archived'] ?? '0') === '1';
            $stmt = $pdo->prepare("SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,s.profile_photo,s.status,s.archived_at,s.created_at,
                (SELECT y.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS registered_school_year,
                (SELECT b.label FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL WHERE a.student_id=s.student_id AND a.archived_at IS NULL ORDER BY (y.status='active') DESC,y.start_year DESC LIMIT 1) AS block_label
                FROM students s WHERE ".($archived ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL')." ORDER BY s.student_name");
            $stmt->execute();
            respond(['ok' => true, 'students' => $stmt->fetchAll()]);
        }
        if ($method === 'POST' && $id === '') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['student_id', 'student_name', 'password', 'parent_name', 'contact_number']); // Password is the student's initial login credential.
            $stmt = $pdo->prepare('INSERT INTO students (student_id, student_name, password, parent_name, contact_number) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$data['student_id'], $data['student_name'], password_hash((string)$data['password'], PASSWORD_DEFAULT), $data['parent_name'] ?? null, $data['contact_number'] ?? null]);
            audit($pdo, $user, 'create', 'student', (string)$data['student_id']);
            respond(['ok' => true, 'student_id' => $data['student_id']], 201);
        }
        if ($method === 'PATCH' && $id !== '' && in_array($action, ['archive', 'restore'], true)) {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $pdo->beginTransaction();
            try {
                $sql = $action === 'archive'
                    ? 'UPDATE students SET archived_at = NOW(), status = \'archived\' WHERE student_id = ? AND archived_at IS NULL'
                    : 'UPDATE students SET archived_at = NULL, status = \'active\' WHERE student_id = ? AND archived_at IS NOT NULL';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$id]);
                $accountChanged = $stmt->rowCount() > 0;
                $assignmentChanged = 0;
                if ($accountChanged && $action === 'archive') {
                    $sessions = $pdo->prepare("UPDATE api_sessions SET revoked_at = NOW() WHERE role = 'student' AND user_uid = ? AND revoked_at IS NULL");
                    $sessions->execute([$id]);
                }
                if ($action === 'restore') {
                    // Restore the student's previous active-school-year placement as
                    // part of the same operation. This also repairs legacy removals
                    // where only the assignment was archived.
                    $assignments = $pdo->prepare(
                        "UPDATE student_block_assignments a
                         JOIN student_blocks b ON b.id = a.block_id AND b.archived_at IS NULL
                         JOIN school_years y ON y.id = b.school_year_id AND y.archived_at IS NULL
                         SET a.archived_at = NULL
                         WHERE a.student_id = ? AND a.archived_at IS NOT NULL"
                    );
                    $assignments->execute([$id]);
                    $assignmentChanged = $assignments->rowCount();
                }
                $changed = $accountChanged || $assignmentChanged > 0;
                if ($changed) {
                    audit($pdo, $user, $action, 'student', $id, [
                        'account_status' => $action === 'archive' ? 'paused' : 'active',
                        'assignments_restored' => $assignmentChanged,
                    ]);
                }
                $pdo->commit();
                respond([
                    'ok' => $changed,
                    'account_status' => $action === 'archive' ? 'paused' : 'active',
                    'assignments_restored' => $assignmentChanged,
                ]);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        if ($method === 'PATCH' && $id !== '' && $action === '') {
            if (!in_array($user['role'], ['admin', 'instructor'], true) && !($user['role'] === 'student' && $user['user_uid'] === $id)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $fields=[];$params=[];foreach(['student_name','parent_name','contact_number','profile_photo'] as $field){if(array_key_exists($field,$data)){$fields[]="$field=?";$params[]=$data[$field];}}
            if(!empty($data['password'])){$fields[]='password=?';$params[]=password_hash((string)$data['password'],PASSWORD_DEFAULT);}
            if(!$fields)respond(['ok'=>false,'message'=>'No student changes supplied.'],422);$params[]=$id;$stmt=$pdo->prepare('UPDATE students SET '.implode(',',$fields).' WHERE student_id=? AND archived_at IS NULL');$stmt->execute($params);audit($pdo,$user,'update','student',$id);respond(['ok'=>true]);
        }
    }

    if ($resource === 'instructors') {
        $user = currentUser($pdo, ['admin', 'student', 'instructor']);
        if ($method === 'GET') {
            $rows = $pdo->query('SELECT account_uid AS id, username, display_name, contact_number, profile_photo, role_title AS role, status, archived_at, created_at FROM instructor_accounts WHERE archived_at IS NULL ORDER BY display_name')->fetchAll();
            respond(['ok' => true, 'accounts' => $rows]);
        }
        if ($method === 'POST' && $id === '') {
            if ($user['role'] !== 'admin') respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['username', 'password', 'display_name']);
            $uid = 'ins_' . bin2hex(random_bytes(8));
            $stmt = $pdo->prepare('INSERT INTO instructor_accounts (account_uid, username, password, display_name, contact_number, role_title) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([$uid, $data['username'], password_hash((string)$data['password'], PASSWORD_DEFAULT), $data['display_name'], $data['contact_number'] ?? null, $data['role'] ?? 'Clinical Instructor']);
            audit($pdo, $user, 'create', 'instructor', $uid);
            respond(['ok' => true, 'id' => $uid], 201);
        }
        if ($method === 'PATCH' && $id !== '' && $action === '') {
            $fields=[];$params=[];
            if ($user['role'] === 'instructor' && $user['user_uid'] !== $id) respond(['ok'=>false,'message'=>'Access denied.'],403);
            if ($user['role'] === 'student') respond(['ok'=>false,'message'=>'Access denied.'],403);
            $allowedFields = $user['role'] === 'admin'
                ? ['username'=>'username','display_name'=>'display_name','contact_number'=>'contact_number','profile_photo'=>'profile_photo','role'=>'role_title','status'=>'status']
                : ['contact_number'=>'contact_number','profile_photo'=>'profile_photo'];
            foreach ($allowedFields as $inputKey=>$column) {
                if (array_key_exists($inputKey,$data)) {$fields[]="$column=?";$params[]=$data[$inputKey];}
            }
            if ($user['role'] === 'admin' && !empty($data['password'])) {$fields[]='password=?';$params[]=password_hash((string)$data['password'],PASSWORD_DEFAULT);}
            if (!$fields) respond(['ok'=>false,'message'=>'No instructor changes supplied.'],422);
            $params[]=$id;$stmt=$pdo->prepare('UPDATE instructor_accounts SET '.implode(',',$fields).' WHERE account_uid=? AND archived_at IS NULL');$stmt->execute($params);
            audit($pdo,$user,'update','instructor',$id);respond(['ok'=>$stmt->rowCount()>=0]);
        }
    }

    if ($resource === 'school-years') {
        $user = currentUser($pdo, ['admin', 'instructor']);
        if ($method === 'GET') {
            $rows = $pdo->query('SELECT y.id, y.label, y.status, y.created_at, COUNT(DISTINCT b.id) AS block_count, COUNT(DISTINCT s.student_id) AS student_count FROM school_years y LEFT JOIN student_blocks b ON b.school_year_id=y.id AND b.archived_at IS NULL LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE y.archived_at IS NULL GROUP BY y.id,y.label,y.status,y.created_at,y.start_year ORDER BY y.start_year DESC')->fetchAll();
            respond(['ok' => true, 'years' => $rows]);
        }
        if ($method === 'POST') {
            if ($user['role'] !== 'admin') respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['label']);
            if (!preg_match('/^(\d{4})-(\d{4})$/', (string)$data['label'], $m) || (int)$m[2] !== (int)$m[1] + 1) respond(['ok' => false, 'message' => 'Use a consecutive YYYY-YYYY school year.'], 422);
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE school_years SET status='inactive' WHERE archived_at IS NULL AND status='active'")->execute();
            $stmt = $pdo->prepare('INSERT INTO school_years (label, start_year, end_year, status, created_by) VALUES (?, ?, ?, \'active\', ?)');
            $stmt->execute([$data['label'], $m[1], $m[2], $user['user_uid']]);
            $pdo->commit();
            respond(['ok' => true, 'id' => $pdo->lastInsertId()], 201);
        }
        if ($method === 'PATCH' && $id !== '') {
            if ($user['role'] !== 'admin') respond(['ok'=>false,'message'=>'Access denied.'],403);
            $nextStatus = strtolower(trim((string)($data['status'] ?? '')));
            if (!in_array($nextStatus, ['active', 'inactive'], true)) respond(['ok' => false, 'message' => 'Invalid academic year status.'], 422);
            if ($nextStatus === 'inactive') {
                $activeCount = (int)$pdo->query("SELECT COUNT(*) FROM school_years WHERE archived_at IS NULL AND status='active'")->fetchColumn();
                $current = $pdo->prepare('SELECT status FROM school_years WHERE id=? AND archived_at IS NULL');
                $current->execute([$id]);
                if ($current->fetchColumn() === 'active' && $activeCount <= 1) respond(['ok' => false, 'message' => 'One academic year must remain active.'], 422);
                $stmt = $pdo->prepare("UPDATE school_years SET status='inactive' WHERE id=? AND archived_at IS NULL");
                $stmt->execute([$id]);
            } else {
                $pdo->beginTransaction();
                $pdo->prepare("UPDATE school_years SET status='inactive' WHERE archived_at IS NULL AND status='active' AND id<>?")->execute([$id]);
                $stmt = $pdo->prepare("UPDATE school_years SET status='active' WHERE id=? AND archived_at IS NULL");
                $stmt->execute([$id]);
                $pdo->commit();
            }
            audit($pdo, $user, 'update', 'school_year', $id, ['status' => $nextStatus]);
            respond(['ok' => $stmt->rowCount() >= 0]);
        }
    }

    if ($resource === 'blocks') {
        $user = currentUser($pdo, ['admin', 'instructor']);
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT b.id, b.label, y.label AS school_year, b.status, b.created_at, COUNT(DISTINCT s.student_id) AS student_count FROM student_blocks b JOIN school_years y ON y.id=b.school_year_id LEFT JOIN student_block_assignments a ON a.block_id=b.id AND a.archived_at IS NULL LEFT JOIN students s ON s.student_id=a.student_id AND s.archived_at IS NULL WHERE b.archived_at IS NULL AND (? = \'\' OR y.label = ?) GROUP BY b.id,b.label,y.label,b.status,b.created_at,y.start_year ORDER BY y.start_year DESC,b.label');
            $year = (string)($_GET['school_year'] ?? ''); $stmt->execute([$year, $year]);
            respond(['ok' => true, 'blocks' => $stmt->fetchAll()]);
        }
        if ($method === 'POST') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['label', 'school_year']);
            $stmt = $pdo->prepare('INSERT INTO student_blocks (school_year_id, label, created_by) SELECT id, ?, ? FROM school_years WHERE label=? AND archived_at IS NULL');
            $stmt->execute([$data['label'], $user['user_uid'], $data['school_year']]);
            respond(['ok' => $stmt->rowCount() > 0, 'id' => $pdo->lastInsertId()], 201);
        }
        if ($method === 'PATCH' && $id !== '') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['label']);
            $stmt = $pdo->prepare('UPDATE student_blocks SET label=? WHERE id=? AND archived_at IS NULL');
            $stmt->execute([$data['label'], $id]);
            respond(['ok' => $stmt->rowCount() > 0]);
        }
    }

    if ($resource === 'assignments') {
        $user = currentUser($pdo, ['admin', 'instructor']);
        if ($method === 'GET') {
            $year = trim((string)($_GET['school_year'] ?? ''));
            $blockId = trim((string)($_GET['block_id'] ?? ''));
            if (($_GET['unassigned'] ?? '0') === '1') {
                $stmt = $pdo->prepare('SELECT s.student_id,s.student_name,s.parent_name,s.contact_number FROM students s WHERE s.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM student_block_assignments a JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id WHERE a.student_id=s.student_id AND a.archived_at IS NULL AND y.label=?) ORDER BY s.student_name');
                $stmt->execute([$year]);
                respond(['ok' => true, 'students' => $stmt->fetchAll()]);
            }
            $stmt = $pdo->prepare('SELECT s.student_id,s.student_name,s.parent_name,s.contact_number,y.label AS registered_school_year,b.id AS block_id,b.label AS block_label FROM student_block_assignments a JOIN students s ON s.student_id=a.student_id JOIN student_blocks b ON b.id=a.block_id JOIN school_years y ON y.id=b.school_year_id WHERE a.archived_at IS NULL AND s.archived_at IS NULL AND (?=\'\' OR b.id=?) AND (?=\'\' OR y.label=?) ORDER BY s.student_name');
            $stmt->execute([$blockId,$blockId,$year,$year]);
            respond(['ok' => true, 'students' => $stmt->fetchAll()]);
        }
        if ($method === 'POST') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            requireFields($data, ['student_id', 'block_id']);
            $stmt = $pdo->prepare('INSERT INTO student_block_assignments (student_id, block_id, assigned_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), assigned_by=VALUES(assigned_by), archived_at=NULL, updated_at=NOW()');
            $stmt->execute([$data['student_id'], $data['block_id'], $user['user_uid']]);
            audit($pdo, $user, 'assign', 'student_block', (string)$data['student_id'], ['block_id' => $data['block_id']]);
            respond(['ok' => true]);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'archive') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $stmt = $pdo->prepare('UPDATE student_block_assignments SET archived_at=NOW() WHERE student_id=? AND archived_at IS NULL');
            $stmt->execute([$id]); respond(['ok' => true]);
        }
    }

    if ($resource === 'case-comments') {
        $user = currentUser($pdo, ['admin', 'instructor', 'student']);
        $caseId = trim((string)($_GET['case_id'] ?? ''));
        if ($method === 'GET') {
            if ($caseId === '') respond(['ok' => false, 'message' => 'case_id is required.'], 422);
            $caseStmt = $pdo->prepare('SELECT id,student_id,instructor_uid,instructor_name,procedure_key,case_no,teacher_remarks FROM case_records WHERE id=?');
            $caseStmt->execute([$caseId]); $case = $caseStmt->fetch();
            if (!$case) respond(['ok' => false, 'message' => 'Case not found.'], 404);
            if ($user['role'] === 'student' && $user['user_uid'] !== $case['student_id']) respond(['ok' => false, 'message' => 'Access denied.'], 403);

            $legacy = trim((string)($case['teacher_remarks'] ?? ''));
            $commentCountStmt=$pdo->prepare('SELECT COUNT(*) FROM case_comments WHERE case_id=?');$commentCountStmt->execute([$caseId]);$hasComments=(int)$commentCountStmt->fetchColumn()>0;
            if (!$hasComments && $legacy !== '' && !preg_match('/^(none|n\/?a|not applicable|null|undefined|-)$/i', $legacy)) {
                $legacyStmt = $pdo->prepare("INSERT IGNORE INTO case_comments (case_id,author_uid,author_name,author_role,comment_text,source_key) VALUES (?,?,?,?,?,?)");
                $legacyStmt->execute([$caseId,$case['instructor_uid'] ?: null,$case['instructor_name'] ?: 'Clinical Instructor','instructor',$legacy,'legacy-case:'.$caseId]);
            }

            $requestStmt = $pdo->prepare("SELECT id,rejection_remarks,rejected_at FROM edit_requests WHERE student_id=? AND procedure_key=? AND status='rejected' AND rejection_remarks IS NOT NULL");
            $requestStmt->execute([$case['student_id'],$case['procedure_key']]);
            $insertRequestComment = $pdo->prepare("INSERT IGNORE INTO case_comments (case_id,author_uid,author_name,author_role,comment_text,source_key,created_at) VALUES (?,?,?,?,?,?,COALESCE(?,NOW()))");
            foreach ($requestStmt->fetchAll() as $request) {
                $numbersStmt = $pdo->prepare('SELECT case_numbers FROM edit_requests WHERE id=?'); $numbersStmt->execute([$request['id']]);
                $numbers = json_decode((string)$numbersStmt->fetchColumn(), true); if (!is_array($numbers)) $numbers=[];
                if (!in_array((string)$case['case_no'], array_map('strval',$numbers), true)) continue;
                $remark = trim((string)$request['rejection_remarks']);
                if ($remark === '' || preg_match('/^(none|n\/?a|not applicable|null|undefined|-)$/i', $remark)) continue;
                $insertRequestComment->execute([$caseId,null,$case['instructor_name'] ?: 'Clinical Instructor','instructor',$remark,'edit-request:'.$request['id'],$request['rejected_at']]);
            }

            $archived = ($_GET['archived'] ?? '0') === '1';
            $stmt = $pdo->prepare('SELECT id,case_id,author_uid,author_name,author_role,comment_text,created_at,archived_at FROM case_comments WHERE case_id=? AND '.($archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL').' ORDER BY created_at DESC,id DESC');
            $stmt->execute([$caseId]); respond(['ok'=>true,'comments'=>$stmt->fetchAll()]);
        }
        if ($method === 'PATCH' && $id !== '' && in_array($action, ['archive','restore'], true)) {
            $ownerStmt=$pdo->prepare('SELECT c.student_id FROM case_comments m JOIN case_records c ON c.id=m.case_id WHERE m.id=?');$ownerStmt->execute([$id]);$owner=$ownerStmt->fetchColumn();
            if (!$owner) respond(['ok'=>false,'message'=>'Comment not found.'],404);
            if ($user['role']==='student' && $user['user_uid']!==$owner) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $sql=$action==='archive'?'UPDATE case_comments SET archived_at=NOW(),archived_by=? WHERE id=? AND archived_at IS NULL':'UPDATE case_comments SET archived_at=NULL,archived_by=NULL WHERE id=? AND archived_at IS NOT NULL';
            $stmt=$pdo->prepare($sql);$stmt->execute($action==='archive'?[$user['user_uid'],$id]:[$id]);audit($pdo,$user,$action,'case_comment',$id);respond(['ok'=>$stmt->rowCount()>0]);
        }
    }
    if ($resource === 'cases') {
        $user = currentUser($pdo, ['admin', 'instructor', 'student']);
        if ($method === 'GET') {
            $archived = ($_GET['archived'] ?? '0') === '1';
            $conditions = [$archived ? 'c.archived_at IS NOT NULL' : 'c.archived_at IS NULL']; $params = [];
            if ($user['role'] === 'student') { $conditions[] = 'c.student_id=?'; $params[] = $user['user_uid']; }
            elseif (!empty($_GET['student_id'])) { $conditions[] = 'c.student_id=?'; $params[] = $_GET['student_id']; }
            if (!empty($_GET['school_year'])) { $conditions[] = 'c.academic_year=?'; $params[] = $_GET['school_year']; }
            if (!empty($_GET['procedure'])) { $conditions[] = 'c.procedure_key=?'; $params[] = $_GET['procedure']; }
            $stmt = $pdo->prepare("SELECT c.*,
                (SELECT y.label
                 FROM student_block_assignments a
                 JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
                 JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL
                 WHERE a.student_id=c.student_id AND a.archived_at IS NULL
                 ORDER BY (y.label=c.academic_year) DESC,(y.status='active') DESC,y.start_year DESC
                 LIMIT 1) AS assigned_school_year
                FROM case_records c WHERE " . implode(' AND ', $conditions) . ' ORDER BY c.date_time_performed DESC, c.id DESC');
            $stmt->execute($params); respond(['ok' => true, 'cases' => $stmt->fetchAll()]);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'review') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok' => false, 'message' => 'Access denied.'], 403);
            $statusMap = ['Draft' => 'submitted', 'Submitted' => 'submitted', 'Under Review' => 'reviewed', 'Changes Requested' => 'needs_revision', 'Resubmitted' => 'submitted', 'Verified' => 'verified', 'Invalid' => 'invalid', 'Archived' => 'archived'];
            $requested = (string)($data['status'] ?? '');
            $status = $statusMap[$requested] ?? $requested;
            if (!in_array($status, ['submitted', 'reviewed', 'verified', 'needs_revision', 'invalid', 'archived'], true)) respond(['ok' => false, 'message' => 'Invalid record status.'], 422);
            $instructorId = $data['instructor_id'] ?? $data['instructorId'] ?? null;
            $instructorName = $data['instructor_name'] ?? $data['instructorName'] ?? null;
            $stmt = $pdo->prepare('UPDATE case_records SET record_status=?,teacher_remarks=?,checked_by=IF(?="verified",?,NULL),checked_at=IF(?="verified",NOW(),NULL),instructor_uid=COALESCE(?,instructor_uid),instructor_name=COALESCE(?,instructor_name) WHERE id=? AND archived_at IS NULL');
            $stmt->execute([$status, $data['remarks'] ?? null, $status, $instructorName, $status, $instructorId, $instructorName, $id]);
            audit($pdo, $user, 'review', 'case', $id, ['status' => $requested, 'remarks' => $data['remarks'] ?? null]);
            respond(['ok' => $stmt->rowCount() >= 0]);
        }
        if ($method === 'POST') {
            requireFields($data, ['student_id', 'procedure_key']);
            if ($user['role'] === 'student' && $user['user_uid'] !== (string)$data['student_id']) respond(['ok' => false, 'message' => 'Access denied.'], 403);
            $requestedAcademicYear = trim((string)($data['academic_year'] ?? ''));
            $yearStmt = $pdo->prepare("SELECT y.label
                FROM student_block_assignments a
                JOIN student_blocks b ON b.id=a.block_id AND b.archived_at IS NULL
                JOIN school_years y ON y.id=b.school_year_id AND y.archived_at IS NULL
                WHERE a.student_id=? AND a.archived_at IS NULL
                ORDER BY (y.label=?) DESC,(y.status='active') DESC,y.start_year DESC
                LIMIT 1");
            $yearStmt->execute([$data['student_id'], $requestedAcademicYear]);
            $assignedAcademicYear = trim((string)($yearStmt->fetchColumn() ?: ''));
            $academicYear = $assignedAcademicYear !== ''
                ? $assignedAcademicYear
                : ($requestedAcademicYear !== '' ? $requestedAcademicYear : null);
            $stmt = $pdo->prepare('INSERT INTO case_records (student_id, student_name, instructor_uid, instructor_name, academic_year, procedure_key, procedure_name, case_no, complete_diagnosis, date_time_performed, patient_name, patient_address, facility_name, facility_address, facility_contact_number, supervisor_printed_name, supervisor_contact_number, supervisor_position_designation, supervisor_license_no, supervisor_license_expiry_date) SELECT s.student_id,s.student_name,?,?,?,p.procedure_key,p.procedure_name,?,?,?,?,?,?,?,?,?,?,?,?,? FROM students s JOIN procedures p ON p.procedure_key=? WHERE s.student_id=? AND s.archived_at IS NULL');
            $stmt->execute([$data['instructor_uid'] ?? null,$data['instructor_name'] ?? null,$academicYear,$data['case_no'] ?? null,$data['complete_diagnosis'] ?? null,$data['date_time_performed'] ?? null,$data['patient_name'] ?? null,$data['patient_address'] ?? null,$data['facility_name'] ?? null,$data['facility_address'] ?? null,$data['facility_contact_number'] ?? null,$data['supervisor_printed_name'] ?? null,$data['supervisor_contact_number'] ?? null,$data['supervisor_position_designation'] ?? null,$data['supervisor_license_no'] ?? null,$data['supervisor_license_expiry_date'] ?? null,$data['procedure_key'],$data['student_id']]);
            respond(['ok' => $stmt->rowCount() > 0, 'id' => $pdo->lastInsertId()], 201);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'comment') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok' => false, 'message' => 'Access denied.'], 403);
            $remarks = trim((string)($data['remarks'] ?? ''));
            if ($remarks === '') respond(['ok' => false, 'message' => 'A comment is required.'], 422);
            $caseStmt=$pdo->prepare('SELECT instructor_name FROM case_records WHERE id=? AND archived_at IS NULL');$caseStmt->execute([$id]);$case=$caseStmt->fetch();
            if (!$case) respond(['ok'=>false,'message'=>'Case not found.'],404);
            $authorName=trim((string)($data['checked_by'] ?? '')) ?: ($case['instructor_name'] ?: 'Clinical Instructor');
            $pdo->beginTransaction();
            $stmt=$pdo->prepare('INSERT INTO case_comments (case_id,author_uid,author_name,author_role,comment_text) VALUES (?,?,?,?,?)');
            $stmt->execute([$id,$user['user_uid'],$authorName,$user['role']==='admin'?'admin':'instructor',$remarks]);
            $pdo->prepare('UPDATE case_records SET teacher_remarks=? WHERE id=?')->execute([$remarks,$id]);
            $commentId=(string)$pdo->lastInsertId();
            audit($pdo,$user,'comment','case',$id,['comment_id'=>$commentId,'remarks'=>$remarks]);
            $pdo->commit();
            respond(['ok'=>true,'id'=>$commentId]);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'archive') {
            $where = $user['role'] === 'student' ? ' AND student_id=?' : ''; $params = [$id]; if ($where) $params[] = $user['user_uid'];
            $stmt = $pdo->prepare('UPDATE case_records SET archived_at=NOW(), record_status=\'archived\' WHERE id=? AND archived_at IS NULL' . $where);
            $stmt->execute($params); audit($pdo, $user, 'archive', 'case', $id); respond(['ok' => $stmt->rowCount() > 0]);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'restore') {
            $where = $user['role'] === 'student' ? ' AND student_id=?' : ''; $params = [$id]; if ($where) $params[] = $user['user_uid'];
            $stmt = $pdo->prepare('UPDATE case_records SET archived_at=NULL, record_status=\'submitted\' WHERE id=?' . $where);
            $stmt->execute($params); audit($pdo, $user, 'restore', 'case', $id); respond(['ok' => $stmt->rowCount() > 0]);
        }
        if ($method === 'DELETE' && $id !== '') {
            $where = $user['role'] === 'student' ? ' AND student_id=?' : ''; $params = [$id]; if ($where) $params[] = $user['user_uid'];
            $stmt = $pdo->prepare('DELETE FROM case_records WHERE id=? AND archived_at IS NOT NULL' . $where);
            $stmt->execute($params); audit($pdo, $user, 'delete_permanently', 'case', $id); respond(['ok' => $stmt->rowCount() > 0]);
        }
    }

    if ($resource === 'edit-requests') {
        $user = currentUser($pdo, ['admin', 'instructor', 'student']);
        if ($method === 'GET') {
            $where = $user['role'] === 'student' ? ' AND student_id=?' : ''; $stmt = $pdo->prepare('SELECT * FROM edit_requests WHERE archived_at IS NULL' . $where . ' ORDER BY requested_at DESC');
            $stmt->execute($where ? [$user['user_uid']] : []); respond(['ok' => true, 'requests' => $stmt->fetchAll()]);
        }
        if ($method === 'POST' && $user['role'] === 'student') {
            requireFields($data, ['procedure_key', 'procedure_name']);
            $stmt = $pdo->prepare('INSERT INTO edit_requests (student_id, procedure_key, procedure_name, case_numbers) VALUES (?, ?, ?, ?)');
            $stmt->execute([$user['user_uid'],$data['procedure_key'],$data['procedure_name'],json_encode($data['case_numbers'] ?? [])]); respond(['ok'=>true,'id'=>$pdo->lastInsertId()],201);
        }
        if ($method === 'PATCH' && $id !== '' && in_array($action, ['approve','reject','archive'], true)) {
            if ($action !== 'archive' && !in_array($user['role'], ['admin','instructor'], true)) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $sql = $action === 'approve' ? "UPDATE edit_requests SET status='approved', approved_at=NOW() WHERE id=? AND archived_at IS NULL" : ($action === 'reject' ? "UPDATE edit_requests SET status='rejected', rejection_remarks=?, rejected_at=NOW() WHERE id=? AND archived_at IS NULL" : 'UPDATE edit_requests SET archived_at=NOW() WHERE id=? AND archived_at IS NULL');
            $params = $action === 'reject' ? [$data['remarks'] ?? '',$id] : [$id]; $stmt=$pdo->prepare($sql);$stmt->execute($params);
            if (in_array($action,['approve','reject'],true)) {
                $requestStmt=$pdo->prepare('SELECT student_id,procedure_key,procedure_name FROM edit_requests WHERE id=?');$requestStmt->execute([$id]);$request=$requestStmt->fetch();
                if ($request) {
                    $approved=$action==='approve'?1:0;
                    $perm=$pdo->prepare('INSERT INTO edit_permissions (student_id,procedure_key,approved,approved_at) VALUES (?,?,?,IF(?=1,NOW(),NULL)) ON DUPLICATE KEY UPDATE approved=VALUES(approved),approved_at=VALUES(approved_at),updated_at=NOW()');
                    $perm->execute([$request['student_id'],$request['procedure_key'],$approved,$approved]);
                    $notice=$pdo->prepare('INSERT INTO notification_history (event_type,student_id,procedure_key,procedure_type,request_id,message,remarks) VALUES (?,?,?,?,?,?,?)');
                    $notice->execute(['edit_request_'.$action,$request['student_id'],$request['procedure_key'],$request['procedure_name'],$id,'Your edit request was '.$action.'.',$data['remarks']??null]);
                }
            }
            audit($pdo,$user,$action,'edit_request',$id);respond(['ok'=>$stmt->rowCount()>0]);
        }
    }

    if ($resource === 'chat') {
        $user=currentUser($pdo,['admin','instructor','student']);
        if ($method === 'GET') {
            $conditions=['archived_at IS NULL'];$params=[];
            if ($user['role']==='student') {$conditions[]='student_id=?';$params[]=$user['user_uid'];}
            elseif (!empty($_GET['student_id'])) {$conditions[]='student_id=?';$params[]=$_GET['student_id'];}
            if (!empty($_GET['instructor_id'])) {$conditions[]='(instructor_id=? OR instructor_id IS NULL)';$params[]=$_GET['instructor_id'];}
            $stmt=$pdo->prepare('SELECT * FROM chat_messages WHERE '.implode(' AND ',$conditions).' ORDER BY created_at,id');$stmt->execute($params);
            respond(['ok'=>true,'messages'=>$stmt->fetchAll()]);
        }
        if ($method === 'POST') {
            requireFields($data,['student_id','message']);
            if ($user['role']==='student' && $user['user_uid']!==(string)$data['student_id']) respond(['ok'=>false,'message'=>'Access denied.'],403);
            $senderRole=$user['role']==='student'?'student':'instructor';
            $stmt=$pdo->prepare('INSERT INTO chat_messages (student_id,student_name,instructor_id,instructor_name,sender_role,sender_name,message,read_by_student,read_by_instructor) SELECT s.student_id,s.student_name,?,?,?,?,?,?,? FROM students s WHERE s.student_id=? AND s.archived_at IS NULL');
            $stmt->execute([$data['instructor_id']??null,$data['instructor_name']??null,$senderRole,$data['sender_name']??($senderRole==='student'?'Student':'Instructor'),trim((string)$data['message']),$senderRole==='instructor'?1:0,$senderRole==='student'?1:0,$data['student_id']]);
            respond(['ok'=>$stmt->rowCount()>0,'id'=>$pdo->lastInsertId()],201);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'edit') {
            requireFields($data, ['message']);
            $message = trim((string)$data['message']);
            if ($message === '') respond(['ok'=>false,'message'=>'A message is required.'],422);
            $ownerWhere = $user['role'] === 'student'
                ? "sender_role='student' AND student_id=?"
                : ($user['role'] === 'instructor' ? "sender_role='instructor' AND instructor_id=?" : '1=1');
            $params = [$message, $id];
            if ($ownerWhere !== '1=1') $params[] = $user['user_uid'];
            $stmt = $pdo->prepare("UPDATE chat_messages SET message=? WHERE id=? AND archived_at IS NULL AND $ownerWhere");
            $stmt->execute($params);
            $updated = $stmt->rowCount() > 0;
            if (!$updated) {
                $existingParams = [$id];
                if ($ownerWhere !== '1=1') $existingParams[] = $user['user_uid'];
                $existing = $pdo->prepare("SELECT 1 FROM chat_messages WHERE id=? AND archived_at IS NULL AND $ownerWhere");
                $existing->execute($existingParams);
                $updated = (bool)$existing->fetchColumn();
            }
            respond(['ok'=>$updated]);
        }
        if ($method === 'PATCH' && $id !== '' && in_array($action, ['unsend', 'delete'], true)) {
            $ownerWhere = $user['role'] === 'student'
                ? "sender_role='student' AND student_id=?"
                : ($user['role'] === 'instructor' ? "sender_role='instructor' AND instructor_id=?" : '1=1');
            $params = [$id];
            if ($ownerWhere !== '1=1') $params[] = $user['user_uid'];
            $stmt = $pdo->prepare("UPDATE chat_messages SET archived_at=NOW() WHERE id=? AND archived_at IS NULL AND $ownerWhere");
            $stmt->execute($params);
            respond(['ok'=>$stmt->rowCount()>0]);
        }
    }

    if ($resource === 'notifications') {
        $user = currentUser($pdo, ['admin','instructor','student']);
        if ($method === 'GET') {
            $archived = ($_GET['archived'] ?? '0') === '1';
            $where = $user['role']==='student' ? ' AND (student_id=? OR student_id IS NULL)' : '';
            $stmt=$pdo->prepare('SELECT * FROM notification_history WHERE '.($archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL').$where.' ORDER BY created_at DESC');
            $stmt->execute($where?[$user['user_uid']]:[]);respond(['ok'=>true,'notifications'=>$stmt->fetchAll()]);
        }
        if ($method === 'POST') {
            requireFields($data,['event_type']);$stmt=$pdo->prepare('INSERT INTO notification_history (event_type,student_id,procedure_key,procedure_type,case_no,request_id,message,remarks,meta) VALUES (?,?,?,?,?,?,?,?,?)');$stmt->execute([$data['event_type'],$data['student_id']??null,$data['procedure_key']??null,$data['procedure_type']??null,$data['case_no']??null,$data['request_id']??null,$data['message']??null,$data['remarks']??null,json_encode($data['meta']??null)]);respond(['ok'=>true,'id'=>$pdo->lastInsertId()],201);
        }
        if ($method === 'PATCH' && $id !== '' && $action === 'comment') {
            if (!in_array($user['role'], ['admin', 'instructor'], true)) respond(['ok' => false, 'message' => 'Access denied.'], 403);
            $remarks = trim((string)($data['remarks'] ?? ''));
            if ($remarks === '') respond(['ok' => false, 'message' => 'A comment is required.'], 422);
            $stmt = $pdo->prepare('UPDATE case_records SET teacher_remarks=? WHERE id=? AND archived_at IS NULL');
            $stmt->execute([$remarks, $id]);
            audit($pdo, $user, 'comment', 'case', $id, ['remarks' => $remarks]);
            respond(['ok' => $stmt->rowCount() >= 0]);
        }
        if ($method === 'PATCH' && $id !== '' && in_array($action, ['archive', 'restore'], true)) {
            if ($user['role'] !== 'admin') respond(['ok' => false, 'message' => 'Access denied.'], 403);
            $stmt=$pdo->prepare('UPDATE notification_history SET archived_at='.($action === 'archive' ? 'NOW()' : 'NULL').' WHERE id=? AND archived_at IS '.($action === 'archive' ? 'NULL' : 'NOT NULL'));
            $stmt->execute([$id]);respond(['ok'=>$stmt->rowCount()>0]);
        }
    }

    if ($resource === 'audit') {
        $user = currentUser($pdo, ['admin', 'instructor', 'student']);
        $recordId = (string)($_GET['record_id'] ?? '');
        if ($user['role'] === 'student') {
            $sql = 'SELECT a.*, c.case_no, c.procedure_name FROM audit_trail a INNER JOIN case_records c ON a.entity_type = \'case\' AND a.entity_uid = CAST(c.id AS CHAR) WHERE c.student_id = ?';
            $params = [$user['user_uid']];
            if ($recordId !== '') {
                $sql .= ' AND c.id = ?';
                $params[] = $recordId;
            }
            $sql .= ' ORDER BY a.created_at DESC LIMIT 200';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
        } elseif ($recordId !== '') {
            $stmt = $pdo->prepare("SELECT * FROM audit_trail WHERE entity_type = 'case' AND entity_uid = ? ORDER BY created_at DESC");
            $stmt->execute([$recordId]);
            $rows = $stmt->fetchAll();
        } else {
            $rows = $pdo->query('SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT 500')->fetchAll();
        }
        respond(['ok' => true, 'entries' => $rows]);
    }

    respond(['ok' => false, 'message' => 'Endpoint not found.'], 404);
} catch (PDOException $error) {
    $duplicate = $error->getCode() === '23000';
    respond(['ok' => false, 'message' => $duplicate ? 'That record already exists.' : 'Database operation failed.'], $duplicate ? 409 : 500);
} catch (Throwable $error) {
    respond(['ok' => false, 'message' => 'Server operation failed.'], 500);
}
