/**
 * Notification Service
 * Mengirim notifikasi WhatsApp via Fonnte API
 *
 * Setup:
 * 1. Daftar di https://fonnte.com
 * 2. Dapatkan token dari dashboard
 * 3. Tambahkan ke .env: FONNTE_TOKEN=token_anda
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../utils/logger');

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const FONNTE_API = 'https://api.fonnte.com/send';

/**
 * Kirim pesan WhatsApp ke satu nomor
 * @param {string} phone - Nomor telepon (contoh: 87751098112, tanpa 0/+62)
 * @param {string} message - Pesan yang akan dikirim
 */
async function sendWhatsApp(phone, message) {
  if (!FONNTE_TOKEN) {
    logger.warn('FONNTE_TOKEN belum di-set di .env — notifikasi tidak terkirim');
    return false;
  }

  // Bersihkan nomor: hapus +, spasi, strip, tanda kurung
  let cleanPhone = phone.replace(/[+\s\-()]/g, '');

  // Jika diawali 0, ganti dengan 62 (ke format internasional)
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }

  // Jika diawali 62, pastikan tidak ada 0 setelahnya (contoh: 62081 → 6281)
  if (cleanPhone.startsWith('62') && cleanPhone[2] === '0') {
    cleanPhone = '62' + cleanPhone.slice(3);
  }

  if (!cleanPhone || cleanPhone.length < 10) {
    logger.warn(`Nomor telepon tidak valid: ${phone}`);
    return false;
  }

  // Fonnte dengan countryCode: target harus nomor lokal (tanpa kode negara)
  const localNumber = cleanPhone.replace(/^62/, '');

  try {
    const response = await axios.post(FONNTE_API, {
      target: localNumber,
      message: message,
      countryCode: '62'
    }, {
      headers: {
        'Authorization': FONNTE_TOKEN
      }
    });

    logger.info(`WA terkirim ke ${cleanPhone}: ${response.data?.status || 'ok'}`);
    return true;
  } catch (error) {
    logger.error(`Gagal kirim WA ke ${cleanPhone}: ${error.message}`);
    return false;
  }
}

/**
 * Ambil nomor telepon PIC dari database
 * @param {string} picUsername - Username PIC
 * @returns {Promise<string|null>} Nomor telepon atau null
 */
async function getPhoneByUsername(username) {
  try {
    const [rows] = await db.query('SELECT phone FROM users WHERE username = ?', [username]);
    if (rows.length > 0 && rows[0].phone) {
      return rows[0].phone;
    }
    return null;
  } catch (error) {
    logger.error(`Gagal ambil nomor telepon user ${username}: ${error.message}`);
    return null;
  }
}

/**
 * Ambil nomor telepon semua operator
 * @returns {Promise<string[]>} Array nomor telepon operator
 */
async function getAllOperatorPhones() {
  try {
    const [rows] = await db.query("SELECT phone FROM users WHERE role = 'Operator' AND phone IS NOT NULL AND phone != ''");
    return rows.map(r => r.phone).filter(Boolean);
  } catch (error) {
    logger.error('Gagal ambil nomor operator:', error.message);
    return [];
  }
}

/**
 * Format pesan notifikasi ticket baru
 */
function formatNewTicketMessage(ticket) {
  return `📋 *TIKET BARU*\n\n` +
    `ID: #${ticket.id}\n` +
    `Aktifitas: ${ticket.aktifitas}\n` +
    `Lokasi: ${ticket.lokasi}\n` +
    `${ticket.subNode ? 'Sub-Node: ' + ticket.subNode + '\n' : ''}` +
    `${ticket.odc ? 'ODC: ' + ticket.odc + '\n' : ''}` +
    `Prioritas: ${ticket.priority}\n` +
    `Status: ${ticket.status}\n` +
    `PIC: ${ticket.pic}\n\n` +
    `Silakan cek aplikasi untuk detail lebih lanjut.`;
}

/**
 * Format pesan notifikasi update ticket
 */
function formatUpdateMessage(ticketId, oldStatus, newStatus, changedBy, ticketData) {
  return `🔄 *TIKET DIUPDATE*\n\n` +
    `ID: #${ticketId}\n` +
    `Aktifitas: ${ticketData?.aktifitas || '-'}\n` +
    `Lokasi: ${ticketData?.lokasi || '-'}\n` +
    `Status: ${oldStatus} → *${newStatus}*\n` +
    `Oleh: ${changedBy}\n\n` +
    `Cek aplikasi untuk detail lebih lanjut.`;
}

/**
 * Notifikasi: Ticket baru dibuat
 * Mengirim ke pembuat tiket + PIC (teknisi) — sesuai permintaan client
 */
async function notifyTicketCreated(ticket) {
  const recipients = new Set();

  // 1. Pembuat tiket
  const creatorName = ticket.createdBy || ticket.created_by;
  const creatorPhone = await getPhoneByUsername(creatorName);
  if (creatorPhone) recipients.add(creatorPhone);

  // 2. PIC (teknisi yang ditugaskan) — jika berbeda dengan pembuat
  if (creatorName !== ticket.pic) {
    const picPhone = await getPhoneByUsername(ticket.pic);
    if (picPhone) recipients.add(picPhone);
  }

  if (recipients.size === 0) {
    logger.warn(`Tidak ada penerima — notifikasi ticket ${ticket.id} dilewati`);
    return;
  }

  const message = formatNewTicketMessage(ticket);

  // Kirim ke semua penerima secara paralel (fire-and-forget)
  await Promise.allSettled(
    [...recipients].map(phone => sendWhatsApp(phone, message))
  );
}

/**
 * Notifikasi: Status ticket berubah
 * Mengirim ke pembuat tiket + PIC (teknisi) — sesuai permintaan client
 */
async function notifyTicketUpdated(ticketId, oldStatus, newStatus, changedBy, ticketData) {
  const recipients = new Set();

  // 1. Pembuat tiket
  const creatorPhone = await getPhoneByUsername(ticketData?.created_by || ticketData?.createdBy);
  if (creatorPhone) recipients.add(creatorPhone);

  // 2. PIC (teknisi yang ditugaskan) — jika berbeda dengan pembuat
  if (creatorPhone && (ticketData?.created_by || ticketData?.createdBy) !== ticketData?.pic) {
    const picPhone = await getPhoneByUsername(ticketData?.pic);
    if (picPhone) recipients.add(picPhone);
  }

  if (recipients.size === 0) return;

  const message = formatUpdateMessage(ticketId, oldStatus, newStatus, changedBy, ticketData);

  await Promise.allSettled(
    [...recipients].map(phone => sendWhatsApp(phone, message))
  );
}

module.exports = { sendWhatsApp, notifyTicketCreated, notifyTicketUpdated, getPhoneByUsername };
