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
  root.innerHTML = `<div class="ip-overview"><div class="instructor-title-heading"><span class="instructor-title-icon" aria-hidden="true"><i class="fas fa-chart-pie"></i></span><div class="instructor-title-copy"><h2>Progress Overview</h2><p class="ip-subtitle">Search for a student to view their clinical progress.</p></div></div><div class="ip-toolbar" role="search"><input id="ipSearch" aria-label="Search students" placeholder="Search by student ID or name..."><button class="ip-btn" id="ipRefresh" type="button">Refresh</button></div><div class="ip-panel"><div class="ip-table-wrap"><table><thead><tr><th style="width:55px">NO.</th><th>STUDENT ID</th><th>STUDENT NAME</th><th style="width:120px">CLINICAL RECORDS</th><th style="width:120px">ACTIONS</th></tr></thead><tbody id="ipStudents"></tbody></table></div></div><div class="ip-empty" id="ipEmpty">Enter a student name or ID to view progress.</div></div><div class="ip-detail"><div class="ip-detail-actions"><button class="ip-btn back" id="ipBack" type="button"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to Search</button></div><div id="ipStudentInfo"></div><div id="ipRecords"></div></div>`;
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
    body.closest('table')?.style.setProperty('border-spacing', '0', 'important');
    const term = byId('ipSearch').value.trim().toLowerCase();
    const empty = byId('ipEmpty');
    if (!term) {
      empty.hidden = false;
      empty.textContent = 'Search for a student by name or ID to view clinical progress.';
      return;
    }
    empty.hidden = true;
    const matches = students.filter((s) => !term || String(s.student_id || '').toLowerCase().includes(term) || String(s.student_name || '').toLowerCase().includes(term));
    for (const [index, student] of matches.entries()) {
      const count = caseCount(student.student_id);
      const row = document.createElement('tr');
      row.innerHTML = `<td>${index + 1}</td><td>${escape(student.student_id)}</td><td>${escape(student.student_name || 'Student')}</td><td>${count}</td><td><button class="ip-btn" data-id="${escape(student.student_id)}">View Progress</button></td>`;
      row.style.setProperty('height', '44px', 'important');
      row.querySelectorAll('td').forEach((cell) => {
        cell.style.setProperty('height', '44px', 'important');
        cell.style.setProperty('min-height', '44px', 'important');
        cell.style.setProperty('padding-top', '1px', 'important');
        cell.style.setProperty('padding-bottom', '1px', 'important');
      });
      const actionButton = row.querySelector('.ip-btn');
      actionButton?.style.setProperty('min-height', '28px', 'important');
      actionButton?.style.setProperty('padding', '0 10px', 'important');
      row.querySelector('button').addEventListener('click', () => openStudent(student, count)); body.append(row);
    }
    if (!matches.length) body.innerHTML = '<tr><td colspan="5">No matching students found.</td></tr>';
  }
  async function openStudent(student, count) {
    root.classList.add('focused');
    const rows = (await window.ApiClient?.getJoinedCases(student.student_id, '', '')) || [];
    const records = rows.filter((row) => String(row.student_id) === String(student.student_id));
    const procedureFilters = [
      ['all', 'All Procedures'],
      ['delivery-handled', 'Delivery Handled'],
      ['delivery-assisted', 'Delivery Assisted'],
      ['suturing', 'Perineal Suturing'],
      ['iv-insertion', 'IV Insertion'],
      ['internal-exam', 'Internal Examination'],
    ];
    const procedureKey = (value) => {
      const name = String(value || '').toLowerCase();
      if (name.includes('delivery') && name.includes('handled')) return 'delivery-handled';
      if (name.includes('delivery') && name.includes('assisted')) return 'delivery-assisted';
      if (name.includes('sutur')) return 'suturing';
      if (name.includes('intraven') || name.includes('iv insertion')) return 'iv-insertion';
      if (name.includes('internal')) return 'internal-exam';
      return 'other';
    };
    const initials = String(student.student_name || 'Student').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'S';
    const photoSource = String(student.profile_photo || '').trim();
    byId('ipStudentInfo').innerHTML = `<div class="ip-detail-heading"><div><h2>Clinical Progress &amp; Case Summary</h2><p class="ip-subtitle">A comprehensive overview of ${escape(student.student_name || 'this student')}'s clinical requirements and record history.</p></div></div><section class="ip-student summary-student-info ip-student-profile" aria-label="Student profile"><div class="ip-profile-identity"><div class="ip-profile-photo">${photoSource ? `<img data-ip-profile-photo src="${escape(photoSource)}" alt="${escape(student.student_name || 'Student')} profile photo">` : ''}<span data-ip-profile-initials${photoSource ? ' hidden' : ''}>${escape(initials)}</span></div><div class="ip-profile-name"><span class="ip-profile-eyebrow">Clinical student</span><strong>${escape(student.student_name || 'Student')}</strong><small>Student ID: ${escape(student.student_id || 'Not available')}</small></div></div><div class="ip-profile-details"><div><span>Contact Number</span><strong>${escape(student.contact_number || 'Not provided')}</strong></div><div><span>Parent / Guardian</span><strong>${escape(student.parent_name || 'Not provided')}</strong></div><div><span>Academic Year</span><strong>${escape(student.registered_school_year || student.active_school_year || 'Not assigned')}</strong></div><div><span>Registered Block</span><strong>${escape(student.block_label || 'Not assigned')}</strong></div><div><span>Total Cases</span><strong>${escape(count)}</strong></div><div><span>Report Type</span><strong>Clinical Case Summary</strong></div></div></section><div class="ip-record-toolbar student-progress-toolbar"><div class="procedure-tabs ip-detail-tabs">${procedureFilters.map(([key, label]) => `<button type="button" class="procedure-tab ip-detail-tab${key === 'all' ? ' active' : ''}" data-ip-filter="${key}">${label}</button>`).join('')}</div><button class="ip-btn ip-export" id="ipExport" type="button"><i class="fas fa-file-word" aria-hidden="true"></i> Export PRC Form</button></div>`;
    const profilePhoto = byId('ipStudentInfo').querySelector('[data-ip-profile-photo]');
    profilePhoto?.addEventListener('error', () => {
      profilePhoto.hidden = true;
      const fallback = byId('ipStudentInfo').querySelector('[data-ip-profile-initials]');
      if (fallback) fallback.hidden = false;
    });
    byId('ipExport').addEventListener('click', async (event) => {
      if (typeof window.openInstructorPrcExport === 'function') {
        await window.openInstructorPrcExport(student, event.currentTarget);
      }
    });
    const output = byId('ipRecords'); output.innerHTML = '';
    procedureFilters.slice(1).forEach(([filterKey, procedure]) => {
      const group = records.filter((row) => procedureKey(row.procedure_name) === filterKey);
      const section = document.createElement('section');
      section.className = 'summary-procedure-section';
      section.dataset.ipProcedure = filterKey;
      const rowsHtml = group.length
        ? group.map((row) => `<tr><td>${escape(row.patient_name || '-')}<br>${escape(row.patient_address || '')}</td><td>${escape(row.case_no || '-')}</td><td>${escape(row.complete_diagnosis || '-')}</td><td>${escape(row.date_time_performed || '-')}</td><td>${escape(row.facility_name || '-')}<br>${escape(row.facility_address || '')}<br>${escape(row.facility_contact_number || '')}</td><td>${escape(row.supervisor_printed_name || '-')}<br>${escape(row.supervisor_contact_number || '')}</td><td>${escape(row.supervisor_position_designation || '-')}</td><td>${escape(row.supervisor_license_no || '-')}<br>${escape(row.supervisor_license_expiry_date || '')}</td></tr>`).join('')
        : '<tr><td class="ip-no-records" colspan="8">No records for this procedure.</td></tr>';
      const diagnosisHeader = ['delivery-handled', 'delivery-assisted'].includes(filterKey) ? 'Complete Diagnosis<br>(Gravida, Para)' : filterKey === 'internal-exam' ? 'Internal Examination<br>(Cervical Dilation, Effacement, BOW,<br>Presentation and Station)' : 'Complete Diagnosis';
      section.innerHTML = `<h3 class="ip-procedure">${escape(procedure)} (${group.length})</h3><div class="ip-table-wrap ip-clinical-table-wrap prc-source-table-wrap"><table class="ip-clinical-table prc-source-table" aria-label="${escape(procedure)} clinical records"><colgroup><col style="width:23.23%"><col style="width:6.11%"><col style="width:15.63%"><col style="width:8.83%"><col style="width:20.38%"><col style="width:15.63%"><col style="width:10.87%"><col style="width:10.87%"></colgroup><thead><tr><th rowspan="2">Name and Address of Patient</th><th rowspan="2">Case No.</th><th rowspan="2">${diagnosisHeader}</th><th rowspan="2">Date &amp; Time Performed</th><th rowspan="2">Full Name, Address of Facility &amp; Contact Number</th><th colspan="3">Supervised by</th></tr><tr><th>Printed Name and Contact No.</th><th>Position/<br>Designation</th><th>License No /<br>Expiry Date</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
      output.append(section);
    });
    root.querySelectorAll('.ip-detail-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const filter = tab.dataset.ipFilter;
        root.querySelectorAll('.ip-detail-tab').forEach((item) => item.classList.toggle('active', item === tab));
        output.querySelectorAll('section').forEach((section) => {
          section.hidden = filter !== 'all' && section.dataset.ipProcedure !== filter;
        });
      });
    });
  }
  byId('ipSearch').addEventListener('input', renderStudents);
  byId('ipRefresh').addEventListener('click', loadStudents);
  byId('ipBack').addEventListener('click', () => {
    root.classList.remove('focused');
    renderStudents();
    byId('ipSearch').focus();
  });
  loadStudents();
})();

