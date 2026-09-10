(() => {
  "use strict";

  const ACCESS_COOKIE = "haviko_preview_access";
  const hasAccess = document.cookie
    .split(";")
    .map((value) => value.trim())
    .some((value) => value === `${ACCESS_COOKIE}=granted`);

  if (hasAccess || window.location.hostname === "localhost") return;

  window.location.replace(
    `https://autorisieren.haviko.de/?next=${encodeURIComponent(window.location.href)}`
  );
})();
