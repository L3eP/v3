/**
 * Backfill scripts/backfill_ftth_rename_links.js
 *
 * Jalankan SETELAH scripts/add_ftth_rename_links.sql pada database yang
 * sudah berjalan lama, supaya tiket & PSB lama yang sudah punya teks
 * odc/odp/odp_label ikut tertaut ke baris ftth_devices aslinya -- bukan
 * cuma tiket/PSB baru ke depannya (yang sudah ditautkan otomatis oleh
 * routes/tickets.js & routes/psb.js saat teks-nya divalidasi).
 *
 * Strategi: HANYA menautkan yang cocok PASTI (exact match type+label ke
 * ftth_devices, dan cuma kalau hasilnya TEPAT SATU baris). Beda dari
 * backfill_psb_ftth_link.js (SN ONU unik 1:1), banyak tiket/PSB WAJAR
 * menunjuk ODC/ODP yang SAMA -- jadi di sini tidak ada konsep "sudah
 * diklaim", satu ftth_devices boleh jadi tujuan banyak baris. Yang
 * membuat sebuah pasangan di-skip cuma: (a) tidak ada yang cocok, atau
 * (b) lebih dari satu ftth_devices punya type+label yang sama (ODP
 * dengan nama sama di bawah ODC berbeda) -- ambigu, tidak ditebak.
 *
 * Aman dijalankan ulang kapan saja -- hanya menyentuh baris yang
 * ftth_*_id-nya masih NULL.
 *
 * Cara jalan: node scripts/backfill_ftth_rename_links.js
 * (tambahkan --dry-run untuk lihat hasil tanpa benar-benar UPDATE)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const DRY_RUN = process.argv.includes('--dry-run');

async function backfillColumn({ table, idColumn, textColumn, ftthType, label }) {
  const stats = { linked: 0, noMatch: 0, ambiguous: 0 };

  const [candidates] = await db.query(
    `SELECT id, \`${textColumn}\` AS text_val FROM \`${table}\`
     WHERE \`${idColumn}\` IS NULL AND \`${textColumn}\` IS NOT NULL AND \`${textColumn}\` <> ''`
  );

  if (candidates.length === 0) {
    console.log(`[${label}] Tidak ada baris yang perlu di-backfill.`);
    return stats;
  }
  console.log(`[${label}] Ditemukan ${candidates.length} baris untuk dicek.`);

  for (const row of candidates) {
    const [matches] = await db.query(
      'SELECT id FROM ftth_devices WHERE type = ? AND label = ?',
      [ftthType, row.text_val]
    );

    if (matches.length === 0) {
      stats.noMatch++;
      continue;
    }
    if (matches.length > 1) {
      console.warn(`  [${label}] SKIP #${row.id} ("${row.text_val}"): ${matches.length} ${ftthType} punya label yang sama -- ambigu, perlu ditautkan manual.`);
      stats.ambiguous++;
      continue;
    }

    const ftthId = matches[0].id;
    if (!DRY_RUN) {
      await db.query(`UPDATE \`${table}\` SET \`${idColumn}\` = ? WHERE id = ?`, [ftthId, row.id]);
    }
    console.log(`  [${label}] ${DRY_RUN ? '[dry-run] akan menautkan' : 'Tertaut:'} #${row.id} ("${row.text_val}") -> ftth_devices #${ftthId}`);
    stats.linked++;
  }

  return stats;
}

async function backfill() {
  try {
    const ticketsOdc = await backfillColumn({
      table: 'tickets', idColumn: 'ftth_odc_id', textColumn: 'odc', ftthType: 'odc', label: 'tickets.odc',
    });
    const ticketsOdp = await backfillColumn({
      table: 'tickets', idColumn: 'ftth_odp_id', textColumn: 'odp', ftthType: 'odp', label: 'tickets.odp',
    });
    const psbOdp = await backfillColumn({
      table: 'psb', idColumn: 'ftth_odp_id', textColumn: 'odp_label', ftthType: 'odp', label: 'psb.odp_label',
    });

    const total = { linked: 0, noMatch: 0, ambiguous: 0 };
    for (const s of [ticketsOdc, ticketsOdp, psbOdp]) {
      total.linked += s.linked; total.noMatch += s.noMatch; total.ambiguous += s.ambiguous;
    }

    console.log('\n=== Ringkasan backfill ===');
    console.log(`Tertaut${DRY_RUN ? ' (dry-run, belum disimpan)' : ''}: ${total.linked}`);
    console.log(`Tidak ada ftth_devices dengan label cocok: ${total.noMatch}`);
    console.log(`Ambigu (>1 device label sama): ${total.ambiguous}`);
    if (DRY_RUN) console.log('\n--dry-run aktif -- tidak ada perubahan disimpan. Jalankan tanpa --dry-run untuk menerapkan.');
  } catch (error) {
    console.error('Backfill gagal:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

backfill();
