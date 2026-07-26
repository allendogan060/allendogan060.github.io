const SUPABASE_URL = "https://dlapwemckfhxklytbqkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_VeeQLARNn-sULZ4snvp3HA_Hd78H5RN";
const DEVELOPMENT_MODE = true;
const DEVELOPMENT_PIN_HASH =
  "5f20b9b81da6a3163f1cc96b603868330378255157dae99d8a6d7cc5fa3d6a19";
const ACCESS_SESSION_KEY = "servora-development-access";
const AUTH_STORAGE_KEY = "servora-web-session";
const LAST_RESTAURANT_KEY = "servora-web-restaurant";
const SWIFT_REFERENCE_SECONDS = 978307200;
const INITIAL_AUTH_MODE =
  new URLSearchParams(window.location.search).get("mode") === "register"
    ? "register"
    : "login";

const $ = (id) => document.getElementById(id);
const app = {
  session: null,
  workspace: null,
  data: null,
  updatedAt: null,
  route: "overview",
  reservationDate: localDateInput(new Date()),
  tableArea: "Alle",
  orderCart: [],
  orderTableID: null,
  reviews: [],
  loading: false
};

const roleTitles = {
  restaurant_manager: "Restaurantleitung",
  management: "Management",
  service: "Service",
  kitchen: "Küche",
  bar: "Bar"
};

const stateRoleToDatabaseRole = {
  Restaurantleitung: "restaurant_manager",
  Management: "management",
  Service: "service",
  Küche: "kitchen",
  Bar: "bar"
};

const routes = [
  { id: "overview", title: "Start", symbol: "⌂", roles: ["restaurant_manager", "management", "service", "kitchen", "bar"] },
  { id: "tables", title: "Tische", symbol: "▦", roles: ["restaurant_manager", "management", "service"] },
  { id: "orders", title: "Bestellungen", symbol: "☷", roles: ["restaurant_manager", "management", "service", "kitchen", "bar"] },
  { id: "reservations", title: "Reservierungen", symbol: "□", roles: ["restaurant_manager", "management", "service"] },
  { id: "products", title: "Produkte", symbol: "+", roles: ["restaurant_manager"] },
  { id: "team", title: "Team", symbol: "◎", roles: ["restaurant_manager"] },
  { id: "shifts", title: "Schicht", symbol: "◷", roles: ["restaurant_manager", "management", "service", "kitchen", "bar"] },
  { id: "analytics", title: "Statistik", symbol: "↗", roles: ["restaurant_manager", "management"] },
  { id: "reviews", title: "Bewertungen", symbol: "★", roles: ["restaurant_manager", "management"] },
  { id: "stations", title: "Stationen", symbol: "▣", roles: ["restaurant_manager"] },
  { id: "settings", title: "Einstellungen", symbol: "⚙", roles: ["restaurant_manager"] }
];

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uuid() {
  return crypto.randomUUID();
}

function swiftDate(date = new Date()) {
  return date.getTime() / 1000 - SWIFT_REFERENCE_SECONDS;
}

function dateFromSwift(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    return new Date((value + SWIFT_REFERENCE_SECONDS) * 1000);
  }
  return new Date(value);
}

function localDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateTimeFromInputs(date, time) {
  return new Date(`${date}T${time}:00`);
}

function formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  const date = dateFromSwift(value);
  if (!date || Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", options).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function sameDay(value, dateInput = localDateInput(new Date())) {
  const date = dateFromSwift(value);
  return date && localDateInput(date) === dateInput;
}

function activeCashDay() {
  return (app.data?.cashDaySessions || []).find((session) => session.status === "open") || null;
}

function currentMember() {
  return (app.data?.team || []).find(
    (member) =>
      String(member.username || "").toLowerCase() ===
      String(app.workspace?.username || "").toLowerCase()
  );
}

function canManage() {
  return app.workspace?.role === "restaurant_manager";
}

function routeAllowed(routeID) {
  const route = routes.find((item) => item.id === routeID);
  return Boolean(route?.roles.includes(app.workspace?.role));
}

function roleRouteList() {
  return routes.filter((route) => route.roles.includes(app.workspace?.role));
}

function authHeaders(includeJSON = true) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${app.session?.access_token || SUPABASE_KEY}`
  };
  if (includeJSON) headers["Content-Type"] = "application/json";
  return headers;
}

async function parseResponse(response) {
  const text = await response.text();
  let value = null;
  if (text) {
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
  }
  if (!response.ok) {
    const message =
      value?.message ||
      value?.msg ||
      value?.error_description ||
      value?.hint ||
      `Anfrage fehlgeschlagen (${response.status})`;
    throw new Error(message);
  }
  return value;
}

async function rpc(name, parameters = {}) {
  await ensureSession();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(parameters)
  });
  return parseResponse(response);
}

function saveSession(session) {
  app.session = session;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  app.session = null;
  app.workspace = null;
  app.data = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LAST_RESTAURANT_KEY);
}

async function createAnonymousSession() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ data: { client: "servora-web" } })
  });
  const session = await parseResponse(response);
  session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  saveSession(session);
  return session;
}

async function refreshSession(refreshToken) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    }
  );
  const session = await parseResponse(response);
  session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  saveSession(session);
  return session;
}

async function ensureSession() {
  if (!app.session) {
    try {
      app.session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    } catch {
      clearSession();
    }
  }
  if (
    app.session?.access_token &&
    Number(app.session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60
  ) {
    return app.session;
  }
  if (app.session?.refresh_token) {
    try {
      return await refreshSession(app.session.refresh_token);
    } catch {
      clearSession();
    }
  }
  return createAnonymousSession();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function defaultState(session) {
  const ownerID = uuid();
  return {
    restaurantName: session.restaurant_name,
    restaurantCode: session.restaurant_code,
    tables: [],
    areas: [],
    hiddenAreas: [],
    products: [],
    categories: ["Speisen"],
    categoryColors: { Speisen: "blue" },
    categoryParents: {},
    stations: [
      {
        id: uuid(),
        name: "Küche",
        icon: "flame",
        defaultMode: "digital",
        accessUsername: null,
        colorName: "orange",
        isActive: true,
        warningMinutes: 12,
        printerID: null
      }
    ],
    team: [
      {
        id: ownerID,
        name: session.display_name,
        role: "Restaurantleitung",
        phone: "",
        username: session.username
      }
    ],
    currentMemberID: ownerID,
    tickets: [],
    reservations: [],
    guestReviews: [],
    tableOrders: {},
    tableSaleItems: {},
    tableRevenue: {},
    activeShiftStart: null,
    activeBreakStart: null,
    accumulatedBreak: 0,
    shiftRecords: [],
    shiftRequests: [],
    absenceRequests: [],
    paymentMethods: [
      { id: uuid(), name: "Barzahlung", kind: "Bar", isEnabled: true, isBuiltIn: true },
      { id: uuid(), name: "Kartenzahlung", kind: "Karte", isEnabled: true, isBuiltIn: true },
      { id: uuid(), name: "Gutschein", kind: "Gutschein", isEnabled: true, isBuiltIn: true }
    ],
    paymentRecords: [],
    counterSales: [],
    vouchers: [],
    voucherConfiguration: {
      style: "Buchstaben + Zahlen",
      prefix: "GUT",
      length: 6,
      usesSeparator: true
    },
    printers: [],
    printJobs: [],
    servoraPlusEntitlement: {
      restaurantID: session.restaurant_id,
      plan: "free",
      accessSource: "free",
      isActive: false,
      validUntil: null,
      grantedAt: null,
      grantedBy: null
    },
    fiscalConfiguration: {
      receiptPrefix: "SV",
      nextReceiptSequence: 1,
      isTestMode: true,
      fiscalizationState: "notConfigured",
      cashRegisterSerialNumber: null,
      tseSerialNumber: null,
      tseCertificateID: null,
      dsfinvKVersion: "2.4"
    },
    fiscalReceipts: [],
    cashDaySessions: [],
    fiscalAuditEvents: []
  };
}

function normalizeState(state = {}) {
  return {
    restaurantName: state.restaurantName || app.workspace?.restaurantName || "Restaurant",
    restaurantCode: state.restaurantCode || app.workspace?.restaurantCode || "",
    tables: state.tables || [],
    areas: state.areas || [],
    hiddenAreas: state.hiddenAreas || [],
    products: state.products || [],
    categories: state.categories?.length ? state.categories : ["Speisen"],
    categoryColors: state.categoryColors || { Speisen: "blue" },
    categoryParents: state.categoryParents || {},
    stations: state.stations || [],
    team: state.team || [],
    currentMemberID: state.currentMemberID || null,
    tickets: state.tickets || [],
    reservations: state.reservations || [],
    guestReviews: state.guestReviews || [],
    tableOrders: state.tableOrders || {},
    tableSaleItems: state.tableSaleItems || {},
    tableRevenue: state.tableRevenue || {},
    activeShiftStart: state.activeShiftStart ?? null,
    activeBreakStart: state.activeBreakStart ?? null,
    accumulatedBreak: state.accumulatedBreak || 0,
    shiftRecords: state.shiftRecords || [],
    shiftRequests: state.shiftRequests || [],
    absenceRequests: state.absenceRequests || [],
    paymentMethods: state.paymentMethods || [],
    paymentRecords: state.paymentRecords || [],
    counterSales: state.counterSales || [],
    vouchers: state.vouchers || [],
    voucherConfiguration: state.voucherConfiguration || {
      style: "Buchstaben + Zahlen",
      prefix: "GUT",
      length: 6,
      usesSeparator: true
    },
    printers: state.printers || [],
    printJobs: state.printJobs || [],
    onlineBookingConfiguration: state.onlineBookingConfiguration || null,
    servoraPlusEntitlement: state.servoraPlusEntitlement || null,
    fiscalConfiguration: state.fiscalConfiguration || {
      receiptPrefix: "SV",
      nextReceiptSequence: 1,
      isTestMode: true,
      fiscalizationState: "notConfigured"
    },
    fiscalReceipts: state.fiscalReceipts || [],
    cashDaySessions: state.cashDaySessions || [],
    fiscalAuditEvents: state.fiscalAuditEvents || []
  };
}

async function initializeRestaurantState(session) {
  const initial = defaultState(session);
  const result = await rpc("web_initialize_restaurant_state", {
    p_restaurant_id: session.restaurant_id,
    p_state: initial
  });
  return result;
}

async function loadWorkspace(restaurantID = null) {
  setSyncState("saving", "Wird geladen");
  const result = await rpc("web_get_restaurant_workspace", {
    p_restaurant_id: restaurantID
  });
  if (!result?.restaurantId) throw new Error("Kein Restaurantzugang gefunden.");
  app.workspace = result;
  app.data = normalizeState(result.state);
  app.updatedAt = result.updatedAt;
  localStorage.setItem(LAST_RESTAURANT_KEY, result.restaurantId);
  showWorkspace();
  setSyncState("ready", "Aktuell");
}

async function savePatch(patch, message = "Gespeichert") {
  if (!navigator.onLine) {
    toast("Offline", "Änderungen sind erst wieder online möglich.", "error");
    return false;
  }
  setSyncState("saving", "Synchronisiert");
  try {
    const result = await rpc("web_patch_restaurant_state", {
      p_restaurant_id: app.workspace.restaurantId,
      p_patch: patch,
      p_expected_updated_at: app.updatedAt
    });
    app.data = normalizeState(result.state);
    app.updatedAt = result.updatedAt;
    setSyncState("ready", "Aktuell");
    toast("Erledigt", message, "success");
    render();
    return true;
  } catch (error) {
    if (error.message.includes("STATE_CONFLICT")) {
      await loadWorkspace(app.workspace.restaurantId);
      toast(
        "Daten wurden aktualisiert",
        "Eine andere Servora-Instanz war schneller. Der aktuelle Stand wurde neu geladen.",
        "error"
      );
    } else {
      setSyncState("error", "Fehler");
      toast("Nicht gespeichert", friendlyError(error), "error");
    }
    return false;
  }
}

function friendlyError(error) {
  const message = String(error?.message || "Unbekannter Fehler");
  if (message.includes("Invalid restaurant credentials")) {
    return "Restaurantkennung, Benutzername oder Passwort stimmen nicht.";
  }
  if (message.includes("Anonymous sign-ins are disabled")) {
    return "Anonyme Supabase-Anmeldung ist noch nicht aktiviert.";
  }
  if (message.includes("Failed to fetch")) {
    return "Servora konnte den Server nicht erreichen.";
  }
  if (message.includes("Access denied")) {
    return "Deine Rolle darf diese Aktion nicht ausführen.";
  }
  return message;
}

function setSyncState(kind, text) {
  const element = $("sync-state");
  if (!element) return;
  element.classList.toggle("saving", kind === "saving");
  element.classList.toggle("error", kind === "error");
  element.querySelector("span").textContent = text;
}

function toast(title, message, type = "success") {
  const item = document.createElement("div");
  item.className = "toast";
  const symbol = type === "error" ? "!" : "✓";
  item.innerHTML = `
    <div class="activity-icon">${symbol}</div>
    <div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>
    <button type="button" aria-label="Hinweis schließen">×</button>
  `;
  item.querySelector("button").addEventListener("click", () => item.remove());
  $("toast-region").append(item);
  setTimeout(() => item.remove(), 4500);
}

function showAuth() {
  $("auth-shell").classList.remove("hidden");
  $("app-shell").classList.add("hidden");
}

function showWorkspace() {
  $("auth-shell").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  $("restaurant-name").textContent = app.data.restaurantName;
  $("restaurant-code").textContent = app.workspace.restaurantCode;
  $("restaurant-role").textContent = roleTitles[app.workspace.role] || app.workspace.role;
  $("sidebar-user-name").textContent = app.workspace.displayName;
  $("sidebar-user-role").textContent = roleTitles[app.workspace.role] || app.workspace.role;
  if (!routeAllowed(app.route)) app.route = roleRouteList()[0]?.id || "overview";
  buildNavigation();
  render();
}

function routeCount(route) {
  if (route.id === "orders") {
    return app.data.tickets.filter((ticket) => !["Serviert", "Abgebrochen"].includes(ticket.status)).length;
  }
  if (route.id === "reservations") {
    return app.data.reservations.filter(
      (reservation) =>
        sameDay(reservation.time) &&
        ["Zu bestätigen", "Geplant", "Platziert", "Warteliste"].includes(reservation.status)
    ).length;
  }
  if (route.id === "reviews") return app.reviews.length || app.data.guestReviews.length;
  return 0;
}

function navButton(route, mobile = false) {
  const count = routeCount(route);
  return `
    <button class="nav-button ${app.route === route.id ? "selected" : ""}"
      type="button" data-route="${route.id}" aria-current="${app.route === route.id ? "page" : "false"}">
      <span class="nav-symbol" aria-hidden="true">${route.symbol}</span>
      <span>${escapeHTML(route.title)}</span>
      ${count && !mobile ? `<span class="nav-count">${count}</span>` : ""}
    </button>
  `;
}

function buildNavigation() {
  const allowed = roleRouteList();
  $("desktop-navigation").innerHTML = allowed.map((route) => navButton(route)).join("");
  const preferred = ["overview", "tables", "orders", "reservations", "shifts"];
  const mobileRoutes = preferred
    .map((id) => allowed.find((route) => route.id === id))
    .filter(Boolean)
    .slice(0, 4);
  const remaining = allowed.filter((route) => !mobileRoutes.some((item) => item.id === route.id));
  if (remaining.length) {
    mobileRoutes.push({ id: "more", title: "Mehr", symbol: "•••", roles: [] });
  } else {
    mobileRoutes.push(...allowed.filter((route) => !mobileRoutes.includes(route)).slice(0, 5 - mobileRoutes.length));
  }
  $("mobile-navigation").innerHTML = mobileRoutes.map((route) => navButton(route, true)).join("");
}

function navigate(routeID) {
  if (routeID === "more") {
    showMoreNavigation();
    return;
  }
  if (!routeAllowed(routeID)) return;
  app.route = routeID;
  buildNavigation();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const route = routes.find((item) => item.id === app.route);
  $("page-title").textContent = route?.title || "Servora";
  switch (app.route) {
    case "tables": renderTables(); break;
    case "orders": renderOrders(); break;
    case "reservations": renderReservations(); break;
    case "products": renderProducts(); break;
    case "team": renderTeam(); break;
    case "shifts": renderShifts(); break;
    case "analytics": renderAnalytics(); break;
    case "reviews": renderReviews(); break;
    case "stations": renderStations(); break;
    case "settings": renderSettings(); break;
    default: renderOverview();
  }
}

function metric(title, value, note, symbol) {
  return `
    <article class="metric">
      <div class="metric-head"><span>${escapeHTML(title)}</span><b class="metric-symbol">${symbol}</b></div>
      <strong>${escapeHTML(value)}</strong>
      <small>${escapeHTML(note)}</small>
    </article>
  `;
}

function renderOverview() {
  const todayReservations = app.data.reservations.filter(
    (reservation) => sameDay(reservation.time) && !["Storniert", "Nicht erschienen"].includes(reservation.status)
  );
  const activeTables = app.data.tables.filter((table) => table.status === "besetzt");
  const openTickets = app.data.tickets.filter((ticket) => ["Neu", "In Zubereitung", "Fertig"].includes(ticket.status));
  const revenue = app.data.paymentRecords
    .filter((payment) => sameDay(payment.createdAt))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activities = [
    ...todayReservations.map((reservation) => ({
      symbol: "R",
      title: reservation.name,
      subtitle: `${reservation.guests} Personen · ${reservation.status}`,
      date: reservation.time
    })),
    ...openTickets.map((ticket) => ({
      symbol: "B",
      title: `${ticket.table} · ${ticket.station}`,
      subtitle: `${ticket.lineItems?.length || ticket.items?.length || 0} Positionen · ${ticket.status}`,
      date: ticket.createdAt
    }))
  ].sort((a, b) => dateFromSwift(a.date) - dateFromSwift(b.date)).slice(0, 8);

  $("view").innerHTML = `
    <div class="metric-grid">
      ${metric("Umsatz heute", formatCurrency(revenue), canManage() ? "Erfasste Zahlungen" : "Für deine Rolle", "€")}
      ${metric("Reservierungen", String(todayReservations.length), `${todayReservations.reduce((sum, item) => sum + Number(item.guests || 0), 0)} Personen`, "□")}
      ${metric("Aktive Tische", String(activeTables.length), `${app.data.tables.length} Tische insgesamt`, "▦")}
      ${metric("Offene Bons", String(openTickets.length), `${openTickets.filter((ticket) => ticket.status === "Fertig").length} abholbereit`, "☷")}
    </div>
    <div class="split-layout">
      <section class="section">
        <header class="section-header"><div><h2>Heute im Betrieb</h2><span>Live aus Servora</span></div></header>
        <div class="section-body">
          ${activities.length ? `
            <div class="activity-list">${activities.map((item) => `
              <div class="activity-row">
                <span class="activity-icon">${item.symbol}</span>
                <div class="activity-copy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.subtitle)}</span></div>
                <time>${formatDate(item.date, { hour: "2-digit", minute: "2-digit" })}</time>
              </div>`).join("")}
            </div>` : emptyHTML("Noch nichts los", "Reservierungen und Bestellungen erscheinen hier automatisch.")}
        </div>
      </section>
      <section class="section">
        <header class="section-header"><div><h2>Schnellzugriff</h2><span>Häufige Aktionen</span></div></header>
        <div class="section-body compact-list">
          ${quickAction("reservations", "Reservierung anlegen", "Gast und Tisch eintragen", "R")}
          ${routeAllowed("tables") ? quickAction("tables", "Tisch öffnen", "Walk-in platzieren oder bestellen", "T") : ""}
          ${routeAllowed("orders") ? quickAction("orders", "Bons prüfen", "Küche und Abholung", "B") : ""}
          ${routeAllowed("shifts") ? quickAction("shifts", "Schicht verwalten", "Ein- und ausstempeln", "S") : ""}
        </div>
      </section>
    </div>
  `;
}

function quickAction(route, title, subtitle, symbol) {
  if (!routeAllowed(route)) return "";
  return `
    <button class="compact-row quiet full" type="button" data-route="${route}">
      <span class="activity-icon">${symbol}</span>
      <span class="activity-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(subtitle)}</span></span>
      <span>›</span>
    </button>
  `;
}

function emptyHTML(title, text) {
  return `
    <div class="empty-state">
      <img class="empty-mark" src="../assets/servora-app-icon.png" alt="">
      <h2>${escapeHTML(title)}</h2>
      <p>${escapeHTML(text)}</p>
    </div>
  `;
}

function tableStatusColor(status) {
  return {
    frei: "#0a8f70",
    besetzt: "#2878c7",
    reserviert: "#e9ad28",
    reinigen: "#7a55b3"
  }[status] || "#68746f";
}

function itemColor(name) {
  return {
    mint: "#0a8f70",
    green: "#3d9b55",
    orange: "#ef7b45",
    red: "#c83d4d",
    purple: "#7a55b3",
    blue: "#2878c7"
  }[name] || "#2878c7";
}

function tableRunningTotal(tableID) {
  return (app.data.tableSaleItems[tableID] || [])
    .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function upcomingReservationForTable(tableID, date = new Date()) {
  return app.data.reservations
    .filter(
      (reservation) =>
        reservation.tableID === tableID &&
        sameDay(reservation.time, localDateInput(date)) &&
        ["Zu bestätigen", "Geplant", "Platziert"].includes(reservation.status)
    )
    .sort((a, b) => dateFromSwift(a.time) - dateFromSwift(b.time))[0];
}

function renderTables() {
  const areas = ["Alle", ...new Set(app.data.tables.map((table) => table.area).filter(Boolean))];
  if (!areas.includes(app.tableArea)) app.tableArea = "Alle";
  const tables = app.data.tables.filter(
    (table) => app.tableArea === "Alle" || table.area === app.tableArea
  );
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Tischübersicht</h2><p>Belegung, Reservierungen und laufende Umsätze.</p></div>
      <div class="tool-actions">
        ${canManage() ? `<button class="secondary" type="button" data-action="add-table">+ Tisch</button>` : ""}
      </div>
    </div>
    <div class="filter-row">
      ${areas.map((area) => `<button class="filter-button ${area === app.tableArea ? "selected" : ""}" type="button" data-area="${escapeHTML(area)}">${escapeHTML(area)}</button>`).join("")}
    </div>
    ${tables.length ? `<div class="table-grid">
      ${tables.map((table) => {
        const reservation = upcomingReservationForTable(table.id);
        const total = tableRunningTotal(table.id);
        return `
          <button class="table-tile" type="button" data-table-id="${table.id}"
            style="--table-color:${itemColor(table.colorName)};--status-color:${tableStatusColor(table.status)}">
            <span class="status-dot"></span>
            <div>
              <h3>${escapeHTML(table.number ? `${table.name} · ${table.number}` : table.name)}</h3>
              <p>${escapeHTML(table.area)} · ${escapeHTML(table.status)}</p>
              ${reservation ? `<span class="badge orange">${escapeHTML(reservation.name)} · ${formatDate(reservation.time, { hour: "2-digit", minute: "2-digit" })}</span>` : ""}
            </div>
            <div class="table-meta">
              <strong>${table.guests ? `${table.guests}/${table.capacity} Gäste` : `bis ${table.capacity} Gäste`}</strong>
              ${total ? `<span class="table-total">${formatCurrency(total)}</span>` : ""}
            </div>
          </button>`;
      }).join("")}
    </div>` : emptyHTML("Noch keine Tische", canManage() ? "Lege deinen ersten Bereich und Tisch an." : "Die Restaurantleitung hat noch keine Tische angelegt.")}
  `;
}

function ticketColor(status) {
  return status === "Neu" ? "#2878c7" : status === "In Zubereitung" ? "#ef7b45" : "#0a8f70";
}

function renderOrders() {
  const lanes = [
    { status: "Neu", title: "Neu" },
    { status: "In Zubereitung", title: "In Vorbereitung" },
    { status: "Fertig", title: "Fertig" }
  ];
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Küchen- und Servicebons</h2><p>Statusänderungen sind sofort für App und Web sichtbar.</p></div>
      ${routeAllowed("tables") ? `<button class="secondary" type="button" data-route="tables">Tisch auswählen</button>` : ""}
    </div>
    <div class="ticket-board">
      ${lanes.map((lane) => {
        const tickets = app.data.tickets.filter((ticket) => ticket.status === lane.status);
        return `
          <section class="ticket-lane">
            <header class="ticket-lane-header"><h3>${lane.title}</h3><span>${tickets.length}</span></header>
            <div class="ticket-stack">
              ${tickets.length ? tickets.map(ticketCard).join("") : emptyHTML("Leer", `Keine Bons in „${lane.title}“.`)}
            </div>
          </section>`;
      }).join("")}
    </div>
  `;
}

function ticketCard(ticket) {
  const nextStatus =
    ticket.status === "Neu" ? "In Zubereitung" :
    ticket.status === "In Zubereitung" ? "Fertig" : "Serviert";
  const label =
    nextStatus === "In Zubereitung" ? "Annehmen" :
    nextStatus === "Fertig" ? "Fertig" : "Abgeholt";
  return `
    <article class="ticket-card" style="--ticket-color:${ticketColor(ticket.status)}">
      <header>
        <div><h4>${escapeHTML(ticket.table)}</h4><span class="badge">${escapeHTML(ticket.station)}</span></div>
        <time>${formatDate(ticket.createdAt, { hour: "2-digit", minute: "2-digit" })}</time>
      </header>
      <ul class="ticket-items">
        ${(ticket.lineItems || []).map((item) => `<li><strong>${Number(item.quantity || 1)}×</strong> ${escapeHTML(item.name)}${item.notes ? `<br><small>${escapeHTML(item.notes)}</small>` : ""}</li>`).join("") ||
          (ticket.items || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
      </ul>
      ${ticket.isReorder ? `<span class="badge orange">Nachbestellung</span>` : ""}
      <div class="ticket-actions">
        ${ticket.status !== "Neu" ? `<button class="secondary" type="button" data-ticket-back="${ticket.id}">Zurück</button>` : ""}
        <button class="primary" type="button" data-ticket-next="${ticket.id}" data-next-status="${nextStatus}">${label}</button>
      </div>
    </article>
  `;
}

function renderReservations() {
  const reservations = app.data.reservations
    .filter((reservation) => sameDay(reservation.time, app.reservationDate))
    .sort((a, b) => dateFromSwift(a.time) - dateFromSwift(b.time));
  const active = reservations.filter((item) => !["Storniert", "Nicht erschienen"].includes(item.status));
  const tableCount = new Set(active.map((item) => item.tableID).filter(Boolean)).size;
  const guests = active.reduce((sum, item) => sum + Number(item.guests || 0), 0);
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Reservierungen</h2><p>Gäste, Tischzuweisung und Status an einem Ort.</p></div>
      <div class="tool-actions">
        <input id="reservation-date" type="date" value="${app.reservationDate}" aria-label="Reservierungsdatum">
        <button class="primary" type="button" data-action="add-reservation">+ Reservierung</button>
      </div>
    </div>
    <div class="metric-grid">
      ${metric("Buchungen", String(active.length), "am ausgewählten Tag", "□")}
      ${metric("Tische", String(tableCount), `${active.filter((item) => !item.tableID).length} ohne Tisch`, "▦")}
      ${metric("Personen", String(guests), "erwartete Gäste", "◎")}
      ${metric("Platziert", String(active.filter((item) => item.status === "Platziert").length), "aktuell im Restaurant", "✓")}
    </div>
    <section class="section table-section">
      ${reservations.length ? `
        <table class="data-table">
          <thead><tr><th>Zeit</th><th>Gast</th><th>Personen</th><th>Tisch</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${reservations.map((reservation) => `
              <tr>
                <td>${formatDate(reservation.time, { hour: "2-digit", minute: "2-digit" })}</td>
                <td><strong>${escapeHTML(reservation.name)}</strong><br><small>${escapeHTML(reservation.phone || reservation.email || "")}</small></td>
                <td>${Number(reservation.guests || 0)}</td>
                <td>${escapeHTML(reservation.table || "Nicht zugewiesen")}</td>
                <td>${statusBadge(reservation.status)}</td>
                <td><div class="row-actions"><button class="row-button" type="button" data-reservation-id="${reservation.id}">Öffnen</button></div></td>
              </tr>`).join("")}
          </tbody>
        </table>` : emptyHTML("Keine Reservierungen", "Für dieses Datum wurden noch keine Gäste eingetragen.")}
    </section>
  `;
}

function statusBadge(status) {
  const type =
    ["Geplant", "Zu bestätigen"].includes(status) ? "blue" :
    status === "Platziert" ? "green" :
    ["Storniert", "Nicht erschienen"].includes(status) ? "red" :
    status === "Warteliste" ? "purple" : "";
  return `<span class="badge ${type}">${escapeHTML(status)}</span>`;
}

function renderProducts() {
  const categories = ["Alle", ...new Set(app.data.categories)];
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Produkte</h2><p>Preise, Steuern, Kategorien und Stationen.</p></div>
      <div class="row-actions"><button class="secondary" type="button" data-action="manage-categories">Kategorien</button><button class="primary" type="button" data-action="add-product">+ Produkt</button></div>
    </div>
    <div class="filter-row">${categories.map((category, index) => `<span class="badge ${index === 0 ? "green" : ""}">${escapeHTML(category)}</span>`).join("")}</div>
    ${app.data.products.length ? `<div class="product-grid">
      ${app.data.products.map((product) => `
        <article class="product-card" style="--product-color:${itemColor(product.colorName)}">
          <header><div><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.category)} · ${escapeHTML(product.station)}</p></div>${product.isAvailable ? `<span class="badge green">Aktiv</span>` : `<span class="badge red">Pausiert</span>`}</header>
          <strong>${formatCurrency(product.price)}</strong>
          <footer><span class="badge">${Number(product.taxRate || 0)} % MwSt.</span><button class="row-button" type="button" data-product-id="${product.id}">Bearbeiten</button></footer>
        </article>`).join("")}
    </div>` : emptyHTML("Noch keine Produkte", "Erstelle Speisen und Getränke mit Preis, Steuer und Zielstation.")}
  `;
}

function openCategoryManager() {
  const rootCategories = app.data.categories.filter((category) => !app.data.categoryParents[category]);
  openModal({
    eyebrow: "Produkte",
    title: "Kategorien",
    body: `
      <form id="category-form">
        <div class="field-grid">
          <label class="field"><span>Name</span><input id="category-name" required></label>
          <label class="field"><span>Übergeordnet</span><select id="category-parent"><option value="">Keine</option>${rootCategories.map((category) => `<option>${escapeHTML(category)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Farbe</span><select id="category-color">${["blue", "mint", "green", "orange", "red", "purple"].map((color) => `<option value="${color}">${color}</option>`).join("")}</select></label>
        <button class="primary" type="button" data-modal-action="save-category">Hinzufügen</button>
      </form>
      <div class="compact-list category-manager-list">
        ${app.data.categories.map((category, index) => `
          <div class="compact-row">
            <span class="category-swatch" style="background:${itemColor(app.data.categoryColors[category] || "blue")}"></span>
            <div class="activity-copy"><strong>${escapeHTML(category)}</strong><span>${app.data.categoryParents[category] ? `Unterkategorie von ${escapeHTML(app.data.categoryParents[category])}` : "Hauptkategorie"}</span></div>
            <button class="row-button" type="button" data-modal-action="move-category-up" data-id="${escapeHTML(category)}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="row-button" type="button" data-modal-action="move-category-down" data-id="${escapeHTML(category)}" ${index === app.data.categories.length - 1 ? "disabled" : ""}>↓</button>
            <button class="row-button danger-text" type="button" data-modal-action="delete-category" data-id="${escapeHTML(category)}" ${category === "Speisen" || app.data.products.some((product) => product.category === category) ? "disabled" : ""}>−</button>
          </div>`).join("")}
      </div>`,
    footer: `<button class="primary" type="button" data-modal-action="close">Fertig</button>`
  });
}

async function saveCategory() {
  const name = $("category-name")?.value.trim();
  if (!name || app.data.categories.some((category) => category.toLowerCase() === name.toLowerCase())) {
    toast("Kategorie nicht angelegt", "Gib einen eindeutigen Namen ein.", "error");
    return;
  }
  const categories = [...app.data.categories, name];
  const categoryColors = { ...app.data.categoryColors, [name]: $("category-color").value };
  const categoryParents = { ...app.data.categoryParents };
  if ($("category-parent").value) categoryParents[name] = $("category-parent").value;
  if (await savePatch({ categories, categoryColors, categoryParents }, "Kategorie wurde angelegt.")) {
    openCategoryManager();
  }
}

async function moveCategory(name, direction) {
  const categories = [...app.data.categories];
  const index = categories.indexOf(name);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= categories.length) return;
  [categories[index], categories[destination]] = [categories[destination], categories[index]];
  if (await savePatch({ categories }, "Reihenfolge wurde gespeichert.")) openCategoryManager();
}

async function deleteCategory(name) {
  if (name === "Speisen" || app.data.products.some((product) => product.category === name)) return;
  const categoryColors = { ...app.data.categoryColors };
  const categoryParents = { ...app.data.categoryParents };
  delete categoryColors[name];
  delete categoryParents[name];
  Object.keys(categoryParents).forEach((child) => {
    if (categoryParents[child] === name) delete categoryParents[child];
  });
  if (await savePatch({
    categories: app.data.categories.filter((category) => category !== name),
    categoryColors,
    categoryParents
  }, "Kategorie wurde entfernt.")) openCategoryManager();
}

function renderTeam() {
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Team & Zugänge</h2><p>Mitarbeiter können sich anschließend in App und Web anmelden.</p></div>
      <button class="primary" type="button" data-action="add-member">+ Mitarbeiter</button>
    </div>
    <section class="section table-section">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Benutzername</th><th>Rolle</th><th>Telefon</th></tr></thead>
        <tbody>
          ${app.data.team.map((member) => `
            <tr>
              <td><strong>${escapeHTML(member.name)}</strong></td>
              <td>${escapeHTML(member.username || "–")}</td>
              <td>${statusBadge(member.role)}</td>
              <td>${escapeHTML(member.phone || "–")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderShifts() {
  const activeStart = app.data.activeShiftStart;
  const records = [...app.data.shiftRecords].sort(
    (a, b) => dateFromSwift(b.start) - dateFromSwift(a.start)
  );
  const current = currentMember();
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Meine Schicht</h2><p>${activeStart ? `Gestartet um ${formatDate(activeStart, { hour: "2-digit", minute: "2-digit" })}` : "Derzeit nicht eingestempelt."}</p></div>
      <div class="tool-actions">
        ${activeStart ? `
          <button class="secondary" type="button" data-action="toggle-break">${app.data.activeBreakStart ? "Pause beenden" : "Pause starten"}</button>
          <button class="danger" type="button" data-action="end-shift">Ausstempeln</button>
        ` : `<button class="primary" type="button" data-action="start-shift">Einstempeln</button>`}
      </div>
    </div>
    <div class="metric-grid">
      ${metric("Status", activeStart ? (app.data.activeBreakStart ? "Pause" : "Im Dienst") : "Nicht im Dienst", current?.name || app.workspace.displayName, "◷")}
      ${metric("Schichten", String(records.length), "gespeicherte Einsätze", "□")}
      ${metric("Arbeitszeit", durationText(records.reduce((sum, record) => sum + workedSeconds(record), 0)), "gesamte Aufzeichnung", "⌁")}
      ${metric("Offene Anfragen", String(app.data.shiftRequests.filter((request) => request.status === "Offen").length), "Schichtübernahmen", "↔")}
    </div>
    <section class="section table-section">
      ${records.length ? `<table class="data-table">
        <thead><tr><th>Datum</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Arbeitszeit</th></tr></thead>
        <tbody>${records.slice(0, 30).map((record) => `
          <tr><td>${formatDate(record.start, { dateStyle: "medium" })}</td><td>${formatDate(record.start, { hour: "2-digit", minute: "2-digit" })}</td><td>${formatDate(record.end, { hour: "2-digit", minute: "2-digit" })}</td><td>${durationText(record.breakDuration || 0)}</td><td><strong>${durationText(workedSeconds(record))}</strong></td></tr>`).join("")}</tbody>
      </table>` : emptyHTML("Noch keine Schichten", "Nach dem Ausstempeln erscheint deine Arbeitszeit hier.")}
    </section>
  `;
}

function workedSeconds(record) {
  const start = dateFromSwift(record.start);
  const end = dateFromSwift(record.end);
  if (!start || !end) return 0;
  return Math.max(0, (end - start) / 1000 - Number(record.breakDuration || 0));
}

function durationText(seconds) {
  const hours = Math.floor(Number(seconds || 0) / 3600);
  const minutes = Math.floor((Number(seconds || 0) % 3600) / 60);
  return `${hours} Std. ${minutes} Min.`;
}

function renderAnalytics() {
  const payments = app.data.paymentRecords;
  const revenue = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const tableRevenue = Object.values(app.data.tableRevenue).reduce((sum, item) => sum + Number(item || 0), 0);
  const reservationGuests = app.data.reservations.reduce((sum, item) => sum + Number(item.guests || 0), 0);
  const productSales = {};
  Object.values(app.data.tableSaleItems).flat().forEach((item) => {
    productSales[item.name] = (productSales[item.name] || 0) + Number(item.quantity || 1);
  });
  const topProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $("view").innerHTML = `
    <div class="page-tools"><div><h2>Betriebsstatistik</h2><p>Aus den synchronisierten Servora-Vorgängen.</p></div></div>
    <div class="metric-grid">
      ${metric("Erfasster Umsatz", formatCurrency(revenue || tableRevenue), `${payments.length} Zahlungen`, "€")}
      ${metric("Reservierungsgäste", String(reservationGuests), `${app.data.reservations.length} Buchungen`, "◎")}
      ${metric("Bons", String(app.data.tickets.length), `${app.data.tickets.filter((item) => item.status === "Serviert").length} serviert`, "☷")}
      ${metric("Bewertung", reviewAverage(), `${app.reviews.length || app.data.guestReviews.length} Rückmeldungen`, "★")}
    </div>
    <div class="split-layout">
      <section class="section"><header class="section-header"><h2>Meistbestellte Produkte</h2></header><div class="section-body compact-list">
        ${topProducts.length ? topProducts.map(([name, quantity], index) => `
          <div class="compact-row"><span class="activity-icon">${index + 1}</span><div class="activity-copy"><strong>${escapeHTML(name)}</strong><span>Bestellmenge</span></div><strong>${quantity}</strong></div>`).join("") : emptyHTML("Noch keine Produktdaten", "Nach den ersten Bestellungen entsteht hier die Auswertung.")}
      </div></section>
      <section class="section"><header class="section-header"><h2>Zahlungsarten</h2></header><div class="section-body compact-list">
        ${paymentMethodRows(payments)}
      </div></section>
    </div>
  `;
}

function paymentMethodRows(payments) {
  const groups = {};
  payments.forEach((payment) => {
    groups[payment.methodName] = (groups[payment.methodName] || 0) + Number(payment.amount || 0);
  });
  const entries = Object.entries(groups);
  return entries.length ? entries.map(([name, amount]) => `
    <div class="compact-row"><span class="activity-icon">€</span><div class="activity-copy"><strong>${escapeHTML(name)}</strong><span>Zahlungen</span></div><strong>${formatCurrency(amount)}</strong></div>`).join("") : emptyHTML("Noch keine Zahlungen", "Zahlungsarten werden nach dem Kassieren ausgewertet.");
}

function reviewAverage() {
  const reviews = app.reviews.length ? app.reviews : app.data.guestReviews;
  if (!reviews.length) return "–";
  return `${(reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)} / 5`;
}

async function renderReviews() {
  $("view").innerHTML = emptyHTML("Bewertungen werden geladen", "Einen Moment bitte.");
  try {
    app.reviews = await rpc("list_guest_reviews", {
      p_restaurant_id: app.workspace.restaurantId
    }) || [];
  } catch {
    app.reviews = app.data.guestReviews || [];
  }
  $("view").innerHTML = `
    <div class="page-tools"><div><h2>Gästebewertungen</h2><p>${reviewAverage()} aus ${app.reviews.length} Rückmeldungen.</p></div></div>
    <section class="section"><div class="section-body">
      ${app.reviews.length ? `<div class="activity-list">${app.reviews.map((review) => `
        <article class="activity-row">
          <span class="activity-icon">★</span>
          <div class="activity-copy"><strong>${escapeHTML(review.guest_name || review.guestName)} · ${Math.max(1, Math.min(5, Number(review.rating)))} von 5</strong><span>${escapeHTML(review.comment || "Keine schriftliche Rückmeldung")}${review.contact_requested || review.contactRequested ? " · Kontakt gewünscht" : ""}</span></div>
          <time>${formatDate(review.created_at || review.createdAt, { dateStyle: "medium" })}</time>
        </article>`).join("")}</div>` : emptyHTML("Noch keine Bewertungen", "Nach abgeschlossenen Besuchen können Gäste eine verifizierte Rückmeldung senden.")}
    </div></section>
  `;
}

function renderStations() {
  $("view").innerHTML = `
    <div class="page-tools"><div><h2>Stationen</h2><p>Routing für digitale Küche und Bondruck.</p></div><button class="primary" type="button" data-action="add-station">+ Station</button></div>
    <section class="section table-section">
      ${app.data.stations.length ? `<table class="data-table"><thead><tr><th>Name</th><th>Übertragung</th><th>Warnzeit</th><th>Status</th><th></th></tr></thead><tbody>
        ${app.data.stations.map((station) => `<tr><td><strong>${escapeHTML(station.name)}</strong></td><td>${station.defaultMode === "digital" ? "Digitale Küche" : "Bondruck"}</td><td>${Number(station.warningMinutes || 12)} Min.</td><td>${station.isActive ? `<span class="badge green">Aktiv</span>` : `<span class="badge">Inaktiv</span>`}</td><td><div class="row-actions"><button class="row-button" type="button" data-station-id="${station.id}">Bearbeiten</button></div></td></tr>`).join("")}
      </tbody></table>` : emptyHTML("Noch keine Station", "Lege Küche, Bar oder eine eigene Station an.")}
    </section>
  `;
}

function renderSettings() {
  const fiscal = app.data.fiscalConfiguration;
  const booking = app.data.onlineBookingConfiguration;
  const cashDay = activeCashDay();
  $("view").innerHTML = `
    <div class="page-tools"><div><h2>Einstellungen</h2><p>Restaurant, Online-Buchung und Kassenvorbereitung.</p></div></div>
    <div class="split-layout">
      <section class="section">
        <header class="section-header"><h2>Restaurant</h2></header>
        <div class="section-body">
          <form id="restaurant-settings-form">
            <label class="field"><span>Name</span><input id="settings-name" value="${escapeHTML(app.data.restaurantName)}" required></label>
            <label class="field"><span>Restaurantkennung</span><input value="${escapeHTML(app.workspace.restaurantCode)}" readonly></label>
            <button class="primary" type="submit">Speichern</button>
          </form>
        </div>
      </section>
      <section class="section">
        <header class="section-header"><h2>Technische Kassenbereitschaft</h2></header>
        <div class="section-body compact-list">
          ${settingStatus("Testmodus", fiscal.isTestMode ? "Aktiv" : "Aus", !fiscal.isTestMode)}
          ${settingStatus("TSE", fiscal.fiscalizationState === "ready" ? "Bereit" : "Nicht konfiguriert", fiscal.fiscalizationState === "ready")}
          ${settingStatus("DSFinV-K", fiscal.dsfinvKVersion || "2.4", Boolean(fiscal.dsfinvKVersion))}
          <p class="field-hint">Web-Zahlungen bleiben gesperrt, solange keine zertifizierte TSE angebunden ist.</p>
        </div>
      </section>
      <section class="section">
        <header class="section-header"><h2>Betriebstag</h2>${cashDay ? `<span class="badge ${sameDay(cashDay.businessDate) ? "green" : "warning"}">${sameDay(cashDay.businessDate) ? "Heute geöffnet" : "Vortag offen"}</span>` : `<span class="badge">Geschlossen</span>`}</header>
        <div class="section-body">
          ${cashDay ? `
            <div class="compact-list">
              ${settingStatus("Geschäftsdatum", formatDate(cashDay.businessDate, { dateStyle: "long" }), sameDay(cashDay.businessDate))}
              ${settingStatus("Geöffnet von", cashDay.openedBy || app.workspace.displayName, true)}
              ${settingStatus("Startbestand", formatCurrency(cashDay.openingFloat), true)}
            </div>
            <form id="cash-day-close-form">
              <label class="field"><span>Gezählter Kassenbestand</span><input id="cash-day-actual" type="number" min="0" step="0.01" required></label>
              <label class="field"><span>Abschlussnotiz</span><textarea id="cash-day-note"></textarea></label>
              <button class="danger" type="submit">Tag abschließen</button>
            </form>` : `
            <form id="cash-day-open-form">
              <label class="field"><span>Startbestand</span><input id="cash-day-float" type="number" min="0" step="0.01" value="0" required></label>
              <button class="primary" type="submit">Tag öffnen</button>
            </form>`}
        </div>
      </section>
      <section class="section">
        <header class="section-header"><h2>Online-Reservierung</h2></header>
        <div class="section-body">
          <p>${booking?.restaurant?.settings?.bookingEnabled ? `<span class="badge green">Veröffentlicht</span>` : `<span class="badge">Nicht veröffentlicht</span>`}</p>
          <p class="field-hint">Die umfangreichen Buchungszeiten und Sperren werden weiterhin sicher in der App verwaltet.</p>
          ${booking?.publicID ? `<a class="secondary" href="../?r=${encodeURIComponent(booking.publicID)}" target="_blank" rel="noopener">Reservierungsseite öffnen</a>` : ""}
        </div>
      </section>
      <section class="section">
        <header class="section-header"><h2>Geräte & Drucker</h2></header>
        <div class="section-body">
          <p>Gerätezugänge werden absichtlich nicht im Browser angemeldet.</p>
          <p class="field-hint">Digitale Küchenstationen und Drucker verwenden die Servora-App im geschützten Vollbildmodus.</p>
        </div>
      </section>
    </div>
  `;
}

function settingStatus(title, value, positive) {
  return `<div class="compact-row"><span class="activity-icon">${positive ? "✓" : "!"}</span><div class="activity-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(value)}</span></div><span class="badge ${positive ? "green" : "orange"}">${positive ? "Bereit" : "Offen"}</span></div>`;
}

function openModal({ eyebrow = "Servora", title, body, footer = "" }) {
  $("modal-eyebrow").textContent = eyebrow;
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = body;
  $("modal-footer").innerHTML = footer;
  if (!$("modal").open) $("modal").showModal();
}

function closeModal() {
  $("modal").close();
}

function showMoreNavigation() {
  const items = roleRouteList().filter(
    (route) => !["overview", "tables", "orders", "reservations"].includes(route.id)
  );
  openModal({
    title: "Mehr",
    body: `
      <div class="compact-list">${items.map((route) => quickAction(route.id, route.title, "Öffnen", route.symbol)).join("")}</div>
      <div class="modal-account-actions">
        <button class="secondary full" type="button" data-modal-action="account">Restaurant & Konto</button>
        <button class="quiet full" type="button" data-modal-action="logout">Abmelden</button>
      </div>`
  });
}

function openTable(tableID) {
  const table = app.data.tables.find((item) => item.id === tableID);
  if (!table) return;
  const reservation = upcomingReservationForTable(tableID);
  const total = tableRunningTotal(tableID);
  const body = `
    <div class="metric-grid">
      ${metric("Status", table.status, table.area, "▦")}
      ${metric("Gäste", `${table.guests || 0}/${table.capacity}`, reservation?.name || "Keine Reservierung", "◎")}
    </div>
    ${reservation && ["frei", "reserviert"].includes(table.status) ? `
      <div class="review-block">
        <strong>${escapeHTML(reservation.name)}</strong>
        <p>${Number(reservation.guests)} Personen · ${formatDate(reservation.time)}</p>
        ${reservation.status === "Geplant" ? `<button class="primary full" type="button" data-modal-action="place-reservation" data-id="${reservation.id}">Reservierung platzieren</button>` : ""}
      </div>` : ""}
    ${["frei", "reserviert"].includes(table.status) ? `
      <label class="field"><span>Walk-in Gäste</span><input id="walkin-guests" type="number" min="1" max="${table.capacity}" value="${Math.min(2, table.capacity)}"></label>
      <button class="primary full" type="button" data-modal-action="walkin" data-id="${table.id}">Walk-in platzieren</button>
    ` : ""}
    ${table.status === "besetzt" ? `
      <div class="review-block"><strong>Laufender Umsatz: ${formatCurrency(total)}</strong></div>
      <button class="primary full" type="button" data-modal-action="order" data-id="${table.id}">Bestellung aufnehmen</button>
      <button class="danger full" type="button" data-modal-action="end-visit" data-id="${table.id}">Besuch beenden</button>
    ` : ""}
    ${table.status === "reinigen" ? `<button class="primary full" type="button" data-modal-action="cleaned" data-id="${table.id}">Als gereinigt markieren</button>` : ""}
  `;
  openModal({ eyebrow: table.area, title: table.number ? `${table.name} · ${table.number}` : table.name, body });
}

async function placeWalkIn(tableID) {
  const guests = Math.max(1, Number($("walkin-guests")?.value || 1));
  const tables = structuredClone(app.data.tables);
  const table = tables.find((item) => item.id === tableID);
  if (!table) return;
  table.guests = Math.min(guests, table.capacity);
  table.status = "besetzt";
  const reservations = structuredClone(app.data.reservations);
  reservations.push({
    id: uuid(),
    name: "Walk-in",
    email: "",
    phone: "",
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    notes: "",
    tableID: table.id,
    table: table.number ? `${table.name} · ${table.number}` : table.name,
    guests: table.guests,
    time: swiftDate(),
    status: "Platziert",
    createdBy: app.workspace.displayName,
    source: "Laufkundschaft",
    receivedAt: swiftDate(),
    waitlistPosition: null
  });
  if (await savePatch({ tables, reservations }, "Walk-in wurde platziert.")) {
    closeModal();
    openOrder(tableID);
  }
}

async function placeReservation(reservationID) {
  const reservations = structuredClone(app.data.reservations);
  const reservation = reservations.find((item) => item.id === reservationID);
  if (!reservation?.tableID) return;
  reservation.status = "Platziert";
  const tables = structuredClone(app.data.tables);
  const table = tables.find((item) => item.id === reservation.tableID);
  if (table) {
    table.status = "besetzt";
    table.guests = Math.min(Number(reservation.guests || 1), table.capacity);
  }
  if (await savePatch({ tables, reservations }, "Reservierung wurde platziert.")) {
    closeModal();
    openOrder(reservation.tableID);
  }
}

async function setTableStatus(tableID, status, guests = 0) {
  const tables = structuredClone(app.data.tables);
  const table = tables.find((item) => item.id === tableID);
  if (!table) return;
  table.status = status;
  table.guests = guests;
  const patch = { tables };
  if (status === "reinigen") {
    patch.tableSaleItems = { ...app.data.tableSaleItems, [tableID]: [] };
  }
  if (await savePatch(patch, status === "frei" ? "Tisch ist wieder frei." : "Besuch wurde beendet.")) {
    closeModal();
  }
}

function openOrder(tableID) {
  const table = app.data.tables.find((item) => item.id === tableID);
  if (!table) return;
  app.orderTableID = tableID;
  app.orderCart = [];
  renderOrderModal(table);
}

function renderOrderModal(table) {
  const categories = app.data.categories.filter((category) =>
    app.data.products.some((product) => product.category === category)
  );
  const cashDay = activeCashDay();
  const cartTotal = app.orderCart.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );
  openModal({
    eyebrow: table.area,
    title: `Bestellung · ${table.number ? `${table.name} ${table.number}` : table.name}`,
    body: `
      ${app.data.products.length ? categories.map((category) => `
        <div class="review-block">
          <h3>${escapeHTML(category)}</h3>
          <div class="product-grid">
            ${app.data.products.filter((product) => product.category === category && product.isAvailable).map((product) => `
              <button class="product-card" type="button" data-modal-action="add-cart" data-id="${product.id}" style="--product-color:${itemColor(product.colorName)}">
                <strong>${escapeHTML(product.name)}</strong><span>${formatCurrency(product.price)}</span>
              </button>`).join("")}
          </div>
        </div>`).join("") : emptyHTML("Keine Produkte", "Die Restaurantleitung muss zuerst Produkte anlegen.")}
      <div class="section">
        <header class="section-header"><h3>Auswahl</h3><strong>${formatCurrency(cartTotal)}</strong></header>
        <div class="section-body compact-list">
          ${app.orderCart.length ? app.orderCart.map((item) => `
            <div class="compact-row"><span class="activity-icon">${item.quantity}</span><div class="activity-copy"><strong>${escapeHTML(item.name)}</strong><span>${formatCurrency(item.price)} je Position</span></div><button class="row-button" type="button" data-modal-action="remove-cart" data-id="${item.productID}">−</button></div>`).join("") : `<p class="field-hint">Tippe auf Produkte, um sie hinzuzufügen.</p>`}
        </div>
      </div>
      ${cashDay ? "" : `<div class="inline-alert"><strong>Betriebstag geschlossen</strong><span>Öffne den Tag in den Einstellungen, bevor du bonierst.</span></div>`}
      ${cashDay && !sameDay(cashDay.businessDate) ? `<div class="inline-alert"><strong>Vortag noch offen</strong><span>Diese Bestellung wird dem Betriebstag ${escapeHTML(formatDate(cashDay.businessDate, { dateStyle: "medium" }))} zugeordnet.</span></div>` : ""}`,
    footer: `
      <button class="secondary" type="button" data-modal-action="close">Abbrechen</button>
      <button class="primary" type="button" data-modal-action="submit-order" ${app.orderCart.length && cashDay ? "" : "disabled"}>Bonieren · ${formatCurrency(cartTotal)}</button>
    `
  });
}

function addCart(productID) {
  const product = app.data.products.find((item) => item.id === productID);
  const table = app.data.tables.find((item) => item.id === app.orderTableID);
  if (!product || !table) return;
  if (product.optionGroups?.length) {
    openProductOptions(product);
    return;
  }
  commitCartProduct(product, []);
}

function commitCartProduct(product, options) {
  const table = app.data.tables.find((item) => item.id === app.orderTableID);
  if (!product || !table) return;
  const extras = options.map((option) =>
    Number(option.priceDelta || 0)
      ? `${option.name} (+${formatCurrency(option.priceDelta)})`
      : option.name
  );
  const existing = app.orderCart.find(
    (item) => item.productID === product.id && JSON.stringify(item.extras || []) === JSON.stringify(extras)
  );
  if (existing) existing.quantity += 1;
  else {
    app.orderCart.push({
      id: uuid(),
      productID: product.id,
      name: product.name,
      station: product.station,
      price: Number(product.price) + options.reduce((sum, option) => sum + Number(option.priceDelta || 0), 0),
      quantity: 1,
      variants: [],
      extras,
      notes: "",
      allergens: product.allergens || [],
      itemKind: "product",
      taxRate: Number(product.taxRate || 19),
      voucherCode: null
    });
  }
  renderOrderModal(table);
}

function openProductOptions(product) {
  openModal({
    eyebrow: product.category,
    title: product.name,
    body: `
      <form id="product-options-form" data-id="${product.id}">
        ${(product.optionGroups || []).map((group) => `
          <fieldset class="option-group" data-group-id="${group.id}" data-min="${Number(group.minSelections || 0)}" data-max="${Number(group.maxSelections || 1)}">
            <legend>${escapeHTML(group.name)} ${Number(group.minSelections || 0) > 0 ? "<span>Erforderlich</span>" : "<span>Optional</span>"}</legend>
            ${(group.options || []).map((option) => `
              <label class="check">
                <input type="${Number(group.maxSelections || 1) === 1 ? "radio" : "checkbox"}" name="group-${group.id}" value="${option.id}">
                <span>${escapeHTML(option.name)}</span>
                <strong>${Number(option.priceDelta || 0) ? `+${formatCurrency(option.priceDelta)}` : ""}</strong>
              </label>`).join("")}
          </fieldset>`).join("")}
      </form>`,
    footer: `
      <button class="secondary" type="button" data-modal-action="order" data-id="${app.orderTableID}">Zurück</button>
      <button class="primary" type="button" data-modal-action="add-configured-cart" data-id="${product.id}">Hinzufügen</button>`
  });
}

function addConfiguredCart(productID) {
  const product = app.data.products.find((item) => item.id === productID);
  const form = $("product-options-form");
  if (!product || !form) return;
  const selected = [];
  for (const group of product.optionGroups || []) {
    const values = [...form.querySelectorAll(`[name="group-${group.id}"]:checked`)].map((input) => input.value);
    if (values.length < Number(group.minSelections || 0)) {
      toast("Auswahl fehlt", `Wähle bei „${group.name}“ mindestens ${group.minSelections} Option aus.`, "error");
      return;
    }
    selected.push(...(group.options || []).filter((option) => values.includes(option.id)));
  }
  commitCartProduct(product, selected);
}

function removeCart(productID) {
  const item = app.orderCart.find((entry) => entry.productID === productID);
  const table = app.data.tables.find((entry) => entry.id === app.orderTableID);
  if (!item || !table) return;
  item.quantity -= 1;
  if (item.quantity <= 0) app.orderCart = app.orderCart.filter((entry) => entry !== item);
  renderOrderModal(table);
}

async function submitOrder() {
  const table = app.data.tables.find((item) => item.id === app.orderTableID);
  if (!table || !app.orderCart.length || table.status !== "besetzt") return;
  const cashDay = activeCashDay();
  if (!cashDay) {
    toast("Betriebstag geschlossen", "Öffne zuerst den Betriebstag in den Einstellungen.", "error");
    return;
  }
  if (!sameDay(cashDay.businessDate)
      && !window.confirm("Der offene Betriebstag ist vom Vortag. Trotzdem auf diesen Tag bonieren?")) {
    return;
  }
  const tickets = structuredClone(app.data.tickets);
  const saleItems = structuredClone(app.data.tableSaleItems);
  saleItems[table.id] = [...(saleItems[table.id] || []), ...structuredClone(app.orderCart)];
  const grouped = Map.groupBy
    ? Map.groupBy(app.orderCart, (item) => item.station)
    : app.orderCart.reduce((map, item) => {
        const list = map.get(item.station) || [];
        list.push(item);
        map.set(item.station, list);
        return map;
      }, new Map());
  for (const [station, items] of grouped) {
    const ticketID = uuid();
    const createdAt = swiftDate();
    tickets.push({
      id: ticketID,
      table: table.number ? `${table.name} · ${table.number}` : table.name,
      station,
      items: items.map((item) => `${item.quantity}x ${item.name}`),
      status: "Neu",
      minutesWaiting: 0,
      createdAt,
      updatedAt: createdAt,
      area: table.area,
      guests: table.guests,
      orderNumber: `#${ticketID.slice(0, 6).toUpperCase()}`,
      serviceName: app.workspace.displayName,
      course: "Hauptgang",
      priority: "Normal",
      lineItems: items.map((item) => ({
        id: uuid(),
        productID: item.productID,
        name: item.name,
        quantity: item.quantity,
        variants: item.variants || [],
        extras: item.extras || [],
        notes: item.notes || "",
        allergens: item.allergens || [],
        status: "Offen"
      })),
      comments: [],
      isReorder: Boolean((saleItems[table.id] || []).length > app.orderCart.length),
      isDeferred: false,
      deferredAt: null
    });
  }
  if (await savePatch({ tickets, tableSaleItems: saleItems }, "Bestellung erfolgreich abgeschickt.")) {
    closeModal();
    navigate("tables");
  }
}

async function updateTicket(ticketID, direction, explicitStatus = null) {
  const order = ["Neu", "In Zubereitung", "Fertig", "Serviert"];
  const tickets = structuredClone(app.data.tickets);
  const ticket = tickets.find((item) => item.id === ticketID);
  if (!ticket) return;
  const current = order.indexOf(ticket.status);
  ticket.status = explicitStatus || order[Math.max(0, Math.min(order.length - 1, current + direction))];
  ticket.updatedAt = swiftDate();
  if (["Fertig", "Serviert"].includes(ticket.status)) {
    (ticket.lineItems || []).forEach((item) => { item.status = "Fertig"; });
  }
  await savePatch({ tickets }, `Bon ist jetzt „${ticket.status}“.`);
}

function openReservationEditor(reservationID = null, initialTableID = null) {
  const reservation = app.data.reservations.find((item) => item.id === reservationID);
  const date = reservation ? dateFromSwift(reservation.time) : new Date(`${app.reservationDate}T18:00:00`);
  const tableOptions = app.data.tables
    .filter((table) => !table.isPlaceholder)
    .map((table) => `<option value="${table.id}" ${(reservation?.tableID || initialTableID) === table.id ? "selected" : ""}>${escapeHTML(table.number ? `${table.name} · ${table.number}` : table.name)} · ${escapeHTML(table.area)}</option>`)
    .join("");
  openModal({
    eyebrow: reservation ? "Bearbeiten" : "Neu",
    title: "Reservierung",
    body: `
      <form id="reservation-form" data-id="${reservation?.id || ""}">
        <label class="field"><span>Gastname</span><input id="reservation-name" value="${escapeHTML(reservation?.name || "")}" required></label>
        <div class="field-grid">
          <label class="field"><span>E-Mail</span><input id="reservation-email" type="email" value="${escapeHTML(reservation?.email || "")}"></label>
          <label class="field"><span>Telefon</span><input id="reservation-phone" type="tel" value="${escapeHTML(reservation?.phone || "")}"></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>Datum</span><input id="reservation-form-date" type="date" value="${localDateInput(date)}" required></label>
          <label class="field"><span>Uhrzeit</span><input id="reservation-form-time" type="time" step="900" value="${date.toTimeString().slice(0, 5)}" required></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>Personen</span><input id="reservation-guests" type="number" min="1" max="100" value="${Number(reservation?.guests || 2)}" required></label>
          <label class="field"><span>Tisch</span><select id="reservation-table"><option value="">Noch nicht zuweisen</option>${tableOptions}</select></label>
        </div>
        <label class="field"><span>Adresse</span><input id="reservation-address" value="${escapeHTML([reservation?.street, reservation?.houseNumber].filter(Boolean).join(" "))}" placeholder="Straße und Hausnummer"></label>
        <div class="field-grid">
          <label class="field"><span>Postleitzahl</span><input id="reservation-postal" value="${escapeHTML(reservation?.postalCode || "")}"></label>
          <label class="field"><span>Ort</span><input id="reservation-city" value="${escapeHTML(reservation?.city || "")}"></label>
        </div>
        <label class="field"><span>Notiz</span><textarea id="reservation-notes" rows="3">${escapeHTML(reservation?.notes || "")}</textarea></label>
      </form>`,
    footer: `
      ${reservation ? `<button class="danger" type="button" data-modal-action="cancel-reservation" data-id="${reservation.id}">Stornieren</button>` : ""}
      <button class="secondary" type="button" data-modal-action="close">Abbrechen</button>
      <button class="primary" type="button" data-modal-action="save-reservation">Speichern</button>
    `
  });
}

async function saveReservation() {
  const form = $("reservation-form");
  if (!form?.reportValidity()) return;
  const tableID = $("reservation-table").value || null;
  if (!tableID && !window.confirm("Willst du die Reservierung wirklich ohne Tisch speichern?")) return;
  const reservations = structuredClone(app.data.reservations);
  const existing = reservations.find((item) => item.id === form.dataset.id);
  const table = app.data.tables.find((item) => item.id === tableID);
  const address = $("reservation-address").value.trim().split(/\s+/);
  const record = {
    id: existing?.id || uuid(),
    name: $("reservation-name").value.trim(),
    email: $("reservation-email").value.trim(),
    phone: $("reservation-phone").value.trim(),
    street: address.length > 1 ? address.slice(0, -1).join(" ") : address.join(" "),
    houseNumber: address.length > 1 ? address.at(-1) : "",
    postalCode: $("reservation-postal").value.trim(),
    city: $("reservation-city").value.trim(),
    notes: $("reservation-notes").value.trim(),
    tableID,
    table: table ? (table.number ? `${table.name} · ${table.number}` : table.name) : null,
    guests: Number($("reservation-guests").value),
    time: swiftDate(dateTimeFromInputs($("reservation-form-date").value, $("reservation-form-time").value)),
    status: existing?.status || "Geplant",
    createdBy: existing?.createdBy || app.workspace.displayName,
    source: existing?.source || "Mitarbeiter",
    receivedAt: existing?.receivedAt || swiftDate(),
    waitlistPosition: existing?.waitlistPosition || null
  };
  if (existing) Object.assign(existing, record);
  else reservations.push(record);
  if (await savePatch({ reservations }, existing ? "Reservierung wurde aktualisiert." : "Reservierung wurde angelegt.")) closeModal();
}

async function changeReservationStatus(reservationID, status) {
  const reservations = structuredClone(app.data.reservations);
  const reservation = reservations.find((item) => item.id === reservationID);
  if (!reservation) return;
  reservation.status = status;
  await savePatch({ reservations }, `Reservierung ist jetzt „${status}“.`);
  closeModal();
}

function openProductEditor(productID = null) {
  const product = app.data.products.find((item) => item.id === productID);
  const stations = app.data.stations.map((station) => `<option ${product?.station === station.name ? "selected" : ""}>${escapeHTML(station.name)}</option>`).join("");
  const categories = app.data.categories.map((category) => `<option ${product?.category === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("");
  openModal({
    eyebrow: product ? "Bearbeiten" : "Neu",
    title: "Produkt",
    body: `
      <form id="product-form" data-id="${product?.id || ""}">
        <label class="field"><span>Name</span><input id="product-name" value="${escapeHTML(product?.name || "")}" required></label>
        <div class="field-grid">
          <label class="field"><span>Kategorie</span><select id="product-category">${categories}</select></label>
          <label class="field"><span>Station</span><select id="product-station">${stations}</select></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>Preis</span><input id="product-price" type="number" min="0" step="0.01" value="${Number(product?.price || 0)}" required></label>
          <label class="field"><span>Mehrwertsteuer</span><select id="product-tax"><option value="19" ${Number(product?.taxRate) === 19 ? "selected" : ""}>19 %</option><option value="7" ${Number(product?.taxRate) === 7 ? "selected" : ""}>7 %</option><option value="0" ${Number(product?.taxRate) === 0 ? "selected" : ""}>0 %</option></select></label>
        </div>
        <label class="field"><span>Beschreibung</span><textarea id="product-description">${escapeHTML(product?.productDescription || "")}</textarea></label>
        <label class="check"><input id="product-available" type="checkbox" ${product?.isAvailable !== false ? "checked" : ""}><span>Produkt ist verfügbar</span></label>
        <div class="review-block">
          <div class="section-header"><h3>Auswahl und Extras</h3><button class="row-button" type="button" data-modal-action="add-option-group">+ Gruppe</button></div>
          <div id="product-option-groups">
            ${(product?.optionGroups || []).map(optionGroupEditorHTML).join("")}
          </div>
          <p class="field-hint">Beispiele: Beilage, Garstufe oder „Pommes +1,00 €“.</p>
        </div>
      </form>`,
    footer: `
      ${product ? `<button class="danger" type="button" data-modal-action="delete-product" data-id="${product.id}">Löschen</button>` : ""}
      <button class="secondary" type="button" data-modal-action="close">Abbrechen</button>
      <button class="primary" type="button" data-modal-action="save-product">Speichern</button>`
  });
}

function optionGroupEditorHTML(group = {}) {
  const groupID = group.id || uuid();
  return `
    <div class="option-group-editor" data-group-id="${groupID}">
      <div class="field-grid">
        <label class="field"><span>Gruppenname</span><input data-option-field="name" value="${escapeHTML(group.name || "")}" placeholder="z. B. Beilage" required></label>
        <label class="field"><span>Maximale Auswahl</span><input data-option-field="max" type="number" min="1" max="10" value="${Number(group.maxSelections || 1)}"></label>
      </div>
      <label class="check"><input data-option-field="required" type="checkbox" ${Number(group.minSelections || 0) > 0 ? "checked" : ""}><span>Auswahl erforderlich</span></label>
      <div data-options>
        ${(group.options || []).map(optionEditorHTML).join("")}
      </div>
      <div class="row-actions">
        <button class="row-button" type="button" data-modal-action="add-product-option" data-id="${groupID}">+ Option</button>
        <button class="row-button danger-text" type="button" data-modal-action="remove-option-group" data-id="${groupID}">Gruppe entfernen</button>
      </div>
    </div>`;
}

function optionEditorHTML(option = {}) {
  return `
    <div class="option-editor" data-option-id="${option.id || uuid()}">
      <input data-option-value="name" value="${escapeHTML(option.name || "")}" placeholder="Option" required>
      <input data-option-value="price" type="number" step="0.01" value="${Number(option.priceDelta || 0)}" aria-label="Aufpreis">
      <button class="row-button" type="button" data-modal-action="remove-product-option" aria-label="Option entfernen">−</button>
    </div>`;
}

function addOptionGroupEditor() {
  $("product-option-groups")?.insertAdjacentHTML("beforeend", optionGroupEditorHTML());
}

function addProductOptionEditor(groupID) {
  document
    .querySelector(`.option-group-editor[data-group-id="${groupID}"] [data-options]`)
    ?.insertAdjacentHTML("beforeend", optionEditorHTML());
}

function readProductOptionGroups() {
  return [...document.querySelectorAll(".option-group-editor")].map((group) => ({
    id: group.dataset.groupId,
    name: group.querySelector('[data-option-field="name"]').value.trim(),
    minSelections: group.querySelector('[data-option-field="required"]').checked ? 1 : 0,
    maxSelections: Number(group.querySelector('[data-option-field="max"]').value || 1),
    options: [...group.querySelectorAll(".option-editor")].map((option) => ({
      id: option.dataset.optionId,
      name: option.querySelector('[data-option-value="name"]').value.trim(),
      priceDelta: Number(option.querySelector('[data-option-value="price"]').value || 0)
    })).filter((option) => option.name)
  })).filter((group) => group.name && group.options.length);
}

async function saveProduct() {
  const form = $("product-form");
  if (!form?.reportValidity()) return;
  const products = structuredClone(app.data.products);
  const existing = products.find((item) => item.id === form.dataset.id);
  const product = {
    id: existing?.id || uuid(),
    name: $("product-name").value.trim(),
    category: $("product-category").value,
    station: $("product-station").value,
    price: Number($("product-price").value),
    isAvailable: $("product-available").checked,
    colorName: existing?.colorName || "mint",
    taxRate: Number($("product-tax").value),
    sku: existing?.sku || "",
    productDescription: $("product-description").value.trim(),
    allergens: existing?.allergens || [],
    sortOrder: Number(existing?.sortOrder || products.length),
    optionGroups: readProductOptionGroups()
  };
  if (existing) Object.assign(existing, product);
  else products.push(product);
  if (await savePatch({ products }, "Produkt wurde gespeichert.")) closeModal();
}

async function openCashDay(event) {
  event.preventDefault();
  const openingFloat = Number($("cash-day-float")?.value || 0);
  if (openingFloat < 0 || activeCashDay()) return;
  const sessions = structuredClone(app.data.cashDaySessions || []);
  const now = new Date();
  sessions.unshift({
    id: uuid(),
    businessDate: swiftDate(new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    openedAt: swiftDate(now),
    openedBy: app.workspace.displayName,
    openingFloat,
    status: "open",
    closedAt: null,
    closedBy: null,
    expectedCash: null,
    actualCash: null,
    closingNote: ""
  });
  if (await savePatch({ cashDaySessions: sessions }, "Betriebstag wurde geöffnet.")) renderSettings();
}

async function closeCashDay(event) {
  event.preventDefault();
  const actualCash = Number($("cash-day-actual")?.value);
  const note = $("cash-day-note")?.value.trim() || "";
  const sessions = structuredClone(app.data.cashDaySessions || []);
  const session = sessions.find((item) => item.status === "open");
  if (!session || !Number.isFinite(actualCash) || actualCash < 0) {
    toast("Nicht abgeschlossen", "Prüfe den gezählten Kassenbestand.", "error");
    return;
  }
  const openedAt = dateFromSwift(session.openedAt);
  const cashMethodIDs = new Set(
    app.data.paymentMethods.filter((method) => method.kind === "Bar").map((method) => method.id)
  );
  const cashRevenue = app.data.paymentRecords
    .filter((payment) => cashMethodIDs.has(payment.methodID) && dateFromSwift(payment.createdAt) >= openedAt)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  session.status = "closed";
  session.closedAt = swiftDate();
  session.closedBy = app.workspace.displayName;
  session.expectedCash = Number(session.openingFloat || 0) + cashRevenue;
  session.actualCash = actualCash;
  session.closingNote = note;
  if (await savePatch({ cashDaySessions: sessions }, "Betriebstag wurde abgeschlossen.")) renderSettings();
}

async function deleteProduct(productID) {
  if (!window.confirm("Produkt wirklich löschen? Historische Bons bleiben erhalten.")) return;
  if (await savePatch({ products: app.data.products.filter((item) => item.id !== productID) }, "Produkt wurde gelöscht.")) closeModal();
}

function openMemberEditor() {
  openModal({
    eyebrow: "Geschützter Zugang",
    title: "Mitarbeiter anlegen",
    body: `
      <form id="member-form">
        <label class="field"><span>Name</span><input id="member-name" required></label>
        <div class="field-grid">
          <label class="field"><span>Benutzername</span><input id="member-username" minlength="2" autocomplete="off" required></label>
          <label class="field"><span>Rolle</span><select id="member-role"><option>Service</option><option>Management</option><option>Küche</option><option>Bar</option></select></label>
        </div>
        <label class="field"><span>Startpasswort</span><input id="member-password" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="field"><span>Telefon</span><input id="member-phone" type="tel"></label>
        <p class="field-hint">Das Passwort wird ausschließlich als sicherer Hash in Supabase gespeichert und niemals in den Restaurantdaten abgelegt.</p>
      </form>`,
    footer: `<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-member">Zugang erstellen</button>`
  });
}

async function saveMember() {
  const form = $("member-form");
  if (!form?.reportValidity()) return;
  const roleTitle = $("member-role").value;
  const member = {
    id: uuid(),
    name: $("member-name").value.trim(),
    role: roleTitle,
    phone: $("member-phone").value.trim(),
    username: $("member-username").value.trim()
  };
  try {
    await rpc("upsert_restaurant_credential", {
      target_restaurant_id: app.workspace.restaurantId,
      member_username: member.username,
      member_password: $("member-password").value,
      member_display_name: member.name,
      member_role: stateRoleToDatabaseRole[roleTitle]
    });
    if (await savePatch({ team: [...app.data.team, member] }, "Mitarbeiterzugang wurde erstellt.")) closeModal();
  } catch (error) {
    toast("Zugang nicht erstellt", friendlyError(error), "error");
  }
}

function openTableEditor() {
  const areaOptions = app.data.areas.map((area) => `<option>${escapeHTML(area)}</option>`).join("");
  openModal({
    eyebrow: "Tischplan",
    title: "Tisch anlegen",
    body: `
      <form id="table-form">
        <div class="field-grid"><label class="field"><span>Name</span><input id="table-name" value="Tisch" required></label><label class="field"><span>Nummer</span><input id="table-number" required></label></div>
        <label class="field"><span>Bereich</span><input id="table-area" list="areas-list" required><datalist id="areas-list">${areaOptions}</datalist></label>
        <div class="field-grid"><label class="field"><span>Kapazität</span><input id="table-capacity" type="number" min="1" max="100" value="4" required></label><label class="field"><span>Form</span><select id="table-shape"><option value="rectangle">Rechteck</option><option value="square">Quadrat</option><option value="round">Rund</option><option value="oval">Oval</option></select></label></div>
        <label class="check"><input id="table-online" type="checkbox"><span>Dieser Tisch kann online gebucht werden.</span></label>
      </form>`,
    footer: `<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-table">Speichern</button>`
  });
}

async function saveTable() {
  const form = $("table-form");
  if (!form) return;
  const requiredFields = [...form.querySelectorAll("[required]")];
  const missingField = requiredFields.find((field) => !String(field.value || "").trim());
  if (missingField) {
    missingField.focus();
    toast("Angabe fehlt", "Bitte fülle alle Pflichtfelder aus.", "error");
    return;
  }
  const area = $("table-area").value.trim();
  const table = {
    id: uuid(),
    name: $("table-name").value.trim(),
    number: $("table-number").value.trim(),
    area,
    guests: 0,
    status: "frei",
    capacity: Number($("table-capacity").value),
    isOnlineBookable: $("table-online").checked,
    isPlaceholder: false,
    positionX: null,
    positionY: null,
    width: 120,
    height: 90,
    shape: $("table-shape").value,
    colorName: "mint"
  };
  const areas = app.data.areas.includes(area) ? app.data.areas : [...app.data.areas, area];
  if (await savePatch({ tables: [...app.data.tables, table], areas }, "Tisch wurde angelegt.")) closeModal();
}

function openStationEditor(stationID = null) {
  const station = app.data.stations.find((item) => item.id === stationID);
  openModal({
    eyebrow: station ? "Bearbeiten" : "Neu",
    title: "Station",
    body: `
      <form id="station-form" data-id="${station?.id || ""}">
        <label class="field"><span>Name</span><input id="station-name" value="${escapeHTML(station?.name || "")}" required></label>
        <div class="field-grid"><label class="field"><span>Übertragungsart</span><select id="station-mode"><option value="digital" ${station?.defaultMode === "digital" ? "selected" : ""}>Digitale Küche</option><option value="print" ${station?.defaultMode === "print" ? "selected" : ""}>Bondruck</option></select></label><label class="field"><span>Warnung nach Minuten</span><input id="station-warning" type="number" min="1" max="120" value="${Number(station?.warningMinutes || 12)}"></label></div>
        <label class="check"><input id="station-active" type="checkbox" ${station?.isActive !== false ? "checked" : ""}><span>Station ist aktiv</span></label>
      </form>`,
    footer: `<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-station">Speichern</button>`
  });
}

function openAccountMenu() {
  openModal({
    eyebrow: roleTitles[app.workspace.role] || "Servora",
    title: app.data.restaurantName,
    body: `
      <div class="detail-list">
        <div><span>Restaurantkennung</span><strong>${escapeHTML(app.workspace.restaurantCode)}</strong></div>
        <div><span>Angemeldet als</span><strong>${escapeHTML(app.workspace.displayName || app.workspace.username)}</strong></div>
        <div><span>Benutzername</span><strong>${escapeHTML(app.workspace.username)}</strong></div>
      </div>
      <p class="modal-note">Geräte- und Druckerzugänge werden aus Sicherheitsgründen ausschließlich in der Servora App verwendet.</p>`,
    footer: `
      <button class="secondary" type="button" data-modal-action="copy-code">Kennung kopieren</button>
      <button class="danger" type="button" data-modal-action="logout">Abmelden</button>`
  });
}

async function saveStation() {
  const form = $("station-form");
  if (!form?.reportValidity()) return;
  const stations = structuredClone(app.data.stations);
  const existing = stations.find((item) => item.id === form.dataset.id);
  const station = {
    id: existing?.id || uuid(),
    name: $("station-name").value.trim(),
    icon: existing?.icon || "flame",
    defaultMode: $("station-mode").value,
    accessUsername: existing?.accessUsername || null,
    colorName: existing?.colorName || "orange",
    isActive: $("station-active").checked,
    warningMinutes: Number($("station-warning").value),
    printerID: existing?.printerID || null
  };
  if (existing) Object.assign(existing, station);
  else stations.push(station);
  if (await savePatch({ stations }, "Station wurde gespeichert.")) closeModal();
}

async function shiftAction(action) {
  const now = swiftDate();
  if (action === "start") {
    await savePatch({ activeShiftStart: now, activeBreakStart: null, accumulatedBreak: 0 }, "Schicht wurde gestartet.");
    return;
  }
  if (action === "break") {
    if (app.data.activeBreakStart) {
      const breakSeconds = Math.max(0, (dateFromSwift(now) - dateFromSwift(app.data.activeBreakStart)) / 1000);
      await savePatch({
        activeBreakStart: null,
        accumulatedBreak: Number(app.data.accumulatedBreak || 0) + breakSeconds
      }, "Pause wurde beendet.");
    } else {
      await savePatch({ activeBreakStart: now }, "Pause wurde gestartet.");
    }
    return;
  }
  if (action === "end" && app.data.activeShiftStart) {
    let breakDuration = Number(app.data.accumulatedBreak || 0);
    if (app.data.activeBreakStart) {
      breakDuration += Math.max(0, (dateFromSwift(now) - dateFromSwift(app.data.activeBreakStart)) / 1000);
    }
    const member = currentMember();
    const record = {
      id: uuid(),
      memberID: member?.id || null,
      start: app.data.activeShiftStart,
      end: now,
      breakDuration
    };
    await savePatch({
      activeShiftStart: null,
      activeBreakStart: null,
      accumulatedBreak: 0,
      shiftRecords: [...app.data.shiftRecords, record]
    }, "Schicht wurde beendet.");
  }
}

async function updateRestaurantSettings(event) {
  event.preventDefault();
  const name = $("settings-name").value.trim();
  if (!name) return;
  await savePatch({ restaurantName: name }, "Restaurantname wurde gespeichert.");
}

function handleViewClick(event) {
  const route = event.target.closest("[data-route]")?.dataset.route;
  if (route) {
    if ($("modal").open) closeModal();
    navigate(route);
    return;
  }
  const tableID = event.target.closest("[data-table-id]")?.dataset.tableId;
  if (tableID) return openTable(tableID);
  const reservationID = event.target.closest("[data-reservation-id]")?.dataset.reservationId;
  if (reservationID) return openReservationEditor(reservationID);
  const productID = event.target.closest("[data-product-id]")?.dataset.productId;
  if (productID) return openProductEditor(productID);
  const stationID = event.target.closest("[data-station-id]")?.dataset.stationId;
  if (stationID) return openStationEditor(stationID);
  const nextTicket = event.target.closest("[data-ticket-next]");
  if (nextTicket) return updateTicket(nextTicket.dataset.ticketNext, 1, nextTicket.dataset.nextStatus);
  const backTicket = event.target.closest("[data-ticket-back]");
  if (backTicket) return updateTicket(backTicket.dataset.ticketBack, -1);
  const area = event.target.closest("[data-area]")?.dataset.area;
  if (area) {
    app.tableArea = area;
    renderTables();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "add-table") openTableEditor();
  if (action === "add-reservation") openReservationEditor();
  if (action === "add-product") openProductEditor();
  if (action === "manage-categories") openCategoryManager();
  if (action === "add-member") openMemberEditor();
  if (action === "add-station") openStationEditor();
  if (action === "start-shift") shiftAction("start");
  if (action === "toggle-break") shiftAction("break");
  if (action === "end-shift") shiftAction("end");
}

function handleModalClick(event) {
  const target = event.target.closest("[data-modal-action]");
  if (!target) return;
  const action = target.dataset.modalAction;
  const id = target.dataset.id;
  if (action === "close") closeModal();
  if (action === "walkin") placeWalkIn(id);
  if (action === "place-reservation") placeReservation(id);
  if (action === "order") openOrder(id);
  if (action === "end-visit") setTableStatus(id, "reinigen", 0);
  if (action === "cleaned") setTableStatus(id, "frei", 0);
  if (action === "add-cart") addCart(id);
  if (action === "add-configured-cart") addConfiguredCart(id);
  if (action === "remove-cart") removeCart(id);
  if (action === "submit-order") submitOrder();
  if (action === "save-reservation") saveReservation();
  if (action === "cancel-reservation") changeReservationStatus(id, "Storniert");
  if (action === "save-product") saveProduct();
  if (action === "save-category") saveCategory();
  if (action === "move-category-up") moveCategory(id, -1);
  if (action === "move-category-down") moveCategory(id, 1);
  if (action === "delete-category") deleteCategory(id);
  if (action === "add-option-group") addOptionGroupEditor();
  if (action === "add-product-option") addProductOptionEditor(id);
  if (action === "remove-option-group") {
    document.querySelector(`.option-group-editor[data-group-id="${id}"]`)?.remove();
  }
  if (action === "remove-product-option") target.closest(".option-editor")?.remove();
  if (action === "delete-product") deleteProduct(id);
  if (action === "save-member") saveMember();
  if (action === "save-table") saveTable();
  if (action === "save-station") saveStation();
  if (action === "account") openAccountMenu();
  if (action === "copy-code") {
    navigator.clipboard
      .writeText(app.workspace.restaurantCode)
      .then(() => toast("Kopiert", "Die Restaurantkennung liegt in der Zwischenablage.", "success"))
      .catch(() => toast("Nicht kopiert", "Bitte kopiere die Kennung manuell.", "error"));
  }
  if (action === "logout") {
    closeModal();
    logout();
  }
}

async function login(event) {
  event.preventDefault();
  const button = $("login-submit");
  const error = $("login-error");
  error.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Anmeldung läuft …";
  try {
    await ensureSession();
    const rows = await rpc("claim_restaurant_access", {
      p_restaurant_code: $("login-code").value.trim().toUpperCase(),
      p_member_username: $("login-username").value.trim(),
      p_member_password: $("login-password").value
    });
    const session = Array.isArray(rows) ? rows[0] : rows;
    if (!session?.restaurant_id) throw new Error("Invalid restaurant credentials");
    if (!Object.keys(roleTitles).includes(session.role)) {
      throw new Error("Gerätezugänge können sich nicht im Web-Dashboard anmelden.");
    }
    await loadWorkspace(session.restaurant_id);
  } catch (caught) {
    error.textContent = friendlyError(caught);
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Anmelden";
  }
}

async function register(event) {
  event.preventDefault();
  const button = $("register-submit");
  const error = $("register-error");
  error.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Restaurant wird erstellt …";
  try {
    await ensureSession();
    const rows = await rpc("create_restaurant_account", {
      p_restaurant_name: $("register-name").value.trim(),
      p_restaurant_type: $("register-type").value,
      p_owner_username: $("register-username").value.trim(),
      p_owner_password: $("register-password").value,
      p_owner_display_name: $("register-display-name").value.trim()
    });
    const session = Array.isArray(rows) ? rows[0] : rows;
    if (!session?.restaurant_id) throw new Error("Restaurant konnte nicht erstellt werden.");
    await initializeRestaurantState(session);
    await loadWorkspace(session.restaurant_id);
    toast("Restaurant erstellt", `Deine Kennung lautet ${session.restaurant_code}.`, "success");
  } catch (caught) {
    error.textContent = friendlyError(caught);
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Restaurant sicher erstellen";
  }
}

async function logout() {
  try {
    if (app.session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: authHeaders(false)
      });
    }
  } finally {
    clearSession();
    showAuth();
  }
}

function switchAuth(mode) {
  const loginMode = mode === "login";
  $("login-form").classList.toggle("hidden", !loginMode);
  $("register-form").classList.toggle("hidden", loginMode);
  $("login-tab").classList.toggle("selected", loginMode);
  $("register-tab").classList.toggle("selected", !loginMode);
  $("login-tab").setAttribute("aria-selected", String(loginMode));
  $("register-tab").setAttribute("aria-selected", String(!loginMode));
  $("auth-title").textContent = loginMode ? "Anmelden" : "Restaurant erstellen";
  $("auth-subtitle").textContent = loginMode
    ? "Mit Restaurantkennung und persönlichem Zugang."
    : "Starte leer und richte deinen Betrieb anschließend ein.";
}

async function submitGate(event) {
  event.preventDefault();
  const valid = (await sha256($("gate-pin").value)) === DEVELOPMENT_PIN_HASH;
  $("gate-error").classList.toggle("hidden", valid);
  if (!valid) return;
  sessionStorage.setItem(ACCESS_SESSION_KEY, "granted");
  $("development-gate").classList.add("hidden");
  await start();
}

function updateOnlineStatus() {
  $("offline-banner").classList.toggle("hidden", navigator.onLine);
  if (!navigator.onLine) setSyncState("error", "Offline");
  else if (app.workspace) setSyncState("ready", "Aktuell");
}

async function start() {
  showAuth();
  switchAuth(INITIAL_AUTH_MODE);
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (!stored?.access_token && !stored?.refresh_token) return;
    app.session = stored;
    await ensureSession();
    await loadWorkspace(localStorage.getItem(LAST_RESTAURANT_KEY));
  } catch {
    clearSession();
    showAuth();
  }
}

document.addEventListener("click", (event) => {
  const route = event.target.closest("[data-route]")?.dataset.route;
  if (route && !event.target.closest("#view")) {
    if ($("modal").open) closeModal();
    navigate(route);
  }
});
$("view").addEventListener("click", handleViewClick);
$("modal-shell").addEventListener("click", handleModalClick);
$("login-form").addEventListener("submit", login);
$("register-form").addEventListener("submit", register);
$("login-tab").addEventListener("click", () => switchAuth("login"));
$("register-tab").addEventListener("click", () => switchAuth("register"));
$("logout-button").addEventListener("click", logout);
$("restaurant-button").addEventListener("click", openAccountMenu);
$("refresh-button").addEventListener("click", () => loadWorkspace(app.workspace.restaurantId));
$("gate-form").addEventListener("submit", submitGate);
$("view").addEventListener("change", (event) => {
  if (event.target.id === "reservation-date") {
    app.reservationDate = event.target.value;
    renderReservations();
  }
});
$("view").addEventListener("submit", (event) => {
  if (event.target.id === "restaurant-settings-form") updateRestaurantSettings(event);
  if (event.target.id === "cash-day-open-form") openCashDay(event);
  if (event.target.id === "cash-day-close-form") closeCashDay(event);
});
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

updateOnlineStatus();
if (
  !DEVELOPMENT_MODE ||
  sessionStorage.getItem(ACCESS_SESSION_KEY) === "granted"
) {
  $("development-gate").classList.add("hidden");
  start();
}
