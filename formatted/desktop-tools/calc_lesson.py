import argparse
import csv
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'config': 'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
    'number': 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def q(name):
    prefix, local = name.split(':')
    return '{' + NS[prefix] + '}' + local


def element(parent, name, attrs=None, text=None):
    node = ET.SubElement(parent, q(name), {q(k): str(v) for k, v in (attrs or {}).items()})
    node.text = text
    return node


def find_calc():
    candidates = [] if sys.platform == 'darwin' else [shutil.which('libreoffice'), shutil.which('soffice')]
    candidates += [
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        str(Path.home() / 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
        '/opt/homebrew/bin/soffice',
        '/usr/local/bin/soffice',
    ]
    if sys.platform == 'win32':
        for base in ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']:
            if os.environ.get(base):
                candidates.append(str(Path(os.environ[base]) / 'LibreOffice/program/soffice.exe'))
    return next((str(Path(p).resolve()) for p in candidates if p and Path(p).is_file()), None)


def load_lesson():
    return json.loads(Path(__file__).with_name('calc-lesson.json').read_text(encoding='utf-8'))


def write_csv(path, headers, rows):
    with path.open('x', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file, delimiter=';', lineterminator='\r\n')
        writer.writerow(headers)
        writer.writerows(rows)


def workbook(lesson, step):
    root = ET.Element(q('office:document'), {
        q('office:version'): '1.3',
        q('office:mimetype'): 'application/vnd.oasis.opendocument.spreadsheet',
        'xmlns:of': 'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
    })
    styles = element(root, 'office:automatic-styles')
    text_format = element(styles, 'number:text-style', {'style:name': 'identifier'})
    element(text_format, 'number:text-content')
    for name, parent in [('code', 'body'), ('code-focus', 'focus')]:
        style = element(styles, 'style:style', {'style:name': name, 'style:family': 'table-cell', 'style:parent-style-name': parent, 'style:data-style-name': 'identifier'})
        element(style, 'style:paragraph-properties', {'fo:text-align': 'start'})
    date_format = element(styles, 'number:date-style', {'style:name': 'iso-date'})
    element(date_format, 'number:year', {'number:style': 'long'})
    element(date_format, 'number:text', text='-')
    element(date_format, 'number:month', {'number:style': 'long'})
    element(date_format, 'number:text', text='-')
    element(date_format, 'number:day', {'number:style': 'long'})
    date_style = element(styles, 'style:style', {'style:name': 'date', 'style:family': 'table-cell', 'style:parent-style-name': 'body', 'style:data-style-name': 'iso-date'})
    element(date_style, 'style:table-cell-properties', {'fo:padding': '0.1cm'})
    for name, width in [('column', '4cm'), ('guide', '20cm')]:
        style = element(styles, 'style:style', {'style:name': name, 'style:family': 'table-column'})
        element(style, 'style:table-column-properties', {'style:column-width': width})
    for name, fill, bold in [('body', '#FFFFFF', False), ('head', '#EAF3FF', True), ('focus', '#FFF0BE', False)]:
        style = element(styles, 'style:style', {'style:name': name, 'style:family': 'table-cell'})
        element(style, 'style:table-cell-properties', {'fo:background-color': fill, 'fo:padding': '0.1cm', 'fo:wrap-option': 'wrap'})
        element(style, 'style:text-properties', {'fo:font-family': 'Arial', 'fo:font-size': '11pt', 'fo:font-weight': 'bold' if bold else 'normal'})
    settings = element(root, 'office:settings')
    root.remove(settings)
    root.insert(0, settings)
    config = element(settings, 'config:config-item-set', {'config:name': 'ooo:view-settings'})
    views = element(config, 'config:config-item-map-indexed', {'config:name': 'Views'})
    view = element(views, 'config:config-item-map-entry')
    active_sheet = 'Исходник' if step == 0 else 'Категории' if step == 2 else 'Товары' if step == 6 else 'Практика'
    element(view, 'config:config-item', {'config:name': 'ActiveTable', 'config:type': 'string'}, active_sheet)
    body = element(root, 'office:body')
    book = element(body, 'office:spreadsheet')
    instruction = lesson['steps'][step]
    guide = [[f"Шаг {step + 1}: {instruction['title']}"], [instruction['target']]]
    guide += [[text] for text in instruction['instructions']]
    if instruction.get('formula'):
        guide.append([instruction['formula']])
    guide += [[instruction['why']], ['Жёлтым выделена ячейка текущего шага. Формулы можно менять в учебной копии'], [lesson['source']]]

    def sheet(name, headers, rows, formulas=None, focus=None):
        table = element(book, 'table:table', {'table:name': name})
        element(table, 'table:table-column', {'table:number-columns-repeated': len(headers), 'table:style-name': 'guide' if name == 'Подсказка' else 'column'})
        for index, values in enumerate([headers] + rows):
            row = element(table, 'table:table-row')
            for col, value in enumerate(values):
                address = f'{chr(65 + col)}{index + 1}'
                attrs = {'table:style-name': 'head' if index == 0 else 'focus' if address == focus else 'body'}
                formula = (formulas or {}).get(address)
                if formula:
                    attrs.update({'table:formula': 'of:=' + formula, 'office:value-type': 'float', 'office:value': value})
                elif isinstance(value, (int, float)):
                    attrs.update({'office:value-type': 'float', 'office:value': value})
                elif index and headers[col] == 'received_on' and name != 'Исходник':
                    attrs.update({'office:value-type': 'date', 'office:date-value': value, 'table:style-name': 'date'})
                else:
                    attrs['office:value-type'] = 'string'
                    if index and headers[col] == 'product_code':
                        attrs['table:style-name'] = 'code-focus' if address == focus else 'code'
                cell = element(row, 'table:table-cell', attrs)
                paragraph = element(cell, 'text:p')
                content = str(value)
                if content.startswith(' '):
                    space = element(paragraph, 'text:s')
                    space.tail = content.strip(' ')
                else:
                    paragraph.text = content.rstrip(' ')
                if content.endswith(' '):
                    element(paragraph, 'text:s')
    categories = lesson['categories']
    cleaned = [row[:2] + [row[2].strip()] + row[3:] for row in lesson['rows']]
    positions = {name: i + 1 for i, (_, name) in enumerate(categories)}
    ids = dict((name, code) for code, name in categories)
    formulas = {}
    work_rows = [row[:] for row in cleaned]
    headers = lesson['headers'][:]
    if step >= 3:
        headers.append('Позиция поиска')
        for i, row in enumerate(work_rows, 2):
            row.append(positions[row[2]])
            formulas[f'G{i}'] = f'MATCH([.C{i}];[Категории.$B$2:.$B$4];0)'
    if step >= 4:
        headers.append('category_id')
        for i, row in enumerate(work_rows, 2):
            row.append(ids[row[2]])
            if step == 4:
                formulas[f'H{i}'] = f'INDEX([Категории.$A$2:.$A$4];MATCH([.C{i}];[Категории.$B$2:.$B$4];0))'
    if step == 6:
        headers = lesson['headers'][:2] + ['category_id'] + lesson['headers'][3:]
        work_rows = [row[:2] + [ids[row[2]]] + row[3:6] for row in cleaned]
        formulas = {}
    if step == 2:
        sheet('Категории', ['category_id', 'category_name'], categories, focus='B2')
    if step:
        sheet('Товары' if step == 6 else 'Практика', headers, work_rows, formulas, instruction['focus'])
    if step > 2:
        sheet('Категории', ['category_id', 'category_name'], categories)
    sheet('Исходник', lesson['headers'], lesson['rows'], focus='A2' if step == 0 else None)
    sheet('Подсказка', ['Как выполнить шаг'], guide)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def prepare(directory, lesson, step):
    directory.mkdir(parents=True, exist_ok=True)
    folder = Path(tempfile.mkdtemp(prefix=f'step-{step + 1}-', dir=directory))
    write_csv(folder / 'source.csv', lesson['headers'], lesson['rows'])
    target = folder / 'lesson.fods'
    target.write_bytes(workbook(lesson, step))
    return folder, target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--step', type=int, choices=range(7))
    parser.add_argument('--output', type=Path)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--work', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    calc = find_calc()
    if args.status:
        result = {'ready': bool(calc), 'message': 'Python и LibreOffice Calc доступны' if calc else 'LibreOffice Calc не найден. Установи его с libreoffice.org; урок внутри приложения доступен без него'}
    elif args.step is None or args.output is None:
        parser.error('Нужны --step и --output')
    elif args.check:
        from calc_work import check_work
        folder = args.output.resolve() / 'work'
        target = next((folder / name for name in ['lesson.ods', 'lesson.fods'] if (folder / name).is_file()), None)
        result = check_work(target, load_lesson(), args.step) if target else {'ready': False, 'message': 'Сначала открой рабочую книгу и сохрани свою работу'}
    elif not calc and not args.prepare_only:
        result = {'ready': False, 'message': 'LibreOffice Calc не найден. Урок можно пройти внутри приложения'}
    else:
        if args.work:
            from calc_work import prepare_work
            folder, target = prepare_work(args.output.resolve(), load_lesson())
        else:
            folder, target = prepare(args.output.resolve(), load_lesson(), args.step)
        if not args.prepare_only:
            profile = args.output.resolve() / 'calc-profile'
            subprocess.Popen([calc, '-env:UserInstallation=' + profile.as_uri(), '--norestore', '--calc', str(target)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        result = {'ready': bool(calc), 'directory': str(folder), 'file': str(target), 'message': 'Учебная копия подготовлена' if args.prepare_only else 'Учебная копия передана Calc. Пояснение на листе «Подсказка», нужная ячейка выделена жёлтым. Изменения предыдущих шагов не переносятся'}
        if args.work:
            result['message'] = 'Открыта твоя рабочая книга. Изменения сохраняются между шагами. Перед проверкой нажми Ctrl+S в Calc'
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        print(json.dumps({'ready': False, 'message': 'Не удалось открыть учебную копию: ' + str(error)}, ensure_ascii=False))
