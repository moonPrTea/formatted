import {catalogData} from './catalog-data.js';
import {type FormulaLanguage} from '../../../packages/spreadsheet/src/index.js';

export const categories: Record<string, [string, string]> = {
  DATABASE: ['База данных', 'Database'],
  DATETIME: ['Дата и время', 'Date & time'],
  FINANCIAL: ['Финансовые', 'Financial'],
  INFO: ['Информация', 'Information'],
  LOGIC: ['Логические', 'Logical'],
  MATH: ['Математические', 'Mathematical'],
  MATRIX: ['Массив', 'Array'],
  STATISTIC: ['Статистические', 'Statistical'],
  TABLE: ['Электронная таблица', 'Spreadsheet'],
  TECHNICAL: ['Технические', 'Technical'],
  TEXT: ['Текстовые', 'Text'],
};
export const catalog = catalogData
  .trim()
  .split('\n')
  .map(row => {
    const [en, ru, category] = row.split('|');
    return {en, ru, category};
  });
const normalize = (value: string) =>
  value.trim().toLowerCase().replaceAll('ё', 'е');
export function findFunctions(
  search: string,
  category: string,
  language: FormulaLanguage,
) {
  const term = normalize(search);
  return catalog
    .filter(
      item =>
        (!category || item.category === category) &&
        [item.en, item.ru].some(name => normalize(name).includes(term)),
    )
    .sort((a, b) => a[language].localeCompare(b[language], language));
}
