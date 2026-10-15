// The library's one table: the 54 parashot in Torah order (key, English, Hebrew, book), the seven
// that are sometimes read together, the books, and the special Shabbatot and festivals the library
// groups by. publish.mjs files each week under it (parashahKeys, tags); the landing's views and the
// vercel.json alias allow-list are made from it, and a test holds vercel.json to it. Keys are lib.js's
// parashahKey of Hebcal's English names; keyOf is the same function, for pages that load no lib.js.
export const TORAH_BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"];

export const PARASHOT = [
  ["bereshit", "Bereshit", "בראשית", "Genesis"], ["noach", "Noach", "נח", "Genesis"], ["lech-lecha", "Lech-Lecha", "לך לך", "Genesis"],
  ["vayera", "Vayera", "וירא", "Genesis"], ["chayei-sara", "Chayei Sara", "חיי שרה", "Genesis"], ["toldot", "Toldot", "תולדות", "Genesis"],
  ["vayetzei", "Vayetzei", "ויצא", "Genesis"], ["vayishlach", "Vayishlach", "וישלח", "Genesis"], ["vayeshev", "Vayeshev", "וישב", "Genesis"],
  ["miketz", "Miketz", "מקץ", "Genesis"], ["vayigash", "Vayigash", "ויגש", "Genesis"], ["vayechi", "Vayechi", "ויחי", "Genesis"],
  ["shemot", "Shemot", "שמות", "Exodus"], ["vaera", "Vaera", "וארא", "Exodus"], ["bo", "Bo", "בא", "Exodus"],
  ["beshalach", "Beshalach", "בשלח", "Exodus"], ["yitro", "Yitro", "יתרו", "Exodus"], ["mishpatim", "Mishpatim", "משפטים", "Exodus"],
  ["terumah", "Terumah", "תרומה", "Exodus"], ["tetzaveh", "Tetzaveh", "תצוה", "Exodus"], ["ki-tisa", "Ki Tisa", "כי תשא", "Exodus"],
  ["vayakhel", "Vayakhel", "ויקהל", "Exodus"], ["pekudei", "Pekudei", "פקודי", "Exodus"],
  ["vayikra", "Vayikra", "ויקרא", "Leviticus"], ["tzav", "Tzav", "צו", "Leviticus"], ["shmini", "Shmini", "שמיני", "Leviticus"],
  ["tazria", "Tazria", "תזריע", "Leviticus"], ["metzora", "Metzora", "מצרע", "Leviticus"], ["achrei-mot", "Achrei Mot", "אחרי מות", "Leviticus"],
  ["kedoshim", "Kedoshim", "קדשים", "Leviticus"], ["emor", "Emor", "אמר", "Leviticus"], ["behar", "Behar", "בהר", "Leviticus"],
  ["bechukotai", "Bechukotai", "בחקתי", "Leviticus"],
  ["bamidbar", "Bamidbar", "במדבר", "Numbers"], ["nasso", "Nasso", "נשא", "Numbers"], ["behaalotcha", "Beha'alotcha", "בהעלתך", "Numbers"],
  ["shlach", "Sh'lach", "שלח", "Numbers"], ["korach", "Korach", "קרח", "Numbers"], ["chukat", "Chukat", "חקת", "Numbers"],
  ["balak", "Balak", "בלק", "Numbers"], ["pinchas", "Pinchas", "פינחס", "Numbers"], ["matot", "Matot", "מטות", "Numbers"],
  ["masei", "Masei", "מסעי", "Numbers"],
  ["devarim", "Devarim", "דברים", "Deuteronomy"], ["vaetchanan", "Vaetchanan", "ואתחנן", "Deuteronomy"], ["eikev", "Eikev", "עקב", "Deuteronomy"],
  ["reeh", "Re'eh", "ראה", "Deuteronomy"], ["shoftim", "Shoftim", "שפטים", "Deuteronomy"], ["ki-teitzei", "Ki Teitzei", "כי תצא", "Deuteronomy"],
  ["ki-tavo", "Ki Tavo", "כי תבוא", "Deuteronomy"], ["nitzavim", "Nitzavim", "נצבים", "Deuteronomy"], ["vayeilech", "Vayeilech", "וילך", "Deuteronomy"],
  ["haazinu", "Ha'azinu", "האזינו", "Deuteronomy"], ["vezot-haberakhah", "Vezot Haberakhah", "וזאת הברכה", "Deuteronomy"],
].map(([key, en, he, book], i) => ({ key, en, he, book, order: i + 1 }));

export const COMBINED = {
  "vayakhel-pekudei": ["vayakhel", "pekudei"], "tazria-metzora": ["tazria", "metzora"], "achrei-mot-kedoshim": ["achrei-mot", "kedoshim"],
  "behar-bechukotai": ["behar", "bechukotai"], "chukat-balak": ["chukat", "balak"], "matot-masei": ["matot", "masei"], "nitzavim-vayeilech": ["nitzavim", "vayeilech"],
};

export const PROPHET_BOOKS = ["Joshua", "Judges", "I Samuel", "II Samuel", "I Kings", "II Kings", "Isaiah", "Jeremiah", "Ezekiel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"];

// Special Shabbatot and festivals, matched against Hebcal's haftarah reason ("Shabbat Shuva (with
// Ha'azinu)", "Chanukah Day 1 (on Shabbat)") or a festival week's own name ("Pesach Shabbat Chol ha-Moed").
export const SPECIALS = [
  { tag: "shuva", en: "Shabbat Shuvah", re: /\bShuva/i },
  { tag: "chazon", en: "Shabbat Chazon", re: /\bChazon\b/i },
  { tag: "nachamu", en: "Shabbat Nachamu", re: /\bNachamu\b/i },
  { tag: "shekalim", en: "Shabbat Shekalim", re: /\bShekalim\b/i },
  { tag: "zachor", en: "Shabbat Zachor", re: /\bZachor\b/i },
  { tag: "parah", en: "Shabbat Parah", re: /\bParah\b/i },
  { tag: "hachodesh", en: "Shabbat HaChodesh", re: /\bHaChodesh\b/i },
  { tag: "hagadol", en: "Shabbat HaGadol", re: /\bHaGadol\b/i },
  { tag: "chanukah", en: "Shabbat Chanukah", re: /\bChanukah\b/i },
  { tag: "rosh-chodesh", en: "Shabbat Rosh Chodesh", re: /\bRosh Chodesh\b/i },
  { tag: "machar-chodesh", en: "Shabbat Machar Chodesh", re: /\bMachar Chodesh\b/i },
  { tag: "rosh-hashana", en: "Rosh Hashanah", re: /\bRosh Hashana/i },
  { tag: "yom-kippur", en: "Yom Kippur", re: /\bYom Kippur\b/i },
  { tag: "sukkot", en: "Sukkot", re: /\bSukkot\b/i },
  { tag: "shmini-atzeret", en: "Shemini Atzeret", re: /\bShmini Atzeret\b/i },
  { tag: "pesach", en: "Pesach", re: /\bPesach\b/i },
  { tag: "shavuot", en: "Shavuot", re: /\bShavuot\b/i },
];

/** lib.js's parashahKey: "Ha'azinu" → "haazinu", "I Samuel" → "i-samuel". */
export const keyOf = name => String(name == null ? "" : name).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const isParashahKey = key => PARASHOT.some(p => p.key === key) || Object.prototype.hasOwnProperty.call(COMBINED, key);

/** The parashot a week's name covers: both halves of a combined week, one, or a festival's own key. */
export function parashahKeysOf(name) {
  const k = keyOf(name);
  if (!k) return [];
  return COMBINED[k] ? COMBINED[k].slice() : [k];
}

export function parashahName(key) {
  const p = PARASHOT.find(x => x.key === key);
  if (p) return p.en;
  return COMBINED[key] ? COMBINED[key].map(parashahName).join("-") : key;
}

/** An index row's parashah keys; rows written before parashahKeys existed fall back to parashahKey, then the name. */
export function weekKeys(row) {
  if (row && Array.isArray(row.parashahKeys) && row.parashahKeys.length) return row.parashahKeys;
  if (row && row.parashahKey) return parashahKeysOf(row.parashahKey);
  return parashahKeysOf((row && row.parashah) || "");
}

/** The special Shabbatot and festivals a week belongs to, in SPECIALS order. */
export function weekTags({ parashah = "", special = null } = {}) {
  const festival = isParashahKey(keyOf(parashah)) ? "" : parashah;
  const text = `${special || ""} ${festival || ""}`;
  return SPECIALS.filter(s => s.re.test(text)).map(s => s.tag);
}

const alt = list => list.join("|");
const PARASHAH_ALIASES = () => [...PARASHOT.map(p => p.key), ...Object.keys(COMBINED)];

/**
 * vercel.json's rewrites for the library's short addresses, an explicit allow-list (any other path
 * stays the site's 404). tests/contract.test.mjs holds vercel.json to this. The week's own address,
 * /<date-slug>, stays the permanent page; these only lead to it.
 */
export function aliasRewrites() {
  const keys = alt(PARASHAH_ALIASES());
  return [
    { source: `/:year(\\d{4})/:parashah(${keys})`, destination: "/library.html" },
    { source: `/:parashah(${keys})`, destination: "/library.html" },
    { source: `/torah/:book(${alt(TORAH_BOOKS.map(keyOf))})`, destination: "/library.html" },
    { source: `/prophets/:book(${alt(PROPHET_BOOKS.map(keyOf))})`, destination: "/library.html" },
    { source: `/special/:tag(${alt(SPECIALS.map(s => s.tag))})`, destination: "/library.html" },
  ];
}

/** The same allow-list as a test of one path (web-check's local server routes with it). */
export function isAliasPath(pathname) {
  const re = new RegExp(`^/(?:(?:\\d{4}/)?(?:${alt(PARASHAH_ALIASES())})|torah/(?:${alt(TORAH_BOOKS.map(keyOf))})|prophets/(?:${alt(PROPHET_BOOKS.map(keyOf))})|special/(?:${alt(SPECIALS.map(s => s.tag))}))$`);
  return re.test(String(pathname == null ? "" : pathname));
}
