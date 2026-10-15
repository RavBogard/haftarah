/**
 * customs.mjs — a congregation's customs as data (spec 3.2): calendar, haftarah rite, how the Torah
 * selection is made, versions, series, credits, the entry cap. customs/<id>.json; CRC's is crc.json.
 * fetch.mjs and lint.mjs take the object; nothing CRC-specific lives in their code.
 *
 * `toConfirm` lists fields Daniel has not confirmed yet (spec 11.4); fetch prints them every run.
 */
import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HAFTARAH_RITES } from "./rites.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CUSTOMS_DIR = join(ROOT, "customs");
export const TORAH_MODES = ["selection", "triennial", "full"];

/** Every problem that makes a customs record unusable, in field order; [] when it is fine. */
export function validateCustoms(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return ["not a JSON object"];
  const str = v => typeof v === "string" && v.trim().length > 0;
  const p = [];
  if (!str(c.id) || !/^[a-z0-9-]+$/.test(c.id)) p.push("id: lowercase letters, digits and hyphens");
  if (typeof (c.calendar && c.calendar.diaspora) !== "boolean") p.push("calendar.diaspora: true or false");
  if (!Object.keys(HAFTARAH_RITES).includes(c.haftarahRite)) p.push(`haftarahRite: one of ${Object.keys(HAFTARAH_RITES).join(", ")}`);
  if (!TORAH_MODES.includes(c.torah && c.torah.mode)) p.push(`torah.mode: one of ${TORAH_MODES.join(", ")}`);
  if (!str(c.versions && c.versions.he) || !str(c.versions && c.versions.en)) p.push("versions.he and versions.en: Sefaria version titles");
  if (!Number.isInteger(c.entryCap) || c.entryCap < 1) p.push("entryCap: a whole number of entries per reading");
  if (!str(c.series && c.series.name)) p.push("series.name: the series the sheets belong to");
  if (c.credits != null && (typeof c.credits !== "object" || Array.isArray(c.credits))) p.push("credits: an object");
  if (c.toConfirm != null && !Array.isArray(c.toConfirm)) p.push("toConfirm: a list of field names");
  return p;
}

/** customs/<id>.json, or a path to a JSON file; throws naming the file and every problem. */
export async function loadCustoms(idOrPath = "crc") {
  const file = /[\\/]|\.json$/i.test(idOrPath) ? resolve(idOrPath) : join(CUSTOMS_DIR, `${idOrPath}.json`);
  let c;
  try { c = JSON.parse(await readFile(file, "utf8")); }
  catch (err) { throw new Error(`customs: cannot read ${file}: ${err.message}`); }
  const problems = validateCustoms(c);
  if (problems.length) throw new Error(`customs: ${file} is not usable:\n  - ${problems.join("\n  - ")}`);
  return c;
}
