// lib/fee.js
// Aturan fee deposit (random, buat unique amount per QRIS) & fee withdraw manual.
// Diset sesuai ketentuan terbaru dari owner.

// ===== Fee Deposit (QRIS) — random (dan sebagian persentase), ditambahkan ke nominal =====
// Minimal deposit sekarang Rp5.000 — lihat MIN_DEPOSIT di route deposit.
function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getDepositFee(amount) {
  if (amount <= 10000) return randBetween(250, 280);
  if (amount <= 15000) return randBetween(330, 350);
  if (amount <= 25000) return randBetween(400, 450);
  if (amount <= 49999) return randBetween(500, 550);
  if (amount <= 99999) return Math.round(amount * 0.007) + randBetween(350, 400);
  return Math.round(amount * 0.001) + randBetween(0, 25);
}

// ===== Fee Withdraw (manual) — flat sesuai tier nominal =====
const WD_FEE_TIERS = [
  { min: 1000,    max: 49999,  fee: 2000 },
  { min: 50000,   max: 99999,  fee: 2500 },
  { min: 100000,  max: 149999, fee: 3000 },
  { min: 150000,  max: 500000, fee: 3500 },
];

export function getWithdrawalFee(amount) {
  const tier = WD_FEE_TIERS.find(t => amount >= t.min && amount <= t.max);
  if (tier) return tier.fee;
  // Fallback kalau nominal di luar semua tier (mis. > Rp500.000, sampai batas MAX_WITHDRAW manual)
  if (amount > 500000) return 3500;
  return 2000;
}
