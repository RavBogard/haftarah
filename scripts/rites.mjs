/**
 * rites.mjs — each rite's default haftarah for every parashah, keyed by lib.js's parashahKey
 * ("lech-lecha", "haazinu", "vayakhel-pekudei"). fetch.mjs uses it only to say what the reading would
 * have been when a special Shabbat replaces it. A congregation's customs name its rite.
 */
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../template/lib.js");

export const HAFTARAH_RITES = {
  ashkenazi: {
    "bereshit": "Isaiah 42:5-43:10", "noach": "Isaiah 54:1-55:5", "lech-lecha": "Isaiah 40:27-41:16", "vayera": "II Kings 4:1-37",
    "chayei-sara": "I Kings 1:1-31", "toldot": "Malachi 1:1-2:7", "vayetzei": "Hosea 12:13-14:10", "vayishlach": "Obadiah 1:1-21",
    "vayeshev": "Amos 2:6-3:8", "miketz": "I Kings 3:15-4:1", "vayigash": "Ezekiel 37:15-28", "vayechi": "I Kings 2:1-12",
    "shemot": "Isaiah 27:6-28:13; 29:22-23", "vaera": "Ezekiel 28:25-29:21", "bo": "Jeremiah 46:13-28", "beshalach": "Judges 4:4-5:31",
    "yitro": "Isaiah 6:1-7:6; 9:5-6", "mishpatim": "Jeremiah 34:8-22; 33:25-26", "terumah": "I Kings 5:26-6:13", "tetzaveh": "Ezekiel 43:10-27",
    "ki-tisa": "I Kings 18:1-39", "vayakhel": "I Kings 7:40-50", "pekudei": "I Kings 7:51-8:21", "vayakhel-pekudei": "I Kings 7:51-8:21",
    "vayikra": "Isaiah 43:21-44:23", "tzav": "Jeremiah 7:21-8:3; 9:22-23", "shmini": "II Samuel 6:1-7:17", "tazria": "II Kings 4:42-5:19",
    "metzora": "II Kings 7:3-20", "tazria-metzora": "II Kings 7:3-20", "achrei-mot": "Ezekiel 22:1-19", "kedoshim": "Amos 9:7-15",
    "achrei-mot-kedoshim": "Amos 9:7-15", "emor": "Ezekiel 44:15-31", "behar": "Jeremiah 32:6-27", "bechukotai": "Jeremiah 16:19-17:14",
    "behar-bechukotai": "Jeremiah 16:19-17:14", "bamidbar": "Hosea 2:1-22", "nasso": "Judges 13:2-25", "behaalotcha": "Zechariah 2:14-4:7",
    "shlach": "Joshua 2:1-24", "korach": "I Samuel 11:14-12:22", "chukat": "Judges 11:1-33", "balak": "Micah 5:6-6:8",
    "chukat-balak": "Micah 5:6-6:8", "pinchas": "I Kings 18:46-19:21", "matot": "Jeremiah 1:1-2:3", "masei": "Jeremiah 2:4-28; 3:4",
    "matot-masei": "Jeremiah 2:4-28; 3:4", "devarim": "Isaiah 1:1-27", "vaetchanan": "Isaiah 40:1-26", "eikev": "Isaiah 49:14-51:3",
    "reeh": "Isaiah 54:11-55:5", "shoftim": "Isaiah 51:12-52:12", "ki-teitzei": "Isaiah 54:1-10", "ki-tavo": "Isaiah 60:1-22",
    "nitzavim": "Isaiah 61:10-63:9", "vayeilech": "Isaiah 55:6-56:8", "nitzavim-vayeilech": "Isaiah 61:10-63:9",
    "haazinu": "II Samuel 22:1-51", "vezot-haberakhah": "Joshua 1:1-18",
  },
};

/** The rite's haftarah for a parashah named as Hebcal names it, or null (a festival, an unknown name). */
export function defaultHaftarahFor(parashah, rite = "ashkenazi") {
  const table = HAFTARAH_RITES[rite];
  if (!table) throw new Error(`no haftarah table for rite "${rite}"`);
  return table[L.parashahKey(parashah)] || null;
}
