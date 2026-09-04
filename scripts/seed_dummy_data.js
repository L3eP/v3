/**
 * Seed Dummy Data — MAYUNG Ticketing System (Bulk Insert Version)
 *
 * node scripts/seed_dummy_data.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const NAMA_DEPAN = ['Ahmad','Budi','Citra','Dedi','Eka','Fitri','Guntur','Hasanah','Indah','Joko',
  'Kartika','Lilis','Miftah','Nurul','Opik','Putri','Qori','Rudi','Siti','Taufik',
  'Umar','Vina','Wawan','Yanti','Zainal','Agus','Baiq','Chairul','Diana','Edi',
  'Faisal','Gita','Hendra','Isnaini','Jamilah','Kurnia','Lalu','Maya','Ningsih','Oka',
  'Parhan','Ria','Saiful','Tini','Usman','Wiwin','Yusuf','Zaenab','Arif','Baidowi',
  'Cahya','Darmawan','Erna','Fathur','Gunawan','Husni','Ida','Jamal','Khalid','Lina',
  'Mahmud','Nadia','Oman','Pahrul','Ratna','Sahril','Tahir','Umairoh','Wardiman','Yuliana',
  'Zainuddin','Ari','Baihaki','Candra','Dahlia','Ermawati','Fahrul','Gusti','Halimah','Irfan',
  'Junaidi','Kasmini','Lukman','Marzuki','Nina','Ony','Paizah','Rasidi','Sukri','Tarmizi',
  'Ulfah','Wahid','Yasin','Zohri','Anwar','Burhan','Dahlan','Fauzi','Hamzah','Iskandar'];

const NAMA_BELAKANG = ['Hidayat','Pratama','Wijaya','Saputra','Kusuma','Permadi','Ramadhani','Setiawan',
  'Suryadi','Utama','Anggraini','Febrianti','Handayani','Indrasari','Kurniawan','Lestari',
  'Maulana','Ningsih','Pertiwi','Rahmawati','Susanti','Wulandari','Yulianti','Zahara',
  'Ardiansyah','Budiman','Cahyono','Dewi','Firmansyah','Gunarto','Hakim','Ilham',
  'Jayadi','Kartini','Mulyadi','Nasution','Purnama','Rasyid','Soleh','Taslim',
  'Wahyudi','Yusran','Zain','Alamsyah','Bahri','Darmadi','Effendi','Ghozali',
  'Harjono','Irawan','Jamil','Khalik','Latif','Marwan','Nurdin','Pahlevi',
  'Rahman','Syahputra','Thalib','Ubaidillah','Wardana','Yahya','Zen','Arifin',
  'Basri','Dachlan','Firdaus','Hambali','Ilyas','Jabbar','Karim','Luthfi',
  'Mukti','Najib','Pramono','Ridwan','Syafii','Taufiq','Wicaksono','Zulkarnain'];

const KOTA = ['Selong','Masbagik','Aikmel','Sakra','Sikur','Pringgasela','Suralaga','Sembalun',
  'Labuhan Lombok','Keruak','Jerowaru','Sukamulia','Pringgabaya','Wanasaba','Montong Gading',
  'Selong Timur','Denggen','Kembang Kerang','Lombok Timur','Praya','Mataram','Ampenan',
  'Cakranegara','Gerung','Tanjung','Bayah','Pemenang','Gangga'];

const JALAN = ['Jl. Raya','Jl. Pahlawan','Jl. Diponegoro','Jl. Ahmad Yani','Jl. Sudirman','Jl. Gajah Mada',
  'Jl. HOS Cokroaminoto','Jl. Merdeka','Jl. Kartini','Jl. Imam Bonjol','Jl. Pendidikan','Jl. Masjid',
  'Jl. TGH. Umar','Jl. TGH. Ibrahim','Jl. Pariwisata','Jl. Danau','Jl. Gunung','Jl. Mangga',
  'Jl. Mawar','Jl. Melati','Jl. Anggrek','Jl. Flamboyan','Jl. Cendana','Jl. Kenanga',
  'Gs. Orong','Gs. Dasan','Gs. Montong','Gs. Lauk','Gs. Daya','Gs. Kertak'];

const GANGGUAN = ['loss','Maintenance','PSB','migrasi'];
const STATUS_TICKET = ['Terlapor','Dikerjakan','Selesai','Pending'];
const STATUS_PSB = ['Terdaftar','Terpasang','Aktif'];
const PRIORITY_LIST = ['Low','Moderate','Critical'];
const SUB_NODES = ['ANJ','SKM','JRG','DMS','SKJ','RKM','MBL'];
const OLTS = ['OLA-A','OLA-B','OLA-C','OLA-D'];
const ODC_LIST = [
  'ODC 1 - rumah p enjel','ODC 2 - h. Marjan','ODC 3 - depan kubur sekarteja','ODC 4 - sekarteja',
  'ODC 5 - rumah amak unet','ODC 6 - indomaret sukamulia','ODC 7 - rumah epol','ODC 8 - orong piter induk',
  'ODC 9 - BTN Hanum','ODC 10 - BTN sekar anyar','ODC 11 - BTN sekar anyar','ODC 12 - Anjani',
  'ODC 13 - rumah pandi','ODC 14 - Rekat lauk','ODC 15 Gubuk Lauk Masjid'];
const OLT_ODC_MAP = {'OLA-A':[0,1,2,3],'OLA-B':[4,5,6,7],'OLA-C':[8,9,10,11],'OLA-D':[12,13,14]};

const AKTIFITAS_DESC = [
  'Cek ONU di rumah pelanggan','Ganti kabel FO','Setting ulang ONU','Pasang baru ONU',
  'Cek redaman kabel','Sambung kabel putus','Konfigurasi ulang OLT','Monitoring jaringan',
  'Survey lokasi pelanggan','Instalasi ONU baru','Perbaikan ODP','Pembersihan ODC',
  'Update firmware ONU','Cek tegangan OLT','Penggantian SFP','Splicing kabel',
  'Pengukuran daya OLT','Setting VLAN','Migrasi pelanggan','Aktifasi ONU baru'];

const INVENTORY_ITEMS = [
  ['ONU Huawei HG8245H','ONU',150],['ONU Huawei HG8240W5','ONU',80],['ONU ZTE F660','ONU',60],
  ['Kabel FO Drop 50m','Kabel',200],['Kabel FO Drop 100m','Kabel',150],['Kabel FO Feeder 500m','Kabel',30],
  ['Splice FTTH','Splice',500],['Connector SC/APC','Connector',300],['Connector SC/UPC','Connector',200],
  ['Adaptor SC/APC','Connector',250],['SFP GPON OLT','Lainnya',20],['SFP GPON ONU','Lainnya',40],
  ['Splitter 1:4','ODP',25],['Splitter 1:8','ODP',30],['Battrey Cadangan OLT','Lainnya',10],
  ['Kabel Pigtail SC/APC','Kabel',350]];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function ri(a,b) { return Math.floor(Math.random() * (b-a+1)) + a; }
function rd(a,b) { const n=new Date(); return new Date(n.getTime() + ri(a,b) * 86400000); }
function phone() { return '62'+pick(['877','878','819','817','813','823','853','855','856','859','861','862','863','865','866','867','868','869','871','896','897','898','899'])+ri(10000000,99999999); }

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST||'localhost', user: process.env.DB_USER||'root',
    password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'login_app',
    waitForConnections: true, connectionLimit: 10,
  });

  console.log('🔄 Truncate all tables (except users)...');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['ticket_status_history','activities','tickets','psb','inventory_log','inventory','ftth_devices','reference_options']) {
    await pool.query(`TRUNCATE TABLE ${t}`);
  }
  await pool.query('DELETE FROM sessions');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  // Load real users from DB
  const [users] = await pool.query("SELECT username, role FROM users WHERE deleted_at IS NULL");
  const TEKNISI = users.filter(u => u.role === 'Teknisi').map(u => u.username);
  const OPERATOR = users.filter(u => u.role === 'Operator').map(u => u.username);
  const OWNER = users.filter(u => u.role === 'Owner').map(u => u.username);
  const allUsers = [...TEKNISI, ...OPERATOR, ...OWNER];
  console.log(`  👥 ${allUsers.length} users loaded (${TEKNISI.length} teknisi, ${OPERATOR.length} operator, ${OWNER.length} owner)`);
  console.log('✅ Done\n');

  // === 1. REFERENCE OPTIONS ===
  console.log('📌 Reference options...');
  const refValues = [];
  for (let i=0; i<GANGGUAN.length; i++) refValues.push(['aktifitas', GANGGUAN[i], i+1]);
  for (let i=0; i<SUB_NODES.length; i++) refValues.push(['sub_node', SUB_NODES[i], i+1]);
  for (let i=0; i<ODC_LIST.length; i++) {
    const olt = Object.keys(OLT_ODC_MAP).find(k => OLT_ODC_MAP[k].includes(i));
    refValues.push(['odc', ODC_LIST[i], olt, i+1]);
  }
  // ODPs
  let odpIdx = 0;
  for (let i=0; i<ODC_LIST.length; i++) {
    const cnt = ri(2,4);
    for (let j=0; j<cnt; j++) refValues.push(['odp', `ODP ${++odpIdx}`, ODC_LIST[i], j+1]);
  }
  for (const p of ['Low','Moderate','Critical','Urgent']) refValues.push(['priority', p, p==='Low'?1:p==='Moderate'?2:p==='Critical'?3:4]);

  // Bulk insert references
  for (let i=0; i<refValues.length; i+=200) {
    const batch = refValues.slice(i, i+200);
    const placeholders = batch.map(() => '(?, ?, ?, ?)').join(',');
    const params = batch.flatMap(r => {
      if (r.length === 3) return [r[0], r[1], null, r[2]];
      return [r[0], r[1], r[2], r[3]];
    });
    await pool.query(`INSERT INTO reference_options (type, label, group_name, sort_order) VALUES ${placeholders}`, params);
  }
  console.log(`  ✅ ${refValues.length} references (${GANGGUAN.length} aktifitas, ${SUB_NODES.length} sub-node, ${ODC_LIST.length} ODC, ~${odpIdx} ODP)`);

  // === 2. FTTH DEVICES ===
  console.log('📌 FTTH devices...');
  const oltDevs = [
    ['olt','OLA-A','Huawei MA5800',16, -8.58, 116.48, 1],
    ['olt','OLA-B','Huawei MA5608T',8, -8.62, 116.52, 2],
    ['olt','OLA-C','ZTE C300',16, -8.55, 116.43, 3],
    ['olt','OLA-D','FS GPON',8, -8.65, 116.55, 4]
  ];
  const ftthValues = [...oltDevs.map(d => d)];
  let portCtr = {};
  for (const oltName of Object.keys(OLT_ODC_MAP)) {
    portCtr[oltName] = 0;
    for (const idx of OLT_ODC_MAP[oltName]) {
      portCtr[oltName]++;
      ftthValues.push(['odc', ODC_LIST[idx], oltName, `Port ${portCtr[oltName]}`, 8, (-8.5-Math.random()*0.5).toFixed(6), (116.3+Math.random()*0.6).toFixed(6), portCtr[oltName]]);
    }
  }
  // ODP & ONU
  const ODP_NAMES = [];
  for (let i=0; i<ODC_LIST.length; i++) {
    const cnt = ri(2,4);
    for (let j=1; j<=cnt; j++) ODP_NAMES.push(`ODP ${ODP_NAMES.length+1}`);
  }
  for (let i=0; i<ODP_NAMES.length; i++) {
    const parent = ODC_LIST[i % ODC_LIST.length];
    ftthValues.push(['odp', ODP_NAMES[i], parent, `Port ${Math.floor(i/ODC_LIST.length)+1}`, 4, (-8.5-Math.random()*0.5).toFixed(6), (116.3+Math.random()*0.6).toFixed(6), (i%ODC_LIST.length)+1]);
  }
  for (let i=1; i<=100; i++) {
    const parent = pick(ODP_NAMES);
    ftthValues.push(['onu', `ONU-${i}`, parent, `Port ${ri(1,4)}`, `HWTCMB${ri(100000,999999)}`, (-8.5-Math.random()*0.5).toFixed(6), (116.3+Math.random()*0.6).toFixed(6), i]);
  }
  // Group by type for bulk insert
  const typeInserts = {
    olt: { sql: 'INSERT INTO ftth_devices (type,label,brand,total_ports,latitude,longitude,sort_order) VALUES ', rows: [] },
    odc: { sql: 'INSERT INTO ftth_devices (type,label,group_name,parent_port,total_ports,latitude,longitude,sort_order) VALUES ', rows: [] },
    odp: { sql: 'INSERT INTO ftth_devices (type,label,group_name,parent_port,total_ports,latitude,longitude,sort_order) VALUES ', rows: [] },
    onu: { sql: 'INSERT INTO ftth_devices (type,label,group_name,parent_port,serial_number,latitude,longitude,sort_order) VALUES ', rows: [] },
  };
  for (const d of ftthValues) {
    const t = typeInserts[d[0]];
    if (t) t.rows.push(d);
  }
  for (const t of Object.values(typeInserts)) {
    if (!t.rows.length) continue;
    for (let i=0; i<t.rows.length; i+=50) {
      const batch = t.rows.slice(i,i+50);
      const ph = batch.map(r => `(${r.map(()=>'?').join(',')})`).join(',');
      await pool.query(t.sql + ph, batch.flat());
    }
  }
  console.log(`  ✅ ${ftthValues.length} FTTH devices`);

  // === 3. PSB (1000) ===
  console.log('📌 PSB 1000 customers (bulk)...');
  const BATCH = 100;
  const psbStatuses = ['Terdaftar','Terpasang','Aktif'];
  for (let b=0; b<1000; b+=BATCH) {
    const batch = [];
    for (let i=b; i<Math.min(b+BATCH, 1000); i++) {
      const nama = `${pick(NAMA_DEPAN)} ${pick(NAMA_BELAKANG)}`;
      const alamat = `${pick(JALAN)} No.${ri(1,200)}, ${pick(['Orong','Dasan','Montong','Kertak','Lauk','Daya'])}, ${pick(KOTA)}`;
      const created = rd(-180,-1);
      batch.push([nama, alamat, Math.random()>0.15?phone():null, `HWTCMB${ri(100000,999999)}`,
        (-8.5-Math.random()*0.5).toFixed(6), (116.3+Math.random()*0.6).toFixed(6),
        pick(ODP_NAMES), null, pick(psbStatuses), pick(TEKNISI), created]);
    }
    const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await pool.query(`INSERT INTO psb (customer_name,address,phone,onu_sn,latitude,longitude,odp_label,notes,status,created_by,created_at) VALUES ${ph}`, batch.flat());
    if ((b/BATCH) % 2 === 1) console.log(`  ${b+BATCH}/1000`);
  }
  console.log('  ✅ 1000 PSB');

  // === 4. TICKETS (500) ===
  console.log('📌 Tickets 500 (bulk)...');
  const ticketIds = [];
  for (let b=0; b<500; b+=BATCH) {
    const batch = [];
    for (let i=b; i<Math.min(b+BATCH, 500); i++) {
      const created = rd(-120,-1);
      const status = pick(STATUS_TICKET);
      const selesai = status==='Selesai' ? new Date(created.getTime()+ri(1,72)*3600000) : null;
      batch.push([pick(GANGGUAN), pick(SUB_NODES), pick(ODC_LIST), `${pick(JALAN)}, ${pick(KOTA)}`,
        pick(TEKNISI), pick(PRIORITY_LIST), status,
        `Laporan: ${pick(['Internet mati total','Jaringan lemot','ONU merah','Kabel putus','Instalasi baru','Migrasi alamat','Ganti ONU','Perbaikan kabel','Setting ulang','Penambahan port'])}`,
        Math.random()>0.3?pick(OWNER):pick(TEKNISI), created, selesai]);
    }
    const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const [result] = await pool.query(
      `INSERT INTO tickets (aktifitas,sub_node,odc,lokasi,pic,priority,status,info,created_by,created_at,date_selesai) VALUES ${ph}`,
      batch.flat()
    );
    // Get inserted IDs
    for (let j=0; j<batch.length; j++) ticketIds.push(Number(result.insertId) + j);
  }
  console.log('  ✅ 500 tickets');

  // === 5. STATUS HISTORY ===
  console.log('📌 Status history...');
  const histBatch = [];
  for (const tid of ticketIds) {
    const changes = ri(0,3);
    let old = null;
    for (let c=0; c<changes; c++) {
      const ns = pick(STATUS_TICKET.filter(s => s!==old));
      if (!ns) continue;
      histBatch.push([tid, old, ns, pick(TEKNISI), rd(-90,-1)]);
      old = ns;
    }
    if (histBatch.length >= 200) {
      const ph = histBatch.slice(0,200).map(() => '(?,?,?,?,?)').join(',');
      await pool.query('INSERT INTO ticket_status_history (ticket_id,old_status,new_status,changed_by,changed_at) VALUES '+ph, histBatch.splice(0,200).flat());
    }
  }
  if (histBatch.length) {
    const ph = histBatch.map(() => '(?,?,?,?,?)').join(',');
    await pool.query('INSERT INTO ticket_status_history (ticket_id,old_status,new_status,changed_by,changed_at) VALUES '+ph, histBatch.flat());
  }
  console.log('  ✅ Status history');

  // === 6. ACTIVITIES (2000) ===
  console.log('📌 Activities 2000 (bulk)...');
  for (let b=0; b<2000; b+=BATCH) {
    const batch = [];
    for (let i=b; i<Math.min(b+BATCH,2000); i++) {
      const tid = Math.random()>0.3 ? pick(ticketIds) : null;
      const date = rd(-120,0);
      batch.push([`${pick(AKTIFITAS_DESC)}${tid?' (tiket #'+tid+')':''}`, Math.random()>0.5?pick(TEKNISI):pick(OWNER), date, tid, date]);
    }
    const ph = batch.map(() => '(?,?,?,?,?)').join(',');
    await pool.query('INSERT INTO activities (description,username,date,ticket_id,created_at) VALUES '+ph, batch.flat());
  }
  console.log('  ✅ 2000 activities');

  // === 7. INVENTORY ===
  console.log('📌 Inventory...');
  for (const item of INVENTORY_ITEMS) {
    const used = ri(Math.floor(item[2]*0.3), Math.floor(item[2]*0.8));
    await pool.query('INSERT INTO inventory (device_type,device_name,total_stock,used_stock,location,created_by) VALUES (?,?,?,?,?,?)',
      [item[1], item[0], item[2], used, pick(['Gudang Pusat','Gudang JRG','Gudang SKM','Gudang HNM']), pick(OWNER)]);
  }
  console.log('  ✅ 16 inventory items');

  await pool.end();
  console.log('\n🎉 DONE!');
  console.log(`📊 ${refValues.length} refs | ${ftthValues.length} FTTH | 1000 PSB | 500 tiket | 2000 aktivitas`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
