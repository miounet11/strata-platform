import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

/**
 * Repair fact tables that were written as one glued line.
 *
 * Observed shapes (all rejected by verify.mjs as "no fact table"):
 *   | a | b |            | a | b |
 *   |---|---|<br>| 1 | 2 |    ->  |---|---|
 *                                 | 1 | 2 |
 *   | a | b |            | a | b |
 *   | 1 | 2 |            ->  |---|---|      (delimiter row missing entirely)
 *   | 3 | 4 |
 *
 * Only inserts a delimiter row. It never rewrites data, so a wrong repair is visible in the diff
 * rather than silently changing what the page says.
 */
const files = process.argv.slice(2);
let fixed = 0;

for (const f of files) {
  const p = `scripts/content/out/${f}.json`;
  copyFileSync(p, `/tmp/table-bak-${f.replace(/\//g, "_")}.json`);
  const article = JSON.parse(readFileSync(p, "utf8"));
  const before = article.article.body;
  let body = before;

  // The glued cell is written as `|...|---|<br>| 1 | 2 |`. Keep the delimiter row intact and move
  // the payload after `<br>` onto its own line, restoring the pipe that `<br>` replaced.
  // `<br>` stands in for the newline; the payload that follows already starts with its own `|`,
  // so the replacement must not add another one.
  body = body.replace(/^([ \t]*\|[\s|:-]*-{3,}[\s|:-]*\|)[ \t]*<br>[ \t]*/m, "$1\n");

  // Work per table block, not per line. A line-by-line pass treats every data row as a potential
  // header and inserts a delimiter between data rows too, which is worse than the original damage.
  const lines = body.split("\n");
  const isDelimiter = (l) => /^\s*\|?[\s|:-]*-{3,}[\s|:-]*\|?\s*$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    let end = i;
    while (end < lines.length && lines[end].trim().startsWith("|")) end++;
    const body2 = lines.slice(i, end);
    if (body2.length >= 2 && !isDelimiter(body2[1])) {
      const cols = body2[0].split("|").filter((c) => c.trim() !== "").length;
      if (cols >= 2) {
        lines.splice(i + 1, 0, `|${Array(cols).fill("---").join("|")}|`);
        end++;
      }
    }
    i = end - 1;
  }
  body = lines.join("\n");

  if (body !== before) {
    article.article.body = body;
    writeFileSync(p, `${JSON.stringify(article, null, 2)}\n`);
    fixed++;
    console.log(`fixed ${f}`);
  } else {
    console.log(`unchanged ${f} (no repair matched)`);
  }
}

console.log(`fixed=${fixed}`);
