// The landing page: the welcome, this week's sheet set like the sheet's own hero, the index.
import { applyStored, initSettings } from "./settings.js";
import { indexUrl } from "./contract.js";
import { createAnalytics } from "./analytics.js";
import { load, store } from "./storage.js";
import { parashahGrid, byBook, specials } from "./library.js";
import { gridHtml, bookHtml, specialHtml } from "./library-view.js";
import { registerOffline, showUpdate, warmWeek, settleOffline } from "./offline-client.js";

const DAY = 86400000;

// The newest week is "This week" until seven days after its Shabbat; after that, "The latest sheet".
export function pickHero(index, now = new Date()) {
  const weeks = (index && index.weeks) || [];
  if (!weeks.length) return null;
  const entry = weeks[0];
  const shabbat = Date.parse(`${entry.civil}T12:00:00Z`);
  const current = !Number.isNaN(shabbat) && now.getTime() - shabbat <= 7 * DAY;
  return { entry, heading: current ? "This week" : "The latest sheet", current };
}

export function rowHtml(w, current, esc) {
  // A week with a Torah reading: two lines, the Torah's ref then the haftarah's.
  const torah = (w.readings || []).find(r => r.kind === "torah");
  const refs = torah
    ? `<span class="r two"><span>${esc(torah.ref || "")}</span><span>${esc(w.ref || "")}</span></span>`
    : `<span class="r">${esc(w.ref || "")}</span>`;
  return `<li${current ? ' class="current"' : ""}><span class="d">${esc(w.hebrewEn || "")}</span><a href="/${esc(w.slug)}">${esc(w.shabbat || w.slug)}</a>${refs}<span class="c">${esc(w.civilDisplay || w.civil || "")}</span></li>`;
}

/** The four doors over one list: aria-pressed buttons, one panel shown. */
export function initDoors(host, { initial = "week", remember = () => {} } = {}) {
  const buttons = [...host.querySelectorAll("[data-door]")];
  const show = door => {
    for (const b of buttons) {
      const on = b.dataset.door === door;
      b.setAttribute("aria-pressed", String(on));
      host.querySelector(`#door-${b.dataset.door}`).hidden = !on;
    }
  };
  for (const b of buttons) b.addEventListener("click", () => { show(b.dataset.door); remember(b.dataset.door); });
  show(buttons.some(b => b.dataset.door === initial) ? initial : "week");
  return { show };
}

export async function run() {
  const L = window.HaftarahLib, esc = L.escapeHtml;
  const $ = id => document.getElementById(id);
  const check = new URLSearchParams(location.search).get("check") === "1";
  const html = document.documentElement;
  const errors = [];   // check mode: script errors and CSP violations
  if (check) {
    addEventListener("error", e => errors.push(e.message));
    document.addEventListener("securitypolicyviolation", e => errors.push(`CSP blocked ${e.blockedURI || "inline"} (${e.violatedDirective})`));
  }
  applyStored();
  initSettings({ host: $("settings"), button: $("aaBtn"), trope: false, langs: false });
  const analytics = createAnalytics();
  addEventListener("appinstalled", () => analytics.track("install", {}));
  const status = (msg) => { $("status").innerHTML = msg; $("status").hidden = false; };
  let index;
  try {
    const res = await fetch(indexUrl());
    if (res.status === 404) index = { schema: 1, weeks: [] };
    else if (!res.ok) throw new Error(`HTTP ${res.status}`);
    else {
      index = await res.json();
      index = index && typeof index === "object" ? index : {};
      index.weeks = Array.isArray(index.weeks) ? index.weeks : [];
    }
  } catch {
    status("The sheets could not be loaded; try again in a minute.");
    if (check) { html.dataset.checkErrors = "1: load"; html.dataset.checkDone = "1"; }
    return;
  }
  const hero = pickHero(index);
  if (!hero) status("The first sheet is on its way.");
  else {
    const w = hero.entry, inc = w.incipit || {};
    $("mastYear").textContent = (w.hebrewEn || "").split(/\s+/).pop() || "";
    $("thisweek").innerHTML = `<h2>${hero.heading}</h2>
      <div class="hero"><div class="incipit-block">
        ${inc.he ? `<p class="incipit" lang="he" dir="rtl">${L.divineName(esc(inc.he)).html}</p>` : ""}
        ${inc.en ? `<p class="incipit-en">${esc(inc.en)}</p>` : ""}
        <p class="reading">${(w.readings || []).some(r => r.kind === "torah") ? `<span class="ref">Torah · ${esc(w.readings.find(r => r.kind === "torah").ref || "")}</span><br><span class="ref">Haftarah · ${esc(w.ref || "")}</span>` : `<span class="ref">${esc(w.ref || "")}</span>`}<br>${esc(w.shabbat || "")}<br>
          <span class="dates"><span class="he-date" lang="he" dir="rtl">${esc(w.hebrew || "")}</span> · ${esc(w.civilDisplay || "")}</span></p>
        <a class="cta" href="/${esc(w.slug)}">Read this week's sheet</a>
      </div></div>`;
    $("thisweek").hidden = false;
    $("weeks").innerHTML = index.weeks.map(x => rowHtml(x, hero.current && x.slug === w.slug, esc)).join("");
    // The other doors: the same weeks, grouped.
    $("door-parashah").innerHTML = gridHtml(parashahGrid(index.weeks, { currentSlug: hero.current ? w.slug : null }), esc);
    $("door-book").innerHTML = bookHtml(byBook(index.weeks), esc);
    const sp = specials(index.weeks);
    $("door-special").innerHTML = sp.length ? specialHtml(sp, esc) : `<p class="status">No sheets here yet.</p>`;
    initDoors($("index"), { initial: load("door") || "week", remember: d => store("door", d) });
    $("index").hidden = false;
  }
  // The offline app: register the worker, then warm this week's sheet into the cache once a worker
  // controls the page (an uncontrolled first visit warms nothing, by design). The check waits for the
  // worker to take control first, as the week page's check does, so the warm-up is exercised.
  const offlineReady = registerOffline({ onUpdate: () => showUpdate($("update")) });
  const slug = hero ? hero.entry.slug : null;
  // In check mode the warm-up runs only once control is confirmed; the state goes in data-check-warm-sw.
  const warmed = !check ? offlineReady.then(() => warmWeek(slug))
    : settleOffline(offlineReady).then(({ state }) => { html.dataset.checkWarmSw = state; return state === "active" ? warmWeek(slug) : "skipped"; });
  if (check) {
    html.dataset.checkWarm = await warmed;
    html.dataset.checkWeeks = String(index.weeks.length);
    html.dataset.checkHero = hero ? hero.entry.slug : "";
    html.dataset.checkHeading = hero ? hero.heading : "";
    html.dataset.checkDoors = String(document.querySelectorAll("#index [data-door]").length);
    html.dataset.checkCells = String(document.querySelectorAll("#door-parashah .cell").length);
    html.dataset.checkHeld = String(document.querySelectorAll("#door-parashah .cell:not(.empty)").length);
    const pb = document.querySelector('#index [data-door="parashah"]'), wb = document.querySelector('#index [data-door="week"]');
    if (pb && wb) {
      pb.click();
      const shown = !$("door-parashah").hidden && $("door-week").hidden && pb.getAttribute("aria-pressed") === "true" && wb.getAttribute("aria-pressed") === "false";
      wb.click();
      html.dataset.checkDoorSwitch = shown && !$("door-week").hidden ? "ok" : "fail";
    } else html.dataset.checkDoorSwitch = "none";
    html.dataset.checkErrors = String(errors.length) + (errors.length ? ": " + errors[0] : "");
    html.dataset.checkDone = "1";
  }
}
