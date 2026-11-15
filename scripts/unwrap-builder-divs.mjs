// Strip leftover Elementor/Fusion-builder wrapper <div>s from recovered
// posts WITHOUT deleting their content -- unwraps each matching div (removes
// just the opening and its balanced closing tag), repeatedly, until none
// remain. Leaves real content (p, img, h2, a, ul/li, etc.) untouched.
import fs from 'node:fs';
import path from 'node:path';

const postsDir = 'src/posts';
const files = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  : fs.readdirSync(postsDir).filter(f => f.endsWith('.md')).map(f => path.join(postsDir, f));

// Matches an opening <div ...class="...fusion-xxx... or elementor-xxx...">
const WRAPPER_OPEN_RE = /<div\b[^>]*\bclass="[^"]*\b(fusion-[a-z0-9_-]+|elementor[a-z0-9_-]*)\b[^"]*"[^>]*>/i;

function findMatchingClose(content, openTagStart, openTagEnd) {
  let depth = 1;
  const divRe = /<div\b|<\/div>/gi;
  divRe.lastIndex = openTagEnd;
  let m;
  while ((m = divRe.exec(content))) {
    if (/^<\/div>$/i.test(m[0])) {
      depth--;
      if (depth === 0) return { closeStart: m.index, closeEnd: m.index + m[0].length };
    } else {
      depth++;
    }
  }
  return null;
}

function unwrapOnce(content) {
  const m = WRAPPER_OPEN_RE.exec(content);
  if (!m) return null;
  const openStart = m.index;
  const openEnd = m.index + m[0].length;
  const close = findMatchingClose(content, openStart, openEnd);
  if (!close) return { failed: true };
  // Remove the opening tag and the matching closing tag, keep everything between.
  const inner = content.slice(openEnd, close.closeStart);
  return {
    content: content.slice(0, openStart) + inner + content.slice(close.closeEnd),
  };
}

let fixedFiles = 0;
let totalUnwraps = 0;
const failed = [];
const beforeAfterLen = [];

for (const p of files) {
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  if (!WRAPPER_OPEN_RE.test(content)) continue;
  const originalLen = content.length;
  let unwraps = 0;
  let guard = 0;
  while (guard < 500) {
    const result = unwrapOnce(content);
    if (!result) break;
    if (result.failed) { failed.push(p); break; }
    content = result.content;
    unwraps++;
    guard++;
  }
  if (unwraps > 0) {
    fs.writeFileSync(p, content, 'utf8');
    fixedFiles++;
    totalUnwraps += unwraps;
    beforeAfterLen.push([p, originalLen, content.length]);
  }
}

console.log(`Unwrapped ${totalUnwraps} builder div(s) across ${fixedFiles} file(s).`);
if (failed.length) {
  console.log(`\n${failed.length} file(s) hit UNBALANCED markup and were partially/not processed:`);
  failed.forEach(f => console.log(' -', f));
}
// Flag any file where content shrank by more than expected (pure wrapper tags
// are short; a big drop suggests something more than tags got removed).
const suspicious = beforeAfterLen.filter(([, before, after]) => (before - after) > before * 0.5);
if (suspicious.length) {
  console.log(`\n${suspicious.length} file(s) shrank by >50% -- worth a manual look:`);
  suspicious.forEach(([f, b, a]) => console.log(` - ${f} (${b} -> ${a} chars)`));
}
