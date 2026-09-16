// PENTING: node-telegram-bot-api dengan { polling: true } TIDAK BISA jalan di Vercel
// (serverless function tidak punya proses long-running). Diganti total dengan webhook:
// Telegram kirim POST ke /api/telegram/webhook, dan kita balas via fetch ke Bot API biasa.

const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function tgSend(chatId, text, extra = {}) {
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra })
    });
  } catch (e) { console.error('tgSend error:', e.message); }
}

export async function tgSendPhoto(chatId, photo, caption, extra = {}) {
  try {
    await fetch(`${TG_API}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo, caption, parse_mode: 'Markdown', ...extra })
    });
  } catch (e) { console.error('tgSendPhoto error:', e.message); }
}

export async function tgAnswerCallback(callbackId, opts = {}) {
  try {
    await fetch(`${TG_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, ...opts })
    });
  } catch (e) {}
}

export async function tgEditMessage(chatId, messageId, text, extra = {}) {
  try {
    await fetch(`${TG_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', ...extra })
    });
  } catch (e) {}
}

export async function sendToOwner(text, extra = {}) {
  return tgSend(process.env.ADMIN_TELEGRAM_ID, text, extra);
}

function tanggalWaktuID() {
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const waktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' WIB';
  return { tanggal, waktu };
}

function siteDomain() {
  return (process.env.WEBSITE_URL || 'https://www.feypay.my.id').replace(/^https?:\/\//, '');
}

function footerBlock() {
  return `━━━━━━━━━━━━━━━━━━━━\n⚡ FEYPAY PAYMENT GATEWAY\n🌐 ${siteDomain()}\n━━━━━━━━━━━━━━━━━━━━`;
}

export async function sendNewUserNotification(username) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return;
  const { tanggal, waktu } = tanggalWaktuID();
  const text = `━━━━━━━━━━━━━━━━━━━━\n📊 LIVE STATISTICS\n━━━━━━━━━━━━━━━━━━━━\n\n👤 USER BARU\n\n🆕 Username : ${username}\n📅 Bergabung : ${tanggal}\n⏰ Waktu : ${waktu}\n\n${footerBlock()}`;
  await tgSend(channelId, text);
}

export async function sendDepositCreatedNotification(deposit, user, formatRupiah) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return;
  const { tanggal, waktu } = tanggalWaktuID();
  const text = `━━━━━━━━━━━━━━━━━━━━\n📊 LIVE STATISTICS\n━━━━━━━━━━━━━━━━━━━━\n\n🧾 DEPOSIT DIBUAT (API)\n\n👤 User      : ${user.username}\n💵 Deposit   : ${formatRupiah(deposit.amount)}\n💳 Total     : ${formatRupiah(deposit.total_bayar)}\n🏪 Provider  : ${deposit.provider}\n🧾 ID Trx    : ${deposit.id}\n\n📅 ${tanggal}\n⏰ ${waktu}\n\n${footerBlock()}`;
  await tgSend(channelId, text);
}

export async function sendDepositSuccessNotification(deposit, user, formatRupiah) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return;
  const { tanggal, waktu } = tanggalWaktuID();
  const text = `━━━━━━━━━━━━━━━━━━━━\n📊 LIVE STATISTICS\n━━━━━━━━━━━━━━━━━━━━\n\n💰 DEPOSIT BERHASIL\n\n👤 User      : ${user.username}\n💵 Deposit   : ${formatRupiah(deposit.amount)}\n💳 Total     : ${formatRupiah(deposit.total_bayar)}\n💰 Saldo     : ${formatRupiah(user.balance)}\n\n📅 ${tanggal}\n⏰ ${waktu}\n\n${footerBlock()}`;
  await tgSend(channelId, text);
}

export async function sendWithdrawNotification(withdraw, user, formatRupiah) {
  // Notifikasi ke owner saat WD DIAJUKAN (bukan "berhasil") — tetap dipakai admin, bukan channel publik.
  return sendToOwner(`📋 *WD ${withdraw.type === 'instant' ? 'INSTAN' : 'MANUAL'} DIAJUKAN*\n👤 ${user.username}\n💸 ${formatRupiah(withdraw.amount)}\n🏦 ${(withdraw.operator || '').toUpperCase()}\n🧾 ${withdraw.id}`);
}

export async function sendWithdrawSuccessNotification(withdraw, user, formatRupiah) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return;
  const { tanggal, waktu } = tanggalWaktuID();
  const text = `━━━━━━━━━━━━━━━━━━━━\n📊 LIVE STATISTICS\n━━━━━━━━━━━━━━━━━━━━\n\n💸 WITHDRAW BERHASIL\n\n👤 User      : ${user.username}\n💵 Nominal   : ${formatRupiah(withdraw.amount)}\n🏦 Status    : Berhasil\n📅 ${tanggal}\n⏰ ${waktu}\n\n${footerBlock()}`;
  await tgSend(channelId, text);
}
