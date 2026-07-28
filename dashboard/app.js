const SUPABASE_URL = "https://dlapwemckfhxklytbqkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_VeeQLARNn-sULZ4snvp3HA_Hd78H5RN";
const DEVELOPMENT_MODE = true;
const DEVELOPMENT_PIN_HASH =
  "5f20b9b81da6a3163f1cc96b603868330378255157dae99d8a6d7cc5fa3d6a19";
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

const teamPermissions = [
  ["closeOwnShift", "Eigene Schicht schließen", "Die eigene laufende Schicht beenden."],
  ["manageCashDay", "Tagesbetrieb verwalten", "Tage öffnen und Tagesabschlüsse durchführen."],
  ["viewStatistics", "Statistiken ansehen", "Umsatz- und Betriebsstatistiken öffnen."],
  ["manageProducts", "Produkte verwalten", "Produkte, Kategorien und Preise bearbeiten."],
  ["manageReservations", "Reservierungen verwalten", "Reservierungen anlegen und bearbeiten."],
  ["manageGuests", "Gästeregister verwalten", "Gastprofile ansehen und bearbeiten."],
  ["manageTables", "Tische und Bereiche verwalten", "Tischplan und Bereiche bearbeiten."],
  ["manageTeam", "Team und Schichtplan verwalten", "Zugänge und geplante Schichten bearbeiten."],
  ["manageStations", "Stationen und Drucker verwalten", "Ausgabewege und Geräte konfigurieren."],
  ["managePayments", "Zahlungen und Stornos bearbeiten", "Zahlungen korrigieren oder stornieren."],
  ["viewReports", "Berichte ansehen", "Abschlüsse und exportierbare Berichte öffnen."]
];

function defaultPermissions(role) {
  if (role === "Restaurantleitung") return teamPermissions.map(([id]) => id);
  if (role === "Service") {
    return ["closeOwnShift", "manageReservations", "manageGuests", "manageTables"];
  }
  return ["closeOwnShift"];
}

const routes = [
  { id: "overview", title: "Start", symbol: "⌂", roles: ["restaurant_manager", "management", "service", "kitchen", "bar"] },
  { id: "tables", title: "Tische", symbol: "▦", roles: ["restaurant_manager", "management", "service"] },
  { id: "orders", title: "Bestellungen", symbol: "☷", roles: ["restaurant_manager", "management", "service", "kitchen", "bar"] },
  { id: "reservations", title: "Reservierungen", symbol: "□", roles: ["restaurant_manager", "management", "service"] },
  { id: "guests", title: "Gästeregister", symbol: "◎", roles: ["restaurant_manager", "management", "service"] },
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

function inferKitchenOperatingMode(stations) {
  const modes = new Set(stations.map((station) => station.defaultMode));
  if (modes.has("print") && modes.has("digital")) return "hybrid";
  if (modes.size === 1 && modes.has("print")) return "printedKitchen";
  return "digitalKitchen";
}

function kitchenOperatingModeTitle(mode) {
  if (mode === "printedKitchen") return "Nur Bondruck";
  if (mode === "hybrid") return "Kombiniert";
  return "Nur digitale Stationen";
}

function operatingModeSupports(mode, stationMode) {
  return mode === "hybrid" ||
    (mode === "printedKitchen" && stationMode === "print") ||
    (mode === "digitalKitchen" && stationMode === "digital");
}

function productRoutingIssue(product) {
  const station = app.data?.stations?.find(
    (item) => String(item.name).localeCompare(String(product.station), "de", { sensitivity: "base" }) === 0
  );
  if (!station) return "Keine Station zugewiesen";
  if (station.isActive === false) return `Station „${station.name}“ ist deaktiviert`;
  if (!operatingModeSupports(app.data.kitchenOperatingMode, station.defaultMode)) {
    return "Station passt nicht zur Ausgabeart";
  }
  if (station.defaultMode === "print") {
    const printer = app.data.printers.find((item) => item.id === station.printerID);
    if (!printer) return "Kein Drucker zugewiesen";
    if (printer.isActive === false) return `Drucker „${printer.name}“ ist deaktiviert`;
  }
  return "";
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
    kitchenOperatingMode: "digitalKitchen",
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
    devices: [],
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
    scheduledShifts: [],
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
    onlineBookingConfiguration: defaultOnlineBookingConfiguration(session),
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

function defaultOnlineBookingConfiguration(session = {}) {
  const publicID = session.restaurant_id || session.restaurantId || uuid();
  const restaurantName =
    session.restaurant_name || session.restaurantName || "Restaurant";
  return {
    publicID,
    restaurant: {
      id: uuid(),
      slug: String(restaurantName)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name: restaurantName,
      description: "",
      restaurantType: "Restaurant",
      address: "",
      phone: "",
      email: "",
      website: "",
      directions: "",
      openingHoursText: "",
      languageCode: "de",
      logoData: null,
      titleImageData: null,
      settings: {
        bookingEnabled: false,
        automaticConfirmation: true,
        standardDurationMinutes: 90,
        minimumLeadMinutes: 120,
        maximumAdvanceDays: 90,
        maximumPartySize: 10,
        allowsSameDay: true,
        bufferMinutes: 15,
        slotIntervalMinutes: 15,
        dayAvailability: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          id: weekday,
          isOpen: weekday !== 2,
          windows: [{
            id: uuid(),
            startMinutes: 18 * 60,
            endMinutes: 21 * 60
          }]
        })),
        allowedAreas: [],
        allowsAreaPreference: true,
        allowsConcreteTable: false,
        cancellationHours: 24,
        latestArrivalMinutes: 15,
        waitlistEnabled: true,
        maximumWaitlistEntriesPerSlot: 20,
        blockedPeriods: [],
        clockInRequiresLocation: false,
        clockInLatitude: null,
        clockInLongitude: null,
        clockInRadiusMeters: 150,
        allowsManagerLocationOverride: true,
        fieldVisibility: {
          Vorname: "Pflichtfeld",
          Nachname: "Pflichtfeld",
          "E-Mail-Adresse": "Pflichtfeld",
          Telefonnummer: "Optional",
          Adresse: "Optional",
          Hinweise: "Optional",
          "Freiwillige Allergiehinweise": "Optional"
        }
      }
    }
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
    kitchenOperatingMode:
      state.kitchenOperatingMode ||
      inferKitchenOperatingMode(state.stations || []),
    stations: state.stations || [],
    team: state.team || [],
    devices: state.devices || [],
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
    scheduledShifts: state.scheduledShifts || [],
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
    onlineBookingConfiguration:
      state.onlineBookingConfiguration ||
      defaultOnlineBookingConfiguration(app.workspace || {}),
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
        "Eine andere Taviko-Instanz war schneller. Der aktuelle Stand wurde neu geladen.",
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
    return "Restaurantkennung, Name oder Passwort stimmen nicht.";
  }
  if (message.includes("Anonymous sign-ins are disabled")) {
    return "Anonyme Supabase-Anmeldung ist noch nicht aktiviert.";
  }
  if (message.includes("Failed to fetch")) {
    return "Taviko konnte den Server nicht erreichen.";
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
  const mobileTitles = {
    overview: "Start",
    tables: "Tische",
    orders: "Bons",
    reservations: "Reserv.",
    shifts: "Schicht",
    more: "Mehr"
  };
  const title = mobile ? (mobileTitles[route.id] || route.title) : route.title;
  return `
    <button class="nav-button ${app.route === route.id ? "selected" : ""}"
      type="button" data-route="${route.id}" aria-current="${app.route === route.id ? "page" : "false"}">
      <span class="nav-symbol" aria-hidden="true">${route.symbol}</span>
      <span>${escapeHTML(title)}</span>
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
  $("page-title").textContent = route?.title || "Taviko";
  switch (app.route) {
    case "tables": renderTables(); break;
    case "orders": renderOrders(); break;
    case "reservations": renderReservations(); break;
    case "guests": renderGuests(); break;
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
        <header class="section-header"><div><h2>Heute im Betrieb</h2><span>Live aus Taviko</span></div></header>
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
          <header><div><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.category)} · ${escapeHTML(product.station)}</p>${productRoutingIssue(product) ? `<span class="routing-warning">⚠ ${escapeHTML(productRoutingIssue(product))}</span>` : ""}</div>${product.isAvailable ? `<span class="badge green">Aktiv</span>` : `<span class="badge red">Pausiert</span>`}</header>
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
          <div class="compact-row category-row">
            <span class="category-swatch" style="background:${itemColor(app.data.categoryColors[category] || "blue")}"></span>
            <div class="activity-copy"><strong>${escapeHTML(category)}</strong><span>${app.data.categoryParents[category] ? `Unterkategorie von ${escapeHTML(app.data.categoryParents[category])}` : "Hauptkategorie"}</span></div>
            <div class="category-actions">
              <button class="row-button" type="button" data-modal-action="move-category-up" data-id="${escapeHTML(category)}" aria-label="${escapeHTML(category)} nach oben verschieben" ${index === 0 ? "disabled" : ""}>↑</button>
              <button class="row-button" type="button" data-modal-action="move-category-down" data-id="${escapeHTML(category)}" aria-label="${escapeHTML(category)} nach unten verschieben" ${index === app.data.categories.length - 1 ? "disabled" : ""}>↓</button>
              <button class="row-button danger-text" type="button" data-modal-action="delete-category" data-id="${escapeHTML(category)}" aria-label="${escapeHTML(category)} löschen" ${category === "Speisen" || app.data.products.some((product) => product.category === category) ? "disabled" : ""}>−</button>
            </div>
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
      <div><h2>Team & Geräte</h2><p>Persönliche Zugänge und fest zugewiesene Betriebsgeräte getrennt verwalten.</p></div>
      <div class="tool-actions">
        <button class="secondary" type="button" data-action="add-device">Gerät hinzufügen</button>
        <button class="primary" type="button" data-action="add-member">Mitarbeiter hinzufügen</button>
      </div>
    </div>
    <section class="section table-section">
      <div class="section-heading"><div><p class="eyebrow">Persönliche Zugänge</p><h3>Mitarbeiter</h3></div></div>
      <table class="data-table">
        <thead><tr><th>Name und Anmeldung</th><th>Rolle</th><th>Telefon</th><th></th></tr></thead>
        <tbody>
          ${app.data.team.map((member) => `
            <tr>
              <td><strong>${escapeHTML(member.name)}</strong></td>
              <td>${statusBadge(member.role)}</td>
              <td>${escapeHTML(member.phone || "–")}</td>
              <td><div class="row-actions"><button class="row-button" type="button" data-member-id="${member.id}">Bearbeiten</button></div></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </section>
    <section class="section table-section">
      <div class="section-heading"><div><p class="eyebrow">Festes Gerät</p><h3>Geräte</h3><p>Der Gerätename ist zugleich der eindeutige Anmeldename.</p></div></div>
      ${app.data.devices.length ? `
        <table class="data-table">
          <thead><tr><th>Name und Anmeldung</th><th>Typ</th><th>Station</th><th></th></tr></thead>
          <tbody>
            ${app.data.devices.map((device) => {
              const station = app.data.stations.find((item) => item.id === device.stationID);
              return `<tr>
                <td><strong>${escapeHTML(device.name)}</strong><br><span class="muted">${escapeHTML(device.loginName || device.name)}</span></td>
                <td>${statusBadge(device.kind === "Küchenanzeige" ? "Digitales Stationsdisplay" : "Kasse")}</td>
                <td>${escapeHTML(station?.name || "–")}</td>
                <td><button class="row-button" type="button" data-device-id="${device.id}">Bearbeiten</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="empty-inline"><strong>Noch keine Gerätezugänge</strong><span>Lege eine Kasse oder ein digitales Stationsdisplay an.</span></div>`}
    </section>
  `;
}

function renderShifts() {
  const activeStart = app.data.activeShiftStart;
  const records = [...app.data.shiftRecords].sort(
    (a, b) => dateFromSwift(b.start) - dateFromSwift(a.start)
  );
  const current = currentMember();
  const planned = [...app.data.scheduledShifts]
    .filter((shift) => canManage() || shift.memberID === current?.id)
    .sort((a, b) => dateFromSwift(a.start) - dateFromSwift(b.start));
  $("view").innerHTML = `
    <div class="page-tools">
      <div><h2>Meine Schicht</h2><p>${activeStart ? `Gestartet um ${formatDate(activeStart, { hour: "2-digit", minute: "2-digit" })}` : "Derzeit nicht eingestempelt."}</p></div>
      <div class="tool-actions">
        ${canManage() ? `<button class="secondary" type="button" data-action="plan-shift">Schicht planen</button>` : ""}
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
      <header class="section-header"><h2>${canManage() ? "Dienstplan" : "Meine geplanten Schichten"}</h2><span class="badge">${planned.length}</span></header>
      ${planned.length ? `<table class="data-table">
        <thead><tr><th>Mitarbeiter</th><th>Datum</th><th>Beginn</th><th>Ende</th><th>Notiz</th></tr></thead>
        <tbody>${planned.slice(0, 50).map((shift) => `
          <tr><td><strong>${escapeHTML(shift.memberName)}</strong></td><td>${formatDate(shift.start, { dateStyle: "medium" })}</td><td>${formatDate(shift.start, { hour: "2-digit", minute: "2-digit" })}</td><td>${formatDate(shift.end, { hour: "2-digit", minute: "2-digit" })}</td><td>${escapeHTML(shift.note || "–")}</td></tr>`).join("")}</tbody>
      </table>` : emptyHTML("Noch keine geplanten Schichten", "Die Restaurantleitung kann hier den Dienstplan aufbauen.")}
    </section>
    <section class="section table-section">
      <header class="section-header"><h2>Schichtberichte</h2></header>
      ${records.length ? `<table class="data-table">
        <thead><tr><th>Mitarbeiter</th><th>Datum</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Arbeitszeit</th></tr></thead>
        <tbody>${records.slice(0, 30).map((record) => `
          <tr><td>${escapeHTML(app.data.team.find((member) => member.id === record.memberID)?.name || "Mitarbeiter")}</td><td>${formatDate(record.start, { dateStyle: "medium" })}</td><td>${formatDate(record.start, { hour: "2-digit", minute: "2-digit" })}</td><td>${formatDate(record.end, { hour: "2-digit", minute: "2-digit" })}</td><td>${durationText(record.breakDuration || 0)}</td><td><strong>${durationText(workedSeconds(record))}</strong></td></tr>`).join("")}</tbody>
      </table>` : emptyHTML("Noch keine Schichten", "Nach dem Ausstempeln erscheint deine Arbeitszeit hier.")}
    </section>
  `;
}

function guestProfiles() {
  const profiles = new Map();
  for (const reservation of app.data.reservations) {
    const contactKey = String(reservation.email || reservation.phone || "").trim().toLowerCase();
    const key = contactKey || `name:${String(reservation.name || "").trim().toLowerCase()}`;
    if (!key || key === "name:") continue;
    const existing = profiles.get(key) || {
      id: key,
      name: reservation.name,
      email: reservation.email || "",
      phone: reservation.phone || "",
      street: reservation.street || "",
      houseNumber: reservation.houseNumber || "",
      postalCode: reservation.postalCode || "",
      city: reservation.city || "",
      reservations: []
    };
    existing.reservations.push(reservation);
    if (dateFromSwift(reservation.time) > dateFromSwift(existing.latest?.time || 0)) {
      existing.latest = reservation;
      Object.assign(existing, {
        name: reservation.name,
        email: reservation.email || existing.email,
        phone: reservation.phone || existing.phone,
        street: reservation.street || existing.street,
        houseNumber: reservation.houseNumber || existing.houseNumber,
        postalCode: reservation.postalCode || existing.postalCode,
        city: reservation.city || existing.city
      });
    }
    profiles.set(key, existing);
  }
  return [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function renderGuests() {
  const guests = guestProfiles();
  $("view").innerHTML = `
    <div class="page-tools"><div><h2>Gästeregister</h2><p>Kontaktdaten und Besuchshistorie aus Reservierungen und Walk-ins.</p></div><span class="badge">${guests.length}</span></div>
    <section class="section table-section">
      ${guests.length ? `<table class="data-table">
        <thead><tr><th>Gast</th><th>Kontakt</th><th>Besuche</th><th>Letzter Besuch</th><th></th></tr></thead>
        <tbody>${guests.map((guest) => `
          <tr>
            <td><strong>${escapeHTML(guest.name)}</strong></td>
            <td>${escapeHTML(guest.email || guest.phone || "–")}</td>
            <td>${guest.reservations.length}</td>
            <td>${formatDate(guest.latest?.time, { dateStyle: "medium" })}</td>
            <td><button class="row-button" type="button" data-guest-id="${escapeHTML(guest.id)}">Profil</button></td>
          </tr>`).join("")}</tbody>
      </table>` : emptyHTML("Noch keine Gäste", "Gäste erscheinen automatisch nach der ersten Reservierung oder einem Walk-in.")}
    </section>`;
}

function openGuestProfile(guestID) {
  const guest = guestProfiles().find((item) => item.id === guestID);
  if (!guest) return;
  const visits = [...guest.reservations].sort((a, b) => dateFromSwift(b.time) - dateFromSwift(a.time));
  openModal({
    eyebrow: "Gästeregister",
    title: guest.name,
    body: `
      <div class="detail-list">
        <div><span>E-Mail</span><strong>${escapeHTML(guest.email || "–")}</strong></div>
        <div><span>Telefon</span><strong>${escapeHTML(guest.phone || "–")}</strong></div>
        <div><span>Adresse</span><strong>${escapeHTML([guest.street, guest.houseNumber, guest.postalCode, guest.city].filter(Boolean).join(" ") || "–")}</strong></div>
        <div><span>Besuche</span><strong>${visits.length}</strong></div>
      </div>
      <div class="activity-list">${visits.map((visit) => `
        <article class="activity-row"><span class="activity-icon">□</span><div class="activity-copy"><strong>${formatDate(visit.time)}</strong><span>${Number(visit.guests)} Personen · ${escapeHTML(visit.status)}</span></div></article>`).join("")}</div>`,
    footer: `<button class="primary" type="button" data-modal-action="close">Fertig</button>`
  });
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
    <div class="page-tools"><div><h2>Betriebsstatistik</h2><p>Aus den synchronisierten Taviko-Vorgängen.</p></div></div>
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
    <div class="page-tools"><div><h2>Stationen & Ausgabe</h2><p>Lege fest, ob Aufträge digital, gedruckt oder über beide Wege ausgegeben werden.</p></div><button class="primary" type="button" data-action="add-station">Station hinzufügen</button></div>
    <section class="section">
      <header class="section-header"><div><h2>Auftragsausgabe</h2><p>Diese Einstellung gilt für Küche, Bar, Getränke und weitere Stationen.</p></div></header>
      <div class="section-body setting-choice">
        <div>
          <select id="kitchen-operating-mode" aria-label="Ausgabeart">
          <option value="digitalKitchen" ${app.data.kitchenOperatingMode === "digitalKitchen" ? "selected" : ""}>Nur digitale Stationen</option>
          <option value="printedKitchen" ${app.data.kitchenOperatingMode === "printedKitchen" ? "selected" : ""}>Nur Bondruck</option>
          <option value="hybrid" ${app.data.kitchenOperatingMode === "hybrid" ? "selected" : ""}>Kombiniert</option>
          </select>
          <p>Digitale Stationen zeigen Aufträge auf einem Display. Beim Bondruck werden sie an einen zugewiesenen Drucker übergeben.</p>
        </div>
        <button class="secondary" type="button" data-action="save-operating-mode">Übernehmen</button>
      </div>
    </section>
    <section class="section table-section">
      ${app.data.stations.length ? `<table class="data-table"><thead><tr><th>Name</th><th>Ausgabeweg</th><th>Warnzeit</th><th>Status</th><th></th></tr></thead><tbody>
        ${app.data.stations.map((station) => `<tr class="${station.isActive === false ? "is-disabled" : ""}"><td><strong>${escapeHTML(station.name)}</strong></td><td>${station.defaultMode === "digital" ? "Digitales Stationsdisplay" : "Bondruck"}</td><td>${Number(station.warningMinutes || 12)} Min.</td><td>${station.isActive ? `<span class="badge green">Aktiv</span>` : `<span class="badge red">Deaktiviert</span>`}</td><td><div class="row-actions"><button class="row-button" type="button" data-station-id="${station.id}">Bearbeiten</button></div></td></tr>`).join("")}
      </tbody></table>` : emptyHTML("Noch keine Station", "Lege Küche, Bar oder eine eigene Station an.")}
    </section>
  `;
}

async function saveKitchenOperatingMode() {
  const mode = $("kitchen-operating-mode")?.value;
  if (!mode) return;
  const incompatible = app.data.stations.some(
    (station) => station.isActive !== false && !operatingModeSupports(mode, station.defaultMode)
  );
  if (incompatible) {
    toast("Ausgabeart nicht geändert", "Deaktiviere oder ändere zuerst unpassende Stationen.", "error");
    return;
  }
  await savePatch({ kitchenOperatingMode: mode }, `${kitchenOperatingModeTitle(mode)} ist aktiv.`);
  renderStations();
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
          <label class="field"><span>Name</span><input value="${escapeHTML(app.data.restaurantName)}" readonly aria-readonly="true"></label>
          <label class="field"><span>Restaurantkennung</span><input value="${escapeHTML(app.workspace.restaurantCode)}" readonly aria-readonly="true"></label>
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
          <form id="business-settings-form">
            <label class="field"><span>Restaurantadresse</span><input id="business-address" value="${escapeHTML(booking?.restaurant?.address || "")}" autocomplete="street-address" required></label>
            <div class="field-grid">
              <label class="field"><span>Telefon</span><input id="business-phone" value="${escapeHTML(booking?.restaurant?.phone || "")}" autocomplete="tel"></label>
              <label class="field"><span>E-Mail</span><input id="business-email" type="email" value="${escapeHTML(booking?.restaurant?.email || "")}" autocomplete="email"></label>
            </div>
            <label class="field"><span>Öffnungszeiten-Hinweis</span><textarea id="business-opening-text" placeholder="z. B. Dienstag bis Sonntag, 17:00–23:00 Uhr">${escapeHTML(booking?.restaurant?.openingHoursText || "")}</textarea></label>
            <label class="check"><input id="business-booking-enabled" type="checkbox" ${booking?.restaurant?.settings?.bookingEnabled ? "checked" : ""}><span>Online-Reservierung veröffentlichen</span></label>
            <label class="check"><input id="business-auto-confirm" type="checkbox" ${booking?.restaurant?.settings?.automaticConfirmation !== false ? "checked" : ""}><span>Reservierungen automatisch bestätigen</span></label>
            <label class="check"><input id="business-location-required" type="checkbox" ${booking?.restaurant?.settings?.clockInRequiresLocation ? "checked" : ""}><span>Einstempeln nur am Restaurant erlauben</span></label>
            <label class="field"><span>Erlaubter Radius</span><input id="business-location-radius" type="number" min="50" max="1000" step="25" value="${Number(booking?.restaurant?.settings?.clockInRadiusMeters || 150)}"></label>
            <button class="secondary" type="button" data-action="use-current-location">Aktuellen Standort übernehmen</button>
            <p class="field-hint">${booking?.restaurant?.settings?.clockInLatitude != null ? "Standort ist hinterlegt." : "Für die Standortprüfung zuerst den Standort übernehmen oder die Adresse in der App bestätigen."}</p>
            <button class="primary" type="submit">Betriebsdaten speichern</button>
          </form>
          ${booking?.publicID ? `<a class="secondary" href="../?r=${encodeURIComponent(booking.publicID)}" target="_blank" rel="noopener">Reservierungsseite öffnen</a>` : ""}
        </div>
      </section>
      <section class="section">
        <header class="section-header"><h2>Geräte, Stationen & Drucker</h2></header>
        <div class="section-body">
          <p>Gerätezugänge werden im Team-Bereich verwaltet und ausschließlich in der Taviko-App angemeldet.</p>
          <p class="field-hint">Kassen öffnen Tische und Theke. Digitale Stationsdisplays zeigen nur die Aufträge ihrer zugewiesenen Station. Klassische Bondrucker besitzen keinen Mitarbeiterzugang.</p>
        </div>
      </section>
    </div>
  `;
}

function settingStatus(title, value, positive) {
  return `<div class="compact-row"><span class="activity-icon">${positive ? "✓" : "!"}</span><div class="activity-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(value)}</span></div><span class="badge ${positive ? "green" : "orange"}">${positive ? "Bereit" : "Offen"}</span></div>`;
}

async function saveBusinessSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const email = $("business-email").value.trim();
  const phone = $("business-phone").value.trim();
  const phoneDigits = phone.replace(/\D/g, "");
  if (email && !$("business-email").checkValidity()) {
    toast("E-Mail prüfen", "Bitte gib eine vollständige E-Mail-Adresse ein.", "error");
    $("business-email").focus();
    return;
  }
  if (phone && (!/^[+0-9 ()/-]+$/.test(phone) || phoneDigits.length < 6 || phoneDigits.length > 18)) {
    toast("Telefonnummer prüfen", "Bitte gib eine gültige Telefonnummer ein.", "error");
    $("business-phone").focus();
    return;
  }
  const configuration = structuredClone(
    app.data.onlineBookingConfiguration ||
      defaultOnlineBookingConfiguration(app.workspace)
  );
  configuration.restaurant.address = $("business-address").value.trim();
  configuration.restaurant.phone = phone;
  configuration.restaurant.email = email;
  configuration.restaurant.openingHoursText =
    $("business-opening-text").value.trim();
  configuration.restaurant.settings.bookingEnabled =
    $("business-booking-enabled").checked;
  configuration.restaurant.settings.automaticConfirmation =
    $("business-auto-confirm").checked;
  configuration.restaurant.settings.clockInRequiresLocation =
    $("business-location-required").checked;
  configuration.restaurant.settings.clockInRadiusMeters = Math.max(
    50,
    Math.min(1000, Number($("business-location-radius").value || 150))
  );
  await savePatch(
    { onlineBookingConfiguration: configuration },
    "Betriebs- und Reservierungsdaten wurden gespeichert."
  );
}

function useCurrentBusinessLocation() {
  if (!navigator.geolocation) {
    toast("Standort nicht verfügbar", "Dieser Browser unterstützt keine Standortabfrage.", "error");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const configuration = structuredClone(
        app.data.onlineBookingConfiguration ||
          defaultOnlineBookingConfiguration(app.workspace)
      );
      configuration.restaurant.settings.clockInLatitude = coords.latitude;
      configuration.restaurant.settings.clockInLongitude = coords.longitude;
      if (await savePatch(
        { onlineBookingConfiguration: configuration },
        "Der Restaurantstandort wurde übernommen."
      )) {
        renderSettings();
      }
    },
    () => {
      toast(
        "Standort nicht übernommen",
        "Erlaube den Standortzugriff im Browser und versuche es erneut.",
        "error"
      );
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

function openModal({ eyebrow = "Taviko", title, body, footer = "" }) {
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

function permissionEditorHTML(member, role) {
  const selected = new Set(member?.permissions || defaultPermissions(role));
  const manager = role === "Restaurantleitung";
  return `
    <div class="permission-list" id="member-permissions">
      ${teamPermissions.map(([id, title, explanation]) => `
        <label class="permission-row">
          <span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(explanation)}</small></span>
          <span class="switch">
            <input type="checkbox" value="${id}" ${manager || selected.has(id) ? "checked" : ""} ${manager ? "disabled" : ""}>
            <span aria-hidden="true"></span>
          </span>
        </label>`).join("")}
    </div>`;
}

function openMemberEditor(memberID = null) {
  const member = app.data.team.find((item) => item.id === memberID);
  const role = member?.role || "Service";
  openModal({
    eyebrow: "Geschützter Zugang",
    title: member ? "Mitarbeiter bearbeiten" : "Mitarbeiter anlegen",
    body: `
      <form id="member-form" data-id="${member?.id || ""}" data-login-name="${escapeHTML(member?.username || member?.name || "")}">
        <label class="field"><span>Name</span><input id="member-name" value="${escapeHTML(member?.name || "")}" required></label>
        <label class="field"><span>Rolle</span><select id="member-role"><option ${role === "Restaurantleitung" ? "selected" : ""}>Restaurantleitung</option><option ${role === "Service" ? "selected" : ""}>Service</option><option ${role === "Management" ? "selected" : ""}>Management</option><option ${role === "Küche" ? "selected" : ""}>Küche</option><option ${role === "Bar" ? "selected" : ""}>Bar</option></select></label>
        <label class="field"><span>${member ? "Neues Passwort (optional)" : "Startpasswort"}</span><input id="member-password" type="password" minlength="8" autocomplete="new-password" ${member ? "" : "required"}></label>
        <label class="field"><span>Telefon</span><input id="member-phone" type="tel" value="${escapeHTML(member?.phone || "")}"></label>
        <p class="field-hint">Der Name ist gleichzeitig der eindeutige Anmeldename. Groß- und Kleinschreibung werden nicht unterschieden. Das Passwort wird ausschließlich als sicherer Hash gespeichert.</p>
        <div id="member-permission-editor">${permissionEditorHTML(member, role)}</div>
      </form>`,
    footer: `${member ? `<button class="danger" type="button" data-modal-action="delete-member" data-id="${member.id}">Mitarbeiter löschen</button>` : ""}<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-member">${member ? "Speichern" : "Zugang erstellen"}</button>`
  });
  $("member-role")?.addEventListener("change", () => {
    $("member-permission-editor").innerHTML =
      permissionEditorHTML(null, $("member-role").value);
  });
}

function openScheduledShiftEditor() {
  if (!canManage()) return;
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  openModal({
    eyebrow: "Dienstplan",
    title: "Schicht planen",
    body: `
      <form id="scheduled-shift-form">
        <label class="field"><span>Mitarbeiter</span><select id="scheduled-shift-member" required>
          <option value="">Bitte auswählen</option>
          ${app.data.team.map((member) => `<option value="${member.id}">${escapeHTML(member.name)} · ${escapeHTML(member.role)}</option>`).join("")}
        </select></label>
        <div class="field-grid">
          <label class="field"><span>Beginn</span><input id="scheduled-shift-start" type="datetime-local" step="900" value="${localDateInput(start)}T${start.toTimeString().slice(0, 5)}" required></label>
          <label class="field"><span>Ende</span><input id="scheduled-shift-end" type="datetime-local" step="900" value="${localDateInput(end)}T${end.toTimeString().slice(0, 5)}" required></label>
        </div>
        <label class="field"><span>Notiz</span><textarea id="scheduled-shift-note" rows="3"></textarea></label>
      </form>`,
    footer: `<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-scheduled-shift">Speichern</button>`
  });
}

async function saveScheduledShift() {
  if (!canManage()) return;
  const form = $("scheduled-shift-form");
  if (!form?.reportValidity()) return;
  const member = app.data.team.find((item) => item.id === $("scheduled-shift-member").value);
  const start = new Date($("scheduled-shift-start").value);
  const end = new Date($("scheduled-shift-end").value);
  if (!member || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    toast("Nicht gespeichert", "Bitte prüfe Mitarbeiter, Beginn und Ende.", "error");
    return;
  }
  const shift = {
    id: uuid(),
    memberID: member.id,
    memberName: member.name,
    start: swiftDate(start),
    end: swiftDate(end),
    note: $("scheduled-shift-note").value.trim(),
    createdBy: app.workspace.displayName,
    updatedAt: swiftDate()
  };
  if (await savePatch(
    { scheduledShifts: [...app.data.scheduledShifts, shift] },
    "Schicht wurde eingeplant."
  )) closeModal();
}

async function saveMember() {
  const form = $("member-form");
  if (!form?.reportValidity()) return;
  const memberID = form.dataset.id || null;
  const previousLoginName = form.dataset.loginName;
  const roleTitle = $("member-role").value;
  const member = {
    id: memberID || uuid(),
    name: $("member-name").value.trim(),
    role: roleTitle,
    phone: $("member-phone").value.trim(),
    username: $("member-name").value.trim(),
    permissions: roleTitle === "Restaurantleitung"
      ? defaultPermissions(roleTitle)
      : [...form.querySelectorAll("#member-permissions input:checked")].map((input) => input.value)
  };
  if (app.data.team.some((item) =>
    item.id !== memberID &&
    String(item.name).localeCompare(member.name, "de", { sensitivity: "base" }) === 0
  ) || app.data.stations.some((item) =>
    String(item.accessUsername || item.name).localeCompare(member.name, "de", { sensitivity: "base" }) === 0
  ) || app.data.devices.some((item) =>
    String(item.loginName || item.name).localeCompare(member.name, "de", { sensitivity: "base" }) === 0
  )) {
    toast("Name bereits vergeben", "Jeder Anmeldename muss im Restaurant eindeutig sein.", "error");
    return;
  }
  try {
    const password = $("member-password").value;
    if (memberID) {
      await rpc("update_restaurant_credential_identity", {
        target_restaurant_id: app.workspace.restaurantId,
        previous_username: previousLoginName,
        member_name: member.name,
        member_password: password,
        member_role: stateRoleToDatabaseRole[roleTitle]
      });
    } else {
      await rpc("upsert_restaurant_credential", {
        target_restaurant_id: app.workspace.restaurantId,
        member_username: member.username,
        member_password: password,
        member_display_name: member.name,
        member_role: stateRoleToDatabaseRole[roleTitle]
      });
    }
    const team = memberID
      ? app.data.team.map((item) => item.id === memberID ? member : item)
      : [...app.data.team, member];
    if (await savePatch({ team }, memberID ? "Mitarbeiter wurde aktualisiert." : "Mitarbeiterzugang wurde erstellt.")) closeModal();
  } catch (error) {
    toast("Zugang nicht gespeichert", friendlyError(error), "error");
  }
}

async function deleteMember(memberID) {
  const member = app.data.team.find((item) => item.id === memberID);
  if (!member) return;
  const managerCount = app.data.team.filter((item) => item.role === "Restaurantleitung").length;
  if (member.role === "Restaurantleitung" && managerCount <= 1) {
    toast("Nicht möglich", "Die letzte Restaurantleitung kann nicht gelöscht werden.", "error");
    return;
  }
  if (String(member.username).localeCompare(String(app.workspace.username), "de", { sensitivity: "base" }) === 0) {
    toast("Nicht möglich", "Der aktuell angemeldete Zugang kann hier nicht gelöscht werden.", "error");
    return;
  }
  if (!window.confirm(`Mitarbeiterzugang „${member.name}“ endgültig löschen?`)) return;
  try {
    await rpc("delete_restaurant_credential", {
      target_restaurant_id: app.workspace.restaurantId,
      member_username: member.username || member.name
    });
    if (await savePatch(
      { team: app.data.team.filter((item) => item.id !== memberID) },
      "Mitarbeiterzugang wurde gelöscht."
    )) closeModal();
  } catch (error) {
    toast("Mitarbeiter nicht gelöscht", friendlyError(error), "error");
  }
}

function openDeviceEditor(deviceID = null) {
  const device = app.data.devices.find((item) => item.id === deviceID);
  const kind = device?.kind || "Bonier-Tablet";
  const digitalStations = app.data.stations.filter(
    (station) => station.defaultMode === "digital" && station.isActive !== false
  );
  openModal({
    eyebrow: "Geschützter Gerätezugang",
    title: device ? "Gerät bearbeiten" : "Gerät anlegen",
    body: `
      <form id="device-form" data-id="${device?.id || ""}" data-login-name="${escapeHTML(device?.loginName || device?.name || "")}">
        <label class="field"><span>Gerätename</span><input id="device-name" value="${escapeHTML(device?.name || "")}" required></label>
        <label class="field"><span>Gerätetyp</span>
          <select id="device-kind">
            <option value="Bonier-Tablet" ${kind === "Bonier-Tablet" ? "selected" : ""}>Kasse</option>
            <option value="Küchenanzeige" ${kind === "Küchenanzeige" ? "selected" : ""}>Digitales Stationsdisplay</option>
          </select>
        </label>
        <label class="field" id="device-station-field"><span>Digitale Station</span>
          <select id="device-station">
            <option value="">Bitte auswählen</option>
            ${digitalStations.map((station) => `<option value="${station.id}" ${device?.stationID === station.id ? "selected" : ""}>${escapeHTML(station.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>${device ? "Neues Passwort (optional)" : "Gerätepasswort"}</span><input id="device-password" type="password" minlength="6" autocomplete="new-password" ${device ? "" : "required"}></label>
        <div class="notice-card">
          <strong>Anmeldung am Gerät</strong>
          <p>Restaurantkennung, Gerätename und Gerätepasswort öffnen direkt die passende Oberfläche. Der Anmeldename ändert sich automatisch mit dem Gerätenamen.</p>
        </div>
      </form>`,
    footer: `
      ${device ? `<button class="danger" type="button" data-modal-action="delete-device" data-id="${device.id}">Gerät löschen</button>` : ""}
      <button class="secondary" type="button" data-modal-action="close">Abbrechen</button>
      <button class="primary" type="button" data-modal-action="save-device">Speichern</button>`
  });
  updateDeviceStationVisibility();
  $("device-kind")?.addEventListener("change", updateDeviceStationVisibility);
}

function updateDeviceStationVisibility() {
  const isKitchen = $("device-kind")?.value === "Küchenanzeige";
  $("device-station-field")?.classList.toggle("hidden", !isKitchen);
  if ($("device-station")) $("device-station").required = isKitchen;
}

async function saveDevice() {
  const form = $("device-form");
  if (!form?.reportValidity()) return;
  const deviceID = form.dataset.id || null;
  const previousLoginName = form.dataset.loginName;
  const name = $("device-name").value.trim();
  const kind = $("device-kind").value;
  const stationID = kind === "Küchenanzeige" ? $("device-station").value : null;
  const password = $("device-password").value;
  const duplicate =
    app.data.team.some((item) =>
      String(item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
    ) ||
    app.data.stations.some((item) =>
      String(item.accessUsername || item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
    ) ||
    app.data.devices.some((item) =>
      item.id !== deviceID &&
      String(item.loginName || item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
    );
  if (duplicate) {
    toast("Name bereits vergeben", "Mitarbeiter, Stationen und Geräte benötigen eindeutige Anmeldenamen.", "error");
    return;
  }

  const devices = structuredClone(app.data.devices);
  const existing = devices.find((item) => item.id === deviceID);
  const device = existing || {
    id: uuid(),
    createdAt: swiftDate()
  };
  device.name = name;
  device.loginName = name;
  device.kind = kind;
  device.stationID = stationID || null;

  try {
    if (existing) {
      await rpc("update_restaurant_credential_identity", {
        target_restaurant_id: app.workspace.restaurantId,
        previous_username: previousLoginName,
        member_name: name,
        member_password: password,
        member_role: kind === "Küchenanzeige" ? "kitchen" : "service"
      });
    } else {
      await rpc("upsert_restaurant_credential", {
        target_restaurant_id: app.workspace.restaurantId,
        member_username: name,
        member_password: password,
        member_display_name: `Gerät · ${name}`,
        member_role: kind === "Küchenanzeige" ? "kitchen" : "service"
      });
      devices.push(device);
    }
    if (await savePatch({ devices }, "Gerätezugang wurde gespeichert.")) closeModal();
  } catch (error) {
    toast("Gerät nicht gespeichert", friendlyError(error), "error");
  }
}

async function deleteDevice(deviceID) {
  const device = app.data.devices.find((item) => item.id === deviceID);
  if (!device || !window.confirm(`Gerätezugang „${device.name}“ endgültig löschen?`)) return;
  try {
    await rpc("delete_restaurant_credential", {
      target_restaurant_id: app.workspace.restaurantId,
      member_username: device.loginName || device.name
    });
    if (await savePatch(
      { devices: app.data.devices.filter((item) => item.id !== deviceID) },
      "Gerätezugang wurde gelöscht."
    )) closeModal();
  } catch (error) {
    toast("Gerät nicht gelöscht", friendlyError(error), "error");
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
        <div class="field-grid"><label class="field"><span>Ausgabeweg</span><select id="station-mode"><option value="digital" ${station?.defaultMode === "digital" ? "selected" : ""}>Digitales Stationsdisplay</option><option value="print" ${station?.defaultMode === "print" ? "selected" : ""}>Bondruck</option></select></label><label class="field"><span>Warnung nach Minuten</span><input id="station-warning" type="number" min="1" max="120" value="${Number(station?.warningMinutes || 12)}"></label></div>
        <label class="check"><input id="station-active" type="checkbox" ${station?.isActive !== false ? "checked" : ""}><span>Station ist aktiv</span></label>
      </form>`,
    footer: `<button class="secondary" type="button" data-modal-action="close">Abbrechen</button><button class="primary" type="button" data-modal-action="save-station">Speichern</button>`
  });
}

function openAccountMenu() {
  openModal({
    eyebrow: roleTitles[app.workspace.role] || "Taviko",
    title: app.data.restaurantName,
    body: `
      <div class="detail-list">
        <div><span>Restaurantkennung</span><strong>${escapeHTML(app.workspace.restaurantCode)}</strong></div>
        <div><span>Angemeldet als</span><strong>${escapeHTML(app.workspace.displayName || app.workspace.username)}</strong></div>
        <div><span>Anmeldename</span><strong>${escapeHTML(app.workspace.username)}</strong></div>
      </div>
      <p class="modal-note">Geräte- und Druckerzugänge werden aus Sicherheitsgründen ausschließlich in der Taviko App verwendet.</p>`,
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
  const name = $("station-name").value.trim();
  const stationMode = $("station-mode").value;
  if (stations.some((item) =>
    item.id !== form.dataset.id &&
    String(item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
  ) || app.data.team.some((item) =>
    String(item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
  ) || app.data.devices.some((item) =>
    String(item.loginName || item.name).localeCompare(name, "de", { sensitivity: "base" }) === 0
  )) {
    toast("Name bereits vergeben", "Stations-, Mitarbeiter- und Gerätenamen müssen eindeutig sein.", "error");
    return;
  }
  let operatingMode = app.data.kitchenOperatingMode;
  if (!operatingModeSupports(operatingMode, stationMode)) {
    if (!window.confirm("Diese Station passt nicht zur aktuellen Ausgabeart. Auf „Kombiniert“ wechseln?")) return;
    operatingMode = "hybrid";
  }
  const station = {
    id: existing?.id || uuid(),
    name,
    icon: existing?.icon || "flame",
    defaultMode: stationMode,
    accessUsername: existing?.accessUsername || null,
    colorName: existing?.colorName || "orange",
    isActive: $("station-active").checked,
    warningMinutes: Number($("station-warning").value),
    printerID: existing?.printerID || null
  };
  if (existing) Object.assign(existing, station);
  else stations.push(station);
  if (await savePatch(
    { stations, kitchenOperatingMode: operatingMode },
    "Station wurde gespeichert."
  )) closeModal();
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
  const memberID = event.target.closest("[data-member-id]")?.dataset.memberId;
  if (memberID) return openMemberEditor(memberID);
  const deviceID = event.target.closest("[data-device-id]")?.dataset.deviceId;
  if (deviceID) return openDeviceEditor(deviceID);
  const guestID = event.target.closest("[data-guest-id]")?.dataset.guestId;
  if (guestID) return openGuestProfile(guestID);
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
  if (action === "add-device") openDeviceEditor();
  if (action === "add-station") openStationEditor();
  if (action === "save-operating-mode") saveKitchenOperatingMode();
  if (action === "plan-shift") openScheduledShiftEditor();
  if (action === "start-shift") shiftAction("start");
  if (action === "toggle-break") shiftAction("break");
  if (action === "end-shift") shiftAction("end");
  if (action === "use-current-location") useCurrentBusinessLocation();
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
  if (action === "delete-member") deleteMember(id);
  if (action === "save-device") saveDevice();
  if (action === "delete-device") deleteDevice(id);
  if (action === "save-scheduled-shift") saveScheduledShift();
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
    const isDeviceAccess = app.data.devices.some(
      (device) =>
        String(device.loginName || device.name).localeCompare(
          session.username,
          "de",
          { sensitivity: "base" }
        ) === 0
    );
    if (isDeviceAccess) {
      await logout();
      throw new Error("Gerätezugänge können sich nur in der Taviko-App anmelden.");
    }
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
      p_owner_display_name: $("register-username").value.trim()
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
  if (event.target.id === "cash-day-open-form") openCashDay(event);
  if (event.target.id === "cash-day-close-form") closeCashDay(event);
  if (event.target.id === "business-settings-form") saveBusinessSettings(event);
});
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

updateOnlineStatus();
if (!DEVELOPMENT_MODE) {
  $("development-gate").classList.add("hidden");
  start();
}
