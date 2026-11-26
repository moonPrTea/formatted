import type {
  ErrorCode,
  FormulaLanguage,
} from '../../../packages/spreadsheet/src/index.js';

const messages: Record<ErrorCode, Record<FormulaLanguage, string>> = {
  '#PARSE!': {
    ru: 'Не удалось разобрать формулу. Проверь скобки, кавычки и знаки между выражениями. Точка с запятой разделяет аргументы внутри функции, а не после её закрывающей скобки',
    en: 'The formula could not be parsed. Check parentheses, quotes and operators between expressions. Semicolons separate arguments inside a function, not after its closing parenthesis',
  },
  '#REF!': {
    ru: 'Недопустимая ссылка. Проверь название листа и адрес ячейки. В ИНДЕКС номер строки и столбца должен попадать в выбранный диапазон: для одной ячейки допустимы только 1 и 1',
    en: 'Invalid reference. Check the sheet name and cell address. INDEX row and column numbers must fit the selected range: a single cell only allows row 1 and column 1',
  },
  '#VALUE!': {
    ru: 'Неподходящий тип аргумента. Проверь, где требуется число, а где ссылка на диапазон. Для ПОИСКПОЗ диапазон должен состоять из одной строки или одного столбца',
    en: 'An argument has the wrong type. Check where a number or range reference is required. MATCH needs a single row or column',
  },
  '#NAME?': {
    ru: 'Функция не распознана или ещё не реализована. Проверь название. Сейчас движок вычисляет ИНДЕКС и ПОИСКПОЗ, остальные функции доступны только в каталоге',
    en: 'The function is unknown or not implemented yet. Check its name. The engine currently calculates INDEX and MATCH; other functions are catalog-only',
  },
  '#N/A': {
    ru: 'ПОИСКПОЗ не нашёл точного совпадения. Проверь значение, диапазон, лишние пробелы и тип данных: число 12 и текст «12» различаются',
    en: 'MATCH found no exact match. Check the value, range, extra spaces and data types: the number 12 and the text “12” differ',
  },
  '#DIV/0!': {
    ru: 'Деление на ноль. Проверь знаменатель и ячейки, из которых он вычисляется: пустая ячейка в арифметике считается нулём',
    en: 'Division by zero. Check the denominator and the cells used to calculate it: arithmetic treats an empty cell as zero',
  },
  '#NUM!': {
    ru: 'Числовой результат выходит за допустимые пределы. Проверь слишком большие числа и промежуточные вычисления',
    en: 'The numeric result is outside the supported limits. Check large numbers and intermediate calculations',
  },
  '#CYCLE!': {
    ru: 'Циклическая ссылка: ячейка зависит от самой себя напрямую или через другие ячейки. Убери ссылку, которая замыкает цепочку',
    en: 'Circular reference: this cell depends on itself directly or through other cells. Remove the reference that closes the loop',
  },
  '#LIMIT!': {
    ru: 'Достигнут защитный лимит движка. Уменьши диапазон, длину формулы или глубину зависимостей',
    en: 'An engine safety limit was reached. Reduce the range, formula length or dependency depth',
  },
  '#UNSUPPORTED!': {
    ru: 'Этот способ вычисления пока не поддерживается. ИНДЕКС принимает 2 или 3 аргумента с номерами от 1; ПОИСКПОЗ принимает 3 аргумента и только точный поиск (0). Вывод целого диапазона не поддерживается',
    en: 'This calculation mode is not supported yet. INDEX takes 2 or 3 arguments with positions starting at 1; MATCH takes 3 arguments and only exact matching (0). Returning an entire range is not supported',
  },
};

export function errorExplanation(code: ErrorCode, language: FormulaLanguage) {
  return messages[code][language];
}
