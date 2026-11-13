import fs from 'node:fs';

const html = fs.readFileSync('scripts/track-record-raw.html', 'utf8');
const tableMatch = html.match(/<table id="table_1"[\s\S]*?<\/table>/);
const rows = tableMatch[0].match(/<tr[\s>][\s\S]*?<\/tr>/g) || [];

function cellText(td) {
  return td.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

const headerRow = rows[0];
const headers = [...headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => cellText(m[1]));

const records = [];
for (const r of rows.slice(1)) {
  const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]));
  if (cells.length < headers.length) continue;
  const rec = {};
  headers.forEach((h, i) => { rec[h] = cells[i]; });
  if (rec.Ticker === 'Ticker') continue; // tfoot repeats the header labels
  records.push(rec);
}

console.log(`Parsed ${records.length} records`);
fs.writeFileSync('scripts/track-record.json', JSON.stringify(records, null, 2));
console.log(JSON.stringify(records[0], null, 2));
console.log(JSON.stringify(records[records.length - 1], null, 2));
