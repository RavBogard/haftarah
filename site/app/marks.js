// A reader's own marks on a sheet (spec 5.2): kept on this device under haftarah:v1:marks:<slug>,
// never sent anywhere; shared only as a link whose fragment lists them, or as text. The page owns
// the DOM; this module owns the list, the storage and the strings.
import { load, store } from "./storage.js";
import { formatMarks } from "./contract.js";

export const MARKS_KEY = slug => `marks:${slug}`;
export const MARK = "Mark this verse", UNMARK = "Unmark", MY_MARKS = "My marks";
export const MARKS_EMPTY = "No marks yet. Press and hold a verse number, or use Mark this verse in its header. Marks stay on this device.";
export const MARKS_UNSAVED = "This mark could not be saved on this device.";
export const COPY_LINK = "Copy link to my marks", COPY_TEXT = "Copy my marks as text", REMOVE = "Remove";
export const ADD_SHARED = "Add to my marks", DISMISS = "Dismiss";
export const sharedText = n => `${n} marked ${n === 1 ? "verse" : "verses"} shared with you.`;

const ANCHOR = /^[a-z][a-z0-9]*-\d{1,3}-\d{1,3}$/;

export function readMarks(slug, storage) {
  try {
    const raw = load(MARKS_KEY(slug), storage);
    const o = raw ? JSON.parse(raw) : null;
    return o && o.v === 1 && Array.isArray(o.marks) ? o.marks.filter(m => typeof m === "string" && ANCHOR.test(m)) : [];
  } catch { return []; }
}

/** True when the list is on the device; false when storage refused it (private browsing, blocked site data). */
export function writeMarks(slug, anchors, storage) {
  return store(MARKS_KEY(slug), anchors.length ? JSON.stringify({ v: 1, marks: anchors }) : null, storage);
}

export const toggleMark = (list, anchor) => (list.includes(anchor) ? list.filter(x => x !== anchor) : [...list, anchor]);
/** The marks in page order, those on the page only. */
export const orderMarks = (list, rowIds) => rowIds.filter(id => list.includes(id));
export const marksLink = (origin, slug, anchors) => `${origin}/${slug}#${formatMarks(anchors)}`;
export function marksText(items, { translation, link }) {
  return [...items.map(i => `${i.ref}  ${i.en}`), `— ${translation}\n${link}`].join("\n\n");
}
