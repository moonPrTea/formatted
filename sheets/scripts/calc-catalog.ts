import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const directory = process.argv[2];
if (!directory)
  throw new Error('Pass the directory containing pinned Calc sources');
const read = (name: string) => readFile(join(directory, name), 'utf8');
const translations = (source: string) => {
  const result = new Map<string, string>();
  for (const block of source.split(/\n\s*\n/)) {
    if (block.includes('#, fuzzy')) continue;
    const fields: Record<string, string> = {};
    let field = '';
    for (const line of block.split('\n')) {
      const match = /^(msgctxt|msgid|msgstr) (".*")$/.exec(line);
      if (match) {
        field = match[1];
        fields[field] = JSON.parse(match[2]);
      } else if (line.startsWith('"') && field) {
        fields[field] += JSON.parse(line);
      }
    }
    if (fields.msgstr)
      result.set(`${fields.msgctxt}|${fields.msgid}`, fields.msgstr);
  }
  return result;
};
const coreRu = translations(await read('lo-ru.po'));
const addonRu = translations(await read('lo-addon-ru.po'));
const names = new Map(
  [
    ...(await read('lo-functions.hrc')).matchAll(
      /NC_\("RID_STRLIST_FUNCTION_NAMES", "([^"]+)"\)\s*,\s*(SC_OPCODE_\w+)/g,
    ),
  ].map(m => [m[2], m[1]]),
);
const rows: string[] = [];
function add(en: string, ru: string, category: string) {
  if (!en || !ru || /[|\n`]/.test(en + ru + category))
    throw new Error(`Invalid catalog row: ${en}`);
  rows.push([en, ru, category].join('|'));
}
for (const match of (await read('lo-funcdesc.cxx')).matchAll(
  /\{ (SC_OPCODE_\w+), ENTRY\([^)]*\), (\d+), ID_FUNCTION_GRP_(\w+),/g,
)) {
  if (Number(match[2]) & 1) continue;
  const en = names.get(match[1]);
  if (!en) throw new Error(`Missing core name: ${match[1]}`);
  add(en, coreRu.get(`RID_STRLIST_FUNCTION_NAMES|${en}`) || en, match[3]);
}
const addonNames = new Map(
  [
    ...(await read('lo-addon-strings.hrc')).matchAll(
      /NC_\("(\w+_FUNCNAME_\w+)", "([^"]+)"\)/g,
    ),
  ].map(m => [m[1], m[2]]),
);
const categories: Record<string, string> = {
  DateTime: 'DATETIME',
  Finance: 'FINANCIAL',
  Inf: 'INFO',
  Math: 'MATH',
  Tech: 'TECHNICAL',
  Text: 'TEXT',
};
function addon(context: string, category: string, suffix = '') {
  const en = addonNames.get(context);
  if (!en || !categories[category])
    throw new Error(`Unknown add-in: ${context}`);
  add(
    en + suffix,
    (addonRu.get(`${context}|${en}`) || en) + suffix,
    categories[category],
  );
}
for (const m of (await read('lo-addon-functions.cxx')).matchAll(
  /FUNCDATAS?\(\s*(\w+),\s*(UNIQUE|DOUBLE),\s*\w+,\s*\d+,\s*FDCategory::(\w+)(?:,\s*"([^"]+)")?\s*\)/g,
))
  addon(
    `ANALYSIS_FUNCNAME_${m[1]}`,
    m[3],
    m[2] === 'DOUBLE' ? m[4] || '_ADD' : '',
  );
for (const m of (await read('lo-datefunc.cxx')).matchAll(
  /FUNCDATA\(\s*(\w+),\s*\d+,\s*ScaCategory::(\w+),\s*UNIQUE,/g,
))
  addon(`DATE_FUNCNAME_${m[1]}`, m[2]);
for (const m of (await read('lo-pricing.cxx')).matchAll(
  /\{ "get\w+", (PRICING_FUNCNAME_\w+),[^\n]*ScaCategory::(\w+),/g,
))
  addon(m[1], m[2]);
rows.sort();
if (new Set(rows.map(row => row.split('|')[0])).size !== rows.length)
  throw new Error('Duplicate English function name');
if (rows.length < 500) throw new Error('Incomplete source snapshot');
process.stdout.write(
  '// SPDX-License-Identifier: MPL-2.0\n' +
    '// Generated from LibreOffice 25.8.0.4; see docs/calc-catalog.md\n' +
    'export const catalogData = `\n' +
    rows.join('\n') +
    '\n`;\n',
);
