// Shared renderer for the standalone /datenschutz/, /impressum/ and
// /nutzungsbedingungen/ pages. All three fetch the same live legal_documents
// content from Supabase (get_current_legal_bundle, anon-readable) so there
// is exactly one source of truth shared by the Restaurant app, the
// Gastportal app and this website - editing a document in one place updates
// every surface. Set window.HAVIKO_LEGAL_DOCUMENT_TYPE before loading this
// script to pick which document a page shows.
(() => {
  "use strict";

  const SUPABASE_URL = "https://dlapwemckfhxklytbqkk.supabase.co";
  const SUPABASE_KEY = "sb_publishable_VeeQLARNn-sULZ4snvp3HA_Hd78H5RN";
  const documentType = window.HAVIKO_LEGAL_DOCUMENT_TYPE;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
  }

  function renderBody(body) {
    return String(body ?? "")
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  async function load() {
    const root = document.getElementById("legal-root");
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_current_legal_bundle`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Fehler ${response.status}`);
      const bundle = await response.json();
      const doc = (bundle.documents || []).find((d) => d.document_type === documentType);
      if (!doc) throw new Error("Dokument nicht gefunden.");

      document.title = `${doc.title} | Haviko`;
      const updated = doc.updated_at
        ? new Date(doc.updated_at).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" })
        : null;

      root.innerHTML = `
        <h1>${escapeHTML(doc.title)}</h1>
        <p class="legal-meta">Stand: ${updated ? escapeHTML(updated) : "—"} · Version ${escapeHTML(doc.version)} · gilt für die Haviko Restaurant-App und das Haviko Gastportal</p>
        ${(doc.sections || []).map((section) => `
          <section>
            <h2>${escapeHTML(section.title)}</h2>
            ${renderBody(section.body)}
          </section>
        `).join("")}
      `;
    } catch (error) {
      root.innerHTML = `<p class="legal-error">Der Inhalt konnte nicht geladen werden (${escapeHTML(error.message || error)}). Bitte versuche es später erneut oder wende dich an unseren Support.</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
