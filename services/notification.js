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
const { sanitizePhone } = require('../utils/phone');

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const FONNTE_API = 'https://api.fonnte.com/send';

// Base URL publik dipakai untuk menyusun link tiket di badan pesan WA — lihat
// APP_URL di .env.example. Fallback ke localhost supaya dev tanpa .env tetap
// jalan (tidak melempar), tapi itu berarti link di WA tidak bisa dibuka orang
// lain — beri warning sekali di production kalau operator lupa isi APP_URL.
let warnedMissingAppUrl = false;
function getAppUrl() {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production' && !warnedMissingAppUrl) {
    warnedMissingAppUrl = true;
    logger.warn('APP_URL belum di-set di .env — link tiket di notifikasi WA memakai localhost dan tidak akan bisa dibuka penerima');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

/**
 * URL langsung ke halaman detail tiket. Halaman ini tetap butuh login (semua
 * halaman app redirect ke index.html tanpa sesi) — link ini cuma jalan pintas
 * navigasi, bukan bypass otentikasi.
 */
function ticketUrl(ticketId) {
  return `${getAppUrl()}/ticket-details.html?id=${ticketId}`;
}

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

  // Standarisasi nomor ke format 62xx via shared utility
  const cleanPhone = sanitizePhone(phone);
  if (!cleanPhone) {
    logger.warn(`Nomor telepon tidak valid: ${phone}`);
    return false;
  }

  // Fonnte dengan countryCode: target harus nomor lokal (tanpa kode negara)
  const localNumber = cleanPhone.replace(/^62/, '');

  // Exponential backoff: 3 attempts (1s, 3s, 7s delay antar percobaan)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(FONNTE_API, {
        target: localNumber,
        message: message,
        countryCode: '62'
      }, {
        headers: {
          'Authorization': FONNTE_TOKEN
        },
        timeout: 10000 // tanpa ini, endpoint Fonnte yang macet menahan promise tanpa batas
      });

      logger.info(`WA terkirim ke ${cleanPhone}: ${response.data?.status || 'ok'}`);
      return true;
    } catch (error) {
      // 4xx (selain 429) = error permanen (token salah, nomor ditolak) — retry
      // tidak akan pernah berhasil, jadi jangan buang waktu 1s+3s+7s untuk itu.
      const status = error.response?.status;
      const permanent = status && status >= 400 && status < 500 && status !== 429;
      if (attempt < MAX_RETRIES && !permanent) {
        const delay = [1000, 3000, 7000][attempt - 1];
        logger.warn(`WA attempt ${attempt}/${MAX_RETRIES} gagal untuk ${cleanPhone}, retry in ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`WA gagal setelah ${attempt} attempt ke ${cleanPhone}: ${error.message}`);
        return false;
      }
    }
  }
  return false;
}

/**
 * Ambil nomor telepon PIC dari database
 * @param {string} picUsername - Username PIC
 * @returns {Promise<string|null>} Nomor telepon atau null
 */
async function getPhoneByUsername(username) {
  try {
    const [rows] = await db.query('SELECT phone FROM users WHERE username = ? AND deleted_at IS NULL', [username]);
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
    const [rows] = await db.query("SELECT phone FROM users WHERE role = 'Operator' AND deleted_at IS NULL AND phone IS NOT NULL AND phone != ''");
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
    `Detail: ${ticketUrl(ticket.id)}`;
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
    `Detail: ${ticketUrl(ticketId)}`;
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

  // 2. PIC (teknisi yang ditugaskan) — selalu notifikasi, independen dari creator
  if ((ticketData?.created_by || ticketData?.createdBy) !== ticketData?.pic) {
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
