// The landing's doors as markup: pure functions of library.js's views, escaped with the caller's esc.
// No style attributes (the CSP forbids them); every link is a real address the library resolves.
const sheets = n => `${n} sheet${n === 1 ? "" : "s"}`;

export function cellHtml(c, esc) {
  const names = `<span class="en">${esc(c.en)}</span><span class="he" lang="he" dir="rtl">${esc(c.he)}</span>`;
  if (!c.latest) return `<li class="cell empty">${names}</li>`;
  const said = `${sheets(c.years.length)}: ${c.years.join(", ")}${c.current ? "; this week" : ""}`;
  return `<li class="cell${c.current ? " current" : ""}"><a href="/${esc(c.key)}">${names}<span class="dots" aria-hidden="true">${c.years.map(y => `<span class="dot" title="${esc(y)}"></span>`).join("")}</span><span class="sr">${esc(said)}</span></a></li>`;
}

export function gridHtml(grid, esc) {
  return grid.map(b => `<section class="band"><h3>${esc(b.book)}</h3><ol class="cells">${b.cells.map(c => cellHtml(c, esc)).join("")}</ol></section>`).join("");
}

export function bookHtml(books, esc) {
  const torah = books.torah.map(b => `<li><a href="/torah/${esc(b.key)}">${esc(b.book)}</a><span class="n">${sheets(b.weeks.length)}</span></li>`).join("");
  const prophets = books.prophets.map(b => `<li><a href="/prophets/${esc(b.key)}">${esc(b.book)}</a><span class="ch">${b.chapters.join(", ")}</span><span class="n">${sheets(b.weeks.length)}</span></li>`).join("");
  return `<div class="books"><section><h3>Torah</h3><ol>${torah}</ol></section><section><h3>Prophets</h3><ol>${prophets}</ol></section></div>`;
}

export function specialHtml(list, esc) {
  return `<ol class="specials">${list.map(s => `<li><a href="/special/${esc(s.tag)}">${esc(s.en)}</a><span class="n">${sheets(s.weeks.length)}</span></li>`).join("")}</ol>`;
}
