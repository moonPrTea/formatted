import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {
  Workbook,
  type CellChange,
} from '../../packages/spreadsheet/src/index.js';

const workbook = new Workbook();
workbook.addSheet('Data');
workbook.addSheet('Categories');
const rows = 1000;
const categories = 30;
const timings: Record<string, number> = {};
const measure = (name: string, action: () => void) => {
  const start = performance.now();
  action();
  timings[name] = Number((performance.now() - start).toFixed(2));
};

measure('loadMs', () => {
  const changes: CellChange[] = [];
  for (let i = 1; i <= categories; i++)
    changes.push(
      {sheet: 'Categories', address: `A${i}`, input: i * 10},
      {sheet: 'Categories', address: `B${i}`, input: `Category ${i}`},
    );
  for (let row = 1; row <= rows; row++)
    changes.push(
      {
        sheet: 'Data',
        address: `A${row}`,
        input: `Category ${((row * 17) % categories) + 1}`,
      },
      {
        sheet: 'Data',
        address: `B${row}`,
        input: {
          formula: `=INDEX(Categories.$A$1:$A$30;MATCH(A${row};Categories.$B$1:$B$30;0))`,
        },
      },
    );
  workbook.setCells(changes);
});

const verify = (edited: boolean) => {
  for (let row = 1; row <= rows; row++) {
    const category = ((row * 17) % categories) + 1;
    const expected = edited && category === 5 ? 777 : category * 10;
    assert.equal(workbook.getValue('Data', `B${row}`), expected);
  }
};
measure('firstReadMs', () => verify(false));
measure('cachedReadMs', () => verify(false));
measure('editAndReadMs', () => {
  workbook.setCell('Categories', 'A5', 777);
  verify(true);
});

console.log(
  JSON.stringify(
    {
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      rows,
      categories,
      timings,
      stats: workbook.getStats(),
      note: 'Local sample, includes correctness assertions; not a performance guarantee',
    },
    null,
    2,
  ),
);
