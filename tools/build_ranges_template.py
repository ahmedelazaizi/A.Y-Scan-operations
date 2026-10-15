"""Builds the PROPOSED reference-range template (json for import + xlsx for the consultant).

Every row is status "proposed": adult ranges taken from commonly published sources. They depend on the analyser and
reagent, and become effective only after the lab consultant approves them inside the system.
Usage: python3 -I tools/build_ranges_template.py db/seed/price-list-2023.json db/seed/reference-ranges-proposed.json docs/templates/reference-ranges-template.xlsx
"""
import json, sys
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

SERUM, EDTA, CITRATE, FLUORIDE, URINE, STOOL = 'سيروم', 'دم كامل', 'بلازما سترات', 'دم كامل / سيروم', 'بول', 'براز'
GEL, LAV, BLUE, GREY, CONT = 'أنبوب جل (أصفر)', 'أنبوب EDTA (أرجواني)', 'أنبوب سترات (أزرق)', 'أنبوب فلورايد (رمادي) أو جل', 'عبوة عينة'

# (service code, [ (param code, EN, AR, type, unit, sex, low, high, critLow, critHigh, normal text, note) ], specimen, tube)
N, Q = 'numeric', 'qualitative'
A = 'all'
DATA = [
 ('LAB-001', [
  ('WBC', 'WBC', 'كرات الدم البيضاء', N, 'x10^3/µL', A, 4.0, 11.0, 2.0, 30.0, None, None),
  ('RBC', 'RBC', 'كرات الدم الحمراء', N, 'x10^6/µL', 'male', 4.5, 5.9, None, None, None, None),
  ('RBC', 'RBC', 'كرات الدم الحمراء', N, 'x10^6/µL', 'female', 4.1, 5.1, None, None, None, None),
  ('HB', 'Hemoglobin', 'الهيموجلوبين', N, 'g/dL', 'male', 13.5, 17.5, 7.0, 20.0, None, None),
  ('HB', 'Hemoglobin', 'الهيموجلوبين', N, 'g/dL', 'female', 12.0, 15.5, 7.0, 20.0, None, None),
  ('HCT', 'Hematocrit', 'الهيماتوكريت', N, '%', 'male', 41, 53, None, None, None, None),
  ('HCT', 'Hematocrit', 'الهيماتوكريت', N, '%', 'female', 36, 46, None, None, None, None),
  ('MCV', 'MCV', 'متوسط حجم الكرية', N, 'fL', A, 80, 100, None, None, None, None),
  ('MCH', 'MCH', 'متوسط هيموجلوبين الكرية', N, 'pg', A, 27, 33, None, None, None, None),
  ('MCHC', 'MCHC', 'تركيز هيموجلوبين الكرية', N, 'g/dL', A, 32, 36, None, None, None, None),
  ('PLT', 'Platelets', 'الصفائح الدموية', N, 'x10^3/µL', A, 150, 450, 20, 1000, None, None),
  ('NEUT', 'Neutrophils', 'العدلات', N, '%', A, 40, 75, None, None, None, None),
  ('LYMPH', 'Lymphocytes', 'الخلايا الليمفاوية', N, '%', A, 20, 45, None, None, None, None),
  ('MONO', 'Monocytes', 'الخلايا الأحادية', N, '%', A, 2, 10, None, None, None, None),
  ('EOS', 'Eosinophils', 'الحمضات', N, '%', A, 1, 6, None, None, None, None),
  ('BASO', 'Basophils', 'القاعدات', N, '%', A, 0, 1, None, None, None, None)], EDTA, LAV),
 ('LAB-004', [
  ('HB', 'Hemoglobin', 'الهيموجلوبين', N, 'g/dL', 'male', 13.5, 17.5, 7.0, 20.0, None, None),
  ('HB', 'Hemoglobin', 'الهيموجلوبين', N, 'g/dL', 'female', 12.0, 15.5, 7.0, 20.0, None, None),
  ('HCT', 'Hematocrit', 'الهيماتوكريت', N, '%', 'male', 41, 53, None, None, None, None),
  ('HCT', 'Hematocrit', 'الهيماتوكريت', N, '%', 'female', 36, 46, None, None, None, None)], EDTA, LAV),
 ('LAB-008', [('PLT', 'Platelets', 'الصفائح الدموية', N, 'x10^3/µL', A, 150, 450, 20, 1000, None, None)], EDTA, LAV),
 ('LAB-009', [
  ('ESR1', 'ESR (1st hour)', 'سرعة الترسيب (ساعة أولى)', N, 'mm/h', 'male', 0, 15, None, None, None, 'للبالغين دون 50 سنة'),
  ('ESR1', 'ESR (1st hour)', 'سرعة الترسيب (ساعة أولى)', N, 'mm/h', 'female', 0, 20, None, None, None, 'للبالغات دون 50 سنة')], EDTA, LAV),
 ('LAB-011', [
  ('ABO', 'ABO group', 'فصيلة الدم', Q, None, A, None, None, None, None, 'A / B / AB / O', None),
  ('RH', 'Rh factor', 'عامل ريزوس', Q, None, A, None, None, None, None, 'Positive / Negative', None)], EDTA, LAV),
 ('LAB-016', [('PTT', 'PTT', 'زمن الثرومبوبلاستين الجزئي', N, 'sec', A, 25, 35, None, 70, None, None)], 'بلازما سترات', BLUE),
 ('LAB-017', [
  ('PT', 'Prothrombin time', 'زمن البروثرومبين', N, 'sec', A, 11.0, 13.5, None, None, None, None),
  ('PTCONC', 'PT concentration', 'تركيز البروثرومبين', N, '%', A, 70, 100, None, None, None, None),
  ('INR', 'INR', 'INR', N, 'ratio', A, 0.8, 1.1, None, 5.0, None, 'المدى العلاجي لمرضى الوارفارين يحدده الطبيب')], 'بلازما سترات', BLUE),
 ('LAB-005', [('TIBC', 'TIBC', 'السعة الكلية لربط الحديد', N, 'µg/dL', A, 250, 450, None, None, None, None)], SERUM, GEL),
 ('LAB-006', [('FE', 'Iron', 'الحديد', N, 'µg/dL', A, 60, 170, None, None, None, None)], SERUM, GEL),
 ('LAB-007', [
  ('FERR', 'Ferritin', 'الفيريتين', N, 'ng/mL', 'male', 24, 336, None, None, None, None),
  ('FERR', 'Ferritin', 'الفيريتين', N, 'ng/mL', 'female', 11, 307, None, None, None, None)], SERUM, GEL),
 ('LAB-029', [('GLU', 'Glucose (fasting)', 'سكر صائم', N, 'mg/dL', A, 70, 99, 40, 450, None, 'صيام 8 ساعات على الأقل')], 'دم كامل / سيروم', GREY),
 ('LAB-030', [('GLU', 'Glucose (2h PP)', 'سكر بعد الأكل بساعتين', N, 'mg/dL', A, 70, 140, 40, 450, None, None)], 'دم كامل / سيروم', GREY),
 ('LAB-031', [('GLU', 'Glucose (random)', 'سكر عشوائي', N, 'mg/dL', A, 70, 140, 40, 450, None, None)], 'دم كامل / سيروم', GREY),
 ('LAB-035', [('HBA1C', 'HbA1c', 'الهيموجلوبين السكري', N, '%', A, 4.0, 5.6, None, None, None, 'ما قبل السكري 5.7–6.4 / السكري 6.5 فأكثر')], EDTA, LAV),
 ('LAB-036', [('UREA', 'Urea', 'اليوريا', N, 'mg/dL', A, 15, 45, None, None, None, 'يختلف حسب الجهاز (BUN = اليوريا ÷ 2.14)')], SERUM, GEL),
 ('LAB-037', [
  ('CREA', 'Creatinine', 'الكرياتينين', N, 'mg/dL', 'male', 0.7, 1.3, None, None, None, None),
  ('CREA', 'Creatinine', 'الكرياتينين', N, 'mg/dL', 'female', 0.6, 1.1, None, None, None, None)], SERUM, GEL),
 ('LAB-038', [
  ('UA', 'Uric acid', 'حمض اليوريك', N, 'mg/dL', 'male', 3.4, 7.0, None, None, None, None),
  ('UA', 'Uric acid', 'حمض اليوريك', N, 'mg/dL', 'female', 2.4, 6.0, None, None, None, None)], SERUM, GEL),
 ('LAB-042', [('CA', 'Calcium (total)', 'الكالسيوم الكلي', N, 'mg/dL', A, 8.6, 10.2, 6.5, 13.0, None, None)], SERUM, GEL),
 ('LAB-044', [('PHOS', 'Phosphorus', 'الفوسفور', N, 'mg/dL', A, 2.5, 4.5, None, None, None, None)], SERUM, GEL),
 ('LAB-047', [('MG', 'Magnesium', 'الماغنسيوم', N, 'mg/dL', A, 1.7, 2.2, None, None, None, None)], SERUM, GEL),
 ('LAB-048', [('HCO3', 'Bicarbonate', 'البيكربونات', N, 'mmol/L', A, 22, 29, None, None, None, None)], SERUM, GEL),
 ('LAB-049', [('CL', 'Chloride', 'الكلوريد', N, 'mmol/L', A, 98, 107, None, None, None, None)], SERUM, GEL),
 ('LAB-053', [('NA', 'Sodium', 'الصوديوم', N, 'mmol/L', A, 135, 145, 120, 160, None, None)], SERUM, GEL),
 ('LAB-054', [('K', 'Potassium', 'البوتاسيوم', N, 'mmol/L', A, 3.5, 5.1, 2.8, 6.2, None, 'تجنب التحلل الدموي للعينة')], SERUM, GEL),
 ('LAB-055', [
  ('TBIL', 'Bilirubin (total)', 'البيلروبين الكلي', N, 'mg/dL', A, 0.3, 1.2, None, None, None, None),
  ('DBIL', 'Bilirubin (direct)', 'البيلروبين المباشر', N, 'mg/dL', A, 0.0, 0.3, None, None, None, None)], SERUM, GEL),
 ('LAB-056', [('ALP', 'Alkaline phosphatase', 'الفوسفاتيز القلوي', N, 'U/L', A, 44, 147, None, None, None, 'يرتفع طبيعيًا في الأطفال والحمل')], SERUM, GEL),
 ('LAB-057', [
  ('AST', 'AST (SGOT)', 'إنزيم AST', N, 'U/L', 'male', 8, 48, None, None, None, None),
  ('AST', 'AST (SGOT)', 'إنزيم AST', N, 'U/L', 'female', 8, 43, None, None, None, None)], SERUM, GEL),
 ('LAB-058', [
  ('ALT', 'ALT (SGPT)', 'إنزيم ALT', N, 'U/L', 'male', 7, 55, None, None, None, None),
  ('ALT', 'ALT (SGPT)', 'إنزيم ALT', N, 'U/L', 'female', 7, 45, None, None, None, None)], SERUM, GEL),
 ('LAB-059', [
  ('GGT', 'GGT', 'إنزيم GGT', N, 'U/L', 'male', 8, 61, None, None, None, None),
  ('GGT', 'GGT', 'إنزيم GGT', N, 'U/L', 'female', 5, 36, None, None, None, None)], SERUM, GEL),
 ('LAB-060', [('TP', 'Total protein', 'البروتين الكلي', N, 'g/dL', A, 6.0, 8.3, None, None, None, None)], SERUM, GEL),
 ('LAB-061', [('ALB', 'Albumin', 'الألبومين', N, 'g/dL', A, 3.5, 5.0, None, None, None, None)], SERUM, GEL),
 ('LAB-063', [
  ('CHOL', 'Cholesterol (total)', 'الكوليسترول الكلي', N, 'mg/dL', A, None, 200, None, None, None, 'القيمة المرغوبة أقل من 200'),
  ('TG', 'Triglycerides', 'الدهون الثلاثية', N, 'mg/dL', A, None, 150, None, None, None, 'القيمة المرغوبة أقل من 150 (صيام 12 ساعة)'),
  ('HDL', 'HDL cholesterol', 'الكوليسترول عالي الكثافة', N, 'mg/dL', 'male', 40, None, None, None, None, None),
  ('HDL', 'HDL cholesterol', 'الكوليسترول عالي الكثافة', N, 'mg/dL', 'female', 50, None, None, None, None, None),
  ('LDL', 'LDL cholesterol', 'الكوليسترول منخفض الكثافة', N, 'mg/dL', A, None, 100, None, None, None, 'الهدف يختلف حسب عوامل الخطورة')], SERUM, GEL),
 ('LAB-064', [('CHOL', 'Cholesterol (total)', 'الكوليسترول الكلي', N, 'mg/dL', A, None, 200, None, None, None, 'القيمة المرغوبة أقل من 200')], SERUM, GEL),
 ('LAB-067', [('TG', 'Triglycerides', 'الدهون الثلاثية', N, 'mg/dL', A, None, 150, None, None, None, 'القيمة المرغوبة أقل من 150')], SERUM, GEL),
 ('LAB-070', [('LDH', 'LDH', 'إنزيم LDH', N, 'U/L', A, 140, 280, None, None, None, None)], SERUM, GEL),
 ('LAB-071', [
  ('CK', 'CPK (total)', 'إنزيم CPK', N, 'U/L', 'male', 39, 308, None, None, None, None),
  ('CK', 'CPK (total)', 'إنزيم CPK', N, 'U/L', 'female', 26, 192, None, None, None, None)], SERUM, GEL),
 ('LAB-074', [('AMY', 'Amylase', 'الأميليز', N, 'U/L', A, 28, 100, None, None, None, None)], SERUM, GEL),
 ('LAB-092', [
  ('COLOR', 'Color', 'اللون', 'text', None, A, None, None, None, None, 'Pale yellow', None),
  ('APPEAR', 'Appearance', 'الشفافية', 'text', None, A, None, None, None, None, 'Clear', None),
  ('SG', 'Specific gravity', 'الكثافة النوعية', N, None, A, 1.005, 1.030, None, None, None, None),
  ('PH', 'pH', 'الحموضة', N, None, A, 5.0, 8.0, None, None, None, None),
  ('PROT', 'Protein', 'البروتين', Q, None, A, None, None, None, None, 'Negative', None),
  ('GLU', 'Glucose', 'السكر', Q, None, A, None, None, None, None, 'Negative', None),
  ('KET', 'Ketones', 'الأسيتون', Q, None, A, None, None, None, None, 'Negative', None),
  ('BLD', 'Blood', 'الدم', Q, None, A, None, None, None, None, 'Negative', None),
  ('BIL', 'Bilirubin', 'البيلروبين', Q, None, A, None, None, None, None, 'Negative', None),
  ('NIT', 'Nitrite', 'النيتريت', Q, None, A, None, None, None, None, 'Negative', None),
  ('LE', 'Leukocyte esterase', 'إستريز الكرات البيضاء', Q, None, A, None, None, None, None, 'Negative', None),
  ('PUS', 'Pus cells', 'خلايا الصديد', N, '/HPF', A, 0, 5, None, None, None, None),
  ('URBC', 'RBCs', 'كرات الدم الحمراء', N, '/HPF', A, 0, 2, None, None, None, None),
  ('EPI', 'Epithelial cells', 'الخلايا الطلائية', 'text', None, A, None, None, None, None, 'Few', None),
  ('CAST', 'Casts', 'الأسطوانات', Q, None, A, None, None, None, None, 'Not seen', None),
  ('CRYS', 'Crystals', 'البلورات', Q, None, A, None, None, None, None, 'Not seen', None)], URINE, CONT),
 ('LAB-090', [
  ('COLOR', 'Color', 'اللون', 'text', None, A, None, None, None, None, 'Brown', None),
  ('CONS', 'Consistency', 'القوام', 'text', None, A, None, None, None, None, 'Formed', None),
  ('MUCUS', 'Mucus', 'المخاط', Q, None, A, None, None, None, None, 'Negative', None),
  ('PUS', 'Pus cells', 'خلايا الصديد', N, '/HPF', A, 0, 5, None, None, None, None),
  ('RBC', 'RBCs', 'كرات الدم الحمراء', Q, None, A, None, None, None, None, 'Not seen', None),
  ('PARA', 'Parasites / ova', 'الطفيليات والبويضات', Q, None, A, None, None, None, None, 'Not seen', None)], STOOL, CONT),
 ('LAB-091', [('OB', 'Occult blood', 'الدم المختفي', Q, None, A, None, None, None, None, 'Negative', None)], STOOL, CONT),
 ('LAB-093', [('USUG', 'Sugar in urine', 'السكر في البول', Q, None, A, None, None, None, None, 'Negative', None)], URINE, CONT),
 ('LAB-094', [('UKET', 'Acetone in urine', 'الأسيتون في البول', Q, None, A, None, None, None, None, 'Negative', None)], URINE, CONT),
 ('LAB-095', [('UALB', 'Albumin in urine', 'الزلال في البول', Q, None, A, None, None, None, None, 'Negative', None)], URINE, CONT),
 ('LAB-110', [('UPREG', 'Pregnancy test (urine)', 'اختبار الحمل بالبول', Q, None, A, None, None, None, None, 'Negative', None)], URINE, CONT),
 ('LAB-123', [('ASO', 'ASO titre', 'ASO', N, 'IU/mL', A, None, 200, None, None, None, None)], SERUM, GEL),
 ('LAB-126', [('CRP', 'CRP (quantitative)', 'بروتين سي التفاعلي', N, 'mg/L', A, None, 5, None, None, None, None)], SERUM, GEL),
 ('LAB-128', [('RF', 'Rheumatoid factor', 'العامل الروماتويدي', N, 'IU/mL', A, None, 20, None, None, None, None)], SERUM, GEL),
 ('LAB-133', [('HCV', 'HCV Ab', 'أجسام HCV المضادة', Q, None, A, None, None, None, None, 'Non-reactive', None)], SERUM, GEL),
 ('LAB-134', [('HCV', 'HCV Ab (ELISA)', 'أجسام HCV المضادة', Q, None, A, None, None, None, None, 'Non-reactive', None)], SERUM, GEL),
 ('LAB-135', [('HBSAG', 'HBsAg', 'مستضد HBs', Q, None, A, None, None, None, None, 'Non-reactive', None)], SERUM, GEL),
 ('LAB-143', [('HIV', 'HIV Ab', 'أجسام HIV المضادة', Q, None, A, None, None, None, None, 'Non-reactive', None)], SERUM, GEL),
 ('LAB-165', [('AFP', 'AFP', 'ألفا فيتو بروتين', N, 'ng/mL', A, None, 10, None, None, None, None)], SERUM, GEL),
 ('LAB-166', [('CEA', 'CEA', 'CEA', N, 'ng/mL', A, None, 3.0, None, None, None, 'لغير المدخنين (المدخنون حتى 5)')], SERUM, GEL),
 ('LAB-167', [('CA199', 'CA 19-9', 'CA 19-9', N, 'U/mL', A, None, 37, None, None, None, None)], SERUM, GEL),
 ('LAB-168', [('CA125', 'CA 125', 'CA 125', N, 'U/mL', A, None, 35, None, None, None, None)], SERUM, GEL),
 ('LAB-169', [('CA153', 'CA 15-3', 'CA 15-3', N, 'U/mL', A, None, 30, None, None, None, None)], SERUM, GEL),
 ('LAB-171', [('PSA', 'PSA (total)', 'PSA الكلي', N, 'ng/mL', 'male', None, 4.0, None, None, None, None)], SERUM, GEL),
 ('LAB-175', [('CORT', 'Cortisol (morning)', 'الكورتيزول (صباحًا)', N, 'µg/dL', A, 6, 23, None, None, None, 'عينة صباحية 8 ص')], SERUM, GEL),
 ('LAB-177', [('INS', 'Insulin (fasting)', 'الأنسولين (صائم)', N, 'µIU/mL', A, 2, 25, None, None, None, None)], SERUM, GEL),
 ('LAB-179', [
  ('TESTO', 'Testosterone (total)', 'التستوستيرون الكلي', N, 'ng/dL', 'male', 270, 1070, None, None, None, None),
  ('TESTO', 'Testosterone (total)', 'التستوستيرون الكلي', N, 'ng/dL', 'female', 15, 70, None, None, None, None)], SERUM, GEL),
 ('LAB-183', [
  ('PRL', 'Prolactin', 'البرولاكتين', N, 'ng/mL', 'male', 4.0, 15.2, None, None, None, None),
  ('PRL', 'Prolactin', 'البرولاكتين', N, 'ng/mL', 'female', 4.8, 23.3, None, None, None, 'غير الحوامل')], SERUM, GEL),
 ('LAB-185', [('PTH', 'Parathormone (intact)', 'الباراثورمون', N, 'pg/mL', A, 15, 65, None, None, None, None)], SERUM, GEL),
 ('LAB-190', [('T3', 'T3 (total)', 'T3 الكلي', N, 'ng/dL', A, 80, 200, None, None, None, None)], SERUM, GEL),
 ('LAB-191', [('T4', 'T4 (total)', 'T4 الكلي', N, 'µg/dL', A, 5.1, 14.1, None, None, None, None)], SERUM, GEL),
 ('LAB-192', [('FT3', 'Free T3', 'T3 الحر', N, 'pg/mL', A, 2.3, 4.2, None, None, None, None)], SERUM, GEL),
 ('LAB-193', [('FT4', 'Free T4', 'T4 الحر', N, 'ng/dL', A, 0.8, 1.8, None, None, None, None)], SERUM, GEL),
 ('LAB-195', [('TSH', 'TSH', 'الهرمون المنبه للدرقية', N, 'µIU/mL', A, 0.4, 4.0, None, None, None, 'يختلف في الحمل والأطفال')], SERUM, GEL),
 ('LAB-288', [('VITD', 'Vitamin D (25-OH)', 'فيتامين د', N, 'ng/mL', A, 30, 100, None, None, None, 'النقص أقل من 20 / عدم الكفاية 20–29')], SERUM, GEL),
 ('LAB-289', [('B12', 'Vitamin B12', 'فيتامين ب12', N, 'pg/mL', A, 200, 900, None, None, None, None)], SERUM, GEL),
 ('LAB-339', [('FOL', 'Folic acid (serum)', 'حمض الفوليك', N, 'ng/mL', A, 3.0, 17.0, None, None, None, None)], SERUM, GEL),
]
COLUMNS = ['كود الخدمة', 'اسم الخدمة', 'كود المعامل', 'اسم المعامل (EN)', 'اسم المعامل (AR)', 'نوع النتيجة', 'الوحدة', 'الجنس', 'العمر من (سنة)', 'العمر إلى (سنة)',
           'الحد الأدنى', 'الحد الأعلى', 'حرج أدنى', 'حرج أعلى', 'النص المرجعي', 'نوع العينة', 'الأنبوبة/العبوة', 'ملاحظات', 'الحالة', 'قرار الاستشاري', 'ملاحظات الاستشاري']
SEX = {'all': 'الكل', 'male': 'ذكر', 'female': 'أنثى'}


def main(price_list, out_json, out_xlsx):
    names = {i['code']: i for i in json.load(open(price_list, encoding='utf-8'))['items']}
    rows = []
    for service, params, specimen, tube in DATA:
        item = names.get(service)
        if item is None:
            raise SystemExit(f'unknown service code {service}')
        for order, (code, en, ar, kind, unit, sex, low, high, clow, chigh, text, note) in enumerate(params, start=1):
            rows.append({'serviceCode': service, 'serviceNameEn': item['nameEn'], 'serviceNameAr': item['nameAr'], 'parameterCode': code, 'parameterNameEn': en, 'parameterNameAr': ar,
                         'sortOrder': order, 'resultType': kind, 'unit': unit, 'sex': sex, 'ageFromYears': 18, 'ageToYears': None, 'low': low, 'high': high,
                         'criticalLow': clow, 'criticalHigh': chigh, 'normalText': text, 'specimen': specimen, 'tube': tube, 'note': note, 'status': 'proposed'})
    out = {'status': 'proposed', 'note': 'Adult ranges only. They are suggestions from commonly published sources and depend on the analyser/reagent. They take effect only after the lab consultant approves them inside the system.', 'rows': rows}
    json.dump(out, open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'المعدلات الطبيعية'
    ws.sheet_view.rightToLeft = True
    ws.append(COLUMNS)
    for r in rows:
        ws.append([r['serviceCode'], r['serviceNameEn'] or r['serviceNameAr'], r['parameterCode'], r['parameterNameEn'], r['parameterNameAr'], r['resultType'], r['unit'], SEX[r['sex']],
                   r['ageFromYears'], r['ageToYears'], r['low'], r['high'], r['criticalLow'], r['criticalHigh'], r['normalText'], r['specimen'], r['tube'], r['note'], 'مقترح', None, None])
    head = PatternFill('solid', fgColor='1F3A5F')
    for cell in ws[1]:
        cell.font, cell.fill, cell.alignment = Font(bold=True, color='FFFFFF'), head, Alignment(horizontal='center', vertical='center', wrap_text=True)
    for index, width in enumerate([11, 34, 10, 24, 26, 11, 11, 8, 9, 9, 10, 10, 9, 9, 18, 15, 24, 38, 9, 14, 30], start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(index)].width = width
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = ws.dimensions
    decision = DataValidation(type='list', formula1='"اعتماد,تعديل,رفض"', allow_blank=True)
    ws.add_data_validation(decision)
    decision.add(f'T2:T{len(rows) + 1}')
    note = wb.create_sheet('تعليمات')
    note.sheet_view.rightToLeft = True
    for line in ['قالب المعدلات الطبيعية المقترحة (للبالغين فقط)',
                 'كل القيم مقترحة من مراجع منشورة شائعة وتتأثر بالجهاز والكاشف المستخدم، ولا تُعتمد إلا من استشاري المعمل داخل النظام.',
                 'الأطفال والحمل ومراحل الدورة الشهرية تحتاج صفوفًا مستقلة (الحد الأدنى للعمر في القالب 18 سنة).',
                 'الحدان الأدنى والأعلى فارغان يعني حدًا واحدًا فقط (مثل: أقل من 200). القيم الحرجة اختيارية.',
                 'يمكن تعديل أي قيمة هنا ثم إعادة الاستيراد، أو تعديلها مباشرة من شاشة «المعدلات الطبيعية» داخل النظام.']:
        note.append([line])
    note.column_dimensions['A'].width = 120
    wb.save(out_xlsx)
    print(len(rows), 'rows,', len({r['serviceCode'] for r in rows}), 'services')


if __name__ == '__main__':
    main(*sys.argv[1:4])
