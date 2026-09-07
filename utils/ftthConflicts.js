// Cacat #2, Sprint 3 — SN unik & port-bentrok untuk ONU sebelumnya HANYA
// dicek di jalur langsung (routes/ftth.js POST/PUT). Draft ONU yang dibuat
// otomatis dari PSB "Terpasang" (routes/psb.js) lolos tanpa pengecekan sama
// sekali, dan mengonfirmasi draft lewat PUT /api/ftth/:id (is_draft: false)
// juga tidak mengulang cek kalau serial_number/parent_port tidak dikirim
// ulang di request itu — padahal nilai yang TERSIMPAN itulah yang sebenarnya
// akan jadi data resmi. Satu fungsi dipakai bersama oleh ketiga jalur itu
// supaya aturannya persis sama, bukan diduplikasi/didesinkron tiga tempat.
//
// `queryable` bisa berupa pool db.js biasa ATAU sebuah transaction connection
// (keduanya punya method .query() yang sama) — dipanggil dari luar maupun
// dari dalam transaksi PSB→Terpasang.
async function checkOnuConflicts(queryable, { serialNumber, groupName, parentPort, excludeId }) {
  const excId = excludeId || 0;

  if (serialNumber) {
    const [dup] = await queryable.query(
      "SELECT id, label FROM ftth_devices WHERE type = 'onu' AND serial_number = ? AND id != ?",
      [serialNumber, excId]
    );
    if (dup.length > 0) {
      return `SN "${serialNumber}" sudah terdaftar pada ${dup[0].label}`;
    }
  }

  if (parentPort && groupName) {
    const [conflict] = await queryable.query(
      "SELECT id, label FROM ftth_devices WHERE type = 'onu' AND group_name = ? AND parent_port = ? AND id != ?",
      [groupName, parentPort, excId]
    );
    if (conflict.length > 0) {
      return `Port "${parentPort}" pada "${groupName}" sudah dipakai oleh ${conflict[0].label}`;
    }
  }

  return null;
}

module.exports = { checkOnuConflicts };
