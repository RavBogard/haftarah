// The landing page: the welcome, this week's sheet set like the sheet's own hero, the index.
import { applyStored, initSettings } from "./settings.js";

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
  return `<li${current ? ' class="current"' : ""}><span class="d">${esc(w.hebrewEn || "")}</span><a href="/${esc(w.slug)}">${esc(w.shabbat || w.slug)}</a><span class="r">${esc(w.ref || "")}</span><span class="c">${esc(w.civilDisplay || w.civil || "")}</span></li>`;
}

export async function run() {
  const L = window.HaftarahLib, esc = L.escapeHtml;
  const $ = id => document.getElementById(id);
  const check = new URLSearchParams(location.search).get("check") === "1";
  const html = document.documentElement;
  applyStored();
  initSettings({ host: $("settings"), button: $("aaBtn"), trope: false });
  const status = (msg) => { $("status").innerHTML = msg; $("status").hidden = false; };
  let index;
  try {
    const res = await fetch("/data/index.json");
    if (res.status === 404) index = { schema: 1, weeks: [] };
    else if (!res.ok) throw new Error(`HTTP ${res.status}`);
    else index = await res.json();
  } catch {
    status("The sheets could not be loaded; try again in a minute.");
    if (check) { html.dataset.checkErrors = "1: load"; html.dataset.checkDone = "1"; }
    return;
  }
  const hero = pickHero(index);
  if (!hero) status("The first sheet is on its way.");
  else {
    const w = hero.entry;
    $("mastYear").textContent = (w.hebrewEn || "").split(/\s+/).pop() || "";
    $("thisweek").innerHTML = `<h2>${hero.heading}</h2>
      <div class="hero"><div class="incipit-block">
        <p class="incipit" lang="he" dir="rtl">${L.divineName(esc((w.incipit && w.incipit.he) || "")).html}</p>
        <p class="incipit-en">${esc((w.incipit && w.incipit.en) || "")}</p>
        <p class="reading"><span class="ref">${esc(w.ref || "")}</span><br>${esc(w.shabbat || "")}<br>
          <span class="dates"><span class="he-date" lang="he" dir="rtl">${esc(w.hebrew || "")}</span> · ${esc(w.civilDisplay || "")}</span></p>
        <a class="cta" href="/${esc(w.slug)}">Read this week's sheet</a>
      </div></div>`;
    $("thisweek").hidden = false;
    $("weeks").innerHTML = index.weeks.map(x => rowHtml(x, hero.current && x.slug === w.slug, esc)).join("");
    $("index").hidden = false;
  }
  if (check) {
    html.dataset.checkWeeks = String(index.weeks.length);
    html.dataset.checkHero = hero ? hero.entry.slug : "";
    html.dataset.checkHeading = hero ? hero.heading : "";
    html.dataset.checkErrors = "0";
    html.dataset.checkDone = "1";
  }
}
