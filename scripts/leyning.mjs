/**
 * leyning.mjs — the week's Torah reading as Hebcal gives it, and the selection the sheet carries.
 * Pure: fetch.mjs makes the one network call (Hebcal's leyning API, CC BY 4.0) and hands its item here.
 *
 * Hebcal's item has `fullkriyah` (aliyot 1-7 and M, each { k: book, b: begin, e: end, v: verses }),
 * `triennial` (the same shape, with `triYear`) and, on special Shabbatot and festivals, the special
 * maftir with its `reason`. The full list is kept on the sheet so the class sees where the selection
 * sits; the selection is one range in one book; the maftir is reported beside it, never folded in.
 */
const ALIYOT = ["1", "2", "3", "4", "5", "6", "7"];

/** Hebcal's { k, b, e } → "Genesis 6:9-22", "Genesis 7:17-8:14", or "Exodus 30:11" for one verse. */
export function hebcalRef(a) {
  if (!a || !a.k || !a.b) return "";
  const e = a.e || a.b;
  if (e === a.b) return `${a.k} ${a.b}`;
  const bc = a.b.split(":")[0], [ec, ev] = e.split(":");
  return `${a.k} ${a.b}-${bc === ec ? ev : e}`;
}

/** "Genesis 6:9-7:16" → { book, from: [6, 9], to: [7, 16] }; null unless it is one range in one book. */
export function parseRange(ref) {
  // The book has no digits, colons or semicolons ("I Samuel", "Song of Songs"), so a ref of two ranges never parses.
  const m = /^([^:;\d]+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(String(ref == null ? "" : ref).trim());
  if (!m) return null;
  const from = [Number(m[2]), Number(m[3])];
  const to = m[5] ? [m[4] ? Number(m[4]) : from[0], Number(m[5])] : from;
  return { book: m[1], from, to };
}

const formatRange = (book, [c1, v1], [c2, v2]) =>
  c1 === c2 && v1 === v2 ? `${book} ${c1}:${v1}` : c1 === c2 ? `${book} ${c1}:${v1}-${v2}` : `${book} ${c1}:${v1}-${c2}:${v2}`;

/** One Hebcal aliyot set → [{ n, ref, verses?, reason? }], aliyot 1-7 then M. */
export function aliyotOf(set) {
  if (!set) return [];
  const out = [];
  for (const n of [...ALIYOT, "M"]) {
    const a = set[n];
    if (!a) continue;
    const row = { n: n === "M" ? "M" : Number(n), ref: hebcalRef(a) };
    if (a.v != null) row.verses = a.v;
    if (a.reason) row.reason = a.reason;
    out.push(row);
  }
  return out;
}

/** What the sheet keeps of Hebcal's item (sheet.json `leyning`, working data only; not published). */
export function leyningOf(item) {
  return {
    parashah: (item && item.name && item.name.en) || "",
    type: (item && item.type) || "shabbat",
    summary: (item && item.summary) || "",
    aliyot: aliyotOf(item && item.fullkriyah),
    triennial: item && item.triennial ? { year: item.triYear == null ? null : item.triYear, aliyot: aliyotOf(item.triennial) } : null,
    source: "Hebcal",
  };
}

/** "aliyah:2", "aliyah:1-3", "aliyah:M", "triennial", "full" → a pick. */
export function parsePick(text) {
  const t = String(text == null ? "" : text).trim().toLowerCase();
  if (t === "triennial" || t === "full") return { kind: t };
  const usage = `--torah-pick takes aliyah:N, aliyah:N-M (1 to 7), aliyah:M, triennial or full (got "${text}")`;
  const m = /^aliyah:([1-7m])(?:-([1-7]))?$/.exec(t);
  if (!m) throw new Error(usage);
  if (m[1] === "m") { if (m[2]) throw new Error(usage); return { kind: "aliyah", from: "M", to: "M" }; }
  const from = Number(m[1]), to = m[2] ? Number(m[2]) : from;
  if (to < from) throw new Error(usage);
  return { kind: "aliyah", from, to };
}

/** The pick a congregation's customs make without asking. A weekly selection (CRC) waits for Daniel: null. */
export function defaultPick(customs) {
  const mode = customs && customs.torah && customs.torah.mode;
  return mode === "triennial" ? { kind: "triennial" } : mode === "full" ? { kind: "full" } : null;
}

function joinRows(rows, what) {
  const ranges = rows.map(r => parseRange(r.ref));
  if (!ranges.length || ranges.some(x => !x)) throw new Error(`${what}: Hebcal gave a reading this cannot join (${rows.map(r => r.ref).join("; ")}); give --torah "<ref>"`);
  const book = ranges[0].book;
  if (ranges.some(x => x.book !== book)) throw new Error(`${what} spans two books (${rows.map(r => r.ref).join("; ")}); pick within one book or give --torah "<ref>"`);
  return formatRange(book, ranges[0].from, ranges[ranges.length - 1].to);
}

/** The Torah selection: { ref, book, selection, maftir }. `pick` comes from parsePick, or is { kind: "ref", ref }. */
export function selectTorah(leyning, pick) {
  const rows = (leyning && leyning.aliyot) || [];
  const m = rows.find(r => r.n === "M");
  const maftir = m ? (m.reason ? { ref: m.ref, reason: m.reason } : { ref: m.ref }) : null;
  const name = (leyning && leyning.parashah) || "this Shabbat";
  let ref, selection;
  if (pick.kind === "ref") {
    if (!parseRange(pick.ref)) throw new Error(`--torah "${pick.ref}" is not one range like "Genesis 6:9-7:16"`);
    ref = String(pick.ref).trim(); selection = "custom";
  } else if (pick.kind === "aliyah" && pick.from === "M") {
    if (!m) throw new Error(`Hebcal lists no maftir for ${name}`);
    ref = m.ref; selection = "maftir";
  } else if (pick.kind === "aliyah") {
    const sel = [];
    for (let n = pick.from; n <= pick.to; n++) {
      const r = rows.find(x => x.n === n);
      if (!r) throw new Error(`Hebcal lists no aliyah ${n} for ${name}`);
      sel.push(r);
    }
    ref = joinRows(sel, pick.from === pick.to ? `aliyah ${pick.from}` : `aliyot ${pick.from}-${pick.to}`);
    selection = pick.from === pick.to ? `aliyah ${pick.from}` : `aliyot ${pick.from}-${pick.to}`;
  } else if (pick.kind === "triennial") {
    if (!leyning || !leyning.triennial) throw new Error(`Hebcal gives no triennial reading for ${name}`);
    ref = joinRows(leyning.triennial.aliyot.filter(r => r.n !== "M"), "the triennial reading");
    selection = `triennial year ${leyning.triennial.year}`;
  } else if (pick.kind === "full") {
    ref = joinRows(rows.filter(r => r.n !== "M"), "the full reading");
    selection = "full reading";
  } else throw new Error(`unknown Torah pick "${pick.kind}"`);
  return { ref, book: parseRange(ref).book, selection, maftir };
}

const row = r => `${r.verses != null ? `${r.verses} verses` : ""}${r.reason ? `${r.verses != null ? "; " : ""}${r.reason}` : ""}`;

/** The aliyot list for the console, one line each. */
export function aliyotLines(leyning) {
  const out = [`Torah: ${leyning.parashah} (Hebcal)`];
  for (const r of leyning.aliyot) out.push(`  ${String(r.n).padEnd(2)} ${r.ref}${row(r) ? `  (${row(r)})` : ""}`);
  if (leyning.triennial) {
    try { out.push(`  triennial year ${leyning.triennial.year}: ${selectTorah(leyning, { kind: "triennial" }).ref}`); } catch {}
  }
  return out;
}

/** The digest's "Torah calendar" section: the whole list, the triennial range, and the selection or how to make one. */
export function aliyotMarkdown(leyning, torah) {
  const list = leyning.aliyot.map(r => `${r.n} ${r.ref}${r.verses != null || r.reason ? ` (${[r.verses, r.reason].filter(x => x != null).join("; ")})` : ""}`).join(" · ");
  const out = [`# Torah calendar: ${leyning.parashah}`, "", `From Hebcal: ${list}.`];
  if (leyning.triennial) {
    try { out.push(`Triennial year ${leyning.triennial.year}: ${selectTorah(leyning, { kind: "triennial" }).ref}.`); } catch {}
  }
  out.push(torah && torah.ref
    ? `Selection: ${torah.selection || "custom"}, ${torah.ref}.`
    : `Selection: none yet. Pick with fetch.mjs --torah-pick aliyah:N[-M], triennial or full, or --torah "<ref>".`);
  return out.join("\n") + "\n";
}
