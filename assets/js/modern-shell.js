(function () {
  "use strict";

  const sidebar = document.querySelector(".dashboard > .sidebar, .app-shell > .sidebar");
  if (!sidebar) return;
  const shell = sidebar.closest(".dashboard") || sidebar.closest(".app-shell");
  if (document.getElementById('main-stats-grid')) {
    document.body.classList.add('role-instructor');
  } else if (document.getElementById('dashboardSummary')) {
    document.body.classList.add('role-admin');
  } else {
    document.body.classList.add('role-student');
  }

  function setCollapsed(collapsed) {
    shell.classList.toggle("sidebar-collapsed", collapsed);
    sidebar.setAttribute("aria-expanded", String(!collapsed));
  }

  let collapseTimer = 0;
  setCollapsed(true);
  sidebar.addEventListener("mouseenter", function () {
    clearTimeout(collapseTimer);
    setCollapsed(false);
  });
  sidebar.addEventListener("mouseleave", function () {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(function () { setCollapsed(true); }, 180);
  });
  sidebar.addEventListener("focusin", function () { setCollapsed(false); });
  sidebar.addEventListener("focusout", function (event) {
    if (!sidebar.contains(event.relatedTarget)) setCollapsed(true);
  });

  shell.querySelectorAll(".sidebar-nav-item, .sidebar-item").forEach(function (item) {
    if (!item.title) {
      const label = item.querySelector(".sidebar-label")?.textContent || item.textContent;
      item.title = label.trim().replace(/\s+/g, " ");
    }
  });

  const instructorMetricTargets = {
    totalRecords: "btn-my-records",
    pendingRequests: "btn-nav-edit-requests",
    approvedCases: "btn-my-records",
    activeStudents: "btn-nav-students"
  };
  Object.keys(instructorMetricTargets).forEach(function (valueId) {
    const value = document.getElementById(valueId);
    const card = value?.closest(".stat-card");
    const target = document.getElementById(instructorMetricTargets[valueId]);
    if (!card || !target) return;
    card.classList.add("is-actionable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Open " + target.textContent.trim().replace(/\s+/g, " "));
    const activate = function () { target.click(); };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });

  const adminSummaryTargets = {
    dashboardInstructorsValue: "instructorsCard",
    dashboardStudentsValue: "studentsCard",
    dashboardRequestsValue: "editRequestsCard",
    dashboardRecordsValue: "casesCard"
  };
  Object.keys(adminSummaryTargets).forEach(function (valueId) {
    const value = document.getElementById(valueId);
    const card = value?.closest(".summary-box");
    const nav = shell.querySelector('.sidebar-item[data-target="' + adminSummaryTargets[valueId] + '"]');
    if (!card || !nav) return;
    card.classList.add("is-actionable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const activate = function () { nav.click(); };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });

  const backButtonSelector = [
    '#deliveryModalBackBtn', '#backToCurrentStudentsBtn',
    '#studentsBlockBackBtn', '#studentsListBackBtn',
    '#casesProceduresBackBtn', '#casesListBackBtn',
    '#yearlyBlockBackBtn', '#yearlyStudentBackBtn', '#yearlyRecordsBackBtn',
    '#yearlyStudentListBackBtn', '#yearlyReportBackBtn',
    '#instructorStudentsBlockBackBtn', '#instructorStudentsListBackBtn'
  ].join(',');
  shell.querySelectorAll(backButtonSelector).forEach(function (button) {
    button.classList.add('portal-back-button');
    button.parentElement?.classList.add('portal-back-row');
    if (!button.querySelector('i')) {
      const icon = document.createElement('i');
      icon.className = 'fas fa-arrow-left';
      icon.setAttribute('aria-hidden', 'true');
      button.prepend(icon);
    }
  });
})();

/* Keep database-backed screens honest when XAMPP is stopped. The HTML shell
   remains available for design testing, but previously rendered database rows
   and totals are removed as soon as the API health check fails. */
(function monitorXamppDatabase() {
  if (!document.querySelector('.app-shell, .dashboard')) return;

  var apiBase = location.protocol === 'file:'
    ? 'http://localhost/THESIS6/api/health'
    : 'api/health';
  var wasOnline = null;

  function clearDatabaseViews() {
    document.querySelectorAll('tbody').forEach(function (tbody) {
      tbody.innerHTML = '';
    });
    document.querySelectorAll(
      '.sidebar-count, [id$="Value"], [id^="navCount"], [id$="Records"], [id$="Cases"]'
    ).forEach(function (node) {
      if (!/input|textarea|select/i.test(node.tagName)) node.textContent = '0';
    });
    document.querySelectorAll('.empty').forEach(function (node) {
      node.style.display = 'block';
    });
  }

  function setDatabaseState(online) {
    document.documentElement.classList.toggle('database-offline', !online);
    if (!online) clearDatabaseViews();
    if (wasOnline === false && online) window.location.reload();
    wasOnline = online;
  }

  async function checkDatabase() {
    try {
      var response = await fetch(apiBase, { cache: 'no-store', signal: AbortSignal.timeout(1800) });
      setDatabaseState(response.ok);
    } catch (error) {
      setDatabaseState(false);
    }
  }

  checkDatabase();
  window.setInterval(checkDatabase, 4000);
})();

/* Instructor Progress Overview: mirrors the Admin search -> detail -> back flow. */
(function instructorProgressOverview() {
  const host = document.getElementById('student-summary-view');
  if (!host || document.getElementById('instructorProgressCopy')) return;
  const containingSection = host.closest('.section');
  const recordsWrapper = host.closest('#mainRecordsWrapper');
  const recordsWrapperParent = recordsWrapper?.parentNode;
  const syncActiveState = () => {
    if (!containingSection) return;
    const active = host.style.display !== 'none';
    containingSection.classList.toggle('instructor-progress-active', active);
    Object.assign(containingSection.style, active ? { border: '0', borderRadius: '0', background: 'transparent', boxShadow: 'none' } : { border: '', borderRadius: '', background: '', boxShadow: '' });
    if (active && recordsWrapper && recordsWrapperParent) {
      recordsWrapperParent.insertBefore(host, recordsWrapper);
      recordsWrapper.style.display = 'none';
    } else if (!active && recordsWrapper) {
      recordsWrapper.append(host);
      recordsWrapper.style.display = '';
    }
  };
  new MutationObserver(syncActiveState).observe(host, { attributes: true, attributeFilter: ['style'] });
  syncActiveState();
  const legacy = Array.from(host.children);
  legacy.forEach((node) => { node.style.display = 'none'; });
  const root = document.createElement('div');
  root.id = 'instructorProgressCopy';
  root.innerHTML = `<div class="ip-overview"><h2>Progress Overview</h2><p class="ip-subtitle">Search for a student to view their clinical progress.</p><div class="ip-toolbar"><input id="ipSearch" placeholder="Search by student ID or name..."><button class="ip-btn" id="ipRefresh">Refresh</button></div><div class="ip-panel"><div class="ip-table-wrap"><table><thead><tr><th style="width:55px">NO.</th><th>STUDENT ID</th><th>STUDENT NAME</th><th style="width:120px">CLINICAL RECORDS</th><th style="width:120px">ACTIONS</th></tr></thead><tbody id="ipStudents"></tbody></table></div></div><div class="ip-empty" id="ipEmpty">Enter a student name or ID to view progress.</div></div><div class="ip-detail"><div class="ip-detail-actions"><button class="ip-btn back" id="ipBack" type="button">Back</button></div><div id="ipStudentInfo"></div><div id="ipRecords"></div></div>`;
  host.append(root);
  [host, root, root.querySelector('.ip-overview')].forEach((node) => {
    ['margin', 'padding', 'border', 'border-radius', 'outline', 'background', 'box-shadow'].forEach((property) => node.style.setProperty(property, property === 'background' ? 'transparent' : '0', 'important'));
  });
  const byId = (id) => root.querySelector('#' + id);
  let students = [];
  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let allRecords = [];
  async function loadStudents() {
    const empty = byId('ipEmpty');
    empty.hidden = false;
    empty.textContent = 'Loading students...';
    try {
      const result = await window.ApiClient.getAllStudents();
      const local = JSON.parse(localStorage.getItem('thesis_students_v1') || '[]');
      students = result?.ok && Array.isArray(result.students) && result.students.length ? result.students : local;
      allRecords = await window.ApiClient.getJoinedCases('', '', '').catch(() => []);
    } catch (error) {
      students = JSON.parse(localStorage.getItem('thesis_students_v1') || '[]');
      allRecords = [];
      empty.textContent = students.length ? 'Student records loaded from local data.' : 'Unable to load students. Please refresh and try again.';
    }
    renderStudents();
  }
  function caseCount(studentId) {
    return Array.isArray(allRecords) ? allRecords.filter((row) => String(row.student_id) === String(studentId)).length : 0;
  }
  async function renderStudents() {
    const body = byId('ipStudents'); body.innerHTML = '';
    const term = byId('ipSearch').value.trim().toLowerCase();
    const empty = byId('ipEmpty');
    if (!term) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const matches = students.filter((s) => !term || String(s.student_id || '').toLowerCase().includes(term) || String(s.student_name || '').toLowerCase().includes(term));
    for (const [index, student] of matches.entries()) {
      const count = caseCount(student.student_id);
      const row = document.createElement('tr');
      row.innerHTML = `<td>${index + 1}</td><td>${escape(student.student_id)}</td><td>${escape(student.student_name || 'Student')}</td><td>${count}</td><td><button class="ip-btn" data-id="${escape(student.student_id)}">View Progress</button></td>`;
      row.querySelector('button').addEventListener('click', () => openStudent(student, count)); body.append(row);
    }
    if (!matches.length) body.innerHTML = '<tr><td colspan="5">No matching students found.</td></tr>';
  }
  async function openStudent(student, count) {
    root.classList.add('focused');
    const rows = (await window.ApiClient?.getJoinedCases(student.student_id, '', '')) || [];
    const records = rows.filter((row) => String(row.student_id) === String(student.student_id));
    byId('ipStudentInfo').innerHTML = `<div class="ip-detail-heading"><h2>${escape(student.student_name || 'Student')}'s Progress Overview</h2><button class="ip-btn ip-export" id="ipExport" type="button"><i class="fas fa-file-export" aria-hidden="true"></i> Export</button></div><div class="ip-student"><span class="ip-avatar">${escape((student.student_name || 'S').slice(0,1).toUpperCase())}</span><div><strong>${escape(student.student_name || 'Student')}</strong><span class="ip-value">Clinical progress and case summary</span></div><div><span class="ip-label">Student ID</span><span class="ip-value">${escape(student.student_id || '-')}</span></div><div><span class="ip-label">Contact Number</span><span class="ip-value">${escape(student.contact_number || '-')}</span></div><div><span class="ip-label">Parent / Guardian</span><span class="ip-value">${escape(student.parent_name || '-')}</span></div><div><span class="ip-label">Total Cases</span><span class="ip-value">${count}</span></div></div>`;
    byId('ipExport').addEventListener('click', () => exportProgressRecords(student, records));
    const groups = new Map(); records.forEach((row) => { const key = row.procedure_name || 'Clinical Records'; (groups.get(key) || groups.set(key, []).get(key)).push(row); });
    const output = byId('ipRecords'); output.innerHTML = '';
    groups.forEach((group, procedure) => {
      const section = document.createElement('section');
      section.innerHTML = `<h3 class="ip-procedure">${escape(procedure)} (${group.length})</h3><div class="ip-table-wrap ip-clinical-table-wrap"><table class="ip-clinical-table"><colgroup><col style="width:16%"><col style="width:5%"><col style="width:16%"><col style="width:8%"><col style="width:16%"><col style="width:13%"><col style="width:9%"><col style="width:10%"></colgroup><thead><tr><th>Name and Address of Patient</th><th>Case No.</th><th>Complete Diagnosis</th><th>Date &amp; Time Performed</th><th>Full Name, Address of Facility &amp; Contact Number</th><th>Supervisor Name &amp; Contact No.</th><th>Position / Designation</th><th>License No. / Expiry Date</th></tr></thead><tbody>${group.map((row) => `<tr><td>${escape(row.patient_name)}<br>${escape(row.patient_address)}</td><td>${escape(row.case_no)}</td><td>${escape(row.complete_diagnosis)}</td><td>${escape(row.date_time_performed)}</td><td>${escape(row.facility_name)}<br>${escape(row.facility_address)}<br>${escape(row.facility_contact_number)}</td><td>${escape(row.supervisor_printed_name)}<br>${escape(row.supervisor_contact_number)}</td><td>${escape(row.supervisor_position_designation)}</td><td>${escape(row.supervisor_license_no)}<br>${escape(row.supervisor_license_expiry_date)}</td></tr>`).join('')}</tbody></table></div>`;
      output.append(section);
    });
    if (!records.length) output.innerHTML = '<p class="ip-subtitle">No clinical records found for this student.</p>';
  }
  function exportProgressRecords(student, records) {
    const headers = ['Procedure', 'Patient', 'Case No.', 'Diagnosis', 'Date & Time', 'Facility', 'Supervisor', 'Position', 'License No.', 'Expiry Date'];
    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = records.map((row) => [row.procedure_name, row.patient_name, row.case_no, row.complete_diagnosis, row.date_time_performed, row.facility_name, row.supervisor_printed_name, row.supervisor_position_designation, row.supervisor_license_no, row.supervisor_license_expiry_date].map(csvCell).join(','));
    const blob = new Blob(["\ufeff" + [headers.map(csvCell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${String(student.student_name || 'student').replace(/[^a-z0-9_-]+/gi, '-')}-clinical-progress.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  byId('ipSearch').addEventListener('input', renderStudents);
  byId('ipRefresh').addEventListener('click', loadStudents);
  byId('ipBack').addEventListener('click', () => { root.classList.remove('focused'); renderStudents(); });
  loadStudents();
})();

