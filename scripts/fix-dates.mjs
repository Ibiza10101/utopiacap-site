import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', 'src', 'posts');
let fixed = 0;

for (const file of fs.readdirSync(dir)) {
  const full = path.join(dir, file);
  const content = fs.readFileSync(full, 'utf8');
  if (!/^date: 2026-11-13$/m.test(content)) continue;

  const ts = content.match(/^archivedAt: "(\d{14})"$/m)?.[1];
  if (!ts) { console.log(`SKIP (no archivedAt): ${file}`); continue; }
  const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  const updated = content.replace(/^date: 2026-11-13$/m, `date: ${date}`);
  fs.writeFileSync(full, updated);
  console.log(`${file}: -> ${date}`);
  fixed++;
}
console.log(`\nFixed ${fixed} files.`);
