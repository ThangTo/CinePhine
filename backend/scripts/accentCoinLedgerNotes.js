/**
 * One-off: rewrite old ASCII coin history notes ("Tu dong nhan thuong...") with Vietnamese accents.
 * Dry run by default (only counts). Write with: node scripts/accentCoinLedgerNotes.js --apply
 * Safe to re-run: accented notes no longer match the ASCII prefixes.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CoinLedger = require('../models/coin_ledger.model');
const { connectDB } = require('../config/db/db');

// [old prefix, new prefix]; matched at the start of the note only.
const NOTE_PREFIXES = [
  ['Tu dong nhan thuong nhiem vu: ', 'Tự động nhận thưởng nhiệm vụ: '],
  ['Nhan thuong nhiem vu: ', 'Nhận thưởng nhiệm vụ: '],
  ['Tu dong nhan bonus hoan thanh nhiem vu daily: ', 'Tự động nhận bonus hoàn thành nhiệm vụ ngày: '],
  ['Tu dong nhan bonus hoan thanh nhiem vu weekly: ', 'Tự động nhận bonus hoàn thành nhiệm vụ tuần: '],
  ['Nhan bonus hoan thanh nhiem vu daily: ', 'Nhận bonus hoàn thành nhiệm vụ ngày: '],
  ['Nhan bonus hoan thanh nhiem vu weekly: ', 'Nhận bonus hoàn thành nhiệm vụ tuần: '],
  ['Mua hieu ung con tro ', 'Mua hiệu ứng con trỏ '],
  ['Nap coin thanh cong tu don hang ', 'Nạp coin thành công từ đơn hàng '],
  ['Nang cap goi Premium ', 'Nâng cấp gói Premium '],
  ['Admin dieu chinh coin: ', 'Admin điều chỉnh coin: '],
  ['Keo Tien Tri: que Dai Cat', 'Kẹo Tiên Tri: quẻ Đại Cát'],
  ['Keo Tien Tri: que Cat', 'Kẹo Tiên Tri: quẻ Cát'],
  ['Keo Tien Tri: que Binh', 'Kẹo Tiên Tri: quẻ Bình'],
  ['Keo Tien Tri: que Hung', 'Kẹo Tiên Tri: quẻ Hung'],
];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const main = async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();
  let total = 0;
  for (const [from, to] of NOTE_PREFIXES) {
    const filter = { note: { $regex: `^${escapeRegex(from)}` } };
    const count = apply
      ? (await CoinLedger.updateMany(filter, [{ $set: { note: { $replaceOne: { input: '$note', find: from, replacement: to } } } }])).modifiedCount
      : await CoinLedger.countDocuments(filter);
    total += count;
    console.log(`${String(count).padStart(5)}  ${from} -> ${to}`);
  }
  console.log(apply ? `Updated ${total} notes.` : `${total} notes would change. Re-run with --apply to write.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
