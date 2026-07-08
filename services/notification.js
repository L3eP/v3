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

  // Bersihkan nomor: hapus +, spasi, strip
  let cleanPhone = phone.replace(/[+\s\-]/g, '');

  // Jika diawali 0, ganti dengan 62
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }

  // Jika diawali 62, pastikan tidak ada 0 setelahnya
  if (cleanPhone.startsWith('62') && cleanPhone[2] === '0') {
    cleanPhone = '62' + cleanPhone.slice(3);
  }

  if (!cleanPhone || cleanPhone.length < 10) {
    logger.warn(`Nomor telepon tidak valid: ${phone}`);
    return false;
  }

  try {
    const response = await axios.post(FONNTE_API, {
      target: cleanPhone,
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
 * Notifikasi: Ticket baru dibuat
 */
async function notifyTicketCreated(ticket) {
  const picPhone = await getPhoneByUsername(ticket.pic);
  if (!picPhone) {
    logger.warn(`Nomor PIC ${ticket.pic} tidak ditemukan — notifikasi ticket ${ticket.id} dilewati`);
    return;
  }

  const message = `📋 *TIKET BARU*\n\n` +
    `ID: #${ticket.id}\n` +
    `Aktifitas: ${ticket.aktifitas}\n` +
    `Lokasi: ${ticket.lokasi}\n` +
    `${ticket.subNode ? 'Sub-Node: ' + ticket.subNode + '\n' : ''}` +
    `${ticket.odc ? 'ODC: ' + ticket.odc + '\n' : ''}` +
    `Prioritas: ${ticket.priority}\n` +
    `Status: ${ticket.status}\n` +
    `PIC: ${ticket.pic}\n\n` +
    `Silakan cek aplikasi untuk detail lebih lanjut.`;

  await sendWhatsApp(picPhone, message);
}

/**
 * Notifikasi: Status ticket berubah
 */
async function notifyTicketUpdated(ticketId, oldStatus, newStatus, changedBy, ticketData) {
  const picPhone = await getPhoneByUsername(ticketData?.pic);
  if (!picPhone) return;

  const message = `🔄 *TIKET DIUPDATE*\n\n` +
    `ID: #${ticketId}\n` +
    `Aktifitas: ${ticketData?.aktifitas || '-'}\n` +
    `Status: ${oldStatus} → *${newStatus}*\n` +
    `Oleh: ${changedBy}\n\n` +
    `Cek aplikasi untuk detail lebih lanjut.`;

  await sendWhatsApp(picPhone, message);
}

module.exports = { sendWhatsApp, notifyTicketCreated, notifyTicketUpdated, getPhoneByUsername };
