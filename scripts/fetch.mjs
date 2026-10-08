#!/usr/bin/env node
/**
 * fetch.mjs — pull one week's haftarah from Sefaria and start a sheet data file.
 *
 *   node scripts/fetch.mjs                       # next Shabbat (Diaspora schedule)
 *   node scripts/fetch.mjs --date 2026-10-10     # a specific Shabbat
 *   node scripts/fetch.mjs --ref "Isaiah 42:5-43:10" --date 2026-10-10   # override the reading
 *   node scripts/fetch.mjs --out weeks            # output root (default: weeks)
 *
 * Writes weeks/<slug>/sheet.json (text + metadata, no commentary yet) and
 * weeks/<slug>/candidates.json (every commentary Sefaria links to the passage,
 * grouped by source, for the rabbi to approve from). Never overwrites an
 * existing sheet.json; use --force to replace it.
 *
 * Dependency-free: Node 18+ with global fetch.
 */

import { mkdir, writeFile, access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const HEBREW_VERSION = "Miqra according to the Masorah";
const ENGLISH_VERSION = "THE JPS TANAKH: Gender-Sensitive Edition";

// Default (Ashkenazi) haftarah for each parashah. Used only to say what the
// reading would have been when a special Shabbat replaces it.
const DEFAULT_HAFTAROT = {
  "bereshit": "Isaiah 42:5-43:10",
  "noach": "Isaiah 54:1-55:5",
  "lech lecha": "Isaiah 40:27-41:16",
  "vayera": "II Kings 4:1-37",
  "chayei sara": "I Kings 1:1-31",
  "toldot": "Malachi 1:1-2:7",
  "vayetzei": "Hosea 12:13-14:10",
  "vayishlach": "Obadiah 1:1-21",
  "vayeshev": "Amos 2:6-3:8",
  "miketz": "I Kings 3:15-4:1",
  "vayigash": "Ezekiel 37:15-28",
  "vayechi": "I Kings 2:1-12",
  "shemot": "Isaiah 27:6-28:13; 29:22-23",
  "vaera": "Ezekiel 28:25-29:21",
  "bo": "Jeremiah 46:13-28",
  "beshalach": "Judges 4:4-5:31",
  "yitro": "Isaiah 6:1-7:6; 9:5-6",
  "mishpatim": "Jeremiah 34:8-22; 33:25-26",
  "terumah": "I Kings 5:26-6:13",
  "tetzaveh": "Ezekiel 43:10-27",
  "ki tisa": "I Kings 18:1-39",
  "vayakhel": "I Kings 7:40-50",
  "pekudei": "I Kings 7:51-8:21",
  "vayakhel pekudei": "I Kings 7:51-8:21",
  "vayikra": "Isaiah 43:21-44:23",
  "tzav": "Jeremiah 7:21-8:3; 9:22-23",
  "shmini": "II Samuel 6:1-7:17",
  "tazria": "II Kings 4:42-5:19",
  "metzora": "II Kings 7:3-20",
  "tazria metzora": "II Kings 7:3-20",
  "achrei mot": "Ezekiel 22:1-19",
  "kedoshim": "Amos 9:7-15",
  "achrei mot kedoshim": "Amos 9:7-15",
  "emor": "Ezekiel 44:15-31",
  "behar": "Jeremiah 32:6-27",
  "bechukotai": "Jeremiah 16:19-17:14",
  "behar bechukotai": "Jeremiah 16:19-17:14",
  "bamidbar": "Hosea 2:1-22",
  "nasso": "Judges 13:2-25",
  "behaalotcha": "Zechariah 2:14-4:7",
  "shlach": "Joshua 2:1-24",
  "korach": "I Samuel 11:14-12:22",
  "chukat": "Judges 11:1-33",
  "balak": "Micah 5:6-6:8",
  "chukat balak": "Micah 5:6-6:8",
  "pinchas": "I Kings 18:46-19:21",
  "matot": "Jeremiah 1:1-2:3",
  "masei": "Jeremiah 2:4-28; 3:4",
  "matot masei": "Jeremiah 2:4-28; 3:4",
  "devarim": "Isaiah 1:1-27",
  "vaetchanan": "Isaiah 40:1-26",
  "eikev": "Isaiah 49:14-51:3",
  "reeh": "Isaiah 54:11-55:5",
  "shoftim": "Isaiah 51:12-52:12",
  "ki teitzei": "Isaiah 54:1-10",
  "ki tavo": "Isaiah 60:1-22",
  "nitzavim": "Isaiah 61:10-63:9",
  "vayeilech": "Isaiah 55:6-56:8",
  "nitzavim vayeilech": "Isaiah 61:10-63:9",
  "haazinu": "II Samuel 22:1-51",
  "vezot haberakhah": "Joshua 1:1-18",
};

// Register lookup by Sefaria index title prefix. Anything not matched is
// reported as "unclassified" for the rabbi to place.
const REGISTERS = [
  [/^(Rashi|Radak|Ralbag|Malbim|Metzudat David|Metzudat Zion|Abarbanel|Targum Jonathan|Targum|Ibn Ezra|Ramban|Sforno|Chizkuni|Marot HaTzoveot|Ahavat Yehonatan|Tze'enah Ure'enah|Maor VaShemesh|Tiferet Shlomo|Kli Yakar|Alshich|Or HaChaim|Siftei Chakhamim|Gur Aryeh|Rambam|Sefer HaShorashim|Machberet Menachem)/, "traditional"],
  [/^(Steinsaltz|The Early Prophets, by Everett Fox|Tribal Lands|Mishnat Eretz Yisrael|Da'at Mikra|Hirsch|Sacks|Netziv|Depths of Yonah|Peninei Halakhah)/, "modern"],
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

function nextShabbat(from = new Date()) {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const add = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "crc-haftarah-sheet/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function slugify(s) {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeParashah(name) {
  return name.toLowerCase().replace(/['’\-]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, " ");
}

// ---- Sefaria HTML cleanup ---------------------------------------------------

const BREAK_TRAIL_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*$/;
const BREAK_MID_RE = /(?:&nbsp;|\s)*<span class="mam-spi-(samekh|pe)">\{[ספ]\}<\/span>(?:&nbsp;|\s|<br\s*\/?>)*/g;

function cleanHebrew(html) {
  let brk = null;
  let out = html.replace(/(?:&nbsp;|\s)+$/g, "").replace(/(<br\s*\/?>\s*)+$/g, "").trim();
  // trailing marker = Masoretic paragraph break after this verse
  out = out.replace(BREAK_TRAIL_RE, (_, kind) => {
    brk = kind === "pe" ? "petuchah" : "setumah";
    return "";
  });
  // mid-verse marker (pisqa be'emtza pasuq) = visible gap inside the line
  out = out.replace(BREAK_MID_RE, ' <span class="pisqa"></span> ');
  out = out.replace(/<br\s*\/?>/g, " ").replace(/\s{2,}/g, " ").trim();
  return { he: out, break: brk };
}

const FOOTNOTE_RE = /<sup class="footnote-marker">(.*?)<\/sup><i class="footnote">(.*?)<\/i>/g;

function cleanEnglish(html) {
  const notes = [];
  let out = html.replace(FOOTNOTE_RE, (_, marker, body) => {
    let lemma = null;
    const m = body.match(/^<b>(.*?)\s*<\/b>\s*(.*)$/s);
    let text = body;
    if (m) { lemma = m[1].trim(); text = m[2].trim(); }
    notes.push({ marker: marker.trim(), lemma, text });
    return `<sup class="fn">${marker.trim()}</sup>`;
  });
  out = out.replace(/\s+/g, " ").trim();
  return { en: out, notes };
}

function flattenVerses(textArr, sections, toSections) {
  // Sefaria returns a flat array for one chapter, nested arrays across chapters.
  const startCh = Number(sections[0]), startV = Number(sections[1] ?? 1);
  const out = [];
  if (textArr.length && Array.isArray(textArr[0])) {
    textArr.forEach((chapter, ci) => {
      const ch = startCh + ci;
      const v0 = ci === 0 ? startV : 1;
      chapter.forEach((t, vi) => out.push({ chapter: ch, verse: v0 + vi, text: t }));
    });
  } else {
    textArr.forEach((t, vi) => out.push({ chapter: startCh, verse: startV + vi, text: t }));
  }
  return out;
}

function firstWords(he, n = 3) {
  const plain = he.replace(/<[^>]+>/g, "").replace(/&nbsp;|&thinsp;/g, " ").replace(/\{[ספ]\}/g, "").trim();
  return plain.split(/\s+/).filter(w => !/^[׀]$/.test(w)).slice(0, n).join(" ");
}

function stripMarks(he) {
  // Remove nikud and te'amim for display titles.
  return he.normalize("NFD").replace(/[֑-ֽֿ-ׇ]/g, "").normalize("NFC");
}

// ---- main -------------------------------------------------------------------

// One more than the highest number already issued this Hebrew year in outRoot.
async function nextNumber(outRoot, year) {
  let max = 0;
  let dirs = [];
  try { dirs = await readdir(outRoot); } catch { return 1; }
  for (const d of dirs) {
    try {
      const s = JSON.parse(await readFile(join(outRoot, d, "sheet.json"), "utf8"));
      if (s.series?.year === year && typeof s.series.number === "number") max = Math.max(max, s.series.number);
    } catch {}
  }
  return max + 1;
}

// The following Shabbat's reading, proposed; Daniel confirms it before it prints.
async function nextWeekFor(date) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7);
  const next = d.toISOString().slice(0, 10);
  try {
    const ley = await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${next}&end=${next}`);
    const it = (ley.items || [])[0];
    if (!it || !it.haftara) return null;
    return {
      shabbat: it.name?.en || "",
      special: it.reason?.haftara || null,
      ref: it.haftara,
      civilDisplay: new Date(next + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      status: "proposed",
    };
  } catch { return null; }
}

async function main() {
  const date = arg("date", nextShabbat());
  const outRoot = arg("out", "weeks");
  const force = arg("force", false) === true;
  const refOverride = arg("ref", null);

  console.log(`Shabbat ${date}`);

  // 1. Schedule: Hebcal leyning gives parashah, haftarah and the reason when special.
  const ley = await getJSON(`https://www.hebcal.com/leyning?cfg=json&start=${date}&end=${date}`);
  const item = (ley.items || [])[0];
  if (!item) throw new Error(`Hebcal has no reading for ${date}; is it a Shabbat?`);
  const conv = await getJSON(`https://www.hebcal.com/converter?cfg=json&gy=${date.slice(0, 4)}&gm=${+date.slice(5, 7)}&gd=${+date.slice(8, 10)}&g2h=1`);

  const haftRef = refOverride || item.haftara;
  if (!haftRef) throw new Error(`No haftarah listed for ${date} (${item.name?.en}).`);
  const special = item.reason?.haftara || null;
  const parashahKey = normalizeParashah(item.name?.en || "");
  const defaultHaftarah = DEFAULT_HAFTAROT[parashahKey] || null;

  console.log(`Parashat ${item.name?.en}; haftarah ${haftRef}${special ? ` (${special})` : ""}`);

  // 2. Text in both versions.
  const refPath = encodeURIComponent(haftRef.replace(/\s+/g, " "));
  const textUrl = `https://www.sefaria.org/api/v3/texts/${refPath}?version=hebrew|${encodeURIComponent(HEBREW_VERSION)}&version=english|${encodeURIComponent(ENGLISH_VERSION)}&return_format=default`;
  const tx = await getJSON(textUrl);
  const heV = tx.versions.find(v => v.languageFamilyName === "hebrew");
  const enV = tx.versions.find(v => v.languageFamilyName === "english");
  if (!heV || !enV) throw new Error("Sefaria did not return both versions for " + haftRef);

  const heVerses = flattenVerses(heV.text, tx.sections, tx.toSections);
  const enVerses = flattenVerses(enV.text, tx.sections, tx.toSections);
  const book = tx.book || tx.indexTitle || haftRef.replace(/\s+\d.*$/, "");

  const verses = heVerses.map((hv, i) => {
    const { he, break: brk } = cleanHebrew(hv.text || "");
    const { en, notes } = cleanEnglish((enVerses[i] && enVerses[i].text) || "");
    return { ref: `${book} ${hv.chapter}:${hv.verse}`, chapter: hv.chapter, verse: hv.verse, he, en, notes, break: brk };
  });

  // 3. Linked commentary, grouped by source.
  const links = await getJSON(`https://www.sefaria.org/api/links/${refPath}?with_text=0`);
  const groups = new Map();
  for (const l of links) {
    const title = l.index_title || l.collectiveTitle?.en || l.ref.replace(/\s+\d.*$/, "");
    const g = groups.get(title) || { source: title, category: l.category, type: l.type, count: 0, verses: new Set(), hasEnglish: false, refs: [] };
    g.count++;
    g.hasEnglish = g.hasEnglish || !!l.sourceHasEn;
    for (const v of (l.anchorRefExpanded || [l.anchorRef])) g.verses.add(v);
    if (g.refs.length < 60) g.refs.push(l.ref);
    groups.set(title, g);
  }
  const candidates = [...groups.values()].map(g => {
    const register = g.category === "Reference" ? "reference" : (REGISTERS.find(([re]) => re.test(g.source)) || [null, g.category === "Commentary" || g.category === "Targum" || g.category === "Talmud" || g.category === "Midrash" || g.category === "Chasidut" || g.category === "Kabbalah" ? "traditional" : "unclassified"])[1];
    return { ...g, register, verses: [...g.verses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }).sort((a, b) => b.count - a.count);

  // 4. Assemble the sheet skeleton.
  const slug = `${date}-${slugify(item.name?.en || "shabbat")}${special ? "-" + slugify(special.replace(/^Shabbat\s+/i, "")) : ""}`;
  const dir = join(outRoot, slug);
  await mkdir(dir, { recursive: true });

  const civilDisplay = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const first = verses[0];
  const sheet = {
    schema: 2,
    slug,
    status: "draft",
    shabbat: {
      civil: date,
      civilDisplay,
      hebrew: conv.hebrew,
      hebrewEn: `${conv.hd} ${conv.hm} ${conv.hy}`,
      parashah: { en: item.name?.en, he: item.name?.he, ref: item.summary },
      special,
    },
    series: { name: "Torah from Scratch", year: String(conv.hy), number: await nextNumber(outRoot, String(conv.hy)) },
    haftarah: {
      ref: haftRef,
      heRef: tx.heRef || null,
      book,
      incipit: { he: firstWords(first.he, 3), en: "" },
      title: { he: stripMarks(firstWords(first.he, 3)), en: special ? special.replace(/^Shabbat\s+/i, "") : `Haftarat ${item.name?.en}` },
      defaultHaftarah: special && defaultHaftarah !== haftRef ? defaultHaftarah : null,
      versions: { he: HEBREW_VERSION, en: ENGLISH_VERSION },
      fetched: new Date().toISOString(),
    },
    verses,
    glosses: [],
    commentary: [],
    openingNote: { calendar: "", setting: [], status: "proposed" },
    glossary: [],
    nextWeek: await nextWeekFor(date),
    credits: {
      issuedBy: "Central Reform Congregation",
      editor: "Rabbi Daniel Bogard",
      signoff: "I chose and approved every entry on this sheet; summaries marked as such were drafted with Claude and read before printing. Tell me what I got wrong.",
    },
  };

  const sheetPath = join(dir, "sheet.json");
  let exists = false;
  try { await access(sheetPath); exists = true; } catch {}
  if (exists && !force) {
    console.log(`Kept existing ${sheetPath} (use --force to replace). Refreshed candidates only.`);
  } else {
    await writeFile(sheetPath, JSON.stringify(sheet, null, 2), "utf8");
    console.log(`Wrote ${sheetPath} (${verses.length} verses)`);
  }
  await writeFile(join(dir, "candidates.json"), JSON.stringify({ ref: haftRef, fetched: sheet.haftarah.fetched, sources: candidates }, null, 2), "utf8");
  console.log(`Wrote ${join(dir, "candidates.json")} (${candidates.length} sources, ${links.length} links)`);
  console.log(`\nNext: review candidates, add approved entries to sheet.json, then\n  node scripts/build.mjs ${dir} --draft`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
