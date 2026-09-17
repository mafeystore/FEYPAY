import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getSession } from '../../../../../lib/auth';
import { generateTransactionId } from '../../../../../lib/security';
import { sendToOwner, sendWithdrawNotification, sendWithdrawSuccessNotification } from '../../../../../lib/telegram';
import { nevaGetWithdrawMethods, nevaCreateWithdraw } from '../../../../../lib/nevapedia';

const OUR_MARKUP = parseInt(process.env.NEVAPEDIA_WITHDRAW_MARKUP || '1000');
const MIN_WITHDRAW = 10000, MAX_WITHDRAW = 10000000;
function formatRupiah(n) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0); }

export async function POST(req) {
  const session = getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { amount, operator, account_number } = await req.json();
  if (!amount || amount < MIN_WITHDRAW) return NextResponse.json({ success: false, error: `Minimal withdraw ${formatRupiah(MIN_WITHDRAW)}` }, { status: 400 });
  if (amount > MAX_WITHDRAW) return NextResponse.json({ success: false, error: `Maksimal withdraw ${formatRupiah(MAX_WITHDRAW)}` }, { status: 400 });
  if (!operator) return NextResponse.json({ success: false, error: 'Metode e-wallet wajib dipilih' }, { status: 400 });
  if (!account_number) return NextResponse.json({ success: false, error: 'Nomor tujuan wajib diisi' }, { status: 400 });

  if (!process.env.NEVAPEDIA_API_KEY) return NextResponse.json({ success: false, error: 'Withdraw instan belum dikonfigurasi (NEVAPEDIA_API_KEY kosong).' }, { status: 503 });

  // Validasi method beneran didukung Nevapedia + ambil fee resminya (jangan percaya fee dari client)
  let methodInfo;
  try {
    const methodsData = await nevaGetWithdrawMethods();
    methodInfo = (methodsData?.instant_methods || []).find((m) => m.method === operator);
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Gagal validasi metode withdraw ke Nevapedia.' }, { status: 502 });
  }
  if (!methodInfo) return NextResponse.json({ success: false, error: 'Metode e-wallet tidak didukung saat ini.' }, { status: 400 });

  const nevaFee = methodInfo.fee;
  const totalFee = nevaFee + OUR_MARKUP;
  const totalDeducted = amount + totalFee;

  // 1. Potong saldo dulu, atomic & anti-saldo-negatif
  const { data: deducted, error: deductErr } = await supabaseAdmin.rpc('deduct_balance_atomic', { p_user_id: session.id, p_amount: totalDeducted });
  if (deductErr) {
    console.error('deduct_balance_atomic error:', deductErr.message);
    return NextResponse.json({ success: false, error: `Gagal memproses saldo: ${deductErr.message}` }, { status: 500 });
  }
  if (!deducted || deducted.length === 0) {
    const { data: u } = await supabaseAdmin.from('users').select('balance').eq('id', session.id).maybeSingle();
    return NextResponse.json({ success: false, error: `Saldo tidak cukup. Butuh: ${formatRupiah(totalDeducted)}. Saldo: ${formatRupiah(u?.balance || 0)}` }, { status: 400 });
  }
  const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', session.id).maybeSingle();

  const kodeTrx = generateTransactionId('WDI');
  const newWithdraw = {
    id: kodeTrx, type: 'instant', provider: 'nevapedia', user_id: user.id, username: user.username, amount, fee: totalFee,
    neva_fee: nevaFee, markup_fee: OUR_MARKUP, total_diterima: amount, operator, account_number,
    status: 'processing', saldo_before: deducted[0].balance + totalDeducted, saldo_after: deducted[0].balance, saldo_refunded: false
  };
  await supabaseAdmin.from('withdrawals').insert(newWithdraw);
  await sendWithdrawNotification(newWithdraw, user, formatRupiah);

  try {
    const nevaResp = await nevaCreateWithdraw({ amount, method: operator, accountNumber: account_number, instant: true });
    const nevaData = nevaResp.data || {};
    const patch = { neva_withdraw_id: nevaData.id };
    if (nevaData.status === 'success') { patch.status = 'success'; patch.completed_at = new Date().toISOString(); }
    await supabaseAdmin.from('withdrawals').update(patch).eq('id', kodeTrx);
    if (patch.status === 'success') await sendWithdrawSuccessNotification({ ...newWithdraw, ...patch }, user, formatRupiah);

    await sendToOwner(`⚡ *WD INSTAN DIPROSES* (nevapedia)\n👤 ${user.username}\n💸 ${formatRupiah(amount)} → ${methodInfo.name}\n📱 ${account_number}\n🧾 ID: ${kodeTrx}\n📊 Neva: ${nevaData.status || 'pending'}`);

    return NextResponse.json({ success: true, withdraw: { id: kodeTrx, type: 'instant', amount, fee: totalFee, total_diterima: amount, operator: methodInfo.name, account_number, status: nevaData.status === 'success' ? 'success' : 'processing', message: 'Withdraw instan sedang diproses. Biasanya 1-5 menit.' } });
  } catch (nevaError) {
    // Refund atomic kalau Nevapedia gagal / error network
    await supabaseAdmin.rpc('refund_balance_atomic', { p_user_id: user.id, p_amount: totalDeducted });
    await supabaseAdmin.from('withdrawals').update({ status: 'failed', h2h_reason: nevaError.message, saldo_refunded: true, failed_at: new Date().toISOString() }).eq('id', kodeTrx);
    await sendToOwner(`❌ *WD INSTAN GAGAL - SALDO DIKEMBALIKAN*\n👤 ${user.username}\n+${formatRupiah(totalDeducted)} dikembalikan\nError: ${nevaError.message}`);
    return NextResponse.json({ success: false, error: 'Withdraw instan gagal diproses, saldo sudah dikembalikan.' }, { status: 500 });
  }
}
