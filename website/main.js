// Mobile navigation toggle. Loaded in <head> so the collapsed menu is hidden before first paint.
document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", function () {
  var root = document.documentElement;
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  function setOpen(open) {
    root.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && root.classList.contains("nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
});
