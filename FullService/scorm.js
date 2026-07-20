/* ============================================================
   Wahlburgers Star-Spangled Shake LTO — SCORM 1.2 Runtime Wrapper
   Self-contained. Finds the LMS API in parent/opener windows.
   Falls back to a silent "standalone" mode (console logging) so the
   module also runs correctly outside an LMS for QA/preview.
   ============================================================ */
(function (global) {
  "use strict";

  var API = null;
  var initialized = false;
  var finished = false;
  var standalone = false;
  var startTime = Date.now();

  // ---- Locate the SCORM 1.2 API object -----------------------------------
  function findAPI(win) {
    var tries = 0;
    while (win.API == null && win.parent != null && win.parent != win) {
      tries++;
      if (tries > 500) return null;
      win = win.parent;
    }
    return win.API;
  }

  function getAPI() {
    var theAPI = null;
    try {
      if (window.parent && window.parent != window) theAPI = findAPI(window.parent);
      if (!theAPI && window.top && window.opener && window.opener.document) {
        theAPI = findAPI(window.opener);
      }
      if (!theAPI && window.top) theAPI = findAPI(window.top);
    } catch (e) { theAPI = null; }
    return theAPI;
  }

  function log(msg) {
    if (global.console && console.log) console.log("[SCORM] " + msg);
  }

  // ---- Public surface -----------------------------------------------------
  var SCORM = {
    init: function () {
      if (initialized) return true;
      API = getAPI();
      if (API == null) {
        standalone = true;
        initialized = true;
        log("No LMS API found — running in standalone mode. Tracking is simulated.");
        return true;
      }
      var ok = (API.LMSInitialize("") + "") === "true";
      initialized = ok;
      if (ok) {
        log("LMSInitialize OK");
        var status = API.LMSGetValue("cmi.core.lesson_status");
        if (!status || status === "not attempted" || status === "unknown" || status === "") {
          API.LMSSetValue("cmi.core.lesson_status", "incomplete");
        }
        API.LMSSetValue("cmi.core.score.min", "0");
        API.LMSSetValue("cmi.core.score.max", "100");
        API.LMSCommit("");
      } else {
        log("LMSInitialize FAILED — falling back to standalone.");
        standalone = true;
        initialized = true;
      }
      return initialized;
    },

    getStudentName: function () {
      if (standalone || !API) return "";
      try {
        var n = API.LMSGetValue("cmi.core.student_name") || "";
        // LMS format is usually "Last, First" — flip to "First Last".
        if (n.indexOf(",") > -1) {
          var p = n.split(",");
          n = (p[1] || "").trim() + " " + (p[0] || "").trim();
        }
        return n.trim();
      } catch (e) { return ""; }
    },

    setScore: function (raw) {
      raw = Math.max(0, Math.min(100, Math.round(raw)));
      if (standalone || !API) { log("score.raw = " + raw + " (standalone)"); return; }
      API.LMSSetValue("cmi.core.score.raw", "" + raw);
      API.LMSSetValue("cmi.core.score.min", "0");
      API.LMSSetValue("cmi.core.score.max", "100");
      API.LMSCommit("");
    },

    // status: "passed" | "failed" | "completed" | "incomplete"
    setStatus: function (status) {
      if (standalone || !API) { log("lesson_status = " + status + " (standalone)"); return; }
      API.LMSSetValue("cmi.core.lesson_status", status);
      API.LMSCommit("");
    },

    // Mark passed/failed based on mastery
    recordResult: function (raw, mastery) {
      this.setScore(raw);
      if (raw >= mastery) this.setStatus("passed");
      else this.setStatus("failed");
    },

    commit: function () {
      if (standalone || !API) return;
      this.writeTime();
      API.LMSCommit("");
    },

    writeTime: function () {
      if (standalone || !API) return;
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      var hh = Math.floor(elapsed / 3600);
      var mm = Math.floor((elapsed % 3600) / 60);
      var ss = elapsed % 60;
      function p(n) { return (n < 10 ? "0" : "") + n; }
      API.LMSSetValue("cmi.core.session_time", p(hh) + ":" + p(mm) + ":" + p(ss));
    },

    finish: function () {
      if (finished) return;
      finished = true;
      if (standalone || !API) { log("LMSFinish (standalone)"); return; }
      this.writeTime();
      API.LMSSetValue("cmi.core.exit", "");
      API.LMSCommit("");
      API.LMSFinish("");
      log("LMSFinish OK");
    },

    isStandalone: function () { return standalone; }
  };

  // Persist time + close the session when the window unloads.
  global.addEventListener("beforeunload", function () {
    try { SCORM.finish(); } catch (e) {}
  });
  // Periodic commit so progress survives an unexpected close.
  global.setInterval(function () { try { SCORM.commit(); } catch (e) {} }, 60000);

  global.WB_SCORM = SCORM;
})(window);
