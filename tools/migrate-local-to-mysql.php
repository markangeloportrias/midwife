<?php
declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!in_array($remote, ['127.0.0.1', '::1'], true)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'message' => 'Migration is restricted to localhost.']);
        exit;
    }
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) $payload = [];
    $students = is_array($payload['students'] ?? null) ? $payload['students'] : [];
    $blocks = is_array($payload['blocks'] ?? null) ? $payload['blocks'] : [];
    $years = is_array($payload['years'] ?? null) ? $payload['years'] : [];
    $cases = is_array($payload['cases'] ?? null) ? $payload['cases'] : [];
    $instructors = is_array($payload['instructors'] ?? null) ? $payload['instructors'] : [];

    try {
        $config = require __DIR__ . '/../api/config.php';
        $db = $config['database'];
        $pdo = new PDO(
            "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4",
            $db['user'],
            $db['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        $pdo->beginTransaction();

        $yearLabels = [];
        foreach ($years as $year) {
            $label = trim((string)(is_array($year) ? ($year['label'] ?? '') : $year));
            if (preg_match('/^(\d{4})-(\d{4})$/', $label, $m) && (int)$m[2] === (int)$m[1] + 1) $yearLabels[$label] = true;
        }
        foreach ($blocks as $block) {
            $label = trim((string)($block['school_year'] ?? ''));
            if ($label !== '') $yearLabels[$label] = true;
        }
        foreach ($students as $student) {
            foreach ((array)($student['enrollments'] ?? []) as $key => $enrollment) {
                $label = trim((string)($enrollment['school_year'] ?? $key));
                if ($label !== '') $yearLabels[$label] = true;
            }
        }

        $yearStmt = $pdo->prepare('INSERT INTO school_years (label,start_year,end_year,status,created_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE archived_at=NULL,status=VALUES(status)');
        foreach (array_keys($yearLabels) as $label) {
            if (!preg_match('/^(\d{4})-(\d{4})$/', $label, $m) || (int)$m[2] !== (int)$m[1] + 1) continue;
            $yearStmt->execute([$label, (int)$m[1], (int)$m[2], 'active', 'local-migration']);
        }

        $blockMap = [];
        $blockStmt = $pdo->prepare('INSERT INTO student_blocks (school_year_id,label,status,created_by) SELECT id,?,?,? FROM school_years WHERE label=? ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),archived_at=NULL,status=VALUES(status)');
        foreach ($blocks as $block) {
            $localId = trim((string)($block['id'] ?? ''));
            $label = trim((string)($block['label'] ?? ''));
            $schoolYear = trim((string)($block['school_year'] ?? ''));
            if ($localId === '' || $label === '' || $schoolYear === '') continue;
            $blockStmt->execute([$label, 'active', 'local-migration', $schoolYear]);
            $blockMap[$localId] = (int)$pdo->lastInsertId();
        }

        $studentStmt = $pdo->prepare('INSERT INTO students (student_id,student_name,password,parent_name,contact_number,status,archived_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE student_name=VALUES(student_name),password=VALUES(password),parent_name=VALUES(parent_name),contact_number=VALUES(contact_number),status=VALUES(status),archived_at=VALUES(archived_at)');
        $assignmentStmt = $pdo->prepare('INSERT INTO student_block_assignments (student_id,block_id,assigned_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE block_id=VALUES(block_id),assigned_by=VALUES(assigned_by),archived_at=NULL');
        $studentCount = 0;
        $assignmentCount = 0;
        foreach ($students as $student) {
            $id = trim((string)($student['student_id'] ?? ''));
            $name = trim((string)($student['student_name'] ?? ''));
            $password = (string)($student['password'] ?? '');
            if ($id === '' || $name === '' || $password === '') continue;
            $hash = password_get_info($password)['algo'] ? $password : password_hash($password, PASSWORD_DEFAULT);
            $archived = !empty($student['archived']);
            $studentStmt->execute([$id, $name, $hash, $student['parent_name'] ?? null, $student['contact_number'] ?? null, $archived ? 'archived' : 'active', $archived ? ($student['archived_at'] ?? date('Y-m-d H:i:s')) : null]);
            $studentCount++;
            if ($archived) continue;
            foreach ((array)($student['enrollments'] ?? []) as $enrollment) {
                $localBlockId = trim((string)($enrollment['block_id'] ?? ''));
                if ($localBlockId !== '' && isset($blockMap[$localBlockId])) {
                    $assignmentStmt->execute([$id, $blockMap[$localBlockId], 'local-migration']);
                    $assignmentCount++;
                }
            }
        }

        $instructorStmt = $pdo->prepare('INSERT INTO instructor_accounts (account_uid,username,password,display_name,status,archived_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE password=VALUES(password),display_name=VALUES(display_name),status=VALUES(status),archived_at=VALUES(archived_at)');
        $instructorCount = 0;
        foreach ($instructors as $instructor) {
            $username = trim((string)($instructor['username'] ?? ''));
            $password = (string)($instructor['password'] ?? '');
            if ($username === '' || $password === '') continue;
            $hash = password_get_info($password)['algo'] ? $password : password_hash($password, PASSWORD_DEFAULT);
            $uid = trim((string)($instructor['id'] ?? '')) ?: 'ins_' . substr(hash('sha256', $username), 0, 24);
            $archived = !empty($instructor['archived']);
            $instructorStmt->execute([$uid,$username,$hash,trim((string)($instructor['display_name'] ?? $username)),$archived?'archived':'active',$archived?($instructor['archived_at']??date('Y-m-d H:i:s')):null]);
            $instructorCount++;
        }

        $caseStmt = $pdo->prepare('INSERT INTO case_records (student_id,student_name,instructor_uid,instructor_name,academic_year,procedure_key,procedure_name,case_no,complete_diagnosis,date_time_performed,patient_name,patient_address,facility_name,facility_address,facility_contact_number,supervisor_printed_name,supervisor_contact_number,supervisor_position_designation,supervisor_license_no,supervisor_license_expiry_date,record_status,archived_at) SELECT s.student_id,s.student_name,?,?,?,?,p.procedure_key,p.procedure_name,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM students s JOIN procedures p ON p.procedure_key=? WHERE s.student_id=? AND NOT EXISTS (SELECT 1 FROM case_records c WHERE c.student_id=s.student_id AND c.procedure_key=p.procedure_key AND COALESCE(c.case_no,\'\')=COALESCE(?,\'\') AND COALESCE(c.date_time_performed,\'1000-01-01\')=COALESCE(?,\'1000-01-01\'))');
        $caseCount = 0;
        $procedureMap = ['delivery handled'=>'delivery-handled','delivery-handled'=>'delivery-handled','delivery assisted'=>'delivery-assisted','delivery-assisted'=>'delivery-assisted','suturing'=>'suturing','perineal suturing'=>'suturing','iv insertion'=>'iv-insertion','iv-insertion'=>'iv-insertion','internal exam'=>'internal-exam','internal examination'=>'internal-exam'];
        foreach ($cases as $case) {
            $studentId = trim((string)($case['student_id'] ?? ''));
            $rawProcedure = strtolower(trim((string)($case['procedure_key'] ?? $case['procedure_name'] ?? '')));
            $procedure = $procedureMap[$rawProcedure] ?? '';
            if ($studentId === '' || $procedure === '') continue;
            $caseNo = $case['case_no'] ?? null; $performed = $case['date_time_performed'] ?? null;
            $archived = !empty($case['archived']);
            $caseStmt->execute([$case['instructor_id']??null,$case['instructor_name']??null,$case['academic_year']??$case['school_year']??null,$caseNo,$case['complete_diagnosis']??null,$performed,$case['patient_name']??null,$case['patient_address']??null,$case['facility_name']??null,$case['facility_address']??null,$case['facility_contact_number']??null,$case['supervisor_printed_name']??null,$case['supervisor_contact_number']??null,$case['supervisor_position_designation']??null,$case['supervisor_license_no']??null,$case['supervisor_license_expiry_date']??null,$archived?'archived':'submitted',$archived?($case['archived_at']??date('Y-m-d H:i:s')):null,$procedure,$studentId,$caseNo,$performed]);
            $caseCount += $caseStmt->rowCount();
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'students' => $studentCount, 'years' => count($yearLabels), 'blocks' => count($blockMap), 'assignments' => $assignmentCount, 'instructors' => $instructorCount, 'cases' => $caseCount]);
    } catch (Throwable $error) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => $error->getMessage()]);
    }
    exit;
}
?>
<!doctype html><html><head><meta charset="utf-8"><title>Migrate data to MySQL</title><style>body{font-family:Arial;max-width:680px;margin:60px auto;padding:24px;color:#171b4b}button{padding:12px 18px;background:#252b84;color:#fff;border:0;border-radius:7px;font-weight:700;cursor:pointer}pre{padding:16px;background:#f3f5fb;border-radius:8px;white-space:pre-wrap}</style></head><body>
<h1>Migrate browser data to MySQL</h1><p>This imports the data stored by this browser into the <code>thesis_portal</code> database on localhost.</p><button id="migrate">Migrate Now</button><pre id="result">Ready.</pre>
<script>
const read=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return[]}};
const businessKeys=['thesis_students_v1','thesis_school_years_v1','thesis_student_blocks_v1','thesis_cases_v1','thesis_instructor_accounts_v1','editRequests','editPermissions','thesis_chat_messages_v1','thesis_notification_history_v1'];
document.getElementById('migrate').onclick=async()=>{const out=document.getElementById('result');out.textContent='Migrating...';try{const response=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({students:read('thesis_students_v1'),years:read('thesis_school_years_v1'),blocks:read('thesis_student_blocks_v1'),cases:read('thesis_cases_v1'),instructors:read('thesis_instructor_accounts_v1')})});const data=await response.json();if(data.ok){businessKeys.forEach(key=>localStorage.removeItem(key));out.textContent=`Migration complete. Legacy business storage cleared.\nStudents: ${data.students}\nSchool years: ${data.years}\nBlocks: ${data.blocks}\nAssignments: ${data.assignments}\nInstructors: ${data.instructors}\nClinical cases: ${data.cases}`;}else{out.textContent=`Migration failed: ${data.message||'Unknown error'}`;}}catch(error){out.textContent='Migration failed. Start Apache and MySQL, then retry. '+error.message;}};
</script></body></html>
