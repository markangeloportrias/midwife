(function () {
  'use strict';

  if (window.SchemaDB) {
    return;
  }

  var script = document.createElement('script');
  script.src = 'api-client.js';
  script.onload = function () {
    if (!window.SchemaDB && window.ApiClient) {
      window.SchemaDB = {
        migrateLegacyData: function () { return true; },
        registerStudent: function (payload) {
          payload = payload || {};
          return window.ApiClient.registerStudent(
            payload.student_id,
            payload.student_name,
            payload.password,
            payload.parent_name,
            payload.contact_number
          );
        },
        authenticateStudent: function (studentId, password) {
          var key = 'thesis_students_v1';
          var students = [];
          try {
            students = JSON.parse(localStorage.getItem(key) || '[]');
          } catch (err) {
            students = [];
          }
          var found = students.find(function (s) {
            return (s.student_id || '').trim() === String(studentId || '').trim() &&
              (s.password || '').trim() === String(password || '').trim();
          });
          return found ? {
            id: found.id,
            student_id: found.student_id,
            student_name: found.student_name,
            parent_name: found.parent_name || '',
            contact_number: found.contact_number || ''
          } : null;
        },
        authenticateInstructor: function (username, password) {
          if (window.ApiClient && typeof window.ApiClient.authenticateInstructor === 'function') {
            return window.ApiClient.authenticateInstructor(username, password);
          }
          return false;
        },
        getStudentByPublicId: function (studentId) {
          var key = 'thesis_students_v1';
          var students = [];
          try {
            students = JSON.parse(localStorage.getItem(key) || '[]');
          } catch (err) {
            students = [];
          }
          var found = students.find(function (s) {
            return (s.student_id || '').trim() === String(studentId || '').trim();
          });
          return found ? {
            id: found.id,
            student_id: found.student_id,
            student_name: found.student_name,
            parent_name: found.parent_name || '',
            contact_number: found.contact_number || ''
          } : null;
        },
        updateStudentName: function (studentId, newName) {
          var key = 'thesis_students_v1';
          var students = [];
          try {
            students = JSON.parse(localStorage.getItem(key) || '[]');
          } catch (err) {
            students = [];
          }
          var id = String(studentId || '').trim();
          var changed = false;
          students = students.map(function (s) {
            if ((s.student_id || '').trim() === id) {
              changed = true;
              return Object.assign({}, s, { student_name: String(newName || '').trim() });
            }
            return s;
          });
          if (changed) {
            localStorage.setItem(key, JSON.stringify(students));
          }
          return changed;
        },
        saveCaseRecord: function () { return { ok: false, message: 'Use ApiClient.saveCaseRecord from api-client.js' }; },
        getJoinedCases: function () { return []; },
        getStudentCaseCount: function () { return 0; },
        getStudentSummaryByName: function () { return []; },
        validateInstructorCredentials: function (username, password) {
          if (window.ApiClient && typeof window.ApiClient.validateInstructorCredentials === 'function') {
            return window.ApiClient.validateInstructorCredentials(username, password);
          }
          return false;
        },
        validateInstructorPin: function (pin) {
          if (window.ApiClient && typeof window.ApiClient.validateInstructorPin === 'function') {
            return window.ApiClient.validateInstructorPin(pin);
          }
          return false;
        },
        clearCaseDataOnly: function () {
          if (window.ApiClient && typeof window.ApiClient.clearCaseDataOnly === 'function') {
            window.ApiClient.clearCaseDataOnly();
          }
        }
      };
    }
  };
  document.head.appendChild(script);
})();
