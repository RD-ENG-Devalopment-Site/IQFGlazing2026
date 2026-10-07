import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const extractJson = (html, name) => {
  const match = html.match(new RegExp(`const ${name}=(\\[[\\s\\S]*?\\]);`));
  if (!match) throw new Error(`Cannot find ${name}`);
  return JSON.parse(match[1]);
};

const orderSource = extractJson(read('Order2026_Restored.html'), 'source');
const products = extractJson(read('ivqf_capacity_flow_simulator.html'), 'PALLET_DATA');
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const typeLabels = { marinade: 'IVQF MARINADE', ivqf: 'IVQF', ytr: 'YTR IVQF' };

const orderMap = new Map();
for (const [name, type, category, values] of orderSource) {
  const key = `${type}|${name}`;
  const row = orderMap.get(key) || { key, name, type, typeLabel: typeLabels[type] || type, category, months: Array(12).fill(0) };
  values.forEach((value, index) => { row.months[index] += Number(value) || 0; });
  orderMap.set(key, row);
}

const groupFor = name => {
  const upper = name.toUpperCase();
  if (/SBB|SKINLESS BONELESS BREAST|CHICKEN BREAST/.test(upper)) return 'SBB';
  if (/BLK|BLOCK|20-30 G|25-30 G|30-40 G/.test(upper)) return 'BLK';
  if (/YTR/.test(upper)) return 'YTR';
  if (/THIGH|LEG THIGH/.test(upper)) return 'BL TH';
  if (/DRUMSTICK/.test(upper)) return 'DR';
  if (/WING/.test(upper)) return 'WING';
  return 'OTHER';
};

const productByName = new Map(products.map(product => [product.product, product]));
const productByCode = new Map(products.map(product => [product.code, product]));
// Candidate aliases are explicit because the Order source has no SKU column.
// They remain unverified in the UI until the data owner confirms the mapping.
const candidateAliases = {
  'NAE HERB FED BLK 25-30 G IVQF 500 Gx24 (O)': '111117318',
  'NAE HERB FED BLK 25-30 G IVQF 500 Gx24 (T)': '111117317',
  'IQF BLK 20-30 G': '111117302'
};
const orderRows = [...orderMap.values()].map(row => {
  const exact = productByName.get(row.name), alias = productByCode.get(candidateAliases[row.name]);
  const matched = exact || alias;
  return {
    ...row,
    group: groupFor(row.name),
    total: row.months.reduce((sum, value) => sum + value, 0),
    productMatch: matched ? {
      level: exact ? 'name-candidate' : 'alias-candidate',
      code: matched.code,
      part: matched.part,
      product: matched.product,
      kgPerCarton: matched.kgPerCarton,
      cartonsPerPallet: matched.palletCartons,
      cartonsPerHour: matched.cartonsPerHour,
      fullPalletMinutes: matched.palletMinutes,
      note: exact ? 'ชื่อ Order ตรงกับฐาน Item ต้องยืนยันรหัส SKU กับเจ้าของข้อมูล' : 'จับคู่จาก alias ที่ระบุไว้ ต้องยืนยันรหัส SKU กับเจ้าของข้อมูล'
    } : {
      level: 'unmatched',
      note: 'ยังไม่มี SKU ที่ยืนยันสำหรับชื่อ Order นี้'
    }
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const trials = [
  {
    id: 'trial-4', number: 4, date: '2026-08-25', dateLabel: '25 ส.ค. 2569',
    groups: ['SBB', 'BLK'], level: 'group', status: 'review', statusLabel: 'มีผลระดับกลุ่ม',
    title: 'เปรียบเทียบ Glazing และ Double IVQF',
    finding: 'Double IVQF ให้ช่วงที่อุณหภูมิ ≤ -18°C ยาวกว่าในตัวอย่าง SBB และ BLK',
    next: 'ยืนยันกับปริมาณผลิตจริงและควบคุมเวลารอก่อนเข้าคลัง',
    criteria: '≤ -18°C และ ≤ -22°C', href: 'ivqf_experiment_4_summary.html'
  },
  {
    id: 'trial-5', number: 5, date: '2026-08-31', dateLabel: '31 ส.ค. 2569',
    groups: ['SBB', 'BLK'], level: 'group', status: 'review', statusLabel: 'มีผลระดับกลุ่ม',
    title: 'ติดตามอุณหภูมิจาก Data logger',
    finding: 'SBB อยู่ ≤ -18°C 20 นาที; BLK สองชุดอยู่ในเกณฑ์ 12 และ 13 นาที',
    next: 'ยืนยันชนิดกระบวนการ เวลา Logger และ SKU ของตัวอย่าง',
    criteria: '≤ -18°C และ ≤ -22°C', href: 'ivqf_experiment_5_summary.html'
  },
  {
    id: 'trial-6', number: 6, date: '2026-09-25', dateLabel: '25 ก.ย. 2569',
    groups: ['BLK'], level: 'group-unconfirmed', status: 'fail', statusLabel: 'ต้องทดลองซ้ำ',
    title: 'ทดสอบ Condition และติดตามในคลัง',
    finding: '0 จาก 9 จุดถึง -18.5°C ที่จุดออก และหลัง 30:57 ชม. ยังยืนยันช่วงเป้าหมายไม่ได้',
    next: 'ยืนยัน SKU/ตำแหน่งหัววัด แล้วทดลองเวลาเดินสายพานและติดตามคลังต่อ',
    criteria: '-18.5 ถึง -22.0°C', href: 'ivqf_experiment_6_summary.html'
  }
];

const output = {
  schema: 'ivqf-main-focus', version: 1, year: 2026, months,
  sourceNote: 'Order IVQF 2026.xlsx; ช่องว่างต้นทางอ่านเป็น 0 ตามนโยบายเดิม และไม่ใช่ยอดผลิตจริง',
  orderRows, trials
};

fs.writeFileSync(
  path.join(root, 'main_focus_data.js'),
  `window.IVQF_MAIN_DATA=${JSON.stringify(output)};\n`,
  'utf8'
);
console.log(`Generated main_focus_data.js with ${orderRows.length} products and ${trials.length} trials`);
