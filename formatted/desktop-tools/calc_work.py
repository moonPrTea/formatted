import copy
import csv
import io
import re
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from calc_lesson import NS, q, workbook, write_csv


def prepare_work(directory, lesson):
    folder = directory / 'work'
    folder.mkdir(parents=True, exist_ok=True)
    if folder.is_symlink():
        raise ValueError('Папка урока не должна быть ссылкой')
    targets = [folder / 'lesson.ods', folder / 'lesson.fods']
    for target in targets:
        if target.exists():
            if target.is_symlink():
                raise ValueError('Книга урока не должна быть ссылкой')
            return folder, target
    root = ET.fromstring(workbook(lesson, 4))
    root.set('xmlns:of', 'urn:oasis:names:tc:opendocument:xmlns:of:1.2')
    for table in root.findall('.//table:table', NS):
        name = table.get(q('table:name'))
        if name in ['Практика', 'Категории']:
            for row in table.findall('table:table-row', NS)[1:]:
                for cell in row:
                    style = cell.get(q('table:style-name'), 'body')
                    cell.clear()
                    cell.set(q('office:value-type'), 'string')
                    cell.set(q('table:style-name'), style)
        if name == 'Подсказка':
            for row in list(table.findall('table:table-row', NS)):
                table.remove(row)
            for text in [
                'Рабочая книга',
                'Импортируй source.csv и скопируй данные на лист Практика',
                'Шаги и формулы находятся в приложении',
                'Продолжай работу в этой книге, сохраняй Ctrl+S перед проверкой',
                'Можно сохранить как lesson.ods в той же папке',
                'Итоговые products.csv и categories.csv сохрани рядом с книгой',
            ]:
                row = ET.SubElement(table, q('table:table-row'))
                cell = ET.SubElement(row, q('table:table-cell'), {q('office:value-type'): 'string', q('table:style-name'): 'body'})
                ET.SubElement(cell, q('text:p')).text = text
    source = folder / 'source.csv'
    if not source.exists():
        write_csv(source, lesson['headers'], lesson['rows'])
    with targets[1].open('xb') as output:
        output.write(ET.tostring(root, encoding='utf-8', xml_declaration=True))
    return folder, targets[1]


def read_book(path):
    if path.is_symlink() or path.stat().st_size > 4_000_000:
        raise ValueError('Недопустимая книга или размер больше 4 МБ')
    if path.suffix == '.ods':
        with ZipFile(path) as archive:
            info = archive.getinfo('content.xml')
            if info.file_size > 10_000_000:
                raise ValueError('Содержимое книги слишком большое')
            xml = archive.read(info)
    else:
        xml = path.read_bytes()
    xml = xml.decode('utf-8')
    if '<!DOCTYPE' in xml or '<!ENTITY' in xml:
        raise ValueError('Описание XML-сущностей не допускается')
    root = ET.fromstring(xml)
    book = {}
    for table in root.findall('.//table:table', NS):
        name = table.get(q('table:name'))
        if name not in ['Практика', 'Категории', 'Исходник', 'Товары']:
            continue
        rows = []
        for row in table.findall('table:table-row', NS):
            cells = []
            for cell in row:
                if cell.tag not in [q('table:table-cell'), q('table:covered-table-cell')]:
                    continue
                paragraphs = cell.findall('text:p', NS)
                for space in cell.findall('.//text:s', NS):
                    space.text = ' ' * min(int(space.get(q('text:c'), '1')), 1000)
                value = '\n'.join(''.join(p.itertext()) for p in paragraphs)
                kind = cell.get(q('office:value-type'), 'string')
                if kind == 'float':
                    value = float(cell.get(q('office:value'), 'nan'))
                elif kind == 'date':
                    value = cell.get(q('office:date-value'), '')[:10]
                data = {'value': value, 'type': kind, 'formula': cell.get(q('table:formula'))}
                count = int(cell.get(q('table:number-columns-repeated'), '1'))
                if len(cells) + count > 32 and (value != '' or data['formula']):
                    raise ValueError('Учебная книга: больше 32 заполненных столбцов')
                cells.extend([data] * min(count, max(0, 32 - len(cells))))
            count = int(row.get(q('table:number-rows-repeated'), '1'))
            if len(rows) + count > 200 and any(c['value'] != '' or c['formula'] for c in cells):
                raise ValueError('Учебная книга: больше 200 заполненных строк')
            rows.extend([cells] * min(count, max(0, 200 - len(rows))))
        book[name] = rows
    return book


def cell_at(book, sheet, address):
    match = re.fullmatch(r'\$?([A-Z]{1,2})\$?([1-9]\d{0,2})', address)
    if not match:
        raise ValueError('Неверная ссылка на ячейку')
    column = 0
    for char in match[1]:
        column = column * 26 + ord(char) - 64
    row = int(match[2]) - 1
    if column > 32 or row >= 200:
        raise ValueError('Ссылка вне учебного диапазона')
    try:
        return book[sheet][row][column - 1]
    except (KeyError, IndexError):
        return {'value': '', 'type': 'string', 'formula': None}


def evaluate(book, sheet, address, visited=()):
    key = (sheet, address)
    if key in visited or len(visited) > 20:
        raise ValueError('Циклическая или слишком длинная формула')
    cell = cell_at(book, sheet, address)
    if not cell['formula']:
        return cell['value']
    formula = cell['formula'].split('=', 1)[-1].strip()
    if len(formula) > 2000 or formula.count('(') > 20:
        raise ValueError('Формула слишком сложная для этого урока')

    def expression(text):
        text = text.strip()
        if re.fullmatch(r'-?\d+', text):
            return int(text)
        if text.startswith('[') and text.endswith(']'):
            reference = text[1:-1]
            match = re.fullmatch(r"(?:\$?'?([^'.:#]+)'?)?\.(\$?[A-Z]{1,2}\$?\d+)(?::\.(\$?[A-Z]{1,2}\$?\d+))?", reference)
            if not match:
                raise ValueError('Допустимы ссылки внутри учебной книги')
            target_sheet = match[1] or sheet
            first = match[2].replace('$', '')
            last = (match[3] or '').replace('$', '')
            if not last:
                return evaluate(book, target_sheet, first, (*visited, key))
            column = re.match('[A-Z]+', first)[0]
            if re.match('[A-Z]+', last)[0] != column:
                raise ValueError('Нужен одностолбцовый диапазон')
            start, end = int(first[len(column):]), int(last[len(column):])
            if not 1 <= start <= end <= 200:
                raise ValueError('Неверный диапазон')
            return [evaluate(book, target_sheet, f'{column}{row}', (*visited, key)) for row in range(start, end + 1)]
        match = re.fullmatch(r'(MATCH|INDEX)\((.*)\)', text, re.I)
        if not match:
            raise ValueError('В этом уроке проверяются только ИНДЕКС и ПОИСКПОЗ со ссылками на ячейки')
        args, depth, begin = [], 0, 0
        for i, char in enumerate(match[2]):
            if char in '([':
                depth += 1
            elif char in ')]':
                depth -= 1
            elif char == ';' and depth == 0:
                args.append(expression(match[2][begin:i]))
                begin = i + 1
        args.append(expression(match[2][begin:]))
        if match[1].upper() == 'MATCH':
            if len(args) != 3 or args[2] != 0 or not isinstance(args[1], list):
                raise ValueError('ПОИСКПОЗ требует точного поиска с 0')
            return args[1].index(args[0]) + 1
        if len(args) != 2 or not isinstance(args[0], list) or not isinstance(args[1], (int, float)) or int(args[1]) != args[1] or not 1 <= args[1] <= len(args[0]):
            raise ValueError('Неверные аргументы ИНДЕКС')
        return args[0][int(args[1]) - 1]
    return expression(formula)


def check_work(path, lesson, step):
    book, issues = read_book(path), []
    def require(condition, message):
        if not condition:
            issues.append(message)
    def value(sheet, address):
        return cell_at(book, sheet, address)['value']
    for sheet in ['Практика', 'Исходник']:
        for j, header in enumerate(lesson['headers']):
            require(value(sheet, f'{chr(65+j)}1') == header, f'{sheet}: проверь заголовок {chr(65+j)}1')
        require(not any(c['value'] != '' or c['formula'] for row in book.get(sheet, [])[5:] for c in row), f'{sheet}: лишние строки после четырёх товаров')
    cleaned = [row[:2] + [row[2].strip()] + row[3:] for row in lesson['rows']]
    for i, row in enumerate(lesson['rows'], 2):
        for j, original in enumerate(row):
            require(value('Исходник', f'{chr(65+j)}{i}') == original, f'Исходник: изменилась ячейка {chr(65+j)}{i}')
    for i, row in enumerate(lesson['rows'] if step == 0 else cleaned, 2):
        for j, expected in enumerate(row):
            require(value('Практика', f'{chr(65+j)}{i}') == expected, f'Практика, {chr(65+j)}{i}: проверь импорт, пробелы или формат данных')
        require(cell_at(book, 'Практика', f'A{i}')['type'] == 'string', f'A{i}: код должен остаться текстом с ведущими нулями')
    if step >= 2:
        entries = [(value('Категории', f'A{i}'), value('Категории', f'B{i}')) for i in range(2, 201) if value('Категории', f'A{i}') != '' or value('Категории', f'B{i}') != '']
        ids = [pair[0] for pair in entries]
        require(len(entries) == 3 and {pair[1] for pair in entries} == {row[2] for row in cleaned}, 'Категории: нужны три уникальные очищенные категории')
        require(len(set(ids)) == len(ids) and all(isinstance(v, (int, float)) and v > 0 and int(v) == v for v in ids), 'Категории: назначь уникальные положительные целочисленные ID')
        mapping = {name: code for code, name in entries}
        for i, row in enumerate(cleaned, 2):
            if step >= 3:
                try:
                    require('MATCH(' in (cell_at(book, 'Практика', f'G{i}')['formula'] or '').upper(), f'G{i}: введи формулу ПОИСКПОЗ')
                    require(evaluate(book, 'Практика', f'G{i}') == [name for _, name in entries].index(row[2]) + 1, f'G{i}: неверная позиция')
                    if step >= 4:
                        require(evaluate(book, 'Практика', f'H{i}') == mapping.get(row[2]), f'H{i}: неверный ID категории')
                        require(bool(cell_at(book, 'Практика', f'H{i}')['formula']) == (step == 4), f'H{i}: ' + ('нужна формула ИНДЕКС' if step == 4 else 'замени формулу постоянным числом'))
                        if step == 4:
                            require('INDEX(' in (cell_at(book, 'Практика', f'H{i}')['formula'] or '').upper(), f'H{i}: используй ИНДЕКС')
                        if step >= 5:
                            require(cell_at(book, 'Практика', f'H{i}')['type'] == 'float', f'H{i}: вставь число, не текст')
                except (ValueError, TypeError, IndexError) as error:
                    issues.append(f'Строка {i}: {error}')
        if step == 4 and not issues:
            changed = copy.deepcopy(book)
            category = next(name for name in mapping if name != cleaned[0][2])
            cell_at(changed, 'Практика', 'C2')['value'] = category
            try:
                require(evaluate(changed, 'Практика', 'H2') == mapping[category], 'H2: формула не реагирует на изменение категории')
            except (ValueError, TypeError, IndexError):
                issues.append('H2: формула не пересчитывается при изменении категории')
        if step == 6 and not issues:
            expected = {
                'products.csv': (lesson['headers'][:2] + ['category_id'] + lesson['headers'][3:], [row[:2] + [mapping[row[2]]] + row[3:] for row in cleaned]),
                'categories.csv': (['category_id', 'category_name'], entries),
            }
            for filename, (headers, rows) in expected.items():
                target = path.parent / filename
                if not target.is_file() or target.is_symlink() or target.stat().st_size > 100_000:
                    issues.append(f'Сохрани {filename} рядом с рабочей книгой')
                    continue
                actual = list(csv.reader(io.StringIO(target.read_text(encoding='utf-8-sig')), delimiter=';', strict=True))
                require(bool(actual) and actual[0] == headers, f'{filename}: проверь заголовки и разделитель ;')
                normalize = lambda r: tuple(str(int(v)) if isinstance(v, float) and v.is_integer() else str(v) for v in r)
                require(sorted(map(normalize, actual[1:])) == sorted(map(normalize, rows)), f'{filename}: данные отличаются от рабочей книги')
    return {'ready': True, 'passed': not issues, 'issues': issues[:40], 'message': 'Шаг проверен по сохранённой книге' if not issues else 'Исправь ошибки и сохрани книгу перед повторной проверкой'}
