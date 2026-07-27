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
    collapseTimer = setTimeout(function () { setCollapsed(true); }, 140);
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
