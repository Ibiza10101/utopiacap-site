// Remove the dead WordPress membership-pricing widget (ich_level_wrap /
// ihcBuyNewLevel onclick "Sign Up" buttons pointing at a defunct register
// endpoint) from every post that still has it. Uses balanced-brace div
// matching so it only removes the widget itself, not surrounding content.
import fs from 'node:fs';
import path from 'node:path';

const postsDir = 'src/posts';
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

const OPEN_MARKER = '<div class="ich_level_wrap';

function stripBalancedDiv(content, startIdx) {
  // startIdx points at the "<div" of the opening tag.
  const openTagEnd = content.indexOf('>', startIdx);
  if (openTagEnd === -1) return null;
  let depth = 1;
  let i = openTagEnd + 1;
  const divRe = /<div\b|<\/div>/g;
  divRe.lastIndex = i;
  let m;
  while ((m = divRe.exec(content))) {
    if (m[0] === '<\/div>' || m[0] === '</div>') {
      depth--;
      if (depth === 0) {
        return content.slice(0, startIdx) + content.slice(m.index + m[0].length);
      }
    } else {
      depth++;
    }
  }
  return null; // unbalanced, bail
}

let fixedFiles = 0;
const failed = [];

for (const f of files) {
  const p = path.join(postsDir, f);
  let content = fs.readFileSync(p, 'utf8');
  if (!content.includes(OPEN_MARKER)) continue;

  let changed = false;
  let idx = content.indexOf(OPEN_MARKER);
  let guard = 0;
  while (idx !== -1 && guard < 10) {
    const result = stripBalancedDiv(content, idx);
    if (result === null) { failed.push(f); break; }
    content = result;
    changed = true;
    idx = content.indexOf(OPEN_MARKER);
    guard++;
  }

  if (changed) {
    fs.writeFileSync(p, content, 'utf8');
    fixedFiles++;
  }
}

console.log(`Stripped the dead pricing block from ${fixedFiles} file(s).`);
if (failed.length) {
  console.log(`\n${failed.length} file(s) had UNBALANCED markup and were NOT touched (need manual review):`);
  failed.forEach(f => console.log(' -', f));
}
