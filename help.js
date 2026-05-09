(function () {
  "use strict";

  const helpButton = document.getElementById("helpButton");
  const helpPanel = document.getElementById("helpPanel");
  const closeButton = document.getElementById("helpCloseButton");

  if (!helpButton || !helpPanel || !closeButton) return;

  function setHelpOpen(isOpen) {
    helpPanel.hidden = !isOpen;
    helpButton.setAttribute("aria-expanded", String(isOpen));
  }

  helpButton.addEventListener("click", () => {
    setHelpOpen(helpPanel.hidden);
  });

  closeButton.addEventListener("click", () => {
    setHelpOpen(false);
    helpButton.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !helpPanel.hidden) {
      setHelpOpen(false);
      helpButton.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      helpPanel.hidden ||
      helpPanel.contains(event.target) ||
      helpButton.contains(event.target)
    ) {
      return;
    }

    setHelpOpen(false);
  });
})();
