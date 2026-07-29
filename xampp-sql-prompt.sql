CREATE DATABASE IF NOT EXISTS thesis_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE thesis_portal;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pin_number VARCHAR(50) NOT NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  student_name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT 'Student initial login password (store a secure hash)',
  parent_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(50) NOT NULL,
  profile_photo LONGTEXT NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_name (student_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instructor_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_uid VARCHAR(80) NOT NULL UNIQUE,
  username VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  pin_number VARCHAR(50) NULL,
  contact_number VARCHAR(50) NULL,
  profile_photo LONGTEXT NULL,
  role_title VARCHAR(120) NOT NULL DEFAULT 'Clinical Instructor',
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE instructor_accounts ADD COLUMN IF NOT EXISTS profile_photo LONGTEXT NULL AFTER contact_number;

CREATE TABLE IF NOT EXISTS school_years (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(20) NOT NULL UNIQUE,
  start_year SMALLINT UNSIGNED NOT NULL,
  end_year SMALLINT UNSIGNED NOT NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  created_by VARCHAR(80) NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (end_year = start_year + 1),
  INDEX idx_school_year_status (status, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_blocks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT UNSIGNED NOT NULL,
  label VARCHAR(120) NOT NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  created_by VARCHAR(80) NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_block_year_label (school_year_id, label),
  CONSTRAINT fk_blocks_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_block_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  block_id INT UNSIGNED NOT NULL,
  assigned_by VARCHAR(80) NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_block (student_id),
  INDEX idx_assignment_block (block_id, archived_at),
  CONSTRAINT fk_assignment_student FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_block FOREIGN KEY (block_id) REFERENCES student_blocks(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  role ENUM('admin', 'instructor', 'student') NOT NULL,
  user_uid VARCHAR(80) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_lookup (token_hash, expires_at, revoked_at),
  INDEX idx_session_user (role, user_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_trail (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_role ENUM('admin', 'instructor', 'student', 'system') NOT NULL,
  actor_uid VARCHAR(80) NULL,
  action_name VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_uid VARCHAR(120) NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_uid),
  INDEX idx_audit_actor (actor_role, actor_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procedures (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  procedure_key VARCHAR(80) NOT NULL UNIQUE,
  procedure_name VARCHAR(255) NOT NULL UNIQUE,
  display_order INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  instructor_uid VARCHAR(80) NULL,
  instructor_name VARCHAR(255) NULL,
  academic_year VARCHAR(20) NULL,
  procedure_key VARCHAR(80) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  case_no VARCHAR(100) NULL,
  complete_diagnosis TEXT NULL,
  date_time_performed DATETIME NULL,
  patient_name VARCHAR(255) NULL,
  patient_address VARCHAR(255) NULL,
  facility_name VARCHAR(255) NULL,
  facility_address VARCHAR(255) NULL,
  facility_contact_number VARCHAR(50) NULL,
  supervisor_printed_name VARCHAR(255) NULL,
  supervisor_contact_number VARCHAR(50) NULL,
  supervisor_position_designation VARCHAR(255) NULL,
  supervisor_license_no VARCHAR(100) NULL,
  supervisor_license_expiry_date DATE NULL,
  teacher_remarks TEXT NULL,
  checked_by VARCHAR(255) NULL,
  checked_at DATETIME NULL,
  record_status ENUM('submitted', 'reviewed', 'verified', 'needs_revision', 'archived') NOT NULL DEFAULT 'submitted',
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cases_student (student_id),
  INDEX idx_cases_procedure (procedure_key),
  INDEX idx_cases_academic_year (academic_year),
  INDEX idx_cases_date (date_time_performed),
  CONSTRAINT fk_cases_student_public
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cases_procedure_key
    FOREIGN KEY (procedure_key) REFERENCES procedures(procedure_key)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id INT UNSIGNED NOT NULL,
  author_uid VARCHAR(80) NULL,
  author_name VARCHAR(255) NOT NULL,
  author_role ENUM('instructor','admin') NOT NULL DEFAULT 'instructor',
  comment_text TEXT NOT NULL,
  source_key VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  archived_by VARCHAR(80) NULL,
  UNIQUE KEY uq_case_comments_source (source_key),
  INDEX idx_case_comments_case (case_id, archived_at, created_at),
  CONSTRAINT fk_case_comments_case FOREIGN KEY (case_id) REFERENCES case_records(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS edit_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  procedure_key VARCHAR(80) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  case_numbers JSON NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rejection_remarks TEXT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  rejected_at DATETIME NULL,
  archived_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_edit_requests_student (student_id),
  INDEX idx_edit_requests_status (status),
  INDEX idx_edit_requests_procedure (procedure_key),
  CONSTRAINT fk_edit_requests_student_public
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_edit_requests_procedure_key
    FOREIGN KEY (procedure_key) REFERENCES procedures(procedure_key)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edit_permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  procedure_key VARCHAR(80) NOT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_edit_permission (student_id, procedure_key),
  CONSTRAINT fk_edit_permissions_student_public
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_edit_permissions_procedure_key
    FOREIGN KEY (procedure_key) REFERENCES procedures(procedure_key)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  student_id VARCHAR(50) NULL,
  procedure_key VARCHAR(80) NULL,
  procedure_type VARCHAR(255) NULL,
  case_no VARCHAR(100) NULL,
  request_id INT UNSIGNED NULL,
  message TEXT NULL,
  remarks TEXT NULL,
  meta JSON NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_created (created_at),
  INDEX idx_notifications_student (student_id),
  INDEX idx_notifications_event (event_type),
  INDEX idx_notifications_request (request_id),
  CONSTRAINT fk_notifications_student_public
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_notifications_request
    FOREIGN KEY (request_id) REFERENCES edit_requests(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NULL,
  instructor_id VARCHAR(80) NULL,
  instructor_name VARCHAR(255) NULL,
  sender_role ENUM('student', 'instructor') NOT NULL DEFAULT 'student',
  sender_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read_by_student TINYINT(1) NOT NULL DEFAULT 0,
  read_by_instructor TINYINT(1) NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_student_created (student_id, created_at),
  INDEX idx_chat_unread_student (student_id, read_by_student),
  INDEX idx_chat_unread_instructor (student_id, read_by_instructor),
  CONSTRAINT fk_chat_student_public
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS instructor_id VARCHAR(80) NULL AFTER student_name;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(255) NULL AFTER instructor_id;

CREATE TABLE IF NOT EXISTS school_year_archives (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year VARCHAR(20) NOT NULL UNIQUE,
  start_year SMALLINT UNSIGNED NOT NULL,
  end_year SMALLINT UNSIGNED NOT NULL,
  saved_by VARCHAR(255) NULL,
  archive_payload JSON NULL,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_year = start_year + 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_year_archive_procedures (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  archive_id INT UNSIGNED NOT NULL,
  procedure_key VARCHAR(80) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  folder_name VARCHAR(255) NOT NULL,
  records_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_archive_procedure (archive_id, procedure_key),
  CONSTRAINT fk_archive_procedures_archive
    FOREIGN KEY (archive_id) REFERENCES school_year_archives(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_archive_procedures_key
    FOREIGN KEY (procedure_key) REFERENCES procedures(procedure_key)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_year_archive_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  archive_procedure_id INT UNSIGNED NOT NULL,
  case_record_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_archive_case (archive_procedure_id, case_record_id),
  CONSTRAINT fk_archive_records_procedure
    FOREIGN KEY (archive_procedure_id) REFERENCES school_year_archive_procedures(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_archive_records_case
    FOREIGN KEY (case_record_id) REFERENCES case_records(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_meta (
  meta_key VARCHAR(80) PRIMARY KEY,
  meta_value JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO admins (pin_number)
SELECT '123456'
WHERE NOT EXISTS (SELECT 1 FROM admins);

UPDATE admins
SET pin_number = '123456'
WHERE pin_number IS NULL OR TRIM(pin_number) = '' OR pin_number = '000000';

INSERT INTO instructor_accounts (account_uid, username, password, display_name, pin_number)
SELECT 'ins_default', 'instructor', '123456', 'Default Instructor', NULL
WHERE NOT EXISTS (SELECT 1 FROM instructor_accounts);

INSERT INTO procedures (procedure_key, procedure_name, display_order) VALUES
  ('delivery handled', 'Delivery Handled', 10),
  ('delivery assisted', 'Delivery Assisted', 20),
  ('internal exam', 'Internal Exam', 30),
  ('suturing', 'Suturing', 40),
  ('iv insertion', 'IV Insertion', 50)
ON DUPLICATE KEY UPDATE
  procedure_name = VALUES(procedure_name),
  display_order = VALUES(display_order);

CREATE OR REPLACE VIEW v_case_records_full AS
SELECT
  c.id,
  c.student_id,
  s.student_name AS current_student_name,
  c.student_name AS recorded_student_name,
  c.instructor_uid,
  c.instructor_name,
  c.academic_year,
  c.procedure_key,
  c.procedure_name,
  c.case_no,
  c.complete_diagnosis,
  c.date_time_performed,
  c.patient_name,
  c.patient_address,
  c.facility_name,
  c.facility_address,
  c.facility_contact_number,
  c.supervisor_printed_name,
  c.supervisor_contact_number,
  c.supervisor_position_designation,
  c.supervisor_license_no,
  c.supervisor_license_expiry_date,
  c.teacher_remarks,
  c.checked_by,
  c.checked_at,
  c.created_at,
  c.updated_at
FROM case_records c
JOIN students s ON s.student_id = c.student_id;

CREATE OR REPLACE VIEW v_student_case_summary AS
SELECT
  s.student_id,
  s.student_name,
  COUNT(c.id) AS total_cases,
  SUM(CASE WHEN c.checked_by IS NOT NULL AND TRIM(c.checked_by) <> '' THEN 1 ELSE 0 END) AS verified_cases,
  GROUP_CONCAT(DISTINCT c.procedure_name ORDER BY c.procedure_name SEPARATOR ', ') AS procedures
FROM students s
LEFT JOIN case_records c ON c.student_id = s.student_id
GROUP BY s.student_id, s.student_name;

CREATE OR REPLACE VIEW v_school_year_procedure_summary AS
SELECT
  c.academic_year AS school_year,
  c.procedure_key,
  c.procedure_name,
  COUNT(*) AS total_records,
  COUNT(DISTINCT c.student_id) AS total_students,
  SUM(CASE WHEN c.checked_by IS NOT NULL AND TRIM(c.checked_by) <> '' THEN 1 ELSE 0 END) AS verified_records
FROM case_records c
WHERE c.academic_year IS NOT NULL AND TRIM(c.academic_year) <> ''
GROUP BY c.academic_year, c.procedure_key, c.procedure_name;

DROP PROCEDURE IF EXISTS sp_create_school_year_archive;
DROP PROCEDURE IF EXISTS sp_register_student;
DROP PROCEDURE IF EXISTS sp_authenticate_student;
DROP PROCEDURE IF EXISTS sp_authenticate_instructor;
DROP PROCEDURE IF EXISTS sp_create_instructor_account;
DROP PROCEDURE IF EXISTS sp_save_case_record;
DROP PROCEDURE IF EXISTS sp_request_edit_approval;
DROP PROCEDURE IF EXISTS sp_approve_edit_request;
DROP PROCEDURE IF EXISTS sp_reject_edit_request;
DROP PROCEDURE IF EXISTS sp_add_notification;
DROP PROCEDURE IF EXISTS sp_send_chat_message;
DROP PROCEDURE IF EXISTS sp_mark_chat_read;

DELIMITER $$

CREATE PROCEDURE sp_create_school_year_archive(
  IN p_school_year VARCHAR(20),
  IN p_saved_by VARCHAR(255)
)
BEGIN
  DECLARE v_start SMALLINT UNSIGNED;
  DECLARE v_end SMALLINT UNSIGNED;
  DECLARE v_archive_id INT UNSIGNED;

  IF p_school_year NOT REGEXP '^[0-9]{4}-[0-9]{4}$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'School year must use YYYY-YYYY format.';
  END IF;

  SET v_start = CAST(SUBSTRING_INDEX(p_school_year, '-', 1) AS UNSIGNED);
  SET v_end = CAST(SUBSTRING_INDEX(p_school_year, '-', -1) AS UNSIGNED);

  IF v_end <> v_start + 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'School year must be consecutive, for example 2025-2026.';
  END IF;

  INSERT INTO school_year_archives (school_year, start_year, end_year, saved_by, archive_payload, saved_at)
  VALUES (
    p_school_year,
    v_start,
    v_end,
    p_saved_by,
    JSON_OBJECT(
      'school_year', p_school_year,
      'saved_by', p_saved_by,
      'saved_at', NOW()
    ),
    NOW()
  )
  ON DUPLICATE KEY UPDATE
    start_year = VALUES(start_year),
    end_year = VALUES(end_year),
    saved_by = VALUES(saved_by),
    archive_payload = VALUES(archive_payload),
    saved_at = NOW();

  SELECT id INTO v_archive_id
  FROM school_year_archives
  WHERE school_year = p_school_year
  LIMIT 1;

  INSERT INTO school_year_archive_procedures (archive_id, procedure_key, procedure_name, folder_name, records_count)
  SELECT
    v_archive_id,
    c.procedure_key,
    c.procedure_name,
    c.procedure_name,
    COUNT(*)
  FROM case_records c
  WHERE c.academic_year = p_school_year
     OR YEAR(c.date_time_performed) IN (v_start, v_end)
  GROUP BY c.procedure_key, c.procedure_name
  ON DUPLICATE KEY UPDATE
    procedure_name = VALUES(procedure_name),
    folder_name = VALUES(folder_name),
    records_count = VALUES(records_count);

  INSERT IGNORE INTO school_year_archive_records (archive_procedure_id, case_record_id)
  SELECT
    app.id,
    c.id
  FROM school_year_archive_procedures app
  JOIN case_records c
    ON c.procedure_key = app.procedure_key
   AND (c.academic_year = p_school_year OR YEAR(c.date_time_performed) IN (v_start, v_end))
  WHERE app.archive_id = v_archive_id;

  SELECT
    a.school_year,
    a.saved_at,
    app.folder_name,
    app.records_count
  FROM school_year_archives a
  JOIN school_year_archive_procedures app ON app.archive_id = a.id
  WHERE a.id = v_archive_id
  ORDER BY app.folder_name;
END$$

CREATE PROCEDURE sp_register_student(
  IN p_student_id VARCHAR(50),
  IN p_student_name VARCHAR(255),
  IN p_initial_password VARCHAR(255),
  IN p_parent_name VARCHAR(255),
  IN p_contact_number VARCHAR(50)
)
BEGIN
  IF p_student_id NOT REGEXP '^[0-9]{6}$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student ID must be exactly 6 digits.';
  END IF;

  IF p_initial_password IS NULL OR CHAR_LENGTH(TRIM(p_initial_password)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An initial password is required.';
  END IF;

  IF p_parent_name IS NULL OR CHAR_LENGTH(TRIM(p_parent_name)) = 0 OR
     p_contact_number IS NULL OR CHAR_LENGTH(TRIM(p_contact_number)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Parent/guardian and contact number are required.';
  END IF;

  INSERT INTO students (student_id, student_name, password, parent_name, contact_number)
  VALUES (p_student_id, p_student_name, p_initial_password, p_parent_name, p_contact_number);

  SELECT id, student_id, student_name, parent_name, contact_number
  FROM students
  WHERE student_id = p_student_id;
END$$

CREATE PROCEDURE sp_authenticate_student(
  IN p_student_id VARCHAR(50),
  IN p_password VARCHAR(255)
)
BEGIN
  SELECT id, student_id, student_name, parent_name, contact_number
  FROM students
  WHERE student_id = p_student_id
    AND password = p_password
  LIMIT 1;
END$$

CREATE PROCEDURE sp_authenticate_instructor(
  IN p_username VARCHAR(120),
  IN p_password VARCHAR(255)
)
BEGIN
  SELECT account_uid AS id, username, display_name
  FROM instructor_accounts
  WHERE username = p_username
    AND password = p_password
  LIMIT 1;
END$$

CREATE PROCEDURE sp_create_instructor_account(
  IN p_username VARCHAR(120),
  IN p_password VARCHAR(255),
  IN p_display_name VARCHAR(255)
)
BEGIN
  INSERT INTO instructor_accounts (account_uid, username, password, display_name)
  VALUES (
    CONCAT('ins_', UNIX_TIMESTAMP(), '_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8)),
    p_username,
    p_password,
    COALESCE(NULLIF(TRIM(p_display_name), ''), p_username)
  );

  SELECT account_uid AS id, username, display_name, created_at
  FROM instructor_accounts
  WHERE username = p_username
  LIMIT 1;
END$$

CREATE PROCEDURE sp_save_case_record(
  IN p_student_id VARCHAR(50),
  IN p_instructor_uid VARCHAR(80),
  IN p_instructor_name VARCHAR(255),
  IN p_academic_year VARCHAR(20),
  IN p_procedure_key VARCHAR(80),
  IN p_case_no VARCHAR(100),
  IN p_complete_diagnosis TEXT,
  IN p_date_time_performed DATETIME,
  IN p_patient_name VARCHAR(255),
  IN p_patient_address VARCHAR(255),
  IN p_facility_name VARCHAR(255),
  IN p_facility_address VARCHAR(255),
  IN p_facility_contact_number VARCHAR(50),
  IN p_supervisor_printed_name VARCHAR(255),
  IN p_supervisor_contact_number VARCHAR(50),
  IN p_supervisor_position_designation VARCHAR(255),
  IN p_supervisor_license_no VARCHAR(100),
  IN p_supervisor_license_expiry_date DATE
)
BEGIN
  DECLARE v_student_name VARCHAR(255);
  DECLARE v_procedure_name VARCHAR(255);

  SELECT student_name INTO v_student_name
  FROM students
  WHERE student_id = p_student_id
  LIMIT 1;

  IF v_student_name IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student not found.';
  END IF;

  SELECT procedure_name INTO v_procedure_name
  FROM procedures
  WHERE procedure_key = p_procedure_key
  LIMIT 1;

  IF v_procedure_name IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Procedure not found.';
  END IF;

  INSERT INTO case_records (
    student_id, student_name, instructor_uid, instructor_name, academic_year,
    procedure_key, procedure_name, case_no, complete_diagnosis, date_time_performed,
    patient_name, patient_address, facility_name, facility_address, facility_contact_number,
    supervisor_printed_name, supervisor_contact_number, supervisor_position_designation,
    supervisor_license_no, supervisor_license_expiry_date
  ) VALUES (
    p_student_id, v_student_name, p_instructor_uid, p_instructor_name, p_academic_year,
    p_procedure_key, v_procedure_name, p_case_no, p_complete_diagnosis, p_date_time_performed,
    p_patient_name, p_patient_address, p_facility_name, p_facility_address, p_facility_contact_number,
    p_supervisor_printed_name, p_supervisor_contact_number, p_supervisor_position_designation,
    p_supervisor_license_no, p_supervisor_license_expiry_date
  );

  SELECT LAST_INSERT_ID() AS case_id;
END$$

CREATE PROCEDURE sp_request_edit_approval(
  IN p_student_id VARCHAR(50),
  IN p_procedure_key VARCHAR(80),
  IN p_case_numbers JSON
)
BEGIN
  DECLARE v_procedure_name VARCHAR(255);

  IF EXISTS (
    SELECT 1
    FROM edit_requests
    WHERE student_id = p_student_id
      AND procedure_key = p_procedure_key
      AND status = 'pending'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A pending edit request already exists.';
  END IF;

  SELECT procedure_name INTO v_procedure_name
  FROM procedures
  WHERE procedure_key = p_procedure_key
  LIMIT 1;

  INSERT INTO edit_requests (student_id, procedure_key, procedure_name, case_numbers)
  VALUES (p_student_id, p_procedure_key, v_procedure_name, p_case_numbers);

  SELECT LAST_INSERT_ID() AS request_id;
END$$

CREATE PROCEDURE sp_approve_edit_request(
  IN p_request_id INT UNSIGNED,
  IN p_checked_by VARCHAR(255),
  IN p_instructor_uid VARCHAR(80)
)
BEGIN
  DECLARE v_student_id VARCHAR(50);
  DECLARE v_procedure_key VARCHAR(80);

  SELECT student_id, procedure_key
  INTO v_student_id, v_procedure_key
  FROM edit_requests
  WHERE id = p_request_id
  LIMIT 1;

  IF v_student_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Edit request not found.';
  END IF;

  UPDATE edit_requests
  SET status = 'approved', approved_at = NOW(), rejected_at = NULL
  WHERE id = p_request_id;

  INSERT INTO edit_permissions (student_id, procedure_key, approved, approved_at)
  VALUES (v_student_id, v_procedure_key, 1, NOW())
  ON DUPLICATE KEY UPDATE approved = 1, approved_at = NOW();

  UPDATE case_records
  SET checked_by = p_checked_by,
      checked_at = NOW(),
      instructor_uid = COALESCE(NULLIF(TRIM(p_instructor_uid), ''), instructor_uid),
      instructor_name = COALESCE(NULLIF(TRIM(p_checked_by), ''), instructor_name)
  WHERE student_id = v_student_id
    AND procedure_key = v_procedure_key;
END$$

CREATE PROCEDURE sp_reject_edit_request(
  IN p_request_id INT UNSIGNED,
  IN p_rejection_remarks TEXT
)
BEGIN
  UPDATE edit_requests
  SET status = 'rejected',
      rejection_remarks = p_rejection_remarks,
      rejected_at = NOW(),
      approved_at = NULL
  WHERE id = p_request_id;
END$$

CREATE PROCEDURE sp_add_notification(
  IN p_event_type VARCHAR(80),
  IN p_student_id VARCHAR(50),
  IN p_procedure_key VARCHAR(80),
  IN p_case_no VARCHAR(100),
  IN p_request_id INT UNSIGNED,
  IN p_message TEXT,
  IN p_remarks TEXT,
  IN p_meta JSON
)
BEGIN
  INSERT INTO notification_history (
    event_type, student_id, procedure_key, procedure_type, case_no, request_id, message, remarks, meta
  )
  VALUES (
    p_event_type,
    p_student_id,
    p_procedure_key,
    (SELECT procedure_name FROM procedures WHERE procedure_key = p_procedure_key LIMIT 1),
    p_case_no,
    p_request_id,
    p_message,
    p_remarks,
    p_meta
  );

  SELECT LAST_INSERT_ID() AS notification_id;
END$$

CREATE PROCEDURE sp_send_chat_message(
  IN p_student_id VARCHAR(50),
  IN p_sender_role VARCHAR(20),
  IN p_sender_name VARCHAR(255),
  IN p_message TEXT
)
BEGIN
  DECLARE v_student_name VARCHAR(255);
  DECLARE v_role VARCHAR(20);

  SELECT student_name INTO v_student_name
  FROM students
  WHERE student_id = p_student_id
  LIMIT 1;

  IF v_student_name IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student not found.';
  END IF;

  SET v_role = LOWER(COALESCE(NULLIF(TRIM(p_sender_role), ''), 'student'));
  IF v_role NOT IN ('student', 'instructor') THEN
    SET v_role = 'student';
  END IF;

  INSERT INTO chat_messages (
    student_id, student_name, sender_role, sender_name, message, read_by_student, read_by_instructor
  )
  VALUES (
    p_student_id,
    v_student_name,
    v_role,
    COALESCE(NULLIF(TRIM(p_sender_name), ''), IF(v_role = 'student', v_student_name, 'Instructor')),
    p_message,
    IF(v_role = 'student', 1, 0),
    IF(v_role = 'instructor', 1, 0)
  );

  SELECT LAST_INSERT_ID() AS message_id;
END$$

CREATE PROCEDURE sp_mark_chat_read(
  IN p_student_id VARCHAR(50),
  IN p_reader_role VARCHAR(20)
)
BEGIN
  IF LOWER(p_reader_role) = 'student' THEN
    UPDATE chat_messages
    SET read_by_student = 1
    WHERE student_id = p_student_id;
  ELSEIF LOWER(p_reader_role) = 'instructor' THEN
    UPDATE chat_messages
    SET read_by_instructor = 1
    WHERE student_id = p_student_id;
  END IF;
END$$

DELIMITER ;
