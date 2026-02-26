/* =======================================================================
   El Impostor – SPA Router / View Controller
   ======================================================================= */
(function () {
  "use strict";

  const VIEW_NAMES = ["menu", "local", "online"];
  const views = {
    menu: document.getElementById("view-menu"),
    local: document.getElementById("view-local"),
    online: document.getElementById("view-online"),
  };

  function validView(name) {
    return VIEW_NAMES.includes(name);
  }

  function parseViewFromHash() {
    const hash = (window.location.hash || "").replace("#", "").trim();
    return validView(hash) ? hash : "menu";
  }

  function showView(name, push = true) {
    const view = validView(name) ? name : "menu";
    Object.entries(views).forEach(([key, element]) => {
      if (!element) return;
      element.classList.toggle("active", key === view);
      element.classList.toggle("hidden", key !== view);
    });

    if (push) {
      const nextHash = view === "menu" ? "" : `#${view}`;
      history.pushState({ view }, "", `${location.pathname}${nextHash}`);
    }
  }

  async function fetchBootstrap() {
    try {
      const response = await fetch("/api/bootstrap", {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) throw new Error("Bootstrap fetch failed");
      await response.json();
    } catch (error) {
      const toasts = document.getElementById("toasts");
      if (!toasts) return;
      const el = document.createElement("div");
      el.className = "toast error";
      el.textContent = "No se pudo conectar con el servidor.";
      toasts.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-spa-view]");
    if (!trigger) return;
    event.preventDefault();
    const targetView = trigger.getAttribute("data-spa-view") || "menu";
    showView(targetView, true);
  });

  window.addEventListener("popstate", () => {
    showView(parseViewFromHash(), false);
  });

  window.SPA = { showView };

  showView(parseViewFromHash(), false);
  fetchBootstrap();
})();
