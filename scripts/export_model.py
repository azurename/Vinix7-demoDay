"""Train the notebook's single LR variant without executing the exploratory notebook."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import random
import re
import subprocess
import unicodedata

import numpy as np
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from sklearn import __version__ as sklearn_version
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedGroupKFold

ROOT = Path(__file__).resolve().parents[1]
CLASSES = ['hybrid', 'onsite', 'remote']
DECISION = [1., 1., 1.3]  # Notebook saved output, section 17.1 for Single.

def field(key, label, options, multi=False, max_options=None):
    labels = dict(part.split(':', 1) for part in options.split('|'))
    data = {'key': key, 'label': label, 'multi': multi, 'choices': list(labels), 'choiceLabels': labels}
    if max_options is not None:
        data['max'] = max_options
    return data

def coded(key, labels):
    return field(key, key, '|'.join(f'{n}:{text}' for n, text in enumerate(labels, start=1)))

FEATURES = [
    field('Jalur Karir', 'Jalur karier', 'stay:Tetap di jalur saat ini|expand:Perluas jalur|switch:Pindah jalur|unsure:Belum yakin'),
    field('Bidang Minat', 'Bidang minat', 'biz:Bisnis|creative:Kreatif|ecom:E-commerce|edu:Pendidikan|finance:Keuangan|govt:Pemerintahan|health:Kesehatan|industry:Industri|social:Sosial|tech:Teknologi', True, 3),
    field('Work Values', 'Nilai kerja', 'creative:Kreativitas|flex:Fleksibilitas|growth:Pertumbuhan|impact:Dampak|learning:Pembelajaran|prestige:Prestise|salary:Gaji|stability:Stabilitas|team:Tim|wlb:Keseimbangan kerja dan hidup', True, 3),
    field('Work Style', 'Gaya kerja', 'big:Tim besar|flex:Fleksibel|small:Tim kecil|solo:Mandiri'),
    field('Cognitive Style', 'Gaya kognitif', 'analytical:Analitis|creative:Kreatif|social:Sosial|strategic:Strategis'),
    field('Motivasi', 'Motivasi', 'freedom:Kebebasan|growth:Pengembangan diri|impact:Dampak|money:Uang|prestige:Prestise'),
    field('Ukuran Perusahaan', 'Ukuran perusahaan', 'big:Besar|flex:Fleksibel|mid:Menengah|startup:Startup'),
    field('Kultur Kerja', 'Kultur kerja', 'agile:Lincah|collab:Kolaboratif|formal:Formal|result:Berorientasi hasil'),
    coded('Semester', ['Semester 1-2', 'Semester 3-4', 'Semester 5-6', 'Semester 7-8', 'Sudah Lulus']),
    coded('IPK', ['Di bawah 2.50', '2.50-2.99', '3.00-3.49', '3.50-4.00']),
    coded('Ekspektasi Gaji', ['< Rp5 juta', 'Rp5-7 juta', 'Rp7-10 juta', 'Rp10-15 juta', '> Rp15 juta']),
    coded('Minat Wirausaha', ['Sangat tidak tertarik', 'Tidak tertarik', 'Netral', 'Tertarik', 'Sangat tertarik']),
    coded('Rencana S2/Sertifikasi', ['Tidak berencana', 'Hanya sertifikasi', 'Hanya S2', 'S2 dan sertifikasi']),
    coded('Frekuensi Belajar', ['Jarang / tidak pernah', '1-2 kali per minggu', '3-4 kali per minggu', 'Hampir setiap hari']),
    coded('Kesiapan Interview', ['Sangat belum siap', 'Belum siap', 'Cukup siap', 'Siap', 'Sangat siap']),
    coded('Level Bahasa Inggris', ['Dasar', 'Menengah', 'Mahir', 'Sangat mahir']),
]


def normalized(value):
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return ' '.join(unicodedata.normalize('NFKC', str(value) if value is not None else '').casefold().split())


def records(row):
    features = {}
    for item in FEATURES:
        key = item['key']
        value = normalized(row[key])
        if item['multi']:
            parts = (v.strip().strip('[]()\"\'').strip() for v in re.split(r'[,;|]', value))
            values = sorted({v for v in parts if v})
        else:
            values = [value]
        if not values or any(v not in item['choices'] for v in values):
            raise ValueError(f'Invalid or missing input code: {key}')
        if item.get('max') and len(values) > item['max']:
            raise ValueError(f'Too many selections: {key}')
        features.update({key + ('::' if item['multi'] else '=') + v: 1. for v in values})
    return features


def load_examples(path):
    source = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = source.worksheets[0].values
        headers = next(rows)
        keys = [item['key'] for item in FEATURES]
        columns = {k: headers.index(k) for k in keys}
        target = headers.index('Preferensi Lokasi')
        x, y, groups, seen = [], [], [], {}
        for row in rows:
            label = normalized(row[target])
            if label == 'any' or not label:
                continue
            if label not in CLASSES:
                raise ValueError('Unexpected target class; check workbook schema')
            record = records({k: row[i] for k, i in columns.items()})
            group = tuple(sorted(record))
            groups.append(seen.setdefault(group, len(seen)))
            x.append(record)
            y.append(label)
    finally:
        source.close()
    return x, np.asarray(y), np.asarray(groups)


def synthetic_profiles():
    rng = random.Random(42)
    profiles = []
    for _ in range(128):
        profiles.append({f['key']: ', '.join(rng.sample(f['choices'], rng.randint(1, min(4, f.get('max', 4))))) if f['multi'] else rng.choice(f['choices']) for f in FEATURES})
    return profiles


def make_template(path, synthetic):
    book = Workbook()
    sheet = book.worksheets[0]
    sheet.title = 'Responden'
    sheet.append([field['key'] for field in FEATURES])
    sheet.append([synthetic[field['key']] for field in FEATURES])
    sheet.freeze_panes = 'B2'
    for number, f in enumerate(FEATURES, start=1):
        cell = sheet.cell(1, number)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='102B6E')
        sheet.column_dimensions[get_column_letter(number)].width = max(20, len(f['key']) + 4)
    help_sheet = book.create_sheet('Kode dan panduan')
    help_sheet.append(['Kolom', 'Kode yang diterima', 'Panduan'])
    for f in FEATURES:
        help_sheet.append([f['key'], ', '.join(f['choices']), 'Pisahkan beberapa kode dengan koma.' if f['multi'] else 'Gunakan satu kode.'])
    help_sheet.append(['Catatan', 'Baris contoh dibuat sintetis; hapus sebelum mengisi data.', 'Kode angka adalah kode survei.'])
    help_sheet.column_dimensions['A'].width = 30
    help_sheet.column_dimensions['B'].width = 95
    help_sheet.column_dimensions['C'].width = 40
    book.save(path)


def main(source, output):
    x, y, groups = load_examples(source)
    dev, holdout = next(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(x, y, groups))
    assert not set(groups[dev]) & set(groups[holdout]), 'Profile group leak'
    vectorizer = DictVectorizer()
    train = vectorizer.fit_transform([x[i] for i in dev])
    y_dev = y[dev]
    counts = Counter(y_dev)
    weights = np.asarray([(len(dev) / (len(CLASSES) * counts[c])) ** 0.5 for c in y_dev])
    weights /= weights.mean()
    clf = LogisticRegression(C=.3, max_iter=1600, random_state=42).fit(train, y_dev, sample_weight=weights)
    order = [list(clf.classes_).index(k) for k in CLASSES]
    test_prob = clf.predict_proba(vectorizer.transform([x[i] for i in holdout]))[:, order]
    labels = np.asarray(CLASSES)[(test_prob * DECISION).argmax(1)]
    allowed = {f['key'] + ('::' if f['multi'] else '=') + v for f in FEATURES for v in f['choices']}
    terms = list(vectorizer.get_feature_names_out())
    # Fail closed: a retrain may not silently expose unreviewed input values or leave dead controls.
    if set(terms) != allowed:
        raise ValueError('Training vocabulary does not match reviewed public input codes')
    artifact = {'version': 1, 'classes': CLASSES, 'decisionWeights': DECISION, 'features': FEATURES,
                'bias': clf.intercept_[order].tolist(), 'terms': dict(zip(terms, clf.coef_[order].T.tolist()))}
    if not np.isfinite(clf.coef_).all() or not np.isfinite(clf.intercept_).all():
        raise ValueError('Model coefficients are not finite')
    profiles = synthetic_profiles()
    expected = clf.predict_proba(vectorizer.transform([records(p) for p in profiles]))[:, order]
    predictions = subprocess.run(['node', str(ROOT/'tests'/'predict-bridge.cjs')], check=True,
                                 input=json.dumps({'model': artifact, 'profiles': profiles}), text=True, capture_output=True)
    actual = json.loads(predictions.stdout)
    max_delta = float(np.max(np.abs(expected - [row['scores'] for row in actual])))
    assert max_delta < 1e-10, max_delta
    assert [row['label'] for row in actual] == np.asarray(CLASSES)[(expected * DECISION).argmax(1)].tolist()
    (output/'model-data.js').write_text('// Generated by scripts/export_model.py. No response rows.\n' +
        'globalThis.VINIX7_MODEL = ' + json.dumps(artifact,ensure_ascii=False,allow_nan=False,separators=(',',':')) + '\n', encoding='utf-8')
    make_template(output/'templat-vinix7.xlsx', profiles[0])
    print(json.dumps({'scikit_learn': sklearn_version, 'workbook_sha256': sha256(source.read_bytes()).hexdigest(),
        'development_n': len(dev), 'reused_holdout_n': len(holdout), 'holdout_class_counts': dict(Counter(y[holdout])),
        'macro_f1': f1_score(y[holdout],labels,average='macro'),
        'recall_remote': recall_score(y[holdout], labels, labels=['remote'],average='macro',zero_division=0),
        'precision_remote': precision_score(y[holdout], labels, labels=['remote'],average='macro',zero_division=0),
        'terms': len(terms), 'parity_profiles': len(profiles), 'max_score_delta': max_delta}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT)
    args = parser.parse_args()
    main(args.workbook, args.output)
