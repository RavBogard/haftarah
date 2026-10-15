/**
 * week-files.mjs — the names of the files in a week folder, per reading: fetch writes the candidates
 * and texts, digest and deliver read them, build and check write and read the HTML, build writes the
 * PDFs that deliver and publish send. The haftarah keeps the names it has always had.
 */
import { PDF_FILES } from "../site/app/contract.js";

export { PDF_FILES };
export const READING_FILES = {
  haftarah: { candidates: "candidates.json", texts: "texts.json" },
  torah: { candidates: "candidates-torah.json", texts: "texts-torah.json" },
};
export const HTML_FILES = { haftarah: "sheet.html", torah: "sheet-torah.html" };
export const TROPE_HTML = "sheet-trope.html";
export const PRIOR_FILE = "prior.json";
