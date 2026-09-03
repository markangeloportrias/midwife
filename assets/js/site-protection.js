/* Shared browser-level protections for every portal screen. */
(function disableContextMenu() {
  "use strict";

  window.addEventListener(
    "contextmenu",
    function (event) {
      event.preventDefault();
    },
    { capture: true },
  );
})();
