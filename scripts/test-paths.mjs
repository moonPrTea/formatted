import {readdir} from 'node:fs/promises';
import path from 'node:path';

export const testDirectories = [
  'formatted/tests',
  'sheets/tests',
  'studio/tests',
  'packages/spreadsheet/tests',
  'tests',
];

export async function discoverTests(predicate) {
  const groups = await Promise.all(
    testDirectories.map(async directory => {
      const entries = await readdir(directory, {withFileTypes: true});
      return entries
        .filter(entry => entry.isFile() && predicate(entry.name))
        .map(entry => path.join(directory, entry.name));
    }),
  );
  return groups.flat().sort();
}
