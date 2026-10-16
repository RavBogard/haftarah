// The library's short addresses. vercel.json sends exactly the allow-listed ones (parashot.js) here;
// this page resolves them against index.json. A week alias goes on to its permanent page, /<date-slug>,
// with location.replace, so the alias leaves no history entry. A list alias (a book, a special
// Shabbat) shows its weeks here with the landing's rows. ?check=1 reports instead of moving on.
import { applyStored, initSettings } from "./settings.js";
import { indexUrl, isSlug } from "./contract.js";
import { parseAlias, resolveWeekAlias, weeksFor } from "./library.js";
import { rowHtml } from "./landing.js";
import { registerOffline, showUpdate } from "./offline-client.js";

export async function run() {
  const esc = window.HaftarahLib.escapeHtml;
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const check = new URLSearchParams(location.search).get("check") === "1";
  const errors = [];
  if (check) {
    addEventListener("error", e => errors.push(e.message));
    document.addEventListener("securitypolicyviolation", e => errors.push(`CSP blocked ${e.blockedURI || "inline"} (${e.violatedDirective})`));
  }
  const done = attrs => {
    if (!check) return;
    Object.assign(html.dataset, attrs);
    html.dataset.checkErrors = String(errors.length) + (errors.length ? ": " + errors[0] : "");
    html.dataset.checkDone = "1";
  };
  const say = msg => { $("status").innerHTML = msg; $("status").hidden = false; };
  applyStored();
  initSettings({ host: $("settings"), button: $("aaBtn"), trope: false, langs: false });

  const alias = parseAlias(location.pathname.toLowerCase());
  if (!alias) { say(`No sheet at this address. <a href="/">All sheets</a>`); return done({ checkMissing: "address" }); }
  let weeks;
  try {
    const res = await fetch(indexUrl());
    if (res.status === 404) weeks = [];
    else if (!res.ok) throw new Error(`HTTP ${res.status}`);
    else { const idx = await res.json(); weeks = idx && Array.isArray(idx.weeks) ? idx.weeks : []; }
  } catch {
    say(`The sheets could not be loaded; try again in a minute. <a href="/">All sheets</a>`);
    return done({ checkMissing: "index" });
  }
  // The offline app: register the worker (fire and forget; the week page and the landing check it).
  registerOffline({ onUpdate: () => showUpdate($("update")) });

  if (alias.kind === "week") {
    const r = resolveWeekAlias(alias, weeks);
    if (r.slug && !isSlug(r.slug)) { say(`No sheet at this address. <a href="/">All sheets</a>`); return done({ checkMissing: "address" }); }
    if (r.slug) {
      if (check) return done({ checkResolved: r.slug });
      location.replace(`/${r.slug}${location.hash}`);
      return;
    }
    const m = r.missing;
    document.title = `${m.en} · Haftarah`;
    say(`${m.year ? `No sheet for ${esc(m.en)} in ${esc(m.year)}.` : `No sheet for ${esc(m.en)} yet.`} <a href="/">All sheets</a>`);
    return done({ checkMissing: m.key });
  }

  const list = weeksFor(alias, weeks);
  document.title = `${list.title} · Haftarah`;
  $("libTitle").textContent = list.title;
  $("weeks").innerHTML = list.weeks.map(w => rowHtml(w, false, esc)).join("");
  $("index").hidden = false;
  if (!list.weeks.length) say(`No sheets here yet. <a href="/">All sheets</a>`);
  done({ checkListed: String(list.weeks.length), checkListTitle: list.title });
}
