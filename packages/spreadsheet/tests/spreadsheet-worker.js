import {parentPort} from 'node:worker_threads';
import {Workbook} from '../../../build/packages/spreadsheet/src/index.js';

parentPort.once('message', ({value}) => {
  const workbook = new Workbook();
  workbook.addSheet('Sheet1');
  workbook.setCell('Sheet1', 'A1', value);
  workbook.setFormula('Sheet1', 'B1', '=A1*2');
  workbook.setFormula('Sheet1', 'C1', '=1/0');
  parentPort.postMessage({
    value: workbook.getValue('Sheet1', 'B1'),
    error: workbook.getValue('Sheet1', 'C1'),
  });
});
