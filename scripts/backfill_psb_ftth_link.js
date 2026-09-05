/**
 * Backfill scripts/backfill_psb_ftth_link.js
 *
 * Jalankan SETELAH scripts/add_psb_ftth_link.sql (menambah kolom
 * psb.ftth_device_id) pada database yang sudah berjalan lama, supaya PSB
 * lama yang sudah "Terpasang"/"Aktif" ikut tertaut ke baris ONU-nya di
 * ftth_devices -- bukan cuma PSB baru ke depannya (yang sudah ditautkan
 * otomatis oleh routes/psb.js saat transisi status).
 *
 * Strategi: HANYA menautkan pasangan yang cocok PASTI (serial_number ONU
 * sama persis dengan psb.onu_sn, dan ONU itu belum ditautkan ke PSB lain).
 * Tidak ada tebak-tebakan berdasarkan nama pelanggan/alamat -- PSB atau
 * ONU yang tidak punya pasangan pasti dibiarkan NULL selamanya, itu wajar
 * (lihat komentar psb.ftth_device_id di schema.sql). Aman dijalankan ulang
 * kapan saja -- hanya menyentuh baris yang ftth_device_id-nya masih NULL.
 *
 * Cara jalan: node scripts/backfill_psb_ftth_link.js
 * (tambahkan --dry-run untuk lihat hasil tanpa benar-benar UPDATE)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const DRY_RUN = process.argv.includes('--dry-run');

async function backfill() {
    const stats = { linked: 0, noMatch: 0, ambiguous: 0, alreadyClaimed: 0 };

    try {
        const [candidates] = await db.query(
            `SELECT id, onu_sn FROM psb
             WHERE status IN ('Terpasang', 'Aktif')
               AND ftth_device_id IS NULL
               AND onu_sn IS NOT NULL AND onu_sn <> ''`
        );

        if (candidates.length === 0) {
            console.log('Tidak ada baris PSB yang perlu di-backfill (semua sudah tertaut atau tidak punya onu_sn).');
            return;
        }
        console.log(`Ditemukan ${candidates.length} baris PSB (Terpasang/Aktif, belum tertaut) untuk dicek.`);

        // Set ONU yang sudah dipakai PSB lain (di run sebelumnya) -- dicek
        // ulang per baris juga untuk cegah 1 ONU tertaut ke >1 PSB dalam
        // satu proses backfill ini sendiri.
        const claimedInThisRun = new Set();

        for (const psbRow of candidates) {
            const [matches] = await db.query(
                `SELECT id FROM ftth_devices WHERE type = 'onu' AND serial_number = ?`,
                [psbRow.onu_sn]
            );

            if (matches.length === 0) {
                stats.noMatch++;
                continue;
            }
            if (matches.length > 1) {
                console.warn(`  SKIP PSB #${psbRow.id} (SN ${psbRow.onu_sn}): ${matches.length} ONU punya SN yang sama -- ambigu, perlu ditautkan manual.`);
                stats.ambiguous++;
                continue;
            }

            const ftthId = matches[0].id;
            if (claimedInThisRun.has(ftthId)) {
                stats.alreadyClaimed++;
                continue;
            }
            const [alreadyLinked] = await db.query(
                `SELECT id FROM psb WHERE ftth_device_id = ? LIMIT 1`,
                [ftthId]
            );
            if (alreadyLinked.length > 0) {
                stats.alreadyClaimed++;
                continue;
            }

            claimedInThisRun.add(ftthId);
            if (!DRY_RUN) {
                await db.query(`UPDATE psb SET ftth_device_id = ? WHERE id = ?`, [ftthId, psbRow.id]);
            }
            console.log(`  ${DRY_RUN ? '[dry-run] akan menautkan' : 'Tertaut:'} PSB #${psbRow.id} (SN ${psbRow.onu_sn}) -> ftth_devices #${ftthId}`);
            stats.linked++;
        }

        console.log('\n=== Ringkasan backfill ===');
        console.log(`Tertaut${DRY_RUN ? ' (dry-run, belum disimpan)' : ''}: ${stats.linked}`);
        console.log(`Tidak ada ONU dengan SN cocok: ${stats.noMatch}`);
        console.log(`Ambigu (>1 ONU SN sama): ${stats.ambiguous}`);
        console.log(`ONU sudah tertaut ke PSB lain: ${stats.alreadyClaimed}`);
        if (DRY_RUN) console.log('\n--dry-run aktif -- tidak ada perubahan disimpan. Jalankan tanpa --dry-run untuk menerapkan.');
    } catch (error) {
        console.error('Backfill gagal:', error);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
}

backfill();
