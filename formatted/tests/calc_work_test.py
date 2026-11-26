from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'build/desktop-tools'))
import calc_lesson as lesson
import calc_work as work


class CalcWorkTests(unittest.TestCase):
    def setUp(self):
        self.data = lesson.load_lesson()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.path = self.folder / 'lesson.fods'

    def sample(self, step=4):
        self.path.write_bytes(lesson.workbook(self.data, step))
        return self.path

    def edit_cell(self, sheet, row, col, change):
        root = ET.fromstring(self.path.read_bytes())
        root.set('xmlns:of', 'urn:oasis:names:tc:opendocument:xmlns:of:1.2')
        table = next(t for t in root.findall('.//table:table', lesson.NS) if t.get(lesson.q('table:name')) == sheet)
        change(table.findall('table:table-row', lesson.NS)[row - 1][col - 1])
        self.path.write_bytes(ET.tostring(root, encoding='utf-8', xml_declaration=True))

    def test_work_is_blank_and_resumed_without_overwriting(self):
        folder, target = work.prepare_work(self.folder, self.data)
        book = work.read_book(target)
        self.assertEqual(work.cell_at(book, 'Практика', 'A2')['value'], '')
        self.assertEqual(work.cell_at(book, 'Исходник', 'A2')['value'], '00101')
        target.write_text('my work', encoding='utf-8')
        self.assertEqual(work.prepare_work(self.folder, self.data), (folder, target))
        self.assertEqual(target.read_text(), 'my work')
        (folder / 'lesson.ods').write_text('saved as ODS')
        self.assertEqual(work.prepare_work(self.folder, self.data)[1].suffix, '.ods')

    def test_blank_work_cannot_pass(self):
        _, target = work.prepare_work(self.folder, self.data)
        for step in range(7):
            self.assertFalse(work.check_work(target, self.data, step)['passed'])

    def test_saved_formulas_recalculated_without_trusting_cache(self):
        self.sample()
        self.edit_cell('Практика', 2, 8, lambda cell: cell.set(lesson.q('office:value'), '-999'))
        result = work.check_work(self.path, self.data, 4)
        self.assertTrue(result['passed'], result['issues'])

    def test_wrong_reference_exact_match_and_hardcoded_formula_rejected(self):
        for formula in ['of:=INDEX([Категории.$A$2:.$A$4];3)', 'of:=INDEX([Категории.$A$2:.$A$4];MATCH([.C2];[Категории.$B$2:.$B$4];1))', 'of:=40', 'of:=HYPERLINK("https://example.com")']:
            self.sample()
            self.edit_cell('Практика', 2, 8, lambda cell: cell.set(lesson.q('table:formula'), formula))
            self.assertFalse(work.check_work(self.path, self.data, 4)['passed'])

    def test_original_and_leading_zeros_preserved(self):
        self.sample()
        self.edit_cell('Практика', 2, 1, lambda cell: cell.set(lesson.q('office:value-type'), 'float'))
        self.assertFalse(work.check_work(self.path, self.data, 4)['passed'])
        self.sample()
        self.edit_cell('Исходник', 2, 1, lambda cell: cell.find(lesson.q('text:p')).__setattr__('text', '00102'))
        self.assertFalse(work.check_work(self.path, self.data, 4)['passed'])

    def test_paste_values_and_final_export(self):
        self.sample(5)
        self.assertTrue(work.check_work(self.path, self.data, 5)['passed'])
        self.assertFalse(work.check_work(self.path, self.data, 6)['passed'])
        ids = dict((name, code) for code, name in self.data['categories'])
        lesson.write_csv(self.folder / 'products.csv', self.data['headers'][:2] + ['category_id'] + self.data['headers'][3:], [r[:2] + [ids[r[2].strip()]] + r[3:] for r in self.data['rows']])
        lesson.write_csv(self.folder / 'categories.csv', ['category_id', 'category_name'], self.data['categories'])
        self.assertTrue(work.check_work(self.path, self.data, 6)['passed'])

    def test_reads_ods_and_rejects_entities(self):
        self.sample()
        ods = self.folder / 'lesson.ods'
        with ZipFile(ods, 'w') as archive:
            archive.writestr('content.xml', self.path.read_bytes())
        self.assertTrue(work.check_work(ods, self.data, 4)['passed'])
        self.path.write_text('<!DOCTYPE x [<!ENTITY bad "x">]><x/>')
        with self.assertRaises(ValueError):
            work.read_book(self.path)

    def test_cycles_and_external_references_rejected(self):
        self.sample()
        for formula in ['of:=INDEX([.H2:.H3];1)', "of:=INDEX(['file:///secret'#$Sheet.A1:.A3];1)"]:
            self.edit_cell('Практика', 2, 8, lambda cell: cell.set(lesson.q('table:formula'), formula))
            self.assertFalse(work.check_work(self.path, self.data, 4)['passed'])


if __name__ == '__main__':
    unittest.main()
