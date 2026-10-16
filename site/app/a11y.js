// Keyboard and focus helpers. The pure parts are tested in node; the DOM parts are exercised by
// web-check's ?check=1 run.

/** Roving focus among a verse's words. Hebrew runs right to left, so ArrowLeft reads on. */
export function rovingTarget(index, count, key) {
  if (!count) return null;
  switch (key) {
    case "ArrowLeft": return Math.min(count - 1, index + 1);
    case "ArrowRight": return Math.max(0, index - 1);
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Tab inside a dialog: the index to focus instead, wrapping at either end; null leaves it to the browser. */
export function trapTarget(index, count, shift) {
  if (!count) return null;
  if (shift && index <= 0) return count - 1;
  if (!shift && index >= count - 1) return 0;
  return null;
}

/** One tab stop per container: the first item (or the one last focused) is in the tab order; arrows move among the rest. */
export function initRoving(container, selector) {
  const items = () => [...container.querySelectorAll(selector)];
  items().forEach((w, i) => { w.tabIndex = i === 0 ? 0 : -1; });
  container.addEventListener("keydown", e => {
    const list = items(), i = list.indexOf(e.target);
    if (i < 0) return;
    const j = rovingTarget(i, list.length, e.key);
    if (j == null) return;
    e.preventDefault();
    if (j === i) return;
    list[i].tabIndex = -1; list[j].tabIndex = 0; list[j].focus();
  });
  container.addEventListener("focusin", e => {
    const list = items();
    if (list.includes(e.target)) list.forEach(w => { w.tabIndex = w === e.target ? 0 : -1; });
  });
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const focusables = root => [...root.querySelectorAll(FOCUSABLE)].filter(n => !n.closest("[hidden]"));

/** Keep Tab inside `host` while isOpen() is true. */
export function trapFocus(host, isOpen) {
  host.addEventListener("keydown", e => {
    if (e.key !== "Tab" || !isOpen()) return;
    const list = focusables(host), j = trapTarget(list.indexOf(document.activeElement), list.length, e.shiftKey);
    if (j != null) { e.preventDefault(); list[j].focus(); }
  });
}

/**
 * Hide `host`, a strip or card that puts itself away. If focus was inside it, focus moves to
 * `target()` when that gives an element, else to the Aa button (on every page), so it is not dropped
 * to the start of the page; with neither on the page nothing moves. Returns the element focused, or null.
 */
export function hideKeepingFocus(host, { target = null, doc = globalThis.document } = {}) {
  const active = doc ? doc.activeElement : null;
  const had = !!active && typeof host.contains === "function" && host.contains(active);
  host.hidden = true;
  if (!had) return null;
  const to = (target && target()) || (typeof doc.getElementById === "function" ? doc.getElementById("aaBtn") : null);
  if (!to || typeof to.focus !== "function") return null;
  to.focus({ preventScroll: true });
  return to;
}
