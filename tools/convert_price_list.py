"""Converts the 2023 contract price list (xlsx) into db/seed/price-list-2023.json.

Usage: python3 -I tools/convert_price_list.py <input.xlsx> <output.json>
The sheet has three blocks with different column layouts:
  lab block 1   rows 4-387   price=C  english=E  arabic=F(+G prefix)  serial=I
  lab block 2   rows 395-406 price=C  english=D  arabic=E            serial=F
  radiology     rows 410+    price=B  english=D  arabic=E            serial=F
Rows without a price are section headers or notes. Nothing is guessed: odd rows go to "review".
"""
import json, re, sys
import openpyxl

ARABIC = re.compile(r'[؀-ۿ]')
DIACRITICS = re.compile(r'[ً-ْٰ]')


def clean(value):
    if value is None:
        return None
    text = DIACRITICS.sub('', str(value)).replace(' ', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text or None


def join_arabic(prefix, main):
    if prefix and main:
        return prefix + ('' if prefix.endswith('(') else ' ') + main
    return main or prefix


MODALITIES = (
    ('PET', r'بوزي|PET'), ('NUCLEAR', r'مسح ذري|Scan|Scintig'), ('MRI', r'رنين|MRI|M\.R\.I'), ('CT', r'مقطعي|C\.T|CT |CBCT'),
    ('DOPPLER', r'دوبلكس|دوبلر|Duplex|Doppler'), ('US', r'موجات صوتية|سونار|U\.S|Ultra'), ('ECG', r'رسم قلب|هولتر|ECG|Holter'),
    ('EEG', r'رسم مخ|EEG'), ('EMG', r'رسم اعصاب|رسم أعصاب|EMG|NCV'), ('MAMMO', r'ماموجرام|Mammo'),
    ('DENTAL', r'بانوراما|سفالومترك|سٌفالومٌترك|الفك|Panorama|Ceph'), ('BONE_DENSITY', r'كثافة العظام|DEXA'), ('XRAY', r'اشعة عادية|أشعة عادية|عادٌية|X-?Ray|اشعة على'),
)


def modality_of(text):
    for key, pattern in MODALITIES:
        if re.search(pattern, text, re.IGNORECASE):
            return key
    return 'OTHER'


def main(source, target):
    ws = openpyxl.load_workbook(source, data_only=True).active
    rows = [tuple(clean(c) if isinstance(c, str) else c for c in r) for r in ws.iter_rows(values_only=True)]
    items, review, notes = [], [], []
    section = {'en': None, 'ar': None}
    kind, group = 'lab', None
    for index, r in enumerate(rows, start=1):
        if index < 4:
            continue
        if index == 408:
            kind = 'radiology'
        if kind == 'lab':
            if index < 388 or index > 394 and index < 407:
                block2 = index >= 395
                price, serial = r[2], (r[5] if block2 else r[8])
                english, arabic = (r[3], r[4]) if block2 else (r[4], join_arabic(r[6], r[5]))
                marker = r[1] if block2 else r[0]
            else:
                continue
            is_new = marker in ('جديد',)
            if price is None and serial is None:
                cells = [c for c in r if isinstance(c, str)]
                if cells and not any(re.search(r'\d{3,}|20\d\d|قائمة|سارية|ماعدا|تحاليل جديد|تم اضافتها|الاجمالى|نوع الخدمة|^م$', c) for c in cells):
                    arabic_cells = [c for c in cells if ARABIC.search(c) and not re.fullmatch(r'[\s\d()]+', c)]
                    latin_cells = [c for c in cells if not ARABIC.search(c)]
                    section = {'en': latin_cells[0] if latin_cells else None, 'ar': arabic_cells[0] if arabic_cells else None}
                continue
            if not isinstance(price, (int, float)) or not isinstance(serial, int):
                review.append({'row': index, 'reason': 'missing price or serial', 'cells': [c for c in r if c is not None]})
                continue
            problems = []
            if english and ARABIC.search(english):
                problems.append('arabic text in the english column')
                arabic = join_arabic(arabic, english) if arabic else english
                english = None
            if not english:
                problems.append('no english name')
            if not arabic:
                problems.append('no arabic name')
            item = {'code': f'LAB-{serial:03d}', 'kind': 'lab', 'sectionEn': section['en'], 'sectionAr': section['ar'], 'nameEn': english, 'nameAr': arabic, 'contractPrice': price, 'isNew': is_new, 'sourceRow': index}
            items.append(item)
            if problems:
                review.append({'row': index, 'code': item['code'], 'reason': '; '.join(problems)})
        else:
            price, english, arabic, serial = r[1], r[3], r[4], r[5]
            if price is None and serial is None:
                cells = [c for c in r if isinstance(c, str)]
                if not cells:
                    continue
                text = ' '.join(cells)
                if re.search(r'يضاف|تضاف|ملاحظات|يتحمل|مبلغ|Additional', text):
                    notes.append({'row': index, 'text': text})
                elif not re.search(r'الاجمالى|نوع الخدمة|اسعار خدمات', text):
                    group = arabic or english
                continue
            if not isinstance(price, (int, float)) or not isinstance(serial, int):
                review.append({'row': index, 'reason': 'missing price or serial', 'cells': [c for c in r if c is not None]})
                continue
            name = ' '.join(x for x in (arabic, english) if x)
            items.append({'code': f'RAD-{serial:03d}', 'kind': 'radiology', 'modality': modality_of(name), 'sectionAr': group, 'nameEn': english, 'nameAr': arabic, 'contractPrice': price, 'isNew': False, 'sourceRow': index})
    codes = [i['code'] for i in items]
    duplicates = sorted({c for c in codes if codes.count(c) > 1})
    out = {'source': 'contract price list 2023', 'currency': 'EGP', 'note': 'Contract prices. Private labs such as Al-Borg, Al-Mokhtabar and Alfa charge 30%-50% more according to the sheet header.', 'items': items, 'review': review, 'notes': notes, 'duplicateCodes': duplicates}
    with open(target, 'w', encoding='utf-8') as handle:
        json.dump(out, handle, ensure_ascii=False, indent=1)
    print(len(items), 'items;', len([i for i in items if i['kind'] == 'lab']), 'lab,', len([i for i in items if i['kind'] == 'radiology']), 'radiology;', len(review), 'to review;', len(notes), 'notes;', 'duplicates', duplicates)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
