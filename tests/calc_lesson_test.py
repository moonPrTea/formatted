import contextlib
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('calc_lesson', ROOT / 'build/desktop-tools/calc_lesson.py')
lesson_script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lesson_script)
NS = lesson_script.NS


class CalcLessonTests(unittest.TestCase):
    def setUp(self):
        self.lesson = lesson_script.load_lesson()

    def sheets(self, step):
        root = ET.fromstring(lesson_script.workbook(self.lesson, step))
        return {table.get(lesson_script.q('table:name')): table for table in root.findall('.//table:table', NS)}

    def cells(self, table):
        return [row.findall('table:table-cell', NS) for row in table.findall('table:table-row', NS)]

    def test_seven_steps_with_source_preserved(self):
        for step in range(7):
            sheets = self.sheets(step)
            self.assertIn('Исходник', sheets)
            self.assertIn('Подсказка', sheets)
            source = self.cells(sheets['Исходник'])
            self.assertEqual(source[1][0].find('text:p', NS).text, '00101')
            self.assertEqual(source[1][0].get(lesson_script.q('office:value-type')), 'string')
            self.assertEqual(len(source[1][2].findall('.//text:s', NS)), 2)
            self.assertEqual(len(source), 5)

    def test_match_position_is_not_the_key_and_only_allowed_formulas_exist(self):
        cells = self.cells(self.sheets(4)['Практика'])
        positions = [3, 2, 3, 1]
        keys = [40, 25, 40, 10]
        for i, row in enumerate(cells[1:], 2):
            self.assertEqual(row[6].get(lesson_script.q('office:value')), str(positions[i - 2]))
            self.assertEqual(row[7].get(lesson_script.q('office:value')), str(keys[i - 2]))
            self.assertEqual(row[6].get(lesson_script.q('table:formula')), f'of:=MATCH([.C{i}];[Категории.$B$2:.$B$4];0)')
            self.assertEqual(row[7].get(lesson_script.q('table:formula')), f'of:=INDEX([Категории.$A$2:.$A$4];MATCH([.C{i}];[Категории.$B$2:.$B$4];0))')
        categories = self.cells(self.sheets(4)['Категории'])
        for i, row in enumerate(cells[1:]):
            category = row[2].find('text:p', NS).text
            index = next(n for n, entry in enumerate(categories[1:]) if entry[1].find('text:p', NS).text == category)
            self.assertEqual(index + 1, positions[i])
            self.assertEqual(int(categories[index + 1][0].get(lesson_script.q('office:value'))), keys[i])

    def test_paste_values_removes_key_formulas_and_export_has_no_helper_columns(self):
        values = self.cells(self.sheets(5)['Практика'])
        for row in values[1:]:
            self.assertIsNone(row[7].get(lesson_script.q('table:formula')))
            self.assertEqual(row[7].get(lesson_script.q('office:value-type')), 'float')
        exported = self.cells(self.sheets(6)['Товары'])
        headers = [cell.find('text:p', NS).text for cell in exported[0]]
        self.assertIn('category_id', headers)
        self.assertNotIn('category', headers)
        self.assertNotIn('Позиция поиска', headers)
        self.assertEqual(exported[1][4].get(lesson_script.q('office:date-value')), '2026-01-12')

    def test_each_launch_creates_independent_files_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            first, target = lesson_script.prepare(Path(directory), self.lesson, 4)
            target.write_text('User edit', encoding='utf-8')
            second, _ = lesson_script.prepare(Path(directory), self.lesson, 4)
            self.assertNotEqual(first, second)
            self.assertEqual(target.read_text(encoding='utf-8'), 'User edit')
            with (second / 'source.csv').open(encoding='utf-8-sig', newline='') as file:
                rows = list(csv.reader(file, delimiter=';'))
            self.assertEqual(rows[0], self.lesson['headers'])
            self.assertEqual(rows[1:], self.lesson['rows'])

    def test_missing_calc_is_reported_without_creating_files(self):
        with patch.object(lesson_script, 'find_calc', return_value=None), patch.object(lesson_script.sys, 'argv', ['lesson', '--status']):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                lesson_script.main()
            self.assertFalse(json.loads(output.getvalue())['ready'])

    def test_launcher_uses_argument_list_and_isolated_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(lesson_script, 'find_calc', return_value='/fake/soffice'), patch.object(lesson_script.subprocess, 'Popen') as process, patch.object(lesson_script.sys, 'argv', ['lesson', '--step', '4', '--output', directory]):
                with contextlib.redirect_stdout(io.StringIO()):
                    lesson_script.main()
                args = process.call_args.args[0]
                self.assertEqual(args[0], '/fake/soffice')
                self.assertTrue(args[1].startswith('-env:UserInstallation=file:'))
                self.assertIn('--calc', args)
                self.assertTrue(args[-1].endswith('lesson.fods'))
                self.assertNotIn('shell', process.call_args.kwargs)

    def test_windows_calc_path_with_spaces(self):
        with patch.object(lesson_script.sys, 'platform', 'win32'), patch.dict(lesson_script.os.environ, {'PROGRAMFILES': 'C:/Program Files'}), patch.object(lesson_script.shutil, 'which', return_value=None), patch.object(Path, 'is_file', lambda path: path.as_posix().endswith('LibreOffice/program/soffice.exe')), patch.object(Path, 'resolve', lambda path: path):
            self.assertEqual(Path(lesson_script.find_calc()).as_posix(), 'C:/Program Files/LibreOffice/program/soffice.exe')


if __name__ == '__main__':
    unittest.main()
