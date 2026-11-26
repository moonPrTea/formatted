import argparse
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'build/desktop-tools'))
import calc_lesson
import calc_work

parser = argparse.ArgumentParser()
parser.add_argument('--soffice', required=True)
args = parser.parse_args()
folder = Path(tempfile.mkdtemp(prefix='formatted-work-native-'))
lesson = calc_lesson.load_lesson()
_, blank = calc_work.prepare_work(folder, lesson)
solved = folder / 'solved.fods'
solved.write_bytes(calc_lesson.workbook(lesson, 4))
output = folder / 'converted'
output.mkdir()
for format_name in ['ods', 'xlsx']:
    subprocess.run([args.soffice, '-env:UserInstallation=' + (folder / 'profile').as_uri(), '--headless', '--convert-to', format_name, '--outdir', str(output), str(blank), str(solved)], check=True, timeout=60)
assert not calc_work.check_work(output / 'lesson.ods', lesson, 0)['passed']
result = calc_work.check_work(output / 'solved.ods', lesson, 4)
assert result['passed'], result
book = calc_work.read_book(output / 'solved.ods')
assert [calc_work.cell_at(book, 'Практика', f'H{i}')['value'] for i in range(2, 6)] == [40, 25, 40, 10]
assert calc_work.cell_at(book, 'Практика', 'A2')['value'] == '00101'
print(f'Native Calc read/write and saved ODS checks passed: {folder}')
