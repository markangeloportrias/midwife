/*
 * MySQL data layer for student, instructor, and case-record flows.
 * Business records live in the XAMPP database. Browser storage is retained
 * only for authentication/session state and harmless UI preferences.
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    students: 'thesis_students_v1',
    cases: 'thesis_cases_v1',
    editRequests: 'editRequests',
    editPermissions: 'editPermissions',
    notificationHistory: 'thesis_notification_history_v1',
    chatMessages: 'thesis_chat_messages_v1',
    schoolYearArchives: 'thesis_school_year_archives_v1',
    meta: 'thesis_meta_v1',
    instructorAuth: 'thesis_instructor_auth_v1',
    instructorAccounts: 'thesis_instructor_accounts_v1',
    adminPin: 'thesis_admin_pin_v1',
    studentBlocks: 'thesis_student_blocks_v1',
    schoolYears: 'thesis_school_years_v1'
    ,auditTrail: 'thesis_audit_trail_v1'
  };

  var DEFAULT_INSTRUCTOR_AUTH = {
    username: 'instructor',
    password: '123456'
  };
  var DEFAULT_ADMIN_PIN = '123456';
  var LEGACY_ADMIN_PIN = '000000';

  function readJson(key, fallback) {
    var raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    try {
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalize(text) {
    return (text || '').toString().trim();
  }

  function canonicalProcedureName(value) {
    var raw = normalize(value).toLowerCase();
    if (!raw) return '';
    if ((raw.indexOf('normal') !== -1 && raw.indexOf('delivery') !== -1) || (raw.indexOf('delivery') !== -1 && raw.indexOf('handled') !== -1)) {
      return 'delivery handled';
    }
    if (raw.indexOf('delivery') !== -1 && raw.indexOf('assisted') !== -1) {
      return 'delivery assisted';
    }
    if (raw.indexOf('sutur') !== -1) {
      return 'suturing';
    }
    if ((raw.indexOf('iv') !== -1 && raw.indexOf('insert') !== -1) || raw.indexOf('intravenous') !== -1) {
      return 'iv insertion';
    }
    if (raw.indexOf('internal') !== -1 && raw.indexOf('exam') !== -1) {
      return 'internal exam';
    }
    return raw;
  }

  function makeInstructorAccount(username, password, displayName) {
    return {
      id: 'ins_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      username: normalize(username),
      password: normalize(password),
      display_name: normalize(displayName) || normalize(username),
      created_at: new Date().toISOString()
    };
  }

  function getDefaultInstructorAccount() {
    return makeInstructorAccount(DEFAULT_INSTRUCTOR_AUTH.username, DEFAULT_INSTRUCTOR_AUTH.password, 'Default Instructor');
  }

  function getInstructorAccountsInternal() {
    var accounts = readJson(STORAGE_KEYS.instructorAccounts, null);
    if (!Array.isArray(accounts)) {
      accounts = [];
    }

    accounts = accounts
      .map(function (acc) {
        return {
          id: normalize(acc && acc.id),
          username: normalize(acc && acc.username),
          password: normalize(acc && acc.password),
          display_name: normalize(acc && acc.display_name),
          created_at: normalize(acc && acc.created_at),
          archived: !!(acc && acc.archived),
          archived_at: normalize(acc && acc.archived_at)
        };
      })
      .filter(function (acc) {
        return !!acc.id && !!acc.username && !!acc.password;
      });

    return accounts;
  }

  function saveInstructorAccountsInternal(accounts) {
    writeJson(STORAGE_KEYS.instructorAccounts, accounts || []);
  }

  function saveLegacyInstructorAuth(username, password) {
    var nextUsername = normalize(username);
    var nextPassword = normalize(password);
    if (nextUsername && nextPassword) {
      writeJson(STORAGE_KEYS.instructorAuth, {
        username: nextUsername,
        password: nextPassword
      });
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.instructorAuth);
  }

  function getStoredInstructorAuth() {
    var accounts = getInstructorAccountsInternal().filter(function (account) {
      return !account.archived;
    });
    if (accounts.length > 0) {
      return {
        username: accounts[0].username,
        password: accounts[0].password
      };
    }
    return {
      username: DEFAULT_INSTRUCTOR_AUTH.username,
      password: DEFAULT_INSTRUCTOR_AUTH.password
    };
  }

  function getStoredAdminPin() {
    var pin = normalize(localStorage.getItem(STORAGE_KEYS.adminPin));
    if (!pin) {
      return DEFAULT_ADMIN_PIN;
    }
    return pin;
  }

  function findInstructorAccountByCredentials(username, password) {
    var user = normalize(username).toLowerCase();
    var pass = normalize(password);
    var accounts = getInstructorAccountsInternal();
    for (var i = 0; i < accounts.length; i += 1) {
      if (!accounts[i].archived && normalize(accounts[i].username).toLowerCase() === user && normalize(accounts[i].password) === pass) {
        return accounts[i];
      }
    }
    return null;
  }

  function matchesInstructorCredentials(username, password) {
    return !!findInstructorAccountByCredentials(username, password);
  }

  function matchesAdminPin(pin) {
    return normalize(pin) === normalize(getStoredAdminPin());
  }

  var ensureStorageRunning = false;

  function ensureStorage() {
    if (ensureStorageRunning) {
      return;
    }
    ensureStorageRunning = true;
    try {
    if (!Array.isArray(readJson(STORAGE_KEYS.students, null))) {
      writeJson(STORAGE_KEYS.students, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.cases, null))) {
      writeJson(STORAGE_KEYS.cases, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.editRequests, null))) {
      writeJson(STORAGE_KEYS.editRequests, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.editPermissions, null))) {
      writeJson(STORAGE_KEYS.editPermissions, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.notificationHistory, null))) {
      writeJson(STORAGE_KEYS.notificationHistory, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.chatMessages, null))) {
      writeJson(STORAGE_KEYS.chatMessages, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.studentBlocks, null))) {
      writeJson(STORAGE_KEYS.studentBlocks, []);
    }
    if (!Array.isArray(readJson(STORAGE_KEYS.schoolYears, null))) {
      writeJson(STORAGE_KEYS.schoolYears, []);
    }
    var archives = readJson(STORAGE_KEYS.schoolYearArchives, null);
    if (!archives || typeof archives !== 'object' || Array.isArray(archives)) {
      writeJson(STORAGE_KEYS.schoolYearArchives, {});
    }

    var meta = readJson(STORAGE_KEYS.meta, null);
    if (!meta || typeof meta !== 'object') {
      meta = { nextCaseId: 1, nextEditRequestId: 1, nextNotificationId: 1, nextChatMessageId: 1 };
      writeJson(STORAGE_KEYS.meta, meta);
    }

    var accounts = getInstructorAccountsInternal();
    if (!accounts.length) {
      var legacyAuth = readJson(STORAGE_KEYS.instructorAuth, null);
      if (legacyAuth && typeof legacyAuth === 'object' && normalize(legacyAuth.username) && normalize(legacyAuth.password)) {
        accounts = [makeInstructorAccount(legacyAuth.username, legacyAuth.password, legacyAuth.username)];
      } else {
        accounts = [getDefaultInstructorAccount()];
      }
      saveInstructorAccountsInternal(accounts);
    }

    var savedAdminPin = normalize(localStorage.getItem(STORAGE_KEYS.adminPin));
    if (!savedAdminPin || savedAdminPin === LEGACY_ADMIN_PIN) {
      localStorage.setItem(STORAGE_KEYS.adminPin, DEFAULT_ADMIN_PIN);
    }

    var metaForMigration = readJson(STORAGE_KEYS.meta, null);
    if (!metaForMigration || typeof metaForMigration !== 'object') {
      metaForMigration = { nextCaseId: 1, nextEditRequestId: 1, nextNotificationId: 1, nextChatMessageId: 1 };
    }
    var blocksMigrationVersion = Number(metaForMigration.studentBlocksMigrationVersion || 0);
    if (blocksMigrationVersion < 2) {
      migrateStudentBlocksData();
      metaForMigration.studentBlocksMigrationVersion = 2;
      metaForMigration.studentBlocksDataMigrated = true;
      writeJson(STORAGE_KEYS.meta, metaForMigration);
      blocksMigrationVersion = 2;
    }
    if (blocksMigrationVersion < 3) {
      migrateStudentEnrollments();
      metaForMigration.studentBlocksMigrationVersion = 3;
      writeJson(STORAGE_KEYS.meta, metaForMigration);
    }
    } finally {
      ensureStorageRunning = false;
    }
  }

  function getMeta() {
    ensureStorage();
    var meta = readJson(STORAGE_KEYS.meta, { nextCaseId: 1, nextEditRequestId: 1, nextNotificationId: 1 });
    if (typeof meta.nextCaseId !== 'number') meta.nextCaseId = 1;
    if (typeof meta.nextEditRequestId !== 'number') meta.nextEditRequestId = 1;
    if (typeof meta.nextNotificationId !== 'number') meta.nextNotificationId = 1;
    if (typeof meta.nextChatMessageId !== 'number') meta.nextChatMessageId = 1;
    return meta;
  }

  function saveMeta(meta) {
    writeJson(STORAGE_KEYS.meta, meta);
  }

  function getStudents() {
    ensureStorage();
    return readJson(STORAGE_KEYS.students, []);
  }

  function saveStudents(students) {
    writeJson(STORAGE_KEYS.students, students);
  }

  function getStudentBlocks() {
    ensureStorage();
    return readJson(STORAGE_KEYS.studentBlocks, []);
  }

  function saveStudentBlocks(blocks) {
    writeJson(STORAGE_KEYS.studentBlocks, blocks || []);
  }

  function findStudentBlockById(blockId) {
    var id = normalize(blockId);
    var blocks = getStudentBlocks();
    for (var i = 0; i < blocks.length; i += 1) {
      if (normalize(blocks[i].id) === id) {
        return blocks[i];
      }
    }
    return null;
  }

  function parseSchoolYearRange(value) {
    var match = String(value || '').trim().match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (!match) return null;
    var startYear = Number(match[1]);
    var endYear = Number(match[2]);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear !== startYear + 1) {
      return null;
    }
    return {
      startYear: startYear,
      endYear: endYear,
      label: startYear + '-' + endYear
    };
  }

  function normalizeSchoolYearRange(value) {
    var parsed = parseSchoolYearRange(value);
    return parsed ? parsed.label : '';
  }

  function getSchoolYearsStored() {
    ensureStorage();
    return readJson(STORAGE_KEYS.schoolYears, []);
  }

  function saveSchoolYears(years) {
    writeJson(STORAGE_KEYS.schoolYears, years || []);
  }

  function collectSchoolYearRangesFromCases() {
    var casesList = getCases();
    var ranges = {};
    casesList.forEach(function (caseRecord) {
      var direct = normalizeSchoolYearRange(caseRecord.academic_year || caseRecord.school_year || '');
      if (direct) {
        ranges[direct] = true;
        return;
      }
      var performed = normalize(caseRecord.date_time_performed);
      if (!performed) return;
      var parsed = new Date(performed);
      if (Number.isNaN(parsed.getTime())) return;
      var year = parsed.getFullYear();
      ranges[year + '-' + (year + 1)] = true;
    });
    return Object.keys(ranges);
  }

  function getCurrentSchoolYearLabel() {
    var now = new Date();
    var startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return startYear + '-' + (startYear + 1);
  }

  function blockLabelEquals(label, expected) {
    return normalize(label).toLowerCase() === normalize(expected).toLowerCase();
  }

  function ensureSchoolYearStored(label) {
    var normalized = normalizeSchoolYearRange(label);
    if (!normalized) return '';
    var years = getSchoolYearsStored();
    if (!years.some(function (year) { return normalizeSchoolYearRange(year) === normalized; })) {
      years.push(normalized);
      years.sort(function (a, b) {
        return Number(b.split('-')[0]) - Number(a.split('-')[0]);
      });
      saveSchoolYears(years);
    }
    return normalized;
  }

  function migrateStudentBlocksData() {
    var blocks = readJson(STORAGE_KEYS.studentBlocks, []);
    if (!Array.isArray(blocks)) {
      blocks = [];
    }
    // A fresh installation must not invent a school year or default blocks.
    // This migration only applies to actual legacy block data.
    if (!blocks.length) {
      return;
    }
    var targetYear = '';
    var years = getAllSchoolYears();
    if (years.length) {
      targetYear = years[0];
    } else {
      targetYear = getCurrentSchoolYearLabel();
    }
    targetYear = ensureSchoolYearStored(targetYear) || targetYear;

    var blocksChanged = false;
    blocks = blocks.map(function (block) {
      if (normalizeSchoolYearRange(block.school_year)) {
        return block;
      }
      blocksChanged = true;
      return Object.assign({}, block, { school_year: targetYear });
    });

    var hasBlockA = blocks.some(function (block) {
      return blockLabelEquals(block.label, 'Block A') &&
        normalizeSchoolYearRange(block.school_year) === targetYear;
    });
    var hasBlockB = blocks.some(function (block) {
      return blockLabelEquals(block.label, 'Block B') &&
        normalizeSchoolYearRange(block.school_year) === targetYear;
    });

    if (!hasBlockA) {
      blocks.push({
        id: 'blk_' + Date.now().toString(36) + '_a_' + Math.random().toString(36).slice(2, 6),
        label: 'Block A',
        school_year: targetYear,
        created_by: 'system',
        created_at: new Date().toISOString()
      });
      blocksChanged = true;
    }
    if (!hasBlockB) {
      blocks.push({
        id: 'blk_' + Date.now().toString(36) + '_b_' + Math.random().toString(36).slice(2, 6),
        label: 'Block B',
        school_year: targetYear,
        created_by: 'system',
        created_at: new Date().toISOString()
      });
      blocksChanged = true;
    }

    if (blocksChanged) {
      saveStudentBlocks(blocks);
    }

    var students = getStudents();
    var studentsChanged = false;
    students = students.map(function (student) {
      if (!normalize(student.block_id)) {
        return student;
      }
      var block = findStudentBlockById(student.block_id);
      if (!block) {
        return student;
      }
      var sy = normalizeSchoolYearRange(block.school_year) || targetYear;
      var assignments = student.block_assignments && typeof student.block_assignments === 'object'
        ? student.block_assignments
        : {};
      if (normalize(assignments[sy])) {
        return student;
      }
      studentsChanged = true;
      return setStudentBlockAssignmentOnRecord(student, sy, student.block_id);
    });
    if (studentsChanged) {
      saveStudents(students);
    }
  }

  function getAllSchoolYears() {
    var registered = {};
    getSchoolYearsStored().forEach(function (year) {
      var normalized = normalizeSchoolYearRange(year);
      if (normalized) registered[normalized] = true;
    });
    return Object.keys(registered).sort(function (a, b) {
      return Number(b.split('-')[0]) - Number(a.split('-')[0]);
    });
  }

  function getStudentEnrollments(student) {
    if (!student || typeof student !== 'object') return {};
    var enrollments = student.enrollments && typeof student.enrollments === 'object'
      ? Object.assign({}, student.enrollments)
      : {};
    var assignments = student.block_assignments && typeof student.block_assignments === 'object'
      ? student.block_assignments
      : {};
    Object.keys(assignments).forEach(function (yearKey) {
      var sy = normalizeSchoolYearRange(yearKey);
      if (!sy || enrollments[sy]) return;
      enrollments[sy] = {
        school_year: sy,
        block_id: normalize(assignments[yearKey]),
        registered_at: student.created_at || new Date().toISOString()
      };
    });
    if (normalize(student.block_id)) {
      var legacyBlock = findStudentBlockById(student.block_id);
      var legacyYear = normalizeSchoolYearRange(
        student.registered_school_year || (legacyBlock && legacyBlock.school_year) || ''
      );
      if (legacyYear && !enrollments[legacyYear]) {
        enrollments[legacyYear] = {
          school_year: legacyYear,
          block_id: normalize(student.block_id),
          registered_at: student.created_at || new Date().toISOString()
        };
      }
    }
    if (normalize(student.registered_school_year) && !enrollments[normalizeSchoolYearRange(student.registered_school_year)]) {
      var regYear = normalizeSchoolYearRange(student.registered_school_year);
      enrollments[regYear] = {
        school_year: regYear,
        block_id: normalize(student.block_id) || '',
        registered_at: student.created_at || new Date().toISOString()
      };
    }
    return enrollments;
  }

  function getStudentEnrollmentForYear(student, schoolYear) {
    var sy = normalizeSchoolYearRange(schoolYear);
    if (!sy) return null;
    var enrollments = getStudentEnrollments(student);
    return enrollments[sy] || null;
  }

  function isStudentRegisteredForYear(student, schoolYear) {
    return !!getStudentEnrollmentForYear(student, schoolYear);
  }

  function getStudentRegisteredSchoolYears(student) {
    return Object.keys(getStudentEnrollments(student)).sort(function (a, b) {
      return Number(b.split('-')[0]) - Number(a.split('-')[0]);
    });
  }

  function getStudentActiveSchoolYear(student) {
    if (!student) return '';
    var active = normalizeSchoolYearRange(student.active_school_year || student.registered_school_year || '');
    if (active) return active;
    var years = getStudentRegisteredSchoolYears(student);
    return years.length ? years[0] : '';
  }

  function getStudentBlockAssignment(student, schoolYear) {
    var sy = normalizeSchoolYearRange(schoolYear);
    if (!student || !sy) return '';
    var enrollment = getStudentEnrollmentForYear(student, sy);
    if (enrollment && normalize(enrollment.block_id)) {
      return normalize(enrollment.block_id);
    }
    return '';
  }

  function setStudentEnrollmentRecord(student, schoolYear, blockId) {
    var sy = normalizeSchoolYearRange(schoolYear);
    if (!sy) return student;
    var next = Object.assign({}, student);
    var enrollments = Object.assign({}, getStudentEnrollments(student));
    var existing = enrollments[sy] || {};
    enrollments[sy] = {
      school_year: sy,
      block_id: normalize(blockId) || '',
      registered_at: existing.registered_at || new Date().toISOString()
    };
    next.enrollments = enrollments;
    next.active_school_year = sy;
    next.registered_school_year = sy;
    delete next.block_assignments;
    delete next.block_id;
    return next;
  }

  function setStudentBlockAssignmentOnRecord(student, schoolYear, blockId) {
    return setStudentEnrollmentRecord(student, schoolYear, blockId);
  }

  function migrateStudentEnrollments() {
    var students = readJson(STORAGE_KEYS.students, []);
    if (!Array.isArray(students)) {
      students = [];
    }
    var changed = false;
    students = students.map(function (student) {
      var enrollments = getStudentEnrollments(student);
      if (!Object.keys(enrollments).length) {
        return student;
      }
      var activeYear = getStudentActiveSchoolYear(student) || Object.keys(enrollments).sort().reverse()[0];
      var next = Object.assign({}, student, {
        enrollments: enrollments,
        active_school_year: activeYear,
        registered_school_year: activeYear
      });
      delete next.block_assignments;
      delete next.block_id;
      changed = true;
      return next;
    });
    if (changed) {
      saveStudents(students);
    }
  }

  function getStudentsInBlock(blockId, schoolYear) {
    var id = normalize(blockId);
    var sy = normalizeSchoolYearRange(schoolYear);
    return getStudents().filter(function (student) {
      return !student.archived && isStudentRegisteredForYear(student, sy) && getStudentBlockAssignment(student, sy) === id;
    });
  }

  function clearBlockFromStudents(blockId, schoolYear) {
    var id = normalize(blockId);
    var sy = schoolYear ? normalizeSchoolYearRange(schoolYear) : '';
    var students = getStudents();
    var changed = false;
    students = students.map(function (student) {
      if (sy) {
        if (getStudentBlockAssignment(student, sy) !== id) {
          return student;
        }
        changed = true;
        return setStudentEnrollmentRecord(student, sy, '');
      }
      var enrollments = getStudentEnrollments(student);
      var itemChanged = false;
      var nextEnrollments = Object.assign({}, enrollments);
      Object.keys(nextEnrollments).forEach(function (yearKey) {
        if (normalize(nextEnrollments[yearKey].block_id) === id) {
          nextEnrollments[yearKey] = Object.assign({}, nextEnrollments[yearKey], { block_id: '' });
          itemChanged = true;
        }
      });
      if (!itemChanged) return student;
      changed = true;
      var next = Object.assign({}, student, { enrollments: nextEnrollments });
      delete next.block_assignments;
      delete next.block_id;
      return next;
    });
    if (changed) {
      saveStudents(students);
    }
  }

  function caseMatchesStudentSchoolYear(caseRec, schoolYear) {
    var sy = normalizeSchoolYearRange(schoolYear);
    if (!sy) return true;
    var caseYear = normalizeSchoolYearRange(caseRec.academic_year || caseRec.school_year || '');
    if (!caseYear) return true;
    return caseYear === sy;
  }

  function getCases() {
    ensureStorage();
    return readJson(STORAGE_KEYS.cases, []).filter(function (record) { return !record.archived; });
  }

  function saveCases(casesList) {
    writeJson(STORAGE_KEYS.cases, casesList);
  }

  function getEditRequests() {
    ensureStorage();
    return readJson(STORAGE_KEYS.editRequests, []);
  }

  function saveEditRequests(requests) {
    writeJson(STORAGE_KEYS.editRequests, requests);
  }

  function getEditPermissions() {
    ensureStorage();
    return readJson(STORAGE_KEYS.editPermissions, []);
  }

  function saveEditPermissions(perms) {
    writeJson(STORAGE_KEYS.editPermissions, perms);
  }

  function getNotificationHistory() {
    ensureStorage();
    return readJson(STORAGE_KEYS.notificationHistory, []);
  }

  function saveNotificationHistory(history) {
    writeJson(STORAGE_KEYS.notificationHistory, history);
  }

  function appendAuditEntry(entry) {
    var history = readJson(STORAGE_KEYS.auditTrail, []);
    history.push(Object.assign({ id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), date_time: new Date().toISOString() }, entry || {}));
    writeJson(STORAGE_KEYS.auditTrail, history);
  }

  function legacyRecordStatus(rec) {
    if (normalize(rec && rec.status)) return normalize(rec.status);
    return normalize(rec && rec.checked_by) ? 'Verified' : 'Submitted';
  }

  function getChatMessages() {
    ensureStorage();
    return readJson(STORAGE_KEYS.chatMessages, []);
  }

  function saveChatMessages(messages) {
    writeJson(STORAGE_KEYS.chatMessages, messages);
  }

  function findStudentByPublicId(studentId) {
    var id = normalize(studentId);
    if (!id) return null;
    var students = getStudents();
    for (var i = 0; i < students.length; i += 1) {
      if (normalize(students[i].student_id) === id) {
        return students[i];
      }
    }
    return null;
  }

  function toCaseRow(caseRec) {
    return {
      id: caseRec.id,
      student_id: caseRec.student_id,
      student_name: caseRec.student_name,
      instructor_id: caseRec.instructor_id || '',
      instructor_name: caseRec.instructor_name || '',
      patient_name: caseRec.patient_name || '',
      patient_address: caseRec.patient_address || '',
      case_no: caseRec.case_no || '',
      academic_year: caseRec.academic_year || '',
      complete_diagnosis: caseRec.complete_diagnosis || '',
      date_time_performed: caseRec.date_time_performed || '',
      facility_name: caseRec.facility_name || '',
      facility_address: caseRec.facility_address || '',
      facility_contact_number: caseRec.facility_contact_number || '',
      supervisor_printed_name: caseRec.supervisor_printed_name || '',
      supervisor_contact_number: caseRec.supervisor_contact_number || '',
      supervisor_position_designation: caseRec.supervisor_position_designation || '',
      supervisor_license_no: caseRec.supervisor_license_no || '',
      supervisor_license_expiry_date: caseRec.supervisor_license_expiry_date || '',
      procedure_name: caseRec.procedure_name || '',
      teacher_remarks: caseRec.teacher_remarks || '',
      checked_by: caseRec.checked_by || '',
      checked_at: caseRec.checked_at || '',
      status: legacyRecordStatus(caseRec),
      submitted_at: caseRec.submitted_at || caseRec.created_at || ''
    };
  }

  function createSearchBlob(rec) {
    return [
      rec.student_id,
      rec.student_name,
      rec.instructor_name,
      rec.patient_name,
      rec.patient_address,
      rec.case_no,
      rec.complete_diagnosis,
      rec.date_time_performed,
      rec.facility_name,
      rec.facility_address,
      rec.facility_contact_number,
      rec.supervisor_printed_name,
      rec.supervisor_contact_number,
      rec.supervisor_position_designation,
      rec.supervisor_license_no,
      rec.supervisor_license_expiry_date,
      rec.procedure_name,
      rec.teacher_remarks,
      rec.checked_by
    ].join(' ').toLowerCase();
  }

  function matchCaseFilters(rec, procedureName, searchTerm) {
    var procedure = canonicalProcedureName(procedureName);
    var term = normalize(searchTerm).toLowerCase();
    if (procedure && canonicalProcedureName(rec.procedure_name) !== procedure) {
      return false;
    }
    if (!term) {
      return true;
    }
    return createSearchBlob(rec).indexOf(term) !== -1;
  }

  var ApiClient = {
    async getSyncState() {
      var keys = [
        STORAGE_KEYS.students, STORAGE_KEYS.studentBlocks, STORAGE_KEYS.schoolYears,
        STORAGE_KEYS.cases, 'editRequests', 'editPermissions', 'thesis_chat_messages_v1'
      ];
      return {
        ok: true,
        version: keys.map(function (key) { return localStorage.getItem(key) || ''; }).join('|')
      };
    },

    apiUrl: 'frontend-localstorage',

    async request(action) {
      return { ok: false, message: 'Direct request("' + action + '") is not used in frontend-only mode.' };
    },

    async ensureSchema() {
      ensureStorage();
      return { ok: true };
    },

    async registerStudent(studentId, studentName, password, parentName, contactNumber, options) {
      ensureStorage();
      options = options || {};
      var id = normalize(studentId);
      var name = normalize(studentName);
      var pwd = normalize(password);
      var pName = normalize(parentName);
      var pContact = normalize(contactNumber);
      var sy = normalizeSchoolYearRange(options.school_year || '');
      var blockId = normalize(options.block_id || '');

      if (!/^\d{6}$/.test(id)) {
        return { ok: false, message: 'Student ID must be exactly 6 digits.' };
      }
      if (!name || !pwd || !pName || !pContact) {
        return { ok: false, message: 'All student fields are required.' };
      }

      var students = getStudents();
      var existing = findStudentByPublicId(id);
      if (existing) {
        if (!sy) {
          return { ok: false, message: 'This Student ID is already registered. Select a school year to enroll the student.' };
        }
        if (
          isStudentRegisteredForYear(existing, sy) &&
          (!blockId || getStudentBlockAssignment(existing, sy))
        ) {
          return { ok: false, message: 'This student is already registered for school year ' + sy + '.' };
        }
        var enrolled = setStudentEnrollmentRecord(existing, sy, blockId);
        enrolled.student_name = name;
        enrolled.password = pwd;
        enrolled.parent_name = pName;
        enrolled.contact_number = pContact;
        students = students.map(function (item) {
          return normalize(item.student_id) === id ? enrolled : item;
        });
        saveStudents(students);
        return {
          ok: true,
          student: {
            id: enrolled.id,
            student_id: enrolled.student_id,
            student_name: enrolled.student_name,
            parent_name: enrolled.parent_name,
            contact_number: enrolled.contact_number,
            registered_school_year: sy,
            active_school_year: sy
          }
        };
      }

      var student = {
        id: Date.now(),
        student_id: id,
        student_name: name,
        password: pwd,
        parent_name: pName,
        contact_number: pContact,
        created_at: new Date().toISOString(),
        enrollments: {}
      };
      if (sy) {
        student.enrollments[sy] = {
          school_year: sy,
          block_id: blockId,
          registered_at: new Date().toISOString()
        };
        student.active_school_year = sy;
        student.registered_school_year = sy;
      }
      students.push(student);
      saveStudents(students);

      return {
        ok: true,
        student: {
          id: student.id,
          student_id: student.student_id,
          student_name: student.student_name,
          parent_name: student.parent_name,
          contact_number: student.contact_number,
          registered_school_year: sy,
          active_school_year: sy
        }
      };
    },

    async authenticateStudent(studentId, password) {
      ensureStorage();
      var id = normalize(studentId);
      var pwd = normalize(password);
      var student = findStudentByPublicId(id);
      if (!student || normalize(student.password) !== pwd) {
        return { ok: false, message: 'Invalid student ID or password.' };
      }

      return {
        ok: true,
        student: {
          id: student.id,
          student_id: student.student_id,
          student_name: student.student_name,
          parent_name: student.parent_name || '',
          contact_number: student.contact_number || '',
          profile_photo: student.profile_photo || '',
          registered_school_year: getStudentActiveSchoolYear(student),
          active_school_year: getStudentActiveSchoolYear(student)
        }
      };
    },

    async getStudent(studentId) {
      ensureStorage();
      var student = findStudentByPublicId(studentId);
      if (!student) {
        return { ok: false, message: 'Student not found.', student: null };
      }

      return {
        ok: true,
        student: {
          id: student.id,
          student_id: student.student_id,
          student_name: student.student_name,
          parent_name: student.parent_name || '',
          contact_number: student.contact_number || '',
          profile_photo: student.profile_photo || '',
          registered_school_year: getStudentActiveSchoolYear(student),
          active_school_year: getStudentActiveSchoolYear(student)
        }
      };
    },

    async getAllStudents() {
      ensureStorage();
      return {
        ok: true,
        students: getStudents().filter(function (student) {
          return student && !student.archived;
        })
      };
    },

    async saveCaseRecord(studentId, procedureName, caseData) {
      ensureStorage();
      var student = findStudentByPublicId(studentId);
      if (!student) {
        return { ok: false, message: 'Student not found. Please log in again.' };
      }

      var activeYear = normalizeSchoolYearRange(caseData && caseData.academic_year) || getStudentActiveSchoolYear(student);
      var meta = getMeta();
      var casesList = getCases();
      var newCase = {
        id: meta.nextCaseId,
        student_id: student.student_id,
        instructor_id: normalize(caseData && caseData.instructor_id),
        instructor_name: normalize(caseData && caseData.instructor_name),
        student_name: student.student_name,
        academic_year: activeYear,
        school_year: activeYear,
        procedure_name: canonicalProcedureName(procedureName),
        case_no: normalize(caseData && caseData.case_no),
        complete_diagnosis: normalize(caseData && caseData.complete_diagnosis),
        date_time_performed: normalize(caseData && caseData.date_time_performed),
        patient_name: normalize(caseData && caseData.patient_name),
        patient_address: normalize(caseData && caseData.patient_address),
        facility_name: normalize(caseData && caseData.facility_name),
        facility_address: normalize(caseData && caseData.facility_address),
        facility_contact_number: normalize(caseData && caseData.facility_contact_number),
        supervisor_printed_name: normalize(caseData && caseData.supervisor_printed_name),
        supervisor_contact_number: normalize(caseData && caseData.supervisor_contact_number),
        supervisor_position_designation: normalize(caseData && caseData.supervisor_position_designation),
        supervisor_license_no: normalize(caseData && caseData.supervisor_license_no),
        supervisor_license_expiry_date: normalize(caseData && caseData.supervisor_license_expiry_date),
        teacher_remarks: normalize(caseData && caseData.teacher_remarks),
        checked_by: normalize(caseData && caseData.checked_by),
        checked_at: normalize(caseData && caseData.checked_at),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      casesList.push(newCase);
      saveCases(casesList);

      meta.nextCaseId += 1;
      saveMeta(meta);

      return { ok: true, case_id: newCase.id };
    },

    async getJoinedCases(studentId, procedureName, searchTerm) {
      ensureStorage();
      var id = normalize(studentId);
      var rows = getCases()
        .filter(function (rec) { return normalize(rec.student_id) === id; })
        .filter(function (rec) { return matchCaseFilters(rec, procedureName, searchTerm); })
        .sort(function (a, b) { return b.id - a.id; })
        .map(toCaseRow);
      return rows;
    },

    async getAllCasesForInstructor(procedureName, searchTerm) {
      ensureStorage();
      return getCases()
        .filter(function (rec) { return matchCaseFilters(rec, procedureName, searchTerm); })
        .sort(function (a, b) { return b.id - a.id; })
        .map(toCaseRow);
    },

    async deleteCaseRecord(studentId, caseId) {
      ensureStorage();
      var id = normalize(studentId);
      var numericId = Number(caseId);
      var casesList = readJson(STORAGE_KEYS.cases, []);
      casesList = casesList.map(function (rec) {
        if (rec.id === numericId && normalize(rec.student_id) === id) {
          return Object.assign({}, rec, { archived: true, archived_at: new Date().toISOString() });
        }
        return rec;
      });
      saveCases(casesList);
      return { ok: true };
    },

    async restoreCaseRecord(studentId, caseId) {
      ensureStorage();
      var id = normalize(studentId);
      var numericId = Number(caseId);
      var casesList = readJson(STORAGE_KEYS.cases, []);
      casesList = casesList.map(function (rec) {
        if (rec.id === numericId && normalize(rec.student_id) === id) {
          return Object.assign({}, rec, { archived: false, archived_at: null });
        }
        return rec;
      });
      saveCases(casesList);
      return { ok: true };
    },

    async permanentlyDeleteCaseRecord(studentId, caseId) {
      ensureStorage();
      var id = normalize(studentId);
      var numericId = Number(caseId);
      saveCases(readJson(STORAGE_KEYS.cases, []).filter(function (rec) {
        return !(rec.id === numericId && normalize(rec.student_id) === id);
      }));
      return { ok: true };
    },

    async updateCaseRecord(caseId, diagnosis) {
      ensureStorage();
      var numericId = Number(caseId);
      var nextDiagnosis = normalize(diagnosis);
      var casesList = getCases();
      for (var i = 0; i < casesList.length; i += 1) {
        if (casesList[i].id === numericId) {
          casesList[i].complete_diagnosis = nextDiagnosis;
          casesList[i].updated_at = new Date().toISOString();
          saveCases(casesList);
          return { ok: true };
        }
      }
      return { ok: false, message: 'Case not found.' };
    },

    async requestEditApproval(studentId, procedureName, caseNumbers) {
      ensureStorage();
      var id = normalize(studentId);
      var procedure = canonicalProcedureName(procedureName);
      var requests = getEditRequests();

      console.log('[API_CLIENT_DEBUG] requestEditApproval called with:', {studentId, procedureName, caseNumbers, id, procedure});

      var hasPending = requests.some(function (req) {
        return normalize(req.studentId) === id && normalize(req.type) === procedure && req.status === 'pending';
      });
      if (hasPending) {
        console.log('[API_CLIENT_DEBUG] Already has pending request, rejecting');
        return { ok: false, message: 'You already have a pending edit request.' };
      }

      var meta = getMeta();
      var request = {
        id: meta.nextEditRequestId,
        studentId: id,
        type: procedure,
        procedure_name: procedure,
        caseNumbers: Array.isArray(caseNumbers) ? caseNumbers : [],
        status: 'pending',
        requestedAt: new Date().toISOString()
      };
      requests.push(request);
      saveEditRequests(requests);

      console.log('[API_CLIENT_DEBUG] Saved edit request:', request);
      console.log('[API_CLIENT_DEBUG] All edit requests now:', requests);

      meta.nextEditRequestId += 1;
      saveMeta(meta);

      return { ok: true, request_id: request.id };
    },

    async getPendingEditRequests() {
      ensureStorage();
      var allRequests = getEditRequests();
      console.log('[API_CLIENT_DEBUG] getPendingEditRequests: All requests:', allRequests);
      var pending = allRequests
        .filter(function (req) { return req.status === 'pending'; })
        .sort(function (a, b) {
          var ta = new Date(a.requestedAt || 0).getTime();
          var tb = new Date(b.requestedAt || 0).getTime();
          return tb - ta;
        });
      console.log('[API_CLIENT_DEBUG] getPendingEditRequests: Filtered pending:', pending);
      return pending;
    },

    async approveEditRequest(requestId) {
      ensureStorage();
      var id = Number(requestId);
      var requests = getEditRequests();
      var target = null;
      for (var i = 0; i < requests.length; i += 1) {
        if (Number(requests[i].id) === id) {
          requests[i].status = 'approved';
          requests[i].approvedAt = new Date().toISOString();
          target = requests[i];
          break;
        }
      }
      saveEditRequests(requests);

      if (target) {
        var perms = getEditPermissions();
        var idx = perms.findIndex(function (p) {
          return normalize(p.studentId) === normalize(target.studentId) && normalize(p.type) === normalize(target.type);
        });
        var nextPerm = {
          studentId: target.studentId,
          type: target.type,
          approved: true,
          approvedAt: new Date().toISOString()
        };
        if (idx >= 0) {
          perms[idx] = nextPerm;
        } else {
          perms.push(nextPerm);
        }
        saveEditPermissions(perms);
      }

      return { ok: true };
    },

    async rejectEditRequest(requestId) {
      ensureStorage();
      var id = Number(requestId);
      var requests = getEditRequests();
      var target = null;
      for (var i = 0; i < requests.length; i += 1) {
        if (Number(requests[i].id) === id) {
          requests[i].status = 'rejected';
          requests[i].rejectedAt = new Date().toISOString();
          target = requests[i];
          break;
        }
      }
      saveEditRequests(requests);

      if (target) {
        var perms = getEditPermissions().filter(function (p) {
          return !(normalize(p.studentId) === normalize(target.studentId) && normalize(p.type) === normalize(target.type));
        });
        saveEditPermissions(perms);
      }

      return { ok: true };
    },

    async hasEditPermission(studentId, procedureName) {
      ensureStorage();
      var id = normalize(studentId);
      var procedure = normalize(procedureName);
      var permitted = getEditPermissions().some(function (perm) {
        return normalize(perm.studentId) === id && normalize(perm.type) === procedure && !!perm.approved;
      });
      return permitted;
    },

    async authenticateInstructor(username, password) {
      ensureStorage();
      var account = findInstructorAccountByCredentials(username, password);
      if (account) {
        return {
          ok: true,
          instructor: {
            id: account.id,
            username: account.username,
            display_name: account.display_name || account.username,
            profile_photo: account.profile_photo || '',
            contact_number: account.contact_number || '',
            role: account.role || 'Clinical Instructor'
          }
        };
      }
      return { ok: false, message: 'Invalid instructor username or password.' };
    },

    async getInstructorAccounts() {
      ensureStorage();
      var accounts = getInstructorAccountsInternal().filter(function (acc) { return !acc.archived; }).map(function (acc) {
        return {
          id: acc.id,
          username: acc.username,
          display_name: acc.display_name || acc.username,
          profile_photo: acc.profile_photo || '',
          contact_number: acc.contact_number || '',
          role: acc.role || 'Clinical Instructor',
          created_at: acc.created_at || ''
        };
      });
      return { ok: true, accounts: accounts };
    },

    async createInstructorAccount(username, password, displayName) {
      ensureStorage();
      var user = normalize(username);
      var pass = normalize(password);
      var name = normalize(displayName) || user;
      if (!user || !pass) {
        return { ok: false, message: 'Instructor username and password are required.' };
      }

      try {
        var accounts = getInstructorAccountsInternal();
        var exists = accounts.some(function (acc) {
          return normalize(acc.username).toLowerCase() === user.toLowerCase();
        });
        if (exists) {
          return { ok: false, message: 'Instructor username already exists.' };
        }

        var created = makeInstructorAccount(user, pass, name);
        accounts.push(created);
        saveInstructorAccountsInternal(accounts);
        saveLegacyInstructorAuth(created.username, created.password);
        return { ok: true, account: { id: created.id, username: created.username, display_name: created.display_name, created_at: created.created_at } };
      } catch (error) {
        return { ok: false, message: (error && error.message) ? error.message : 'Unable to save instructor account.' };
      }
    },

    async updateInstructorAccount(accountId, payload) {
      ensureStorage();
      var id = normalize(accountId);
      var body = payload || {};
      if (!id) return { ok: false, message: 'Instructor id is required.' };

      var accounts = getInstructorAccountsInternal();
      var idx = accounts.findIndex(function (acc) { return normalize(acc.id) === id; });
      if (idx < 0) return { ok: false, message: 'Instructor not found.' };

      var nextUsername = normalize(body.username || accounts[idx].username);
      var nextPassword = normalize(body.password || accounts[idx].password);
      var nextDisplayName = normalize(body.display_name || body.displayName || accounts[idx].display_name || nextUsername);
      if (!nextUsername || !nextPassword) {
        return { ok: false, message: 'Instructor username and password are required.' };
      }

      var duplicate = accounts.some(function (acc, i) {
        return i !== idx && normalize(acc.username).toLowerCase() === nextUsername.toLowerCase();
      });
      if (duplicate) {
        return { ok: false, message: 'Instructor username already exists.' };
      }

      var nextPhoto = body.profile_photo !== undefined ? body.profile_photo : (accounts[idx].profile_photo || '');
      var nextContact = body.contact_number !== undefined ? normalize(body.contact_number) : (accounts[idx].contact_number || '');
      var nextRole = body.role !== undefined ? normalize(body.role) : (accounts[idx].role || 'Clinical Instructor');

      accounts[idx] = Object.assign({}, accounts[idx], {
        username: nextUsername,
        password: nextPassword,
        display_name: nextDisplayName,
        profile_photo: nextPhoto,
        contact_number: nextContact,
        role: nextRole
      });
      saveInstructorAccountsInternal(accounts);
      saveLegacyInstructorAuth(accounts[idx].username, accounts[idx].password);
      return { ok: true, account: { id: accounts[idx].id, username: accounts[idx].username, display_name: accounts[idx].display_name, profile_photo: accounts[idx].profile_photo, contact_number: accounts[idx].contact_number, role: accounts[idx].role, created_at: accounts[idx].created_at || '' } };
    },

    async deleteInstructorAccount(accountId) {
      ensureStorage();
      var id = normalize(accountId);
      if (!id) return { ok: false, message: 'Instructor id is required.' };

      var accounts = getInstructorAccountsInternal();
      if (accounts.length <= 1) {
        return { ok: false, message: 'At least one instructor account must remain.' };
      }

      var activeCount = accounts.filter(function (acc) { return !acc.archived; }).length;
      if (activeCount <= 1) {
        return { ok: false, message: 'At least one active instructor account must remain.' };
      }
      var found = false;
      var filtered = accounts.map(function (acc) {
        if (normalize(acc.id) !== id) return acc;
        found = true;
        return Object.assign({}, acc, { archived: true, archived_at: new Date().toISOString() });
      });
      if (!found) {
        return { ok: false, message: 'Instructor not found.' };
      }
      saveInstructorAccountsInternal(filtered);
      var firstActive = filtered.find(function (account) { return !account.archived; });
      if (firstActive) {
        saveLegacyInstructorAuth(firstActive.username, firstActive.password);
      } else {
        saveLegacyInstructorAuth('', '');
      }
      return { ok: true };
    },

    async getInstructorAccount() {
      ensureStorage();
      var accounts = getInstructorAccountsInternal().filter(function (account) {
        return !account.archived;
      });
      var first = accounts[0] || getDefaultInstructorAccount();
      return {
        ok: true,
        instructor: {
          id: first.id,
          username: first.username,
          display_name: first.display_name || first.username
        }
      };
    },

    async saveInstructorAccount(username, password) {
      ensureStorage();
      var nextUsername = normalize(username);
      var nextPassword = normalize(password);
      if (!nextUsername || !nextPassword) {
        return { ok: false, message: 'Instructor username and password are required.' };
      }

      var accounts = getInstructorAccountsInternal();
      if (!accounts.length) {
        accounts = [getDefaultInstructorAccount()];
      }
      accounts[0] = Object.assign({}, accounts[0], {
        username: nextUsername,
        password: nextPassword,
        display_name: accounts[0].display_name || nextUsername
      });
      saveInstructorAccountsInternal(accounts);
      saveLegacyInstructorAuth(accounts[0].username, accounts[0].password);

      return {
        ok: true,
        instructor: {
          id: accounts[0].id,
          username: accounts[0].username,
          display_name: accounts[0].display_name || accounts[0].username
        }
      };
    },

    async validateAdminPin(pin) {
      ensureStorage();
      return matchesAdminPin(pin);
    },

    async addTeacherRemarks(caseId, remarks, checkedBy, instructorId) {
      ensureStorage();
      var id = Number(caseId);
      var text = normalize(remarks);
      var checker = normalize(checkedBy);
      var ownerId = normalize(instructorId);
      var casesList = getCases();
      for (var i = 0; i < casesList.length; i += 1) {
        if (casesList[i].id === id) {
          casesList[i].teacher_remarks = text;
          if (ownerId) {
            casesList[i].instructor_id = ownerId;
          }
          casesList[i].updated_at = new Date().toISOString();
          saveCases(casesList);
          return { ok: true };
        }
      }
      return { ok: false, message: 'Case not found.' };
    },

    async markCasesCheckedBy(studentId, procedureName, caseNumbers, checkedBy, instructorId) {
      ensureStorage();
      var sid = normalize(studentId);
      var pname = canonicalProcedureName(procedureName);
      var checker = normalize(checkedBy);
      var ownerId = normalize(instructorId);
      if (!sid || !checker) return { ok: false, message: 'Missing student/checker.' };

      var targetCases = Array.isArray(caseNumbers) ? caseNumbers.map(function (c) { return normalize(c); }).filter(Boolean) : [];
      var casesList = getCases();
      var changed = 0;
      for (var i = 0; i < casesList.length; i += 1) {
        var rec = casesList[i];
        if (normalize(rec.student_id) !== sid) continue;
        if (pname && canonicalProcedureName(rec.procedure_name) !== pname) continue;
        if (targetCases.length && targetCases.indexOf(normalize(rec.case_no)) === -1) continue;
        rec.checked_by = checker;
        rec.checked_at = new Date().toISOString();
        rec.status = 'Verified';
        if (ownerId) {
          rec.instructor_id = ownerId;
          rec.instructor_name = checker;
        }
        rec.updated_at = new Date().toISOString();
        changed += 1;
      }
      if (changed > 0) {
        saveCases(casesList);
      }
      return { ok: true, updated: changed };
    },

    async updateRecordStatus(caseId, status, options) {
      ensureStorage();
      var id = Number(caseId);
      var nextStatus = normalize(status);
      var body = options || {};
      var allowed = ['Draft', 'Submitted', 'Under Review', 'Changes Requested', 'Resubmitted', 'Verified', 'Invalid', 'Archived'];
      if (allowed.indexOf(nextStatus) === -1) return { ok: false, message: 'Invalid record status.' };
      if ((nextStatus === 'Changes Requested' || nextStatus === 'Invalid') && !normalize(body.remarks)) return { ok: false, message: 'Instructor remarks are required.' };
      var casesList = getCases();
      for (var i = 0; i < casesList.length; i += 1) {
        if (Number(casesList[i].id) !== id) continue;
        var previous = legacyRecordStatus(casesList[i]);
        casesList[i].status = nextStatus;
        casesList[i].teacher_remarks = normalize(body.remarks || casesList[i].teacher_remarks);
        casesList[i].updated_at = new Date().toISOString();
        if (nextStatus === 'Verified') {
          casesList[i].checked_by = normalize(body.instructor_name || body.instructorName);
          casesList[i].checked_at = new Date().toISOString();
          casesList[i].instructor_id = normalize(body.instructor_id || body.instructorId);
        } else {
          casesList[i].checked_by = '';
          casesList[i].checked_at = '';
        }
        saveCases(casesList);
        appendAuditEntry({ action: normalize(body.action) || ('Record ' + nextStatus), record_id: id, user_id: normalize(body.instructor_id || body.instructorId), user_role: 'instructor', previous_status: previous, new_status: nextStatus, remarks: normalize(body.remarks) });
        return { ok: true, record: toCaseRow(casesList[i]) };
      }
      return { ok: false, message: 'Case not found.' };
    },

    async getRecordHistory(caseId) {
      ensureStorage();
      var id = Number(caseId);
      return { ok: true, history: readJson(STORAGE_KEYS.auditTrail, []).filter(function (entry) { return Number(entry.record_id) === id; }) };
    },

    async validateInstructorCredentials(username, password) {
      ensureStorage();
      return matchesInstructorCredentials(username, password);
    },

    async validateInstructorPin(pin) {
      ensureStorage();
      return matchesInstructorCredentials(DEFAULT_INSTRUCTOR_AUTH.username, pin);
    },

    async addNotificationHistory(payload) {
      ensureStorage();
      var body = payload || {};
      var meta = getMeta();
      var history = getNotificationHistory();
      var entry = {
        id: meta.nextNotificationId,
        event_type: normalize(body.event_type || body.eventType),
        student_id: normalize(body.student_id || body.studentId),
        procedure_type: normalize(body.procedure_type || body.procedureType),
        case_no: normalize(body.case_no || body.caseNo),
        message: normalize(body.message),
        remarks: normalize(body.remarks),
        request_id: body.request_id || body.requestId || null,
        created_at: new Date().toISOString(),
        meta: body.meta || null
      };
      history.push(entry);
      saveNotificationHistory(history);
      meta.nextNotificationId += 1;
      saveMeta(meta);
      return { ok: true, notification_id: entry.id };
    },

    async getNotificationHistory(filters) {
      ensureStorage();
      var opts = filters || {};
      var studentId = normalize(opts.student_id || opts.studentId);
      var procedureType = normalize(opts.procedure_type || opts.procedureType);
      var eventType = normalize(opts.event_type || opts.eventType);
      var requestId = opts.request_id || opts.requestId;
      return getNotificationHistory()
        .filter(function (item) {
          if (studentId && normalize(item.student_id) !== studentId) return false;
          if (procedureType && normalize(item.procedure_type) !== procedureType) return false;
          if (eventType && normalize(item.event_type) !== eventType) return false;
          if (requestId != null && String(item.request_id) !== String(requestId)) return false;
          return true;
        })
        .sort(function (a, b) {
          var ta = new Date(a.created_at || 0).getTime();
          var tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
    },

    async sendChatMessage(payload) {
      ensureStorage();
      var body = payload || {};
      var studentId = normalize(body.student_id || body.studentId);
      var message = normalize(body.message);
      var senderRole = normalize(body.sender_role || body.senderRole || 'student').toLowerCase();
      var instructorId = normalize(body.instructor_id || body.instructorId);
      var student = findStudentByPublicId(studentId);

      if (!studentId) {
        return { ok: false, message: 'Student ID is required.' };
      }
      if (!message) {
        return { ok: false, message: 'Message is required.' };
      }
      if (senderRole !== 'student' && senderRole !== 'instructor') {
        senderRole = 'student';
      }

      var meta = getMeta();
      var messages = getChatMessages();
      var entry = {
        id: meta.nextChatMessageId,
        student_id: studentId,
        student_name: normalize(body.student_name || body.studentName) || (student ? student.student_name : ''),
        instructor_id: instructorId,
        instructor_name: normalize(body.instructor_name || body.instructorName),
        sender_role: senderRole,
        sender_name: normalize(body.sender_name || body.senderName) || (senderRole === 'student' ? (student ? student.student_name : 'Student') : 'Instructor'),
        message: message,
        read_by_student: senderRole === 'student',
        read_by_instructor: senderRole === 'instructor',
        created_at: new Date().toISOString()
      };

      messages.push(entry);
      saveChatMessages(messages);
      meta.nextChatMessageId += 1;
      saveMeta(meta);
      return { ok: true, message: entry };
    },

    async getChatMessages(filters) {
      ensureStorage();
      var opts = filters || {};
      var studentId = normalize(opts.student_id || opts.studentId);
      var instructorId = normalize(opts.instructor_id || opts.instructorId);
      return getChatMessages()
        .filter(function (item) {
          if (studentId && normalize(item.student_id) !== studentId) return false;
          if (instructorId && normalize(item.instructor_id) !== instructorId) return false;
          return true;
        })
        .sort(function (a, b) {
          var ta = new Date(a.created_at || 0).getTime();
          var tb = new Date(b.created_at || 0).getTime();
          return ta - tb;
        });
    },

    async getChatThreads(filters) {
      ensureStorage();
      var opts = filters || {};
      var instructorId = normalize(opts.instructor_id || opts.instructorId);
      var threads = {};
      getChatMessages().forEach(function (msg) {
        if (instructorId && normalize(msg.instructor_id) !== instructorId) return;
        var id = normalize(msg.student_id);
        if (!id) return;
        if (!threads[id]) {
          threads[id] = {
            student_id: id,
            student_name: normalize(msg.student_name) || 'Student',
            last_message: '',
            last_at: '',
            unread: 0,
            total: 0
          };
        }
        threads[id].student_name = normalize(msg.student_name) || threads[id].student_name;
        threads[id].last_message = normalize(msg.message);
        threads[id].last_at = msg.created_at || '';
        threads[id].total += 1;
        if (msg.sender_role === 'student' && !msg.read_by_instructor) {
          threads[id].unread += 1;
        }
      });

      return Object.keys(threads)
        .map(function (key) { return threads[key]; })
        .sort(function (a, b) {
          return new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime();
        });
    },

    async markChatRead(studentId, readerRole) {
      ensureStorage();
      var id = normalize(studentId);
      var role = normalize(readerRole).toLowerCase();
      var messages = getChatMessages();
      var changed = false;
      messages.forEach(function (msg) {
        if (normalize(msg.student_id) !== id) return;
        if (role === 'student' && !msg.read_by_student) {
          msg.read_by_student = true;
          changed = true;
        }
        if (role === 'instructor' && !msg.read_by_instructor) {
          msg.read_by_instructor = true;
          changed = true;
        }
      });
      if (changed) {
        saveChatMessages(messages);
      }
      return { ok: true };
    },

    async getUnreadChatCount(readerRole, studentId) {
      ensureStorage();
      var role = normalize(readerRole).toLowerCase();
      var id = normalize(studentId);
      return getChatMessages().filter(function (msg) {
        if (id && normalize(msg.student_id) !== id) return false;
        if (role === 'student') return msg.sender_role === 'instructor' && !msg.read_by_student;
        if (role === 'instructor') return msg.sender_role === 'student' && !msg.read_by_instructor;
        return false;
      }).length;
    },

    async getStudentCaseCount(studentId) {
      ensureStorage();
      var id = normalize(studentId);
      var count = getCases().filter(function (rec) {
        return normalize(rec.student_id) === id;
      }).length;
      return count;
    },

    async getStudentSummaryByName(namePart) {
      ensureStorage();
      var query = normalize(namePart).toLowerCase();
      if (!query) {
        return [];
      }

      var students = getStudents();
      var casesList = getCases();

      return students
        .filter(function (student) {
          return normalize(student.student_name).toLowerCase().indexOf(query) !== -1;
        })
        .map(function (student) {
          var studentCases = casesList.filter(function (rec) {
            return normalize(rec.student_id) === normalize(student.student_id);
          });
          var procedureMap = {};
          for (var i = 0; i < studentCases.length; i += 1) {
            var pname = normalize(studentCases[i].procedure_name);
            if (pname) procedureMap[pname] = true;
          }
          return {
            student_id: student.student_id,
            student_name: student.student_name,
            total_cases: studentCases.length,
            procedures: Object.keys(procedureMap)
          };
        })
        .sort(function (a, b) {
          return normalize(a.student_name).localeCompare(normalize(b.student_name));
        });
    },

    async getSchoolYears() {
      ensureStorage();
      return {
        ok: true,
        school_years: getAllSchoolYears().map(function (label) {
          var blocks = getStudentBlocks().filter(function (block) {
            return normalizeSchoolYearRange(block.school_year || '') === label;
          });
          var blockIds = blocks.map(function (block) {
            return normalize(block.id);
          });
          var studentCount = getStudents().filter(function (student) {
            var assignedBlockId = getStudentBlockAssignment(student, label);
            return !student.archived &&
              isStudentRegisteredForYear(student, label) &&
              !!assignedBlockId &&
              blockIds.indexOf(normalize(assignedBlockId)) !== -1;
          }).length;
          return {
            label: label,
            block_count: blocks.length,
            student_count: studentCount
          };
        })
      };
    },

    async createSchoolYear(value) {
      ensureStorage();
      var label = normalizeSchoolYearRange(value);
      if (!label) {
        return { ok: false, message: 'School year must be consecutive, for example 2025-2026.' };
      }
      var years = getSchoolYearsStored();
      if (years.some(function (year) { return normalizeSchoolYearRange(year) === label; })) {
        return { ok: true, school_year: label, already_existed: true };
      }
      if (getAllSchoolYears().indexOf(label) !== -1) {
        ensureSchoolYearStored(label);
        return { ok: true, school_year: label, already_existed: true };
      }
      years.push(label);
      years.sort(function (a, b) {
        return Number(b.split('-')[0]) - Number(a.split('-')[0]);
      });
      saveSchoolYears(years);
      return { ok: true, school_year: label };
    },

    async getStudentBlocks(schoolYear) {
      ensureStorage();
      var sy = normalizeSchoolYearRange(schoolYear);
      var blocks = getStudentBlocks().filter(function (block) {
        if (!sy) return true;
        return normalizeSchoolYearRange(block.school_year || '') === sy;
      }).sort(function (a, b) {
        return normalize(a.label).localeCompare(normalize(b.label));
      });
      return {
        ok: true,
        school_year: sy,
        blocks: blocks.map(function (block) {
          return {
            id: block.id,
            label: block.label,
            school_year: normalizeSchoolYearRange(block.school_year || '') || sy,
            created_by: block.created_by || '',
            created_at: block.created_at || '',
            student_count: getStudentsInBlock(block.id, sy || block.school_year).length
          };
        })
      };
    },

    async createStudentBlock(label, createdBy, schoolYear) {
      ensureStorage();
      var nextLabel = normalize(label);
      var sy = normalizeSchoolYearRange(schoolYear);
      if (!nextLabel) {
        return { ok: false, message: 'Block label is required.' };
      }
      if (!sy) {
        return { ok: false, message: 'A valid school year is required (for example 2025-2026).' };
      }
      var blocks = getStudentBlocks();
      var exists = blocks.some(function (block) {
        return normalizeSchoolYearRange(block.school_year || '') === sy &&
          normalize(block.label).toLowerCase() === nextLabel.toLowerCase();
      });
      if (exists) {
        return { ok: false, message: 'A block with this label already exists for this school year.' };
      }
      var years = getSchoolYearsStored();
      if (!years.some(function (year) { return normalizeSchoolYearRange(year) === sy; })) {
        years.push(sy);
        years.sort(function (a, b) {
          return Number(b.split('-')[0]) - Number(a.split('-')[0]);
        });
        saveSchoolYears(years);
      }
      var block = {
        id: 'blk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        label: nextLabel,
        school_year: sy,
        created_by: normalize(createdBy) || 'system',
        created_at: new Date().toISOString()
      };
      blocks.push(block);
      saveStudentBlocks(blocks);
      return { ok: true, block: block };
    },

    async updateStudentBlockLabel(blockId, label) {
      ensureStorage();
      var id = normalize(blockId);
      var nextLabel = normalize(label);
      if (!id) {
        return { ok: false, message: 'Block not found.' };
      }
      if (!nextLabel) {
        return { ok: false, message: 'Block label is required.' };
      }
      var blocks = getStudentBlocks();
      var idx = -1;
      for (var i = 0; i < blocks.length; i += 1) {
        if (normalize(blocks[i].id) === id) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        return { ok: false, message: 'Block not found.' };
      }
      var blockYear = normalizeSchoolYearRange(blocks[idx].school_year || '');
      var duplicate = blocks.some(function (block, index) {
        return index !== idx &&
          normalizeSchoolYearRange(block.school_year || '') === blockYear &&
          normalize(block.label).toLowerCase() === nextLabel.toLowerCase();
      });
      if (duplicate) {
        return { ok: false, message: 'A block with this label already exists for this school year.' };
      }
      blocks[idx] = Object.assign({}, blocks[idx], { label: nextLabel });
      saveStudentBlocks(blocks);
      return { ok: true, block: blocks[idx] };
    },

    async deleteStudentBlock(blockId) {
      return { ok: false, message: 'Permanent block deletion is disabled. Keep the block for historical records.' };
    },

    async assignStudentToBlock(studentId, blockId, schoolYear) {
      ensureStorage();
      var sid = normalize(studentId);
      var bid = normalize(blockId);
      var sy = normalizeSchoolYearRange(schoolYear);
      if (!sy) {
        return { ok: false, message: 'School year is required.' };
      }
      var student = findStudentByPublicId(sid);
      if (!student) {
        return { ok: false, message: 'Student not found.' };
      }
      var block = findStudentBlockById(bid);
      if (!block) {
        return { ok: false, message: 'Block not found.' };
      }
      if (normalizeSchoolYearRange(block.school_year || '') !== sy) {
        return { ok: false, message: 'Block does not belong to the selected school year.' };
      }
      if (isStudentRegisteredForYear(student, sy) && getStudentBlockAssignment(student, sy) && getStudentBlockAssignment(student, sy) !== bid) {
        return { ok: false, message: 'Student is already assigned to another block for this school year.' };
      }
      var students = getStudents();
      students = students.map(function (item) {
        if (normalize(item.student_id) === sid) {
          return setStudentEnrollmentRecord(item, sy, bid);
        }
        return item;
      });
      saveStudents(students);
      return { ok: true };
    },

    async removeStudentFromBlock(studentId, schoolYear) {
      ensureStorage();
      var sid = normalize(studentId);
      var sy = normalizeSchoolYearRange(schoolYear);
      if (!sy) {
        return { ok: false, message: 'School year is required.' };
      }
      var students = getStudents();
      var changed = false;
      students = students.map(function (item) {
        if (normalize(item.student_id) === sid && getStudentBlockAssignment(item, sy)) {
          changed = true;
          return setStudentEnrollmentRecord(item, sy, '');
        }
        return item;
      });
      if (!changed) {
        return { ok: false, message: 'Student is not assigned to a block for this school year.' };
      }
      saveStudents(students);
      return { ok: true };
    },

    async getBlockStudents(blockId, schoolYear) {
      ensureStorage();
      var block = findStudentBlockById(blockId);
      if (!block) {
        return { ok: false, message: 'Block not found.', students: [] };
      }
      var sy = normalizeSchoolYearRange(schoolYear || block.school_year || '');
      return {
        ok: true,
        block: {
          id: block.id,
          label: block.label,
          school_year: sy
        },
        students: getStudentsInBlock(block.id, sy).map(function (student) {
          var enrollment = getStudentEnrollmentForYear(student, sy) || {};
          return {
            student_id: student.student_id,
            student_name: student.student_name,
            parent_name: student.parent_name || '',
            contact_number: student.contact_number || '',
            registered_school_year: sy,
            registered_at: enrollment.registered_at || student.created_at || ''
          };
        })
      };
    },

    async archiveStudent(studentId) {
      ensureStorage();
      var sid = normalize(studentId);
      var students = getStudents();
      var found = false;
      students = students.map(function (student) {
        if (normalize(student.student_id) !== sid) return student;
        found = true;
        return Object.assign({}, student, {
          archived: true,
          archived_at: new Date().toISOString()
        });
      });
      if (!found) return { ok: false, message: 'Student not found.' };
      saveStudents(students);
      return { ok: true };
    },

    async restoreStudent(studentId) {
      ensureStorage();
      var sid = normalize(studentId);
      var students = getStudents();
      var found = false;
      students = students.map(function (student) {
        if (normalize(student.student_id) !== sid) return student;
        found = true;
        var restored = Object.assign({}, student, { archived: false });
        delete restored.archived_at;
        return restored;
      });
      if (!found) return { ok: false, message: 'Archived student not found.' };
      saveStudents(students);
      return { ok: true };
    },

    async getArchivedStudents() {
      ensureStorage();
      return {
        ok: true,
        students: getStudents()
          .filter(function (student) { return !!student.archived; })
          .map(function (student) {
            return {
              student_id: student.student_id,
              student_name: student.student_name,
              parent_name: student.parent_name || '',
              contact_number: student.contact_number || '',
              archived_at: student.archived_at || ''
            };
          })
      };
    },

    async getUnassignedStudents(schoolYear) {
      ensureStorage();
      var sy = normalizeSchoolYearRange(schoolYear);
      if (!sy) {
        return { ok: false, message: 'School year is required.', students: [] };
      }
      return {
        ok: true,
        students: getStudents()
          .filter(function (student) {
            if (isStudentRegisteredForYear(student, sy)) {
              return !getStudentBlockAssignment(student, sy);
            }
            return true;
          })
          .map(function (student) {
            return {
              student_id: student.student_id,
              student_name: student.student_name
            };
          })
          .sort(function (a, b) {
            return normalize(a.student_name).localeCompare(normalize(b.student_name));
          })
      };
    },

    async registerStudentInBlock(blockId, schoolYear, payload) {
      ensureStorage();
      payload = payload || {};
      var bid = normalize(blockId);
      var sy = normalizeSchoolYearRange(schoolYear);
      var block = findStudentBlockById(bid);
      if (!block) {
        return { ok: false, message: 'Block not found.' };
      }
      if (sy && normalizeSchoolYearRange(block.school_year || '') !== sy) {
        return { ok: false, message: 'Block does not belong to the selected school year.' };
      }
      var yearLabel = sy || normalizeSchoolYearRange(block.school_year || '');
      return ApiClient.registerStudent(
        payload.student_id,
        payload.student_name,
        payload.password,
        payload.parent_name,
        payload.contact_number,
        {
          school_year: yearLabel,
          block_id: bid
        }
      );
    },

    async clearCaseDataOnly() {
      ensureStorage();
      var now = new Date().toISOString();
      var allCases = readJson(STORAGE_KEYS.cases, []).map(function (item) {
        return Object.assign({}, item, { archived: true, archived_at: item.archived_at || now });
      });
      saveCases(allCases);
      return { ok: true, archived: allCases.length };
    }
  };

  var SessionCache = {
    prefix: 'thesis_cache_',

    set: function (key, value, ttlSeconds) {
      var ttl = Number(ttlSeconds || 300) * 1000;
      var payload = {
        value: value,
        timestamp: Date.now(),
        ttl: ttl
      };
      sessionStorage.setItem(this.prefix + key, JSON.stringify(payload));
    },

    get: function (key) {
      var item = sessionStorage.getItem(this.prefix + key);
      if (!item) return null;

      try {
        var parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > parsed.ttl) {
          sessionStorage.removeItem(this.prefix + key);
          return null;
        }
        return parsed.value;
      } catch (err) {
        sessionStorage.removeItem(this.prefix + key);
        return null;
      }
    },

    clear: function () {
      var keys = Object.keys(sessionStorage).filter(function (k) {
        return k.indexOf(SessionCache.prefix) === 0;
      });
      keys.forEach(function (k) {
        sessionStorage.removeItem(k);
      });
    }
  };

  var AuthHelper = {
    currentStudent: null,

    setCurrentStudent: function (student) {
      this.currentStudent = student || null;
      if (student) {
        sessionStorage.setItem('currentStudent', JSON.stringify(student));
      } else {
        sessionStorage.removeItem('currentStudent');
      }
    },

    getCurrentStudent: function () {
      if (!this.currentStudent) {
        var stored = sessionStorage.getItem('currentStudent');
        if (stored) {
          try {
            this.currentStudent = JSON.parse(stored);
          } catch (err) {
            this.currentStudent = null;
            sessionStorage.removeItem('currentStudent');
          }
        }
      }
      return this.currentStudent;
    },

    getCurrentStudentId: function () {
      var student = this.getCurrentStudent();
      return student ? student.student_id : null;
    },

    clearSession: function () {
      this.currentStudent = null;
      sessionStorage.removeItem('currentStudent');
      localStorage.removeItem('currentStudentId');
    }
  };

  var SchemaDB = {
    migrateLegacyData: function () {
      ensureStorage();
      return true;
    },

    registerStudent: function (payload) {
      payload = payload || {};
      return ApiClient.registerStudent(
        payload.student_id,
        payload.student_name,
        payload.password,
        payload.parent_name,
        payload.contact_number
      );
    },

    authenticateStudent: function (studentId, password) {
      var student = findStudentByPublicId(studentId);
      if (!student) return null;
      if (normalize(student.password) !== normalize(password)) return null;
      return {
        id: student.id,
        student_id: student.student_id,
        student_name: student.student_name,
        parent_name: student.parent_name || '',
        contact_number: student.contact_number || ''
      };
    },

    authenticateInstructor: function (username, password) {
      ensureStorage();
      if (arguments.length === 1) {
        return matchesInstructorCredentials(DEFAULT_INSTRUCTOR_AUTH.username, username);
      }
      return matchesInstructorCredentials(username, password);
    },

    getInstructorAccount: function () {
      ensureStorage();
      var stored = getStoredInstructorAuth();
      return {
        ok: true,
        instructor: {
          username: stored.username
        }
      };
    },

    saveInstructorAccount: function (username, password) {
      ensureStorage();
      var nextUsername = normalize(username);
      var nextPassword = normalize(password);
      if (!nextUsername || !nextPassword) {
        return { ok: false, message: 'Instructor username and password are required.' };
      }
      writeJson(STORAGE_KEYS.instructorAuth, {
        username: nextUsername,
        password: nextPassword
      });
      return {
        ok: true,
        instructor: {
          username: nextUsername
        }
      };
    },

    validateAdminPin: function (pin) {
      ensureStorage();
      return matchesAdminPin(pin);
    },

    getStudentByPublicId: function (studentId) {
      var student = findStudentByPublicId(studentId);
      if (!student) return null;
      return {
        id: student.id,
        student_id: student.student_id,
        student_name: student.student_name,
        parent_name: student.parent_name || '',
        contact_number: student.contact_number || ''
      };
    },

    updateStudentName: function (studentId, newName) {
      var id = normalize(studentId);
      var name = normalize(newName);
      if (!id || !name) return false;
      var students = getStudents();
      for (var i = 0; i < students.length; i += 1) {
        if (normalize(students[i].student_id) === id) {
          students[i].student_name = name;
          saveStudents(students);
          return true;
        }
      }
      return false;
    },

    saveCaseRecord: function (payload) {
      payload = payload || {};
      var student = findStudentByPublicId(payload.student_id);
      if (!student) {
        return { ok: false, message: 'Student not found.' };
      }

      var meta = getMeta();
      var casesList = getCases();
      casesList.push({
        id: meta.nextCaseId,
        student_id: student.student_id,
        student_name: student.student_name,
        instructor_id: normalize(payload.instructor_id),
        instructor_name: normalize(payload.instructor_name),
        procedure_name: canonicalProcedureName(payload.procedure_name),
        case_no: normalize(payload.case_no),
        academic_year: normalize(payload.academic_year),
        complete_diagnosis: normalize(payload.complete_diagnosis),
        date_time_performed: normalize(payload.date_time_performed),
        patient_name: normalize(payload.patient_name),
        patient_address: normalize(payload.patient_address),
        facility_name: normalize(payload.facility_name),
        facility_address: normalize(payload.facility_address),
        facility_contact_number: normalize(payload.facility_contact_number),
        supervisor_printed_name: normalize(payload.supervisor_printed_name),
        supervisor_contact_number: normalize(payload.supervisor_contact_number),
        supervisor_position_designation: normalize(payload.supervisor_position_designation),
        supervisor_license_no: normalize(payload.supervisor_license_no),
        supervisor_license_expiry_date: normalize(payload.supervisor_license_expiry_date),
        teacher_remarks: normalize(payload.teacher_remarks),
        checked_by: normalize(payload.checked_by),
        checked_at: normalize(payload.checked_at),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      saveCases(casesList);
      meta.nextCaseId += 1;
      saveMeta(meta);
      return { ok: true };
    },

    getJoinedCases: function (filter) {
      filter = filter || {};
      var studentId = normalize(filter.student_id || localStorage.getItem('currentStudentId'));
      var procedureName = canonicalProcedureName(filter.procedure_name);
      var searchTerm = normalize(filter.searchTerm).toLowerCase();

      return getCases()
        .filter(function (rec) { return normalize(rec.student_id) === studentId; })
        .filter(function (rec) { return matchCaseFilters(rec, procedureName, searchTerm); })
        .sort(function (a, b) { return b.id - a.id; })
        .map(toCaseRow);
    },

    getStudentCaseCount: function (studentId) {
      var id = normalize(studentId);
      return getCases().filter(function (rec) {
        return normalize(rec.student_id) === id;
      }).length;
    },

    getStudentSummaryByName: function (namePart) {
      var query = normalize(namePart).toLowerCase();
      if (!query) return [];
      var students = getStudents();
      var casesList = getCases();
      return students
        .filter(function (student) {
          return normalize(student.student_name).toLowerCase().indexOf(query) !== -1;
        })
        .map(function (student) {
          var studentCases = casesList.filter(function (rec) {
            return normalize(rec.student_id) === normalize(student.student_id);
          });
          var names = {};
          studentCases.forEach(function (rec) {
            var pname = canonicalProcedureName(rec.procedure_name);
            if (pname) names[pname] = true;
          });
          return {
            student_id: student.student_id,
            student_name: student.student_name,
            total_cases: studentCases.length,
            procedures: Object.keys(names)
          };
        });
    },

    validateInstructorCredentials: function (username, password) {
      ensureStorage();
      return matchesInstructorCredentials(username, password);
    },

    validateInstructorPin: function (pin) {
      ensureStorage();
      return matchesInstructorCredentials(DEFAULT_INSTRUCTOR_AUTH.username, pin);
    },

    clearCaseDataOnly: function () {
      ApiClient.clearCaseDataOnly();
    }
  };

  function mapRecordStatus(value) {
    var raw = normalize(value).toLowerCase();
    if (!raw) return '';
    if (raw === 'verified') return 'Verified';
    if (raw === 'reviewed' || raw === 'under review') return 'Under Review';
    if (raw === 'needs_revision' || raw === 'changes requested') return 'Changes Requested';
    if (raw === 'resubmitted') return 'Resubmitted';
    if (raw === 'invalid') return 'Invalid';
    if (raw === 'archived') return 'Archived';
    if (raw === 'draft') return 'Draft';
    if (raw === 'submitted') return 'Submitted';
    return normalize(value);
  }

  function fromApiCaseRow(record) {
    var status = record.status || mapRecordStatus(record.record_status);
    if (!status && record.checked_by) status = 'Verified';
    if (!status) status = 'Submitted';
    return {
      id: record.id,
      student_id: record.student_id,
      student_name: record.student_name,
      instructor_id: record.instructor_uid || record.instructor_id || '',
      instructor_name: record.instructor_name || '',
      patient_name: record.patient_name || '',
      patient_address: record.patient_address || '',
      case_no: record.case_no || '',
      academic_year: record.academic_year || '',
      school_year: record.academic_year || '',
      complete_diagnosis: record.complete_diagnosis || '',
      date_time_performed: record.date_time_performed || '',
      facility_name: record.facility_name || '',
      facility_address: record.facility_address || '',
      facility_contact_number: record.facility_contact_number || '',
      supervisor_printed_name: record.supervisor_printed_name || '',
      supervisor_contact_number: record.supervisor_contact_number || '',
      supervisor_position_designation: record.supervisor_position_designation || '',
      supervisor_license_no: record.supervisor_license_no || '',
      supervisor_license_expiry_date: record.supervisor_license_expiry_date || '',
      procedure_name: record.procedure_name || record.procedure_key || '',
      procedure_key: record.procedure_key || canonicalProcedureName(record.procedure_name),
      teacher_remarks: record.teacher_remarks || '',
      checked_by: record.checked_by || '',
      checked_at: record.checked_at || '',
      status: status,
      submitted_at: record.created_at || record.submitted_at || ''
    };
  }

  function filterApiCases(rows, procedureName, searchTerm) {
    var procedure = canonicalProcedureName(procedureName);
    var term = normalize(searchTerm).toLowerCase();
    return (rows || [])
      .map(fromApiCaseRow)
      .filter(function (record) {
        if (procedure && canonicalProcedureName(record.procedure_key || record.procedure_name) !== procedure) {
          return false;
        }
        if (!term) return true;
        return createSearchBlob(record).indexOf(term) !== -1;
      })
      .sort(function (a, b) { return Number(b.id) - Number(a.id); });
  }

  async function syncLegacyCasesToApi(studentId) {
    // Legacy data is migrated explicitly through migrate-local-to-mysql.php.
    // Never import browser records silently during normal application use.
    return;
    /* istanbul ignore next */
    var sid = normalize(studentId);
    var syncKey = 'thesis_cases_synced_v1' + (sid ? '_' + sid : '');
    if (localStorage.getItem(syncKey)) return;
    if (!sessionStorage.getItem('thesis_api_token')) return;

    var legacyCases = readJson(STORAGE_KEYS.cases, []).filter(function (rec) {
      if (rec.archived) return false;
      if (sid && normalize(rec.student_id) !== sid) return false;
      return !!normalize(rec.student_id) && !!canonicalProcedureName(rec.procedure_name);
    });
    if (!legacyCases.length) {
      localStorage.setItem(syncKey, '1');
      return;
    }

    for (var i = 0; i < legacyCases.length; i += 1) {
      var rec = legacyCases[i];
      try {
        await mysqlRequest('cases', {
          method: 'POST',
          body: JSON.stringify({
            student_id: rec.student_id,
            procedure_key: canonicalProcedureName(rec.procedure_name),
            academic_year: rec.academic_year || rec.school_year || getCurrentSchoolYearLabel(),
            case_no: rec.case_no || null,
            complete_diagnosis: rec.complete_diagnosis || null,
            date_time_performed: rec.date_time_performed || null,
            patient_name: rec.patient_name || null,
            patient_address: rec.patient_address || null,
            facility_name: rec.facility_name || null,
            facility_address: rec.facility_address || null,
            facility_contact_number: rec.facility_contact_number || null,
            supervisor_printed_name: rec.supervisor_printed_name || null,
            supervisor_contact_number: rec.supervisor_contact_number || null,
            supervisor_position_designation: rec.supervisor_position_designation || null,
            supervisor_license_no: rec.supervisor_license_no || null,
            supervisor_license_expiry_date: rec.supervisor_license_expiry_date || null,
            instructor_uid: rec.instructor_id || null,
            instructor_name: rec.instructor_name || null
          })
        });
      } catch (err) {
        // Ignore individual migration failures (duplicate rows, missing student, etc.).
      }
    }
    localStorage.setItem(syncKey, '1');
  }

  // MySQL-backed API overrides. Browser storage is never a business-data source.
  async function mysqlRequest(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var token = sessionStorage.getItem('thesis_api_token') || '';
    if (token) headers.Authorization = 'Bearer ' + token;
    var apiBase = location.protocol === 'file:' ? 'http://localhost/THESIS6/api/' : 'api/';
    var response = await fetch(apiBase + path, Object.assign({}, options, { headers: headers, cache: 'no-store' }));
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.message || 'Database request failed.');
    return result;
  }

  async function mysqlLogin(role, credentials) {
    try {
      var result = await mysqlRequest('auth/' + role, { method: 'POST', body: JSON.stringify(credentials) });
      if (result.token) sessionStorage.setItem('thesis_api_token', result.token);
      return result;
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  ApiClient.apiUrl = location.protocol === 'file:' ? 'http://localhost/THESIS6/api' : 'api';
  ApiClient.storageMode = 'mysql-only';
  ApiClient.request = mysqlRequest;
  ApiClient.ensureSchema = async function () { return mysqlRequest('health'); };
  ApiClient.authenticateStudent = async function (studentId, password) {
    var result = await mysqlLogin('student', { student_id: normalize(studentId), password: normalize(password) });
    return result.ok ? { ok: true, student: result.user } : result;
  };
  ApiClient.authenticateInstructor = async function (username, password) {
    var result = await mysqlLogin('instructor', { username: normalize(username), password: normalize(password) });
    return result.ok ? { ok: true, instructor: result.user } : result;
  };
  ApiClient.authenticateAdmin = async function (pin) {
    return mysqlLogin('admin', { pin_number: normalize(pin) });
  };
  ApiClient.getSchoolYears = async function () {
    var result;
    try { result = await mysqlRequest('school-years'); }
    catch (error) { result = await mysqlRequest('school-year-directory'); }
    return { ok: true, school_years: result.years || [] };
  };
  ApiClient.createSchoolYear = async function (value) {
    try { return await mysqlRequest('school-years', { method: 'POST', body: JSON.stringify({ label: normalize(value) }) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.getStudentBlocks = async function (schoolYear) {
    var query='school_year='+encodeURIComponent(normalize(schoolYear));
    try { return await mysqlRequest('blocks?' + query); }
    catch (error) { return mysqlRequest('block-directory?' + query); }
  };
  ApiClient.createStudentBlock = async function (label, createdBy, schoolYear) {
    try { return await mysqlRequest('blocks', { method: 'POST', body: JSON.stringify({ label: normalize(label), school_year: normalize(schoolYear) }) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.updateStudentBlockLabel = async function (blockId, label) {
    try { return await mysqlRequest('blocks/' + encodeURIComponent(blockId), { method: 'PATCH', body: JSON.stringify({ label: normalize(label) }) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.getBlockStudents = async function (blockId, schoolYear) {
    var query='block_id='+encodeURIComponent(blockId)+'&school_year='+encodeURIComponent(normalize(schoolYear));
    try { return await mysqlRequest('assignments?' + query); }
    catch (error) { return mysqlRequest('assignment-directory?' + query); }
  };
  ApiClient.getAllAssignedStudents = async function () {
    try { return await mysqlRequest('assignments'); }
    catch (error) { return mysqlRequest('assignment-directory'); }
  };
  ApiClient.saveCaseRecord = async function (studentId, procedureName, caseData) {
    try {
      caseData = caseData || {};
      var student = findStudentByPublicId(studentId);
      var activeYear = normalizeSchoolYearRange(caseData.academic_year) ||
        (student ? getStudentActiveSchoolYear(student) : getCurrentSchoolYearLabel());
      var result = await mysqlRequest('cases', {
        method: 'POST',
        body: JSON.stringify({
          student_id: normalize(studentId),
          procedure_key: canonicalProcedureName(procedureName),
          academic_year: activeYear || null,
          instructor_uid: normalize(caseData.instructor_id),
          instructor_name: normalize(caseData.instructor_name),
          case_no: normalize(caseData.case_no) || null,
          complete_diagnosis: normalize(caseData.complete_diagnosis) || null,
          date_time_performed: normalize(caseData.date_time_performed) || null,
          patient_name: normalize(caseData.patient_name) || null,
          patient_address: normalize(caseData.patient_address) || null,
          facility_name: normalize(caseData.facility_name) || null,
          facility_address: normalize(caseData.facility_address) || null,
          facility_contact_number: normalize(caseData.facility_contact_number) || null,
          supervisor_printed_name: normalize(caseData.supervisor_printed_name) || null,
          supervisor_contact_number: normalize(caseData.supervisor_contact_number) || null,
          supervisor_position_designation: normalize(caseData.supervisor_position_designation) || null,
          supervisor_license_no: normalize(caseData.supervisor_license_no) || null,
          supervisor_license_expiry_date: normalize(caseData.supervisor_license_expiry_date) || null
        })
      });
      return { ok: !!result.ok, case_id: result.id, message: result.message };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  };
  ApiClient.getJoinedCases = async function (studentId, procedureName, searchTerm) {
    var query = 'cases';
    if (normalize(studentId)) {
      query += '?student_id=' + encodeURIComponent(normalize(studentId));
    }
    var result = await mysqlRequest(query);
    return filterApiCases(result.cases || [], procedureName, searchTerm);
  };
  ApiClient.deleteCaseRecord = async function (studentId, caseId) {
    try {
      var result = await mysqlRequest('cases/' + encodeURIComponent(caseId) + '/archive', {
        method: 'PATCH',
        body: '{}'
      });
      return { ok: !!result.ok, message: result.message };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  };
  ApiClient.restoreCaseRecord = async function (studentId, caseId) {
    try {
      var result = await mysqlRequest('cases/' + encodeURIComponent(caseId) + '/restore', {
        method: 'PATCH',
        body: '{}'
      });
      return { ok: !!result.ok, message: result.message };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  };
  ApiClient.permanentlyDeleteCaseRecord = async function (studentId, caseId) {
    try {
      var result = await mysqlRequest('cases/' + encodeURIComponent(caseId), { method: 'DELETE' });
      return { ok: !!result.ok, message: result.message };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  };
  ApiClient.getStudentCaseCount = async function (studentId) {
    var rows = await ApiClient.getJoinedCases(studentId, '', '');
    return rows.length;
  };
  ApiClient.getAllCasesForInstructor = async function (procedureName, searchTerm) {
    var result = await mysqlRequest('cases');
    return filterApiCases(result.cases || [], procedureName, searchTerm);
  };
  ApiClient.getUnassignedStudents = async function (schoolYear) {
    return mysqlRequest('assignments?unassigned=1&school_year=' + encodeURIComponent(normalize(schoolYear)));
  };
  ApiClient.assignStudentToBlock = async function (studentId, blockId) {
    try { return await mysqlRequest('assignments', { method: 'POST', body: JSON.stringify({ student_id: normalize(studentId), block_id: blockId }) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.removeStudentFromBlock = async function (studentId) {
    // Legacy compatibility: removing a student now means pausing and archiving
    // the account, never silently removing only the block assignment.
    return ApiClient.archiveStudent(studentId);
  };
  ApiClient.registerStudentInBlock = async function (blockId, schoolYear, payload) {
    try {
      await mysqlRequest('students', { method: 'POST', body: JSON.stringify(payload || {}) });
      return await ApiClient.assignStudentToBlock(payload.student_id, blockId, schoolYear);
    } catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.archiveStudent = async function (studentId) {
    try { return await mysqlRequest('students/' + encodeURIComponent(studentId) + '/archive', { method: 'PATCH', body: '{}' }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.restoreStudent = async function (studentId) {
    try { return await mysqlRequest('students/' + encodeURIComponent(studentId) + '/restore', { method: 'PATCH', body: '{}' }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.getArchivedStudents = async function () {
    return mysqlRequest('students?archived=1');
  };
  ApiClient.getAllStudents = async function () {
    return mysqlRequest('students');
  };
  ApiClient.getStudent = async function (studentId) {
    try{return await mysqlRequest('students/'+encodeURIComponent(normalize(studentId)));}catch(error){return {ok:false,student:null,message:error.message};}
  };
  ApiClient.updateStudent = async function (studentId,payload) {
    try{return await mysqlRequest('students/'+encodeURIComponent(normalize(studentId)),{method:'PATCH',body:JSON.stringify(payload||{})});}catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.getSyncState = async function () {
    return mysqlRequest('sync-state');
  };
  ApiClient.getInstructorAccounts = async function () {
    try { return await mysqlRequest('instructors'); }
    catch (error) { return mysqlRequest('instructor-directory'); }
  };
  ApiClient.createInstructorAccount = async function (username, password, displayName) {
    try { return await mysqlRequest('instructors', { method: 'POST', body: JSON.stringify({ username: username, password: password, display_name: displayName }) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.updateInstructorAccount = async function (accountId, payload) {
    try { return await mysqlRequest('instructors/' + encodeURIComponent(accountId), { method: 'PATCH', body: JSON.stringify(payload || {}) }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.setInstructorStatus = async function (accountId, status) {
    var next=normalize(status).toLowerCase();
    if (next!=='active'&&next!=='inactive') return {ok:false,message:'Invalid instructor status.'};
    return ApiClient.updateInstructorAccount(accountId,{status:next});
  };
  ApiClient.deleteInstructorAccount = async function (accountId) {
    try { return await mysqlRequest('instructors/' + encodeURIComponent(accountId) + '/archive', { method: 'PATCH', body: '{}' }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.getArchivedInstructorAccounts = async function () { return mysqlRequest('instructors?archived=1'); };
  ApiClient.restoreInstructorAccount = async function (accountId) {
    try { return await mysqlRequest('instructors/' + encodeURIComponent(accountId) + '/restore', { method: 'PATCH', body: '{}' }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.getArchivedCaseRecords = async function (studentId) {
    var query='cases?archived=1';
    if (normalize(studentId)) query += '&student_id=' + encodeURIComponent(normalize(studentId));
    var result=await mysqlRequest(query);return result.cases||[];
  };
  ApiClient.requestEditApproval = async function (studentId, procedureName, caseNumbers) {
    try {
      var key=canonicalProcedureName(procedureName);
      var result=await mysqlRequest('edit-requests',{method:'POST',body:JSON.stringify({procedure_key:key,procedure_name:procedureName||key,case_numbers:Array.isArray(caseNumbers)?caseNumbers:[]})});
      return {ok:!!result.ok,request_id:result.id,message:result.message};
    } catch(error) { return {ok:false,message:error.message}; }
  };
  ApiClient.getPendingEditRequests = async function () {
    var result=await mysqlRequest('edit-requests');
    return (result.requests||[]).filter(function(r){return r.status==='pending';}).map(function(r){
      return Object.assign({},r,{studentId:r.student_id,type:r.procedure_key,caseNumbers:typeof r.case_numbers==='string'?JSON.parse(r.case_numbers||'[]'):r.case_numbers,requestedAt:r.requested_at});
    });
  };
  ApiClient.getEditRequests = async function () {
    var result=await mysqlRequest('edit-requests');
    return (result.requests||[]).map(function(r){var numbers=r.case_numbers;if(typeof numbers==='string'){try{numbers=JSON.parse(numbers||'[]');}catch(e){numbers=[];}}numbers=Array.isArray(numbers)?numbers:[];return Object.assign({},r,{studentId:r.student_id,type:r.procedure_key,procedureKey:r.procedure_key,procedure:r.procedure_name,caseNumbers:numbers,caseNo:numbers[0]||'',caseKey:String(r.id),requestedAt:r.requested_at});});
  };
  ApiClient.archiveEditRequest = async function (requestId) {
    try{return await mysqlRequest('edit-requests/'+encodeURIComponent(requestId)+'/archive',{method:'PATCH',body:'{}'});}catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.cancelEditRequest = async function (requestId) {
    return ApiClient.archiveEditRequest(requestId);
  };
  ApiClient.approveEditRequest = async function (requestId) {
    try { return await mysqlRequest('edit-requests/'+encodeURIComponent(requestId)+'/approve',{method:'PATCH',body:'{}'}); }
    catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.rejectEditRequest = async function (requestId, remarks) {
    try { return await mysqlRequest('edit-requests/'+encodeURIComponent(requestId)+'/reject',{method:'PATCH',body:JSON.stringify({remarks:remarks||''})}); }
    catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.getNotificationHistory = async function (filters) {
    var result=await mysqlRequest('notifications');var list=result.notifications||[];var f=filters||{};
    return list.filter(function(n){
      if ((f.student_id||f.studentId) && String(n.student_id)!==String(f.student_id||f.studentId)) return false;
      if ((f.event_type||f.eventType) && String(n.event_type)!==String(f.event_type||f.eventType)) return false;
      return true;
    });
  };
  ApiClient.archiveNotification = async function (notificationId) {
    try { return await mysqlRequest('notifications/' + encodeURIComponent(notificationId) + '/archive', { method: 'PATCH', body: '{}' }); }
    catch (error) { return { ok: false, message: error.message }; }
  };
  ApiClient.sendChatMessage = async function (payload) {
    try { return await mysqlRequest('chat',{method:'POST',body:JSON.stringify(payload||{})}); }
    catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.getChatMessages = async function (filters) {
    var f=filters||{};var query=[];
    if (f.student_id||f.studentId) query.push('student_id='+encodeURIComponent(f.student_id||f.studentId));
    if (f.instructor_id||f.instructorId) query.push('instructor_id='+encodeURIComponent(f.instructor_id||f.instructorId));
    var result=await mysqlRequest('chat'+(query.length?'?'+query.join('&'):''));return result.messages||[];
  };
  ApiClient.getChatThreads = async function (filters) {
    var messages=await ApiClient.getChatMessages(filters||{});var threads={};
    messages.forEach(function(m){if(!threads[m.student_id])threads[m.student_id]={student_id:m.student_id,student_name:m.student_name||m.student_id,last_message:'',last_message_at:'',unread_count:0};var t=threads[m.student_id];t.last_message=m.message;t.last_message_at=m.created_at;if(m.sender_role==='student'&&!Number(m.read_by_instructor))t.unread_count+=1;});
    return Object.keys(threads).map(function(k){return threads[k];}).sort(function(a,b){return new Date(b.last_message_at)-new Date(a.last_message_at);});
  };
  ApiClient.addTeacherRemarks = async function (caseId,remarks,checkedBy,instructorId) {
    return ApiClient.updateRecordStatus(caseId,'Under Review',{remarks:remarks,instructor_name:checkedBy,instructor_id:instructorId});
  };
  ApiClient.updateRecordStatus = async function (caseId,status,options) {
    try {var body=Object.assign({},options||{},{status:status});return await mysqlRequest('cases/'+encodeURIComponent(caseId)+'/review',{method:'PATCH',body:JSON.stringify(body)});}catch(error){return {ok:false,message:error.message};}
  };
  ApiClient.getRecordHistory = async function (caseId) {
    try {var result=await mysqlRequest('audit?record_id='+encodeURIComponent(caseId));return {ok:true,history:result.entries||[]};}catch(error){return {ok:false,history:[],message:error.message};}
  };
  ApiClient.addNotificationHistory = async function (payload) {
    try {var result=await mysqlRequest('notifications',{method:'POST',body:JSON.stringify(payload||{})});return {ok:!!result.ok,notification_id:result.id};}catch(error){return {ok:false,message:error.message};}
  };

  window.ApiClient = ApiClient;
  window.SessionCache = SessionCache;
  window.AuthHelper = AuthHelper;
  window.SchemaDB = SchemaDB;
})();
