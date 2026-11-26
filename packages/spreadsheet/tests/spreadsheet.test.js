import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {
  Workbook,
  isCellError,
  limits,
} from '../../../build/packages/spreadsheet/src/index.js';

function book() {
  const workbook = new Workbook();
  workbook.addSheet('Практика');
  workbook.addSheet('Категории');
  return workbook;
}

function lesson() {
  const workbook = book();
  [
    [10, 'Домашняя'],
    [25, 'Повседневная'],
    [40, 'Спортивная'],
  ].forEach(([id, name], i) => {
    workbook.setCell('Категории', `A${i + 2}`, id);
    workbook.setCell('Категории', `B${i + 2}`, name);
  });
  workbook.setCell('Практика', 'A2', '00101');
  workbook.setCell('Практика', 'C2', 'Спортивная');
  workbook.setFormula('Практика', 'G2', '=ПОИСКПОЗ(C2;Категории.$B$2:$B$4;0)');
  workbook.setFormula(
    'Практика',
    'H2',
    '=ИНДЕКС(Категории.$A$2:$A$4;ПОИСКПОЗ(C2;Категории.$B$2:$B$4;0))',
  );
  return workbook;
}

function calculate(formula, workbook = book()) {
  workbook.setFormula('Практика', 'Z1', formula);
  return workbook.getValue('Практика', 'Z1');
}

function expectError(value, code) {
  assert.ok(isCellError(value), JSON.stringify(value));
  assert.equal(value.code, code);
}

test('engine: scalar types, blanks and literal formula-looking text stay distinct', () => {
  const w = book();
  for (const [i, value] of [
    '00101',
    101,
    false,
    true,
    '',
    null,
    '=1+2',
  ].entries()) {
    w.setCell('Практика', `A${i + 1}`, value);
    assert.equal(w.getValue('Практика', `A${i + 1}`), value);
    assert.equal(w.getCell('Практика', `A${i + 1}`), value);
  }
  assert.equal(w.getValue('Практика', 'A20'), null);
  assert.equal(w.getStats().cells, 6);
  for (const invalid of [
    NaN,
    Infinity,
    undefined,
    [],
    {},
    {formula: 3},
    'x'.repeat(32768),
  ])
    assert.throws(() => w.setCell('Практика', 'A1', invalid), TypeError);
});

test('engine: sheet names and addresses are case insensitive without object-key hazards', () => {
  const w = book();
  w.addSheet('__proto__');
  w.setCell('__proto__', 'a1', 7);
  assert.equal(calculate('=__proto__.A1', w), 7);
  w.setCell('практика', '$b$2', 19);
  assert.equal(w.getValue('ПРАКТИКА', 'B2'), 19);
  assert.throws(() => w.addSheet('ПРАКТИКА'));
  for (const name of ['', ' ', '\n', 'a'.repeat(101)])
    assert.throws(() => w.addSheet(name));
  for (const address of ['A0', 'A01', 'XFE1', 'A1048577', 'A1:B2', '1A'])
    assert.throws(() => w.setCell('Практика', address, 1));
  assert.throws(() => w.setCell('Missing', 'A1', 1));
  w.setCell('Практика', 'XFD1048576', 5);
  assert.equal(w.getValue('Практика', 'XFD1048576'), 5);
});

test('engine: parser handles precedence, unary signs, strings and boolean literals', () => {
  for (const [formula, value] of [
    ['=2+3*4', 14],
    ['=(2+3)*4', 20],
    ['=12/3/2', 2],
    ['=10-3-2', 5],
    ['=-2*-3+1', 7],
    ['=1e2+.5', 100.5],
    ['=-(2+3)', -5],
    ['="a""b"', 'a"b'],
    ['="("', '('],
    ['=")"', ')'],
    ['=TRUE', true],
    ['=ЛОЖЬ', false],
    ['=A5+2', 2],
    ['=TRUE+1', 2],
  ])
    assert.equal(calculate(formula), value, formula);
});

test('engine: exam formulas return a position and a distinct existing ID', () => {
  const w = lesson();
  assert.equal(w.getValue('Практика', 'G2'), 3);
  assert.equal(w.getValue('Практика', 'H2'), 40);
  w.setCell('Практика', 'C2', 'Домашняя');
  assert.equal(w.getValue('Практика', 'G2'), 1);
  assert.equal(w.getValue('Практика', 'H2'), 10);
  w.setCell('Категории', 'A2', 700);
  assert.equal(w.getValue('Практика', 'H2'), 700);
  assert.equal(w.getValue('Практика', 'A2'), '00101');
});

test('engine: INDEX supports rectangular ranges and MATCH supports row vectors', () => {
  const w = book();
  w.setCells([
    {sheet: 'Практика', address: 'A1', input: 11},
    {sheet: 'Практика', address: 'B1', input: 12},
    {sheet: 'Практика', address: 'A2', input: 21},
    {sheet: 'Практика', address: 'B2', input: 22},
  ]);
  assert.equal(calculate('=index(A1:B2;2;2)', w), 22);
  assert.equal(calculate('=INDEX(B2:A1;1;1)', w), 11);
  assert.equal(calculate('=INDEX(A1:B2;2.9;1.9)', w), 21);
  assert.equal(calculate('=MATCH(12;A1:B1;0)', w), 2);
  assert.equal(calculate('=INDEX(A1;1)', w), 11);
  expectError(calculate('=MATCH(22;A1:B2;0)', w), '#VALUE!');
});

test('engine: exact MATCH is literal, typed, case insensitive and returns first duplicate', () => {
  const w = book();
  ['Alpha', 'ALPHA', '00101', 101, '*', '', null, 0, ' Alpha '].forEach(
    (v, i) => w.setCell('Практика', `A${i + 1}`, v),
  );
  for (const [criterion, position] of [
    ['"alpha"', 1],
    ['"00101"', 3],
    ['101', 4],
    ['"*"', 5],
    ['""', 6],
    ['B1', 7],
    ['0', 8],
    ['" Alpha "', 9],
  ])
    assert.equal(calculate(`=MATCH(${criterion};A1:A9;0)`, w), position);
  expectError(calculate('=MATCH("101";A1:A9;0)', w), '#N/A');
  expectError(calculate('=MATCH("a*";A1:A9;0)', w), '#N/A');
});

test('engine: quoted sheet names, apostrophes and dollar-prefixed names survive formatting', () => {
  const w = book();
  w.addSheet("Bob's categories");
  w.addSheet('$Prices');
  w.setCell("Bob's categories", 'B2', 33);
  w.setCell('$Prices', 'A1', 9);
  assert.equal(calculate("=$'Bob''s categories'.$B$2", w), 33);
  assert.equal(calculate("='$Prices'.A1", w), 9);
  const source = w.getFormula('Практика', 'Z1', 'ru');
  assert.equal(calculate(source, w), 9);
});

test('engine: Russian and English names serialize without translating strings or sheet names', () => {
  const w = lesson();
  const before = w.getValue('Практика', 'H2');
  const ru = w.getFormula('Практика', 'H2', 'ru');
  const en = w.getFormula('Практика', 'H2', 'en');
  assert.match(ru, /ИНДЕКС.*ПОИСКПОЗ/);
  assert.match(en, /INDEX.*MATCH/);
  assert.match(en, /Категории/);
  assert.equal(calculate(ru, w), before);
  assert.equal(calculate(en, w), before);
  w.setFormula('Практика', 'Z1', '=MATCH("ИНДЕКС";A1:A2;0)');
  assert.match(w.getFormula('Практика', 'Z1'), /"ИНДЕКС"/);
  assert.equal(w.getFormula('Практика', 'A2'), null);
});

test('engine: caches are reused and only affected formulas are invalidated', () => {
  const w = book();
  w.setCell('Практика', 'A1', 3);
  w.setFormula('Практика', 'B1', '=A1+2');
  w.setFormula('Практика', 'C1', '=B1*2');
  w.setFormula('Практика', 'D1', '=10+1');
  assert.equal(w.getValue('Практика', 'C1'), 10);
  assert.equal(w.getValue('Практика', 'D1'), 11);
  const before = w.getStats().evaluations;
  assert.equal(w.getValue('Практика', 'C1'), 10);
  assert.equal(w.getStats().evaluations, before);
  w.setCell('Практика', 'A1', 5);
  assert.equal(w.getValue('Практика', 'D1'), 11);
  assert.equal(w.getStats().evaluations, before);
  assert.equal(w.getValue('Практика', 'C1'), 14);
  assert.equal(w.getStats().evaluations, before + 2);
});

test('engine: changes in ranges and previously blank references invalidate consumers', () => {
  const w = lesson();
  w.setCell('Категории', 'B4', 'Другая');
  expectError(w.getValue('Практика', 'H2'), '#N/A');
  w.setCell('Категории', 'B4', 'Спортивная');
  assert.equal(w.getValue('Практика', 'H2'), 40);
  w.setCell('Категории', 'A4', null);
  assert.equal(w.getValue('Практика', 'H2'), null);
  w.setCell('Категории', 'A4', 41);
  assert.equal(w.getValue('Практика', 'H2'), 41);
});

test('engine: replacement and clearing remove old dependency edges', () => {
  const w = book();
  w.setFormula('Практика', 'A1', '=B1');
  assert.equal(w.getValue('Практика', 'A1'), null);
  w.setFormula('Практика', 'A1', '=C1');
  assert.equal(w.getStats().dependencies, 1);
  w.getValue('Практика', 'A1');
  const before = w.getStats().evaluations;
  w.setCell('Практика', 'B1', 2);
  assert.equal(w.getValue('Практика', 'A1'), null);
  assert.equal(w.getStats().evaluations, before);
  w.setCell('Практика', 'A1', null);
  assert.equal(w.getStats().dependencies, 0);
  assert.equal(w.getStats().cached, 0);
});

test('engine: unknown sheets recover when created, without editing the formula', () => {
  const w = book();
  w.setFormula('Практика', 'A1', '=Later.A1+1');
  expectError(w.getValue('Практика', 'A1'), '#REF!');
  w.addSheet('Later');
  assert.equal(w.getValue('Практика', 'A1'), 1);
  w.setCell('Later', 'A1', 8);
  assert.equal(w.getValue('Практика', 'A1'), 9);
});

test('engine: direct, indirect and cross-sheet cycles report errors and recover', () => {
  const w = book();
  w.setFormula('Практика', 'A1', '=A1+1');
  expectError(w.getValue('Практика', 'A1'), '#CYCLE!');
  w.setFormula('Практика', 'A1', '=Категории.A1');
  w.setFormula('Категории', 'A1', '=Практика.A1');
  w.setFormula('Практика', 'B1', '=A1+2');
  expectError(w.getValue('Практика', 'B1'), '#CYCLE!');
  w.setCell('Категории', 'A1', 5);
  assert.equal(w.getValue('Практика', 'B1'), 7);
});

test('engine: error propagation and unsupported features never become plausible numbers', () => {
  const cases = [
    ['=1/0', '#DIV/0!'],
    ['=1e308*10', '#NUM!'],
    ['=1e999', '#NUM!'],
    ['="1"+2', '#VALUE!'],
    ['=NoSuchFunction(1)', '#NAME?'],
    ['=INDEX(A1:A2;3)', '#REF!'],
    ['=INDEX(A1:A2;0)', '#UNSUPPORTED!'],
    ['=INDEX(A1:A2;1;1;1)', '#UNSUPPORTED!'],
    ['=INDEX(1;1)', '#VALUE!'],
    ['=MATCH(1;A1:A2)', '#UNSUPPORTED!'],
    ['=MATCH(1;A1:A2;1)', '#UNSUPPORTED!'],
    ['=MATCH(1;A1:A2;-1)', '#UNSUPPORTED!'],
    ['=A1:A2', '#UNSUPPORTED!'],
    ['=A0', '#REF!'],
    ['=XFE1', '#REF!'],
    ['=A1048577', '#REF!'],
    ['=INDEX(Практика.A1:Категории.A2;1)', '#REF!'],
  ];
  for (const [formula, code] of cases) expectError(calculate(formula), code);
  const w = book();
  w.setFormula('Практика', 'A1', '=1/0');
  expectError(calculate('=A1+10', w), '#DIV/0!');
  expectError(calculate('=INDEX(A1:A2;1)', w), '#DIV/0!');
});

test('engine: INDEX reads only its selected cell and MATCH stops on the first match', () => {
  const w = book();
  w.setCell('Практика', 'A1', 4);
  w.setFormula('Практика', 'A2', '=1/0');
  assert.equal(calculate('=INDEX(A1:A2;1)', w), 4);
  assert.equal(calculate('=MATCH(4;A1:A2;0)', w), 1);
  expectError(calculate('=MATCH(3;A1:A2;0)', w), '#DIV/0!');
});

test('engine: malformed syntax is contained and cannot execute JavaScript', () => {
  for (const formula of [
    '=',
    '=1+',
    '=(1',
    '="unclosed',
    '=INDEX(A1;)',
    '=1 2',
    '=MATCH("x",A1:A2,0)',
    '=2**3',
    '=globalThis.process.exit()',
    '=constructor.constructor("return process")()',
    '=fetch("https://example.com")',
  ])
    assert.ok(isCellError(calculate(formula)), formula);
  assert.equal(
    calculate('="globalThis.process.exit()"'),
    'globalThis.process.exit()',
  );
});

test('engine: copied formulas shift only relative coordinates, not quoted text', () => {
  const w = book();
  w.setFormula('Практика', 'D4', '=A1+$B1+C$2+$D$3');
  w.copyRange('Практика', 'D4', 'Практика', 'F7');
  assert.equal(w.getFormula('Практика', 'F7'), '=(((C4+$B4)+E$2)+$D$3)');
  w.setFormula('Практика', 'A1', '=MATCH("A1";Категории.$B$2:$B$4;0)');
  w.copyRange('Практика', 'A1', 'Практика', 'A2');
  assert.equal(
    w.getFormula('Практика', 'A2'),
    '=MATCH("A1";\'Категории\'.$B$2:$B$4;0)',
  );
});

test('engine: filling the lesson formula works for all categories', () => {
  const w = lesson();
  ['Спортивная', 'Повседневная', 'Спортивная', 'Домашняя'].forEach(
    (name, i) => {
      const row = i + 2;
      w.setCell('Практика', `C${row}`, name);
      if (i) w.copyRange('Практика', 'G2:H2', 'Практика', `G${row}`);
    },
  );
  assert.deepEqual(
    [2, 3, 4, 5].map(r => w.getValue('Практика', `H${r}`)),
    [40, 25, 40, 10],
  );
});

test('engine: overlapping copies use a snapshot and copy blank cells', () => {
  const w = book();
  w.setCell('Практика', 'A1', 1);
  w.setCell('Практика', 'A2', 2);
  w.setCell('Практика', 'A4', 9);
  w.copyRange('Практика', 'A1:A3', 'Практика', 'A2');
  assert.deepEqual(
    [1, 2, 3, 4].map(r => w.getValue('Практика', `A${r}`)),
    [1, 1, 2, null],
  );
  w.setFormula('Практика', 'B1', '=A1');
  w.setCell('Категории', 'A1', 42);
  w.copyRange('Практика', 'B1', 'Категории', 'B1');
  assert.equal(w.getValue('Категории', 'B1'), 42);
});

test('engine: out-of-bounds references become REF errors; invalid paste is atomic', () => {
  const w = book();
  w.setFormula('Практика', 'B2', '=A1+1');
  w.copyRange('Практика', 'B2', 'Практика', 'A1');
  assert.equal(w.getFormula('Практика', 'A1'), '=(#REF!+1)');
  expectError(w.getValue('Практика', 'A1'), '#REF!');
  w.setCell('Практика', 'XFD1048576', 7);
  assert.throws(() =>
    w.copyRange('Практика', 'A1:B2', 'Практика', 'XFD1048576'),
  );
  assert.equal(w.getValue('Практика', 'XFD1048576'), 7);
  assert.throws(() =>
    w.setCells([
      {sheet: 'Практика', address: 'A10', input: 1},
      {sheet: 'Практика', address: 'A0', input: 2},
    ]),
  );
  assert.equal(w.getValue('Практика', 'A10'), null);
});

test('engine: callers cannot mutate stored formulas, errors or sheet lists', () => {
  const w = book();
  const input = {formula: '=1+2'};
  w.setCell('Практика', 'A1', input);
  input.formula = '=999';
  w.getCell('Практика', 'A1').formula = '=888';
  w.getSheetNames().push('Fake');
  assert.equal(w.getValue('Практика', 'A1'), 3);
  assert.equal(w.getSheetNames().length, 2);
  w.setFormula('Практика', 'A2', '=1/0');
  assert.ok(Object.isFrozen(w.getValue('Практика', 'A2')));
});

test('engine: formula size, depth, token and range budgets are enforced', () => {
  for (const formula of [
    '="' + 'x'.repeat(limits.formulaLength) + '"',
    '=' + '('.repeat(limits.nesting + 1) + '1' + ')'.repeat(limits.nesting + 1),
    '=' + Array(limits.tokens).fill('1').join('+'),
    '=MATCH(1;A1:A10001;0)',
  ])
    expectError(calculate(formula), '#LIMIT!');
});

test('engine: deep dependency limits do not poison independent cached results', () => {
  const w = book();
  for (let row = 1; row <= limits.cellDepth + 1; row++)
    w.setFormula('Практика', `A${row}`, `=A${row + 1}+1`);
  expectError(w.getValue('Практика', 'A1'), '#LIMIT!');
  assert.equal(w.getValue('Практика', `A${limits.cellDepth + 1}`), 1);
  w.setCell('Практика', 'A2', 3);
  assert.equal(w.getValue('Практика', 'A1'), 4);
});

test('engine: sparse storage and atomic capacity limits', () => {
  const w = book();
  w.setCell('Практика', 'XFD1048576', 'last');
  assert.equal(w.getStats().cells, 1);
  w.setCells(
    Array.from({length: limits.cells - 1}, (_, i) => ({
      sheet: 'Практика',
      address: `A${i + 1}`,
      input: i,
    })),
  );
  assert.throws(
    () =>
      w.setCells([
        {sheet: 'Практика', address: 'B1', input: 1},
        {sheet: 'Практика', address: 'B2', input: 2},
      ]),
    RangeError,
  );
  assert.equal(w.getValue('Практика', 'B1'), null);
  w.setCell('Практика', 'A1', null);
  w.setCell('Практика', 'B1', 1);
  assert.equal(w.getStats().cells, limits.cells);
});

test('engine: dependency-edge limits reject the entire batch', () => {
  const w = book();
  const count = limits.dependencies / limits.rangeCells;
  w.setCells(
    Array.from({length: count}, (_, i) => ({
      sheet: 'Практика',
      address: `B${i + 1}`,
      input: {formula: '=INDEX(A1:A10000;1)'},
    })),
  );
  assert.equal(w.getStats().dependencies, limits.dependencies);
  assert.throws(
    () =>
      w.setCells([
        {sheet: 'Практика', address: 'Z1', input: 42},
        {sheet: 'Практика', address: 'B99', input: {formula: '=A1'}},
      ]),
    RangeError,
  );
  assert.equal(w.getValue('Практика', 'Z1'), null);
  w.setCell('Практика', 'B1', null);
  assert.equal(
    w.getStats().dependencies,
    limits.dependencies - limits.rangeCells,
  );
});

test('engine: deterministic generated lookup data agrees with an independent oracle after edits', () => {
  const w = book();
  const dictionary = Array.from({length: 30}, (_, i) => ({
    name: `Category ${i}`,
    id: 1000 + i * 7,
  }));
  dictionary.forEach((entry, i) => {
    w.setCell('Категории', `A${i + 1}`, entry.id);
    w.setCell('Категории', `B${i + 1}`, entry.name);
  });
  for (let row = 1; row <= 200; row++) {
    const entry = dictionary[(row * 17) % dictionary.length];
    w.setCell('Практика', `A${row}`, entry.name);
    w.setFormula(
      'Практика',
      `B${row}`,
      `=INDEX(Категории.$A$1:$A$30;MATCH(A${row};Категории.$B$1:$B$30;0))`,
    );
    assert.equal(w.getValue('Практика', `B${row}`), entry.id);
  }
  dictionary[4].id = 777;
  w.setCell('Категории', 'A5', 777);
  for (let row = 1; row <= 200; row++) {
    const expected = dictionary.find(
      e => e.name === w.getValue('Практика', `A${row}`),
    ).id;
    assert.equal(w.getValue('Практика', `B${row}`), expected);
  }
});

test('engine: independent worker can import the module and return cloneable results', async () => {
  const worker = new Worker(
    new URL('./spreadsheet-worker.js', import.meta.url),
  );
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', code =>
        reject(new Error(`Worker exited before response: ${code}`)),
      );
      worker.postMessage({value: 21});
    });
    assert.deepEqual(result, {
      value: 42,
      error: {kind: 'error', code: '#DIV/0!'},
    });
  } finally {
    await worker.terminate();
  }
});

test('engine: malformed sheet references reject quoted addresses and symbol names', () => {
  for (const formula of ['=Категории."A1"', "=$'Категории'.'A1'", '=..A1'])
    expectError(calculate(formula), '#PARSE!');
  expectError(calculate('=INDEX(#REF!;1)'), '#REF!');
  expectError(calculate('=MATCH(1;#REF!;0)'), '#REF!');
});

test('engine: batch replacement releases capacity before adding new dependencies', () => {
  const w = book();
  const changes = Array.from({length: 20}, (_, i) => ({
    sheet: 'Практика',
    address: `B${i + 1}`,
    input: {formula: '=INDEX(A1:A10000;1)'},
  }));
  w.setCells(changes);
  w.setCells([
    {sheet: 'Практика', address: 'B21', input: changes[0].input},
    {sheet: 'Практика', address: 'B1', input: null},
  ]);
  assert.equal(w.getStats().dependencies, limits.dependencies);
  w.setCells([
    {sheet: 'Практика', address: 'B22', input: changes[0].input},
    {sheet: 'Практика', address: 'B22', input: 5},
  ]);
  assert.equal(w.getValue('Практика', 'B22'), 5);
  assert.throws(
    () => w.setCells(changes.map((c, i) => ({...c, address: `C${i + 1}`}))),
    RangeError,
  );
  assert.equal(w.getValue('Практика', 'C1'), null);
});

test('engine: evaluation work is bounded and can recover after a source edit', () => {
  const w = book();
  w.setCell('Практика', 'A10000', 'last');
  w.setFormula(
    'Практика',
    'B1',
    '=' + Array(6).fill('MATCH("last";A1:A10000;0)').join('+'),
  );
  expectError(w.getValue('Практика', 'B1'), '#LIMIT!');
  w.setCell('Практика', 'A1', 'last');
  assert.equal(w.getValue('Практика', 'B1'), 6);
});

test('engine: sheet limit leaves the existing workbook intact', () => {
  const w = new Workbook();
  for (let i = 0; i < limits.sheets; i++) w.addSheet(`Sheet${i}`);
  assert.throws(() => w.addSheet('Overflow'), RangeError);
  assert.equal(w.getSheetNames().length, limits.sheets);
});
