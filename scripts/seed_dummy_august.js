/**
 * Seed Dummy Data — Agustus 2026
 * Tickets + PSB. NON-DESTRUKTIF: hanya INSERT, tidak truncate.
 * Data dipetakan ke referensi asli di DB (aktifitas, sub_node, odc, odp, priority)
 * dan user riil (teknisi/operator/owner) agar konsisten dengan dropdown aplikasi.
 *
 * Jalankan (default = 1 s/d hari ini):
 *   node scripts/seed_dummy_august.js
 *
 * Seed lanjutan (mis. tambah 11–12 tanpa duplikasi 1–10):
 *   node scripts/seed_dummy_august.js --from 2026-08-11 --to 2026-08-12
 *
 * Distribusi umur status TETAP dihitung dari 1 Agustus, jadi tiket yang baru
 * disemai tetap berstatus "muda" sesuai umur aslinya.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const DEFAULT_START = '2026-08-01';
const DEFAULT_END = '2026-08-12'; // "hari ini" — 2026-08-12
const argVal = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const START_DATE = argVal('--from') || DEFAULT_START;
const END_DATE = argVal('--to') || DEFAULT_END;

// === Pool nama & lokasi khas Lombok ===
const NAMA_DEPAN = ['Ahmad','Budi','Citra','Dedi','Eka','Fitri','Guntur','Hasanah','Indah','Joko',
  'Kartika','Lilis','Miftah','Nurul','Opik','Putri','Qori','Rudi','Siti','Taufik',
  'Umar','Vina','Wawan','Yanti','Zainal','Agus','Baiq','Chairul','Diana','Edi',
  'Faisal','Gita','Hendra','Isnaini','Jamilah','Kurnia','Lalu','Maya','Ningsih','Oka',
  'Parhan','Ria','Saiful','Tini','Usman','Wiwin','Yusuf','Zaenab','Arif','Baidowi'];
const NAMA_BELAKANG = ['Hidayat','Pratama','Wijaya','Saputra','Kusuma','Permadi','Ramadhani','Setiawan',
  'Suryadi','Utama','Anggraini','Febrianti','Handayani','Kurniawan','Lestari',
  'Maulana','Ningsih','Pertiwi','Rahmawati','Susanti','Wulandari','Yulianti','Zahara',
  'Ardiansyah','Budiman','Cahyono','Dewi','Firmansyah','Gunarto','Hakim','Ilham',
  'Jayadi','Kartini','Mulyadi','Nasution','Purnama','Rasyid','Soleh','Taslim','Wahyudi'];
const LOKASI = ['Gubuk Lauk','Kampung Baru','GOR Praya','Dasan Tereng','Mantang Baru','Sektim Timur',
  'Batu Jai','Perumahan Griya','Orong Piter','Montong Tebu','Kembang Kerang','Paok Motong',
  'Lendang Nangka','Dasan Lekong','Aikmel','Sakra','Sikur','Masbagik','Anjani','Keruak',
  'Labuhan Lombok','Pringgabaya','Suralaga','Terara','Batunyala','Rarang','Bagik Polak'];
const ALAMAT = ['Jl. Raya','Jl. Pahlawan','Jl. Diponegoro','Jl. Ahmad Yani','Jl. Sudirman','Jl. Gajah Mada',
  'Jl. HOS Cokroaminoto','Jl. Merdeka','Jl. Kartini','Jl. Imam Bonjol','Jl. Masjid',
  'Jl. TGH. Umar','Gs. Orong','Gs. Dasan','Gs. Montong','Gs. Lauk','Gs. Daya','Gs. Kertak'];

const INFO_LOSS = ['Redaman tinggi karena konektor kotor','Kabel putus tertimpa pohon','ONU merah / LOS di rumah pelanggan',
  'Splicing putus di kabel drop','Loss besar di titik ODP','Redaman OLT port padat','Penyambungan ulang distro'];
const INFO_PSB = ['PSB - Pelanggan baru','Pemasangan baru ONU di rumah pelanggan','PSB - Registrasi + instalasi','PSB - Pindah dari ISP lain'];
const INFO_MAINT = ['Pembersihan ODC','Ganti kabel drop','Setting ulang ONU','Cek tegangan OLT','Penggantian SFP','Splicing kabel feeder'];
const INFO_MIGRASI = ['Migrasi pelanggan ke ODC baru','Pindah port ODP','Migrasi ONU ke splitter baru'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function phone() { return '62' + pick(['877','878','819','817','813','823','853','855','856','859','861','862','863','865','866','867','868','869','871','896','897','898','899']) + ri(10000000, 99999999); }
function dt(y, m, d, h, mi) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:00`; }

const STATUS_TICKET = ['Terlapor','Dikerjakan','Selesai','Pending'];
const STATUS_PSB = ['Terdaftar','Terpasang','Aktif'];

// Distribusi status berdasarkan umur hari (hari lebih lama → makin banyak selesai)
function statusForTicket(dayIdx, totalDays) {
  const ageRatio = dayIdx / Math.max(1, totalDays - 1); // 0 = hari pertama, 1 = hari terakhir
  const r = Math.random();
  if (ageRatio < 0.4) {
    // tua: mayoritas selesai, sisanya nyangkut
    if (r < 0.72) return ['Selesai', 0.001];
    if (r < 0.86) return ['Dikerjakan', 0.001];
    if (r < 0.94) return ['Pending', 0.001];
    return ['Terlapor', 0.001];
  } else if (ageRatio < 0.7) {
    if (r < 0.4) return ['Selesai', 0.001];
    if (r < 0.65) return ['Dikerjakan', 0.001];
    if (r < 0.8) return ['Pending', 0.001];
    return ['Terlapor', 0.001];
  } else {
    // baru: mayoritas masih proses / baru dilaporkan
    if (r < 0.15) return ['Selesai', 0.001];
    if (r < 0.5) return ['Dikerjakan', 0.001];
    if (r < 0.7) return ['Pending', 0.001];
    return ['Terlapor', 0.001];
  }
}

function statusForPsb(dayIdx, totalDays) {
  const ageRatio = dayIdx / Math.max(1, totalDays - 1);
  const r = Math.random();
  if (ageRatio < 0.4) return 'Aktif';
  if (r < 0.5) return 'Terpasang';
  if (r < 0.75) return 'Aktif';
  return 'Terdaftar';
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'login_app',
    waitForConnections: true, connectionLimit: 10,
  });

  // === Ambil data rujukan asli dari DB ===
  const [refs] = await pool.query(`SELECT type, label, group_name FROM reference_options`);
  const aktifitas = refs.filter(r => r.type === 'aktifitas').map(r => r.label);
  const subNodes = refs.filter(r => r.type === 'sub_node').map(r => r.label);
  const odcs = refs.filter(r => r.type === 'odc').map(r => r.label);
  const odps = refs.filter(r => r.type === 'odp').map(r => r.label);
  const priorities = refs.filter(r => r.type === 'priority').map(r => r.label);
  const [users] = await pool.query(`SELECT username, role FROM users WHERE deleted_at IS NULL`);
  const TEKNISI = users.filter(u => u.role === 'Teknisi').map(u => u.username);
  const OPERATOR = users.filter(u => u.role === 'Operator').map(u => u.username);
  const OWNER = users.filter(u => u.role === 'Owner').map(u => u.username);
  if (odcs.length === 0) throw new Error('Referensi ODC kosong — jalankan add_reference_table.sql dulu');

  const [y0, m0, d0] = START_DATE.split('-').map(Number);
  const [y1, m1, d1] = END_DATE.split('-').map(Number);
  const start = new Date(Date.UTC(y0, m0 - 1, d0));
  const end = new Date(Date.UTC(y1, m1 - 1, d1));
  const totalDays = Math.round((end - start) / 86400000) + 1;

  // Baseline umur — distribusi status dihitung sejak 1 Agustus (bukan sejak awal
  // rentang yang disemai). Seed lanjutan (--from 11 --to 12) tetap menghasilkan
  // status "muda" untuk tiket baru, bukan "tua".
  const [ay0, am0, ad0] = DEFAULT_START.split('-').map(Number);
  const ageBase = new Date(Date.UTC(ay0, am0 - 1, ad0));
  const ageTotal = Math.round((end - ageBase) / 86400000) + 1;
  const ageIdx = (day) => Math.round((day - ageBase) / 86400000);

  const PSB_ONLY = process.argv.includes('--psb-only');

  // === 1. TUMPUKAN TICKET ===
  console.log('📌 Tickets...');
  const ticketRows = [];
  const ticketKeys = new Set(); // hindari duplikat identik
  let ticketCount = 0;
  for (let i = 0; !PSB_ONLY && i < totalDays; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    const n = ri(4, 7); // 4–7 tiket per hari
    const todayStr = `${day.getUTCFullYear()}-${String(day.getUTCMonth()+1).padStart(2,'0')}-${String(day.getUTCDate()).padStart(2,'0')}`;
    for (let k = 0; k < n; k++) {
      let [status] = statusForTicket(ageIdx(day), ageTotal);
      const h = ri(7, 18), mi = ri(0, 59);
      const aktif = pick(aktifitas);
      const odc = pick(odcs);
      const lokasi = pick(LOKASI);
      const pic = Math.random() < 0.85 ? pick(TEKNISI) : pick(OPERATOR);
      const createdBy = Math.random() < 0.45 ? pick(OPERATOR) : (Math.random() < 0.7 ? pick(OWNER) : pick(TEKNISI));
      let info;
      if (aktif === 'PSB') {
        info = `PSB - ${pick(NAMA_DEPAN)} ${pick(NAMA_BELAKANG)} | Telp: ${phone()} | SN ONU: ${pick(['HWTCMB','ZTEGPON'])}${ri(100000,999999)}`;
      } else if (aktif === 'loss') info = pick(INFO_LOSS);
      else if (aktif === 'Maintenance') info = pick(INFO_MAINT);
      else info = pick(INFO_MIGRASI);

      const key = `${todayStr}|${aktif}|${odc}|${lokasi}|${h}:${mi}`;
      if (ticketKeys.has(key)) continue;
      ticketKeys.add(key);

      const created_at = dt(day.getUTCFullYear(), day.getUTCMonth()+1, day.getUTCDate(), h, mi);
      let date_selesai = null;
      if (status === 'Selesai') {
        // selesai 1–72 jam setelah dibuat
        const hrs = ri(1, 72);
        const sd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, mi) + hrs * 3600000);
        if (sd <= new Date()) date_selesai = dt(sd.getUTCFullYear(), sd.getUTCMonth()+1, sd.getUTCDate(), sd.getUTCHours(), sd.getUTCMinutes());
        else status = 'Dikerjakan'; // jangan ada selesai di masa depan
      }
      const priority = Math.random() < 0.55 ? pick(['Low','Moderate']) : pick(priorities.filter(p => p === 'Critical' || p === 'Urgent'));

      ticketRows.push([
        aktif, pick(subNodes), odc, lokasi, pic, priority, status, info,
        createdBy, created_at, date_selesai
      ]);
    }
  }
  // batch insert tickets
  for (let i = 0; i < ticketRows.length && !PSB_ONLY; i += 200) {
    const batch = ticketRows.slice(i, i + 200);
    const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await pool.query(
      `INSERT INTO tickets (aktifitas, sub_node, odc, lokasi, pic, priority, status, info, created_by, created_at, date_selesai) VALUES ${ph}`,
      batch.flat()
    );
  }
  ticketCount = ticketRows.length;
  console.log(`  ✅ ${ticketCount} tiket (${START_DATE} s/d ${END_DATE})`);

  // === 2. PSB ===
  console.log('📌 PSB...');
  const psbRows = [];
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    const n = ri(2, 4); // 2–4 PSB per hari
    for (let k = 0; k < n; k++) {
      const status = statusForPsb(ageIdx(day), ageTotal);
      const nama = `${pick(NAMA_DEPAN)} ${pick(NAMA_BELAKANG)}`;
      const addr = `${pick(ALAMAT)} No.${ri(1,200)}, ${pick(LOKASI)}`;
      const odp = pick(odps);
      const coords = [
        (-8.45 - Math.random() * 0.45).toFixed(7),
        (116.2 + Math.random() * 0.7).toFixed(7)
      ];
      const createdBy = Math.random() < 0.5 ? pick(TEKNISI) : pick(OPERATOR);
      const h = ri(8, 17), mi = ri(0, 59);
      const created_at = dt(day.getUTCFullYear(), day.getUTCMonth()+1, day.getUTCDate(), h, mi);
      psbRows.push([
        nama, addr, phone(), `${pick(['HWTCMB','ZTEGPON'])}${ri(100000,999999)}`,
        coords[0], coords[1], odp, null, status, createdBy, created_at, created_at
      ]);
    }
  }
  for (let i = 0; i < psbRows.length; i += 200) {
    const batch = psbRows.slice(i, i + 200);
    const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await pool.query(
      `INSERT INTO psb (customer_name, address, phone, onu_sn, latitude, longitude, odp_label, photo, status, created_by, created_at, updated_at) VALUES ${ph}`,
      batch.flat()
    );
  }
  console.log(`  ✅ ${psbRows.length} PSB (${START_DATE} s/d ${END_DATE})`);

  await pool.end();
  console.log('\n🎉 DONE!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
