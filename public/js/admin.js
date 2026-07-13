document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || user.role !== 'Owner') { window.location.href = 'dashboard.html'; return; }

  const homeEl = document.getElementById('adminHome');
  const detailEl = document.getElementById('adminDetail');
  let allData = {};
  let editId = null, editType = '', deleteId = null, deleteLabel = '';

  const SECTIONS = {
    aktifitas: { icon:'fa-tasks',   label:'Aktifitas', color:'#2563eb', coord:false },
    sub_node:  { icon:'fa-sitemap', label:'Sub-Node',  color:'#7c3aed', coord:true  },
    ftth:      { icon:'fa-network-wired', label:'Jaringan FTTH', color:'#059669', coord:false },
    priority:  { icon:'fa-flag',    label:'Priority',   color:'#d97706', coord:false },
    psb:       { icon:'fa-file-alt',label:'PSB Form',   color:'#db2777', coord:false },
  };

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Toast
  function toast(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.className = 'toast show';
    setTimeout(() => t.className = 'toast', 2500);
  }

  // ==================== CARDS ====================
  function renderCards() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = Object.entries(SECTIONS).map(([k, s]) => {
      let countHtml = '';
      const data = allData[k];
      if (k === 'ftth') {
        const olt = (allData.olt||[]).length;
        const odc = (allData.odc||[]).length;
        const odp = (allData.odp||[]).length;
        countHtml = `<div class="admin-card-count" style="font-size:1.2rem;">OLT ${olt} · ODC ${odc} · ODP ${odp}</div>`;
      } else if (k === 'psb') {
        countHtml = '';
      } else if (data) {
        countHtml = `<div class="admin-card-count">${data.length}</div>`;
      }
      return `<div class="admin-card" onclick="goSection('${k}')" style="${k==='psb'?'opacity:0.6;':''}">
        <div class="admin-card-icon" style="color:${s.color}"><i class="fas ${s.icon}"></i></div>
        <div class="admin-card-title">${s.label}</div>
        ${countHtml}
        <div class="admin-card-sub">${k==='psb'?'→ Buka halaman':'Klik untuk kelola'}</div>
      </div>`;
    }).join('');
  }

  window.goSection = function(key) {
    if (key === 'psb') { toast('PSB Form akan segera hadir'); return; }
    homeEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    if (key === 'ftth') renderFtth();
    else renderList(key);
  };

  window.goHome = function() {
    homeEl.classList.remove('hidden');
    detailEl.classList.add('hidden');
    detailEl.innerHTML = '';
  };

  // ==================== SIMPLE LIST ====================
  function renderList(type) {
    const s = SECTIONS[type];
    const items = allData[type] || [];
    detailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button>
        <h2 style="margin:0;"><i class="fas ${s.icon}" style="color:#4f46e5;"></i> ${s.label} (${items.length})</h2>
      </div>
      <div class="admin-card" id="listWrap">
        <div id="listItems">${renderItems(type, items)}</div>
        <button class="btn-add-ref" onclick="showAddForm('${type}')"><i class="fas fa-plus"></i> Tambah ${s.label}</button>
        <div id="addForm${type}" style="display:none;"></div>
      </div>`;
  }

  function renderItems(type, items) {
    if (!items.length) return '<div class="empty-ref">Belum ada data</div>';
    return items.map(i =>
      `<div class="ref-item">
        <div class="ref-label">${i.lat&&i.lng?'📍 ':''}${esc(i.label)}</div>
        <div class="ref-actions">
          <button class="btn-edit-ref" onclick="openEdit('${type}',${i.id},'${esc(i.label)}','','${i.lat||''}','${i.lng||''}')"><i class="fas fa-edit"></i></button>
          <button class="btn-del-ref" onclick="openDelete(${i.id},'${esc(i.label)}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`
    ).join('');
  }

  window.showAddForm = function(type) {
    const s = SECTIONS[type];
    const f = document.getElementById('addForm'+type);
    f.style.display = 'block';
    f.innerHTML = `<div class="inline-form">
      <input type="text" id="inp-${type}" placeholder="Label ${s.label}" autofocus>
      ${s.coord?'<input type="text" id="inp-'+type+'-lat" placeholder="Latitude" style="min-width:100px;">':''}
      ${s.coord?'<input type="text" id="inp-'+type+'-lng" placeholder="Longitude" style="min-width:100px;">':''}
      <button class="btn-save" onclick="saveSimple('${type}')"><i class="fas fa-check"></i> Simpan</button>
      <button class="btn-cancel" onclick="document.getElementById('addForm${type}').style.display='none'"><i class="fas fa-times"></i></button>
    </div>`;
  };

  window.saveSimple = async function(type) {
    const label = document.getElementById('inp-'+type).value.trim();
    if (!label) return;
    const s = SECTIONS[type];
    const lat = s.coord ? (document.getElementById('inp-'+type+'-lat')?.value.trim()||'') : '';
    const lng = s.coord ? (document.getElementById('inp-'+type+'-lng')?.value.trim()||'') : '';
    try {
      const body = { type, label };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { toast('Berhasil ditambahkan'); goHome(); await loadData(); goSection(type); }
      else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };

  // ==================== FTTH TREE ====================
  function renderFtth() {
    const olts = allData.olt || [];
    const odcs = allData.odc || [];
    const odps = allData.odp || [];
    detailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button>
        <h2 style="margin:0;"><i class="fas fa-network-wired" style="color:#059669;"></i> Jaringan FTTH</h2>
        <span style="font-size:0.85rem;color:var(--text-muted);margin-left:8px;">OLT ${olts.length} · ODC ${odcs.length} · ODP ${odps.length}</span>
      </div>
      <div class="admin-card" id="ftthWrap">
        ${olts.map(olt => {
          const childOdcs = odcs.filter(o => o.group === olt.label);
          return `<div class="ftth-olt">
            <div class="ftth-olt-hdr">
              <span>${olt.lat&&olt.lng?'📍 ':''}${esc(olt.label)}</span>
              <div class="ref-actions">
                <button class="btn-edit-ref" onclick="openEdit('olt',${olt.id},'${esc(olt.label)}','','${olt.lat||''}','${olt.lng||''}')"><i class="fas fa-edit"></i></button>
                <button class="btn-del-ref" onclick="openDelete(${olt.id},'${esc(olt.label)}')"><i class="fas fa-trash"></i></button>
                <button class="btn-sm" style="background:#e0e7ff;color:#4338ca;" onclick="showAddFtth('odc','${esc(olt.label)}')">+ODC</button>
              </div>
            </div>
            ${childOdcs.map(odc => {
              const childOdps = odps.filter(p => p.group === odc.label);
              return `<div class="ftth-odc">
                <span>${odc.lat&&odc.lng?'📍 ':''}${esc(odc.label)}</span>
                <div class="ref-actions">
                  <button class="btn-edit-ref" onclick="openEdit('odc',${odc.id},'${esc(odc.label)}','${esc(odc.group||'')}','${odc.lat||''}','${odc.lng||''}')"><i class="fas fa-edit"></i></button>
                  <button class="btn-del-ref" onclick="openDelete(${odc.id},'${esc(odc.label)}')"><i class="fas fa-trash"></i></button>
                  <button class="btn-sm" style="background:#d1fae5;color:#047857;" onclick="showAddFtth('odp','${esc(odc.label)}')">+ODP</button>
                </div>
              </div>
              ${childOdps.map(odp => `<div class="ftth-odp">
                <span>${odp.lat&&odp.lng?'📍 ':''}${esc(odp.label)}</span>
                <div class="ref-actions">
                  <button class="btn-edit-ref" onclick="openEdit('odp',${odp.id},'${esc(odp.label)}','${esc(odp.group||'')}','${odp.lat||''}','${odp.lng||''}')"><i class="fas fa-edit"></i></button>
                  <button class="btn-del-ref" onclick="openDelete(${odp.id},'${esc(odp.label)}')"><i class="fas fa-trash"></i></button>
                  <span style="font-size:0.75rem;color:#94a3b8;margin-left:8px;">ONU: —</span>
                </div>
              </div>`).join('')}`;
            }).join('')}
          </div>`;
        }).join('')}
        <button class="btn-add-ref" onclick="showAddFtth('olt')" style="margin-top:12px;"><i class="fas fa-plus"></i> Tambah OLT</button>
      </div>`;
  }

  // ==================== FTTH ADD (via modal) ====================
  window.showAddFtth = function(type, parentGroup) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP' };
    const title = titles[type];

    // Build form HTML
    let html = `<input type="text" id="finp" placeholder="Label ${title}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;" autofocus>`;

    if (type === 'olt') {
      html += `<div style="display:flex;gap:8px;">
        <input type="text" id="finp-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="finp-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
      </div>`;
    } else if (type === 'odc') {
      const oltList = (allData.olt||[]).map(o => o.label);
      html += `<select id="finp-group" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;">
        ${oltList.map(l => `<option value="${esc(l)}" ${l===parentGroup?'selected':''}>${esc(l)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;">
        <input type="text" id="finp-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="finp-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
      </div>`;
    } else {
      const odcList = (allData.odc||[]).map(o => o.label);
      html += `<select id="finp-group" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;">
        <option value="">Pilih Induk ODC</option>
        ${odcList.map(l => `<option value="${esc(l)}" ${l===parentGroup?'selected':''}>${esc(l)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;">
        <input type="text" id="finp-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="finp-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
      </div>`;
    }

    html += `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
      <button class="login-btn" style="background:#6b7280;" onclick="document.getElementById('editModal').classList.remove('show')">Batal</button>
      <button class="login-btn" onclick="saveFtth('${type}')">Simpan</button>
    </div>`;

    document.getElementById('editModalTitle').textContent = `Tambah ${title} Baru`;
    document.getElementById('editModalBody').style.display = 'none';
    document.getElementById('addFormContainer').style.display = 'block';
    document.getElementById('addFormContainer').innerHTML = html;
    document.getElementById('editModal').classList.add('show');
  };

  window.saveFtth = async function(type) {
    const label = document.getElementById('finp').value.trim();
    if (!label) { toast('Label harus diisi'); return; }
    const group = type !== 'olt' ? (document.getElementById('finp-group')?.value||'') : '';
    const lat = (document.getElementById('finp-lat')?.value.trim()||'');
    const lng = (document.getElementById('finp-lng')?.value.trim()||'');
    if (type !== 'olt' && !group) { toast('Pilih induk terlebih dahulu'); return; }
    try {
      const body = { type, label };
      if (type !== 'olt') body.group_name = group;
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        document.getElementById('editModal').classList.remove('show');
        document.getElementById('editModalBody').style.display = 'block';
        document.getElementById('addFormContainer').style.display = 'none';
        toast('Berhasil ditambahkan');
        goHome(); await loadData(); goSection('ftth');
      } else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };

  // ==================== EDIT (via modal) ====================
  window.openEdit = function(type, id, label, group, lat, lng) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP', aktifitas:'Aktifitas', sub_node:'Sub-Node', priority:'Priority' };
    editId = id; editType = type;
    const t = titles[type] || type;
    const hasCoord = ['olt','odc','odp','sub_node'].includes(type);
    const hasGroup = ['odc','odp'].includes(type);

    document.getElementById('editModalTitle').textContent = `Edit ${t}`;
    document.getElementById('editModalBody').style.display = 'block';
    document.getElementById('addFormContainer').style.display = 'none';
    document.getElementById('editLabel').value = label;
    document.getElementById('editGroupWrap').style.display = hasGroup ? 'block' : 'none';
    if (hasGroup) document.getElementById('editGroup').value = group;
    document.getElementById('editCoordWrap').style.display = hasCoord ? 'block' : 'none';
    if (hasCoord) { document.getElementById('editLat').value = lat; document.getElementById('editLng').value = lng; }
    document.getElementById('editModal').classList.add('show');
  };

  document.getElementById('saveEditBtn').onclick = async () => {
    if (!editId) return;
    const hasCoord = ['olt','odc','odp','sub_node'].includes(editType);
    const hasGroup = ['odc','odp'].includes(editType);
    const body = { label: document.getElementById('editLabel').value.trim() };
    if (hasGroup) body.group_name = document.getElementById('editGroup').value.trim() || undefined;
    if (hasCoord) {
      const el = document.getElementById('editLat').value.trim();
      const en = document.getElementById('editLng').value.trim();
      if (el && en) { body.latitude = parseFloat(el); body.longitude = parseFloat(en); }
    }
    try {
      const r = await fetch(`/api/references/${editId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        document.getElementById('editModal').classList.remove('show');
        toast('Berhasil diupdate');
        goHome(); await loadData();
        goSection(['olt','odc','odp'].includes(editType) ? 'ftth' : editType);
      } else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };
  document.getElementById('cancelEditBtn').onclick = () => {
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('editModalBody').style.display = 'block';
    document.getElementById('addFormContainer').style.display = 'none';
  };

  // ==================== DELETE (via modal) ====================
  window.openDelete = function(id, label) {
    deleteId = id; deleteLabel = label;
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;
  };

  document.getElementById('confirmDelBtn').onclick = async () => {
    if (!deleteId) return;
    try {
      const r = await fetch(`/api/references/${deleteId}`, { method:'DELETE' });
      if (r.ok) {
        document.getElementById('confirmModal').classList.remove('show');
        toast(`"${deleteLabel}" berhasil dihapus`);
        deleteId = null;
        goHome(); await loadData(); renderCards();
      } else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };
  document.getElementById('cancelDelBtn').onclick = () => document.getElementById('confirmModal').classList.remove('show');

  // ==================== LOAD DATA ====================
  async function loadData() {
    try {
      const r = await fetch('/api/references');
      allData = await r.json();
      renderCards();
    } catch(e) {
      document.getElementById('cardGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Gagal load data</div>';
    }
  }

  await loadData();
});
