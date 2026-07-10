document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || user.role !== 'Owner') { window.location.href = 'dashboard.html'; return; }

  const homeEl = document.getElementById('adminHome');
  const detailEl = document.getElementById('adminDetail');
  const cardGrid = document.getElementById('cardGrid');
  let allData = {};
  let editCallback = null;
  let deleteCallback = null;

  function showToast(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.className = 'toast show';
    setTimeout(() => t.className = 'toast', 2500);
  }

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ======== CARDS ========
  const CARDS = [
    { key:'aktifitas', icon:'fa-tasks',   label:'Aktifitas', color:'#2563eb', getCount: d => (d.aktifitas||[]).length },
    { key:'sub_node',  icon:'fa-sitemap', label:'Sub-Node',  color:'#7c3aed', getCount: d => (d.sub_node||[]).length },
    { key:'ftth',      icon:'fa-network-wired', label:'Jaringan FTTH', color:'#059669',
      getCount: d => ({olt:(d.olt||[]).length, odc:(d.odc||[]).length, odp:(d.odp||[]).length}) },
    { key:'priority',  icon:'fa-flag',    label:'Priority',   color:'#d97706', getCount: d => (d.priority||[]).length },
    { key:'psb',       icon:'fa-file-alt',label:'PSB Form',   color:'#db2777', isLink: true, getCount: () => null },
  ];

  function renderCards() {
    cardGrid.innerHTML = CARDS.map(c => {
      let countHtml = '';
      if (c.key === 'ftth') {
        const cnt = c.getCount(allData);
        countHtml = `<div class="admin-card-count" style="font-size:1.2rem;">OLT ${cnt.olt} · ODC ${cnt.odc} · ODP ${cnt.odp}</div>`;
      } else if (c.getCount) {
        const cnt = c.getCount(allData);
        countHtml = cnt !== null ? `<div class="admin-card-count">${cnt}</div>` : '';
      }
      return `<div class="admin-card" onclick="navigateTo('${c.key}')" style="${c.key==='psb'?'opacity:0.7;':''}">
        <div class="admin-card-icon" style="color:${c.color}"><i class="fas ${c.icon}"></i></div>
        <div class="admin-card-title">${c.label}</div>
        ${countHtml}
        ${c.isLink ? '<div class="admin-card-sub">→ Buka halaman</div>' : '<div class="admin-card-sub">Klik untuk kelola</div>'}
      </div>`;
    }).join('');
  }

  window.navigateTo = function(key) {
    if (key === 'psb') { showToast('PSB Form akan segera hadir'); return; }
    homeEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    if (key === 'ftth') renderFtth();
    else renderSimpleList(key);
  };

  window.goHome = function() {
    homeEl.classList.remove('hidden');
    detailEl.classList.add('hidden');
    detailEl.innerHTML = '';
  };

  // ======== SIMPLE LIST (aktifitas, sub_node, priority) ========
  function renderSimpleList(type) {
    const cfg = { aktifitas:{icon:'fa-tasks',title:'Aktifitas'}, sub_node:{icon:'fa-sitemap',title:'Sub-Node'}, priority:{icon:'fa-flag',title:'Priority'} }[type];
    const items = allData[type] || [];
    const hasCoord = type === 'sub_node';
    detailEl.innerHTML = `
      <div class="detail-header"><button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button><h2 style="margin:0;"><i class="fas ${cfg.icon}" style="color:#4f46e5;"></i> ${cfg.title} (${items.length})</h2></div>
      <div class="admin-card"><div id="slist-${type}"></div>
      <button class="btn-add-ref" onclick="showSimpleAdd('${type}')"><i class="fas fa-plus"></i> Tambah ${cfg.title}</button>
      <div id="sform-${type}" style="display:none;"></div></div>`;
    renderSimpleItems(type, items);
  }

  function renderSimpleItems(type, items) {
    const el = document.getElementById(`slist-${type}`);
    if (!items.length) { el.innerHTML = '<div class="empty-ref">Belum ada data</div>'; return; }
    const hasCoord = type === 'sub_node';
    el.innerHTML = items.map(i => `<div class="ref-item">
      <div class="ref-label">${i.lat&&i.lng?'📍 ':''}<span>${esc(i.label)}</span></div>
      <div class="ref-actions">
        <button class="btn-edit-ref" onclick="editRef('${type}',${i.id},'${esc(i.label)}','','${i.lat||''}','${i.lng||''}')"><i class="fas fa-edit"></i></button>
        <button class="btn-del-ref" onclick="confirmDel(${i.id},'${esc(i.label)}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
  }

  window.showSimpleAdd = function(type) {
    const cfg = { aktifitas:'Aktifitas', sub_node:'Sub-Node', priority:'Priority' }[type];
    const f = document.getElementById(`sform-${type}`);
    f.style.display = 'block';
    const hasCoord = type === 'sub_node';
    f.innerHTML = `<div class="inline-form">
      <input type="text" id="snew-${type}" placeholder="Label ${cfg}" autofocus>
      ${hasCoord?'<input type="text" id="snew-'+type+'-lat" placeholder="Latitude" style="min-width:100px;">':''}
      ${hasCoord?'<input type="text" id="snew-'+type+'-lng" placeholder="Longitude" style="min-width:100px;">':''}
      <button class="btn-save" onclick="addSimple('${type}')"><i class="fas fa-check"></i> Simpan</button>
      <button class="btn-cancel" onclick="document.getElementById('sform-${type}').style.display='none'"><i class="fas fa-times"></i></button>
    </div>`;
    document.querySelector(`.btn-add-ref[onclick*="'${type}'"]`).style.display = 'none';
  };

  window.addSimple = async function(type) {
    const label = document.getElementById(`snew-${type}`).value.trim();
    if (!label) return;
    const lat = type==='sub_node' ? (document.getElementById(`snew-${type}-lat`)?.value.trim()||'') : '';
    const lng = type==='sub_node' ? (document.getElementById(`snew-${type}-lng`)?.value.trim()||'') : '';
    try {
      const body = { type, label };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { showToast('Berhasil ditambahkan'); goHome(); await loadData(); navigateTo(type); }
      else showToast('Gagal');
    } catch(e) { showToast('Error: '+e.message); }
  };

  // ======== FTTH TREE (OLT → ODC → ODP) ========
  function renderFtth() {
    const olts = allData.olt || [];
    const odcs = allData.odc || [];
    const odps = allData.odp || [];

    detailEl.innerHTML = `
      <div class="detail-header"><button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button>
        <h2 style="margin:0;"><i class="fas fa-network-wired" style="color:#059669;"></i> Jaringan FTTH</h2>
        <span style="font-size:0.85rem;color:var(--text-muted);margin-left:8px;">OLT ${olts.length} · ODC ${odcs.length} · ODP ${odps.length}</span>
      </div>
      <div class="admin-card">
        <div id="ftthTree">
          ${olts.map(olt => {
            const childOdcs = odcs.filter(o => o.group === olt.label);
            return `<div class="ftth-olt">
              <div class="ftth-olt-hdr">
                <span>${olt.lat&&olt.lng?'📍 ':''}${esc(olt.label)}</span>
                <div class="ref-actions">
                  <button class="btn-edit-ref" onclick="editRef('olt',${olt.id},'${esc(olt.label)}','','${olt.lat||''}','${olt.lng||''}')"><i class="fas fa-edit"></i></button>
                  <button class="btn-del-ref" onclick="confirmDel(${olt.id},'${esc(olt.label)}')"><i class="fas fa-trash"></i></button>
                  <button class="btn-sm" style="background:#e0e7ff;color:#4338ca;" onclick="showFtthAdd('odc','${esc(olt.label)}')">+ODC</button>
                </div>
              </div>
              ${childOdcs.map(odc => {
                const childOdps = odps.filter(p => p.group === odc.label);
                return `<div class="ftth-odc">
                  <span>${odc.lat&&odc.lng?'📍 ':''}${esc(odc.label)}</span>
                  <div class="ref-actions">
                    <button class="btn-edit-ref" onclick="editRef('odc',${odc.id},'${esc(odc.label)}','${esc(odc.group||'')}','${odc.lat||''}','${odc.lng||''}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-del-ref" onclick="confirmDel(${odc.id},'${esc(odc.label)}')"><i class="fas fa-trash"></i></button>
                    <button class="btn-sm" style="background:#d1fae5;color:#047857;" onclick="showFtthAdd('odp','${esc(odc.label)}')">+ODP</button>
                  </div>
                </div>
                ${childOdps.map(odp => `<div class="ftth-odp">
                  <span>${odp.lat&&odp.lng?'📍 ':''}${esc(odp.label)}</span>
                  <div class="ref-actions">
                    <button class="btn-edit-ref" onclick="editRef('odp',${odp.id},'${esc(odp.label)}','${esc(odp.group||'')}','${odp.lat||''}','${odp.lng||''}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-del-ref" onclick="confirmDel(${odp.id},'${esc(odp.label)}')"><i class="fas fa-trash"></i></button>
                    <span style="font-size:0.75rem;color:#94a3b8;margin-left:8px;">ONU: —</span>
                  </div>
                </div>`).join('')}`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>
        <button class="btn-add-ref" onclick="showFtthAdd('olt')"><i class="fas fa-plus"></i> Tambah OLT</button>
      </div>`;
  }

  window.showFtthAdd = function(type, parentGroup) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP' };
    const title = titles[type];
    const btnHtml = `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
      <button class="login-btn" style="background:#6b7280;" onclick="document.getElementById('editModal').classList.remove('show')">Batal</button>
      <button class="login-btn" id="addSaveBtn">Simpan</button>
    </div>`;

    let formHtml = '';
    if (type === 'olt') {
      formHtml = `<input type="text" id="fnew-olt" placeholder="Label OLT" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;" autofocus>
        <div style="display:flex;gap:8px;"><input type="text" id="fnew-olt-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="fnew-olt-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>`;
    } else if (type === 'odc') {
      const oltList = (allData.olt||[]).map(o => o.label);
      formHtml = `<input type="text" id="fnew-odc" placeholder="Label ODC" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;" autofocus>
        <select id="fnew-odc-group" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;">
          ${oltList.map(l => `<option value="${esc(l)}" ${l===parentGroup?'selected':''}>${esc(l)}</option>`).join('')}
        </select>
        <div style="display:flex;gap:8px;"><input type="text" id="fnew-odc-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="fnew-odc-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>`;
    } else if (type === 'odp') {
      const odcList = (allData.odc||[]).map(o => o.label);
      formHtml = `<input type="text" id="fnew-odp" placeholder="Label ODP" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;" autofocus>
        <select id="fnew-odp-group" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:8px;">
          <option value="">Pilih Induk ODC</option>
          ${odcList.map(l => `<option value="${esc(l)}" ${l===parentGroup?'selected':''}>${esc(l)}</option>`).join('')}
        </select>
        <div style="display:flex;gap:8px;"><input type="text" id="fnew-odp-lat" placeholder="Latitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        <input type="text" id="fnew-odp-lng" placeholder="Longitude" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>`;
    }

    // Tampilkan form di modal
    document.getElementById('editModalTitle').textContent = `Tambah ${title} Baru`;
    document.getElementById('editFormContainer').style.display = 'none';
    document.getElementById('addFormContainer').style.display = 'block';
    document.getElementById('addFormContainer').innerHTML = formHtml + btnHtml;

    // Event klik Simpan
    setTimeout(() => {
      document.getElementById('addSaveBtn').addEventListener('click', async () => {
        const label = document.getElementById(`fnew-${type}`).value.trim();
        if (!label) { showToast('Label harus diisi'); return; }
        const group = type !== 'olt' ? (document.getElementById(`fnew-${type}-group`)?.value||'') : '';
        const lat = (document.getElementById(`fnew-${type}-lat`)?.value.trim()||'');
        const lng = (document.getElementById(`fnew-${type}-lng`)?.value.trim()||'');
        if (type !== 'olt' && !group) { showToast('Pilih induk terlebih dahulu'); return; }
        try {
          const body = { type, label };
          if (type !== 'olt') body.group_name = group;
          if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
          const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
          if (r.ok) { document.getElementById('editModal').classList.remove('show'); showToast(`${title} berhasil ditambahkan`); goHome(); await loadData(); navigateTo('ftth'); }
          else showToast('Gagal');
        } catch(e) { showToast('Error: '+e.message); }
      });
    }, 50);

    editCallback = async () => {
      const label = document.getElementById(`fnew-${type}`).value.trim();
      if (!label) return;
      const group = type !== 'olt' ? (document.getElementById(`fnew-${type}-group`)?.value||'') : '';
      const lat = (document.getElementById(`fnew-${type}-lat`)?.value.trim()||'');
      const lng = (document.getElementById(`fnew-${type}-lng`)?.value.trim()||'');
      if (type !== 'olt' && !group) { showToast('Pilih induk terlebih dahulu'); return; }
      try {
        const body = { type, label };
        if (type !== 'olt') body.group_name = group;
        if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
        const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if (r.ok) { document.getElementById('editModal').classList.remove('show'); showToast(`${title} berhasil ditambahkan`); goHome(); await loadData(); navigateTo('ftth'); }
        else showToast('Gagal');
      } catch(e) { showToast('Error: '+e.message); }
    };

    document.getElementById('editModal').classList.add('show');
  };

  window.addFtth = async function(type) {
    const label = document.getElementById(`fnew-${type}`).value.trim();
    if (!label) return;
    const group = type !== 'olt' ? (document.getElementById(`fnew-${type}-group`)?.value||'') : '';
    const lat = (document.getElementById(`fnew-${type}-lat`)?.value.trim()||'');
    const lng = (document.getElementById(`fnew-${type}-lng`)?.value.trim()||'');
    if (type !== 'olt' && !group) { showToast('Pilih induk terlebih dahulu'); return; }
    try {
      const body = { type, label };
      if (type !== 'olt') body.group_name = group;
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await fetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { showToast(`${type.toUpperCase()} berhasil ditambahkan`); goHome(); await loadData(); navigateTo('ftth'); }
      else showToast('Gagal');
    } catch(e) { showToast('Error: '+e.message); }
  };

  // ======== EDIT / DELETE (shared) ========
  window.editRef = function(type, id, label, group, lat, lng) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP', aktifitas:'Aktifitas', sub_node:'Sub-Node', priority:'Priority' };
    const t = titles[type] || type;
    const hasCoord = ['olt','odc','odp','sub_node'].includes(type);
    const hasGroup = ['odc','odp'].includes(type);
    document.getElementById('editModalTitle').textContent = `Edit ${t}`;
    document.getElementById('editFormContainer').style.display = 'block';
    document.getElementById('addFormContainer').style.display = 'none';
    document.getElementById('editLabel').value = label;
    document.getElementById('editGroupWrap').style.display = hasGroup ? 'block' : 'none';
    if (hasGroup) document.getElementById('editGroup').value = group;
    document.getElementById('editCoordWrap').style.display = hasCoord ? 'block' : 'none';
    if (hasCoord) { document.getElementById('editLat').value = lat; document.getElementById('editLng').value = lng; }
    document.getElementById('editModal').classList.add('show');
    editCallback = async () => {
      const nl = document.getElementById('editLabel').value.trim();
      if (!nl) return;
      const body = { label: nl };
      if (hasGroup) body.group_name = document.getElementById('editGroup').value.trim() || undefined;
      if (hasCoord) {
        const el = document.getElementById('editLat').value.trim();
        const en = document.getElementById('editLng').value.trim();
        if (el && en) { body.latitude = parseFloat(el); body.longitude = parseFloat(en); }
      }
      try {
        const r = await fetch(`/api/references/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if (r.ok) { document.getElementById('editModal').classList.remove('show'); showToast(`${t} berhasil diupdate`); goHome(); await loadData(); if (type==='olt'||type==='odc'||type==='odp') navigateTo('ftth'); else { const k = { olt:'ftth', odc:'ftth', odp:'ftth', aktifitas:'aktifitas', sub_node:'sub_node', priority:'priority' }[type]; navigateTo(k||type); } }
        else showToast('Gagal update');
      } catch(e) { showToast('Error: '+e.message); }
    };
  };

  window.confirmDel = function(id, label) {
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;
    deleteCallback = async () => {
      try {
        const r = await fetch(`/api/references/${id}`, { method:'DELETE' });
        if (r.ok) { document.getElementById('confirmModal').classList.remove('show'); showToast(`"${label}" berhasil dihapus`); goHome(); await loadData(); renderCards(); }
        else showToast('Gagal hapus');
      } catch(e) { showToast('Error: '+e.message); }
    };
  };

  document.getElementById('saveEditBtn').addEventListener('click', () => { if (editCallback) editCallback(); });
  document.getElementById('cancelEditBtn').addEventListener('click', () => document.getElementById('editModal').classList.remove('show'));
  document.getElementById('confirmDelBtn').addEventListener('click', () => { if (deleteCallback) deleteCallback(); });
  document.getElementById('cancelDelBtn').addEventListener('click', () => document.getElementById('confirmModal').classList.remove('show'));

  async function loadData() {
    try {
      const r = await fetch('/api/references');
      allData = await r.json();
      renderCards();
    } catch(e) {
      cardGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Gagal load data</div>';
    }
  }

  await loadData();
});
