import argparse
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


parser = argparse.ArgumentParser()
parser.add_argument('--soffice', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('lesson', root / 'build/desktop-tools/calc_lesson.py')
lesson = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lesson)
directory = Path(tempfile.mkdtemp(prefix='formatted-calc-native-'))
sources = []
for step in range(7):
    file = directory / f'step-{step + 1}.fods'
    file.write_bytes(lesson.workbook(lesson.load_lesson(), step))
    sources.append(str(file))
changed = ET.fromstring(lesson.workbook(lesson.load_lesson(), 4))
table = changed.find('.//table:table', lesson.NS)
row = table.findall('table:table-row', lesson.NS)[1]
cells = row.findall('table:table-cell', lesson.NS)
cells[2].find('text:p', lesson.NS).text = 'Домашняя'
for cell in changed.findall('.//table:table-cell', lesson.NS):
    if cell.get(lesson.q('table:formula')):
        cell.attrib.pop(lesson.q('office:value'), None)
        cell.attrib.pop(lesson.q('office:value-type'), None)
        cell.find('text:p', lesson.NS).text = None
edited = directory / 'changed.fods'
ET.ElementTree(changed).write(edited, encoding='utf-8', xml_declaration=True)
# ElementTree drops namespace declarations used only inside attribute values.
content = edited.read_text(encoding='utf-8').replace('<office:document ', '<office:document xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" ', 1)
edited.write_text(content, encoding='utf-8')
sources.append(str(edited))
output = directory / 'converted'
output.mkdir()
subprocess.run([args.soffice, '-env:UserInstallation=' + (directory / 'profile').as_uri(), '--headless', '--convert-to', 'xlsx', '--outdir', str(output), *sources], check=True, timeout=90)
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for name, expected in [('step-5', [40, 25, 40, 10]), ('changed', [10, 25, 40, 10])]:
    with zipfile.ZipFile(output / (name + '.xlsx')) as archive:
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    for i, value in enumerate(expected, 2):
        cell = sheet.find(f'.//s:c[@r="H{i}"]', ns)
        assert cell.get('t') != 'e', ET.tostring(cell)
        assert float(cell.find('s:v', ns).text) == value
for step in range(1, 8):
    with zipfile.ZipFile(output / f'step-{step}.xlsx') as archive:
        strings = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        first = book.find('s:sheets/s:sheet', ns).get('name')
        assert first == ('Исходник' if step == 1 else 'Категории' if step == 3 else 'Товары' if step == 7 else 'Практика')
        for path in archive.namelist():
            if path.startswith('xl/worksheets/sheet') and path.endswith('.xml'):
                sheet = ET.fromstring(archive.read(path))
                assert not sheet.findall('.//s:c[@t="e"]', ns), (step, path)
                header = sheet.find('.//s:c[@r="A1"]', ns)
                if header is not None and header.get('t') == 's' and ''.join(strings[int(header.find('s:v', ns).text)].itertext()) == 'product_code':
                    code = sheet.find('.//s:c[@r="A2"]', ns)
                    assert code.get('t') == 's'
                    assert ''.join(strings[int(code.find('s:v', ns).text)].itertext()) == '00101'
print(f'Native Calc checked seven stages and recalculated changed input: {directory}')
