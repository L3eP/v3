document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }
  const isOwner = user.role === ROLES.OWNER;

  const homeEl = document.getElementById('ftthHome');
  const detailEl = document.getElementById('ftthDetail');
  let allData = {};
  let activeType = 'olt';

  const toast = (m, type = 'success') => showToast(m, type);
  const API_BASE = '/api/ftth';

  const TYPES = ['olt', 'odc', 'odp', 'onu'];
  const TYPE_CONFIG = {
    olt: { icon: 'fa-server', title: 'OLT', color: '#7c3aed', hasBrand: true, hasPorts: true, hasSn: false },
    odc: { icon: 'fa-network-wired', title: 'ODC', color: '#2563eb', hasBrand: false, hasPorts: true, hasSn: false },
    odp: { icon: 'fa-plug', title: 'ODP', color: '#10b981', hasBrand: false, hasPorts: true, hasSn: false },
    onu: { icon: 'fa-wifi', title: 'ONU', color: '#f59e0b', hasBrand: false, hasPorts: false, hasSn: true }
  };

  // ==================== HOME: Card Grid ====================
  function renderCards() {
    homeEl.classList.remove('hidden');
    detailEl.classList.add('hidden');
    homeEl.innerHTML = `
      <div class="ftth-wrap">
        <div class="ftth-head">
          <h1 class="page-title"><i class="fas fa-network-wired" style="color:var(--olt);"></i> Jaringan FTTH</h1>
        </div>
        <p class="ftth-subhead">Pilih kategori untuk kelola perangkat</p>
      </div>
      <div class="ftth-card-grid" id="ftthCardGrid">`;
    const grid = document.getElementById('ftthCardGrid') || homeEl.querySelector('.ftth-card-grid');
    TYPES.forEach(type => {
      const cfg = TYPE_CONFIG[type];
      const count = (allData[type] || []).length;
      grid.innerHTML += `<button type="button" class="ftth-home-card" onclick="goType('${type}')">
        <div class="ftth-home-icon" style="color:${cfg.color};">
          <i class="fas ${cfg.icon}"></i>
        </div>
        <div class="ftth-home-title">${cfg.title}</div>
        <div class="ftth-home-count" style="color:${cfg.color};">${count}</div>
        <div class="ftth-home-sub">Klik untuk kelola</div>
      </button>`;
    });
  }

  window.goType = function(type) {
    activeType = type;
    window.location.hash = type;
    homeEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    renderDetail(type);
  };

  window.goHome = function() {
    window.location.hash = '';
    renderCards();
  };

  // ==================== DETAIL: Card List ====================
  function renderDetail(type) {
    const cfg = TYPE_CONFIG[type];
    const items = allData[type] || [];
    const colorMap = { olt:'#7c3aed', odc:'#2563eb', odp:'#10b981', onu:'#f59e0b' };
    const borderColor = colorMap[type] || 'var(--olt)';

    const totalItems = items.length;
    const navHtml = `<div class="ftth-nav">
      <div class="ftth-nav-head">
        <button class="back-btn" onclick="goHome()" aria-label="Kembali"><i class="fas fa-arrow-left"></i></button>
        <h2 class="ftth-detail-heading"><i class="fas ${cfg.icon}" style="color:${borderColor};"></i> ${cfg.title} <span class="ftth-detail-count">(${totalItems})</span></h2>
        <div class="ftth-search-box">
          <i class="fas fa-search ftth-search-icon"></i>
          <input type="text" id="ftthSearch" aria-label="Cari ${cfg.title}" class="filter-select ftth-search-input" placeholder="Cari ${cfg.title}..." oninput="searchDetail('${type}')">
        </div>
        <button class="login-btn btn-header" onclick="showForm('${type}')"><i class="fas fa-plus-circle"></i> Tambah ${cfg.title}</button>
      </div>
    </div>`;

    window.searchDetail = function(t) {
      const q = (document.getElementById('ftthSearch').value || '').toLowerCase();
      const filtered = (allData[t] || []).filter(i =>
        (i.label || '').toLowerCase().includes(q) ||
        (i.brand || '').toLowerCase().includes(q) ||
        (i.group || '').toLowerCase().includes(q) ||
        (i.serialNumber || '').toLowerCase().includes(q) ||
        (i.parentPort || '').toLowerCase().includes(q)
      );
      renderCardGrid(t, filtered, borderColor, q);
    };

    function renderCardGrid(t, filteredItems, bColor, query) {
      const searchVal = query || (document.getElementById('ftthSearch')?.value || '');
      const parts = navHtml.split('oninput="searchDetail');
      const navWithSearch = parts.join('oninput="searchDetail');

      if (!filteredItems.length) {
        detailEl.innerHTML = navWithSearch + '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ditemukan</p></div>';
        return;
      }

      // Group items by parent (group_name)
      const groups = {};
      filteredItems.forEach(i => {
        const g = i.group || 'Tanpa Induk';
        if (!groups[g]) groups[g] = [];
        groups[g].push(i);
      });

      // Sort groups: "Tanpa Induk" last, then alphabetical
      const groupKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'Tanpa Induk') return 1;
        if (b === 'Tanpa Induk') return -1;
        return a.localeCompare(b);
      });

      detailEl.innerHTML = navWithSearch + groupKeys.map(gKey => {
        const items = groups[gKey];
        return `<div class="admin-card ftth-group-card">
          <div class="ftth-group-head">
            <span class="field-label ftth-group-title">
              <i class="fas fa-folder" style="color:${bColor};"></i>${esc(gKey)}
              <span class="ftth-group-count">(${items.length})</span>
            </span>
          </div>
          <div class="ftth-group-body">
            ${items.map(i => `
              <div class="ftth-item">
                <div class="ftth-item-main">
                  <div class="ftth-item-tags">
                    <span class="field-label">${esc(i.label)}</span>
                    ${i.isDraft ? `<span class="tag-chip" style="background:var(--sem-warn-strong);color:#fff;" title="Dibuat otomatis dari PSB Terpasang, perlu direview">Draft — perlu konfirmasi</span>` : ''}
                    ${i.brand ? `<span class="tag-chip">${esc(i.brand)}</span>` : ''}
                    ${i.serialNumber ? `<span class="ftth-sn">SN: ${esc(i.serialNumber)}</span>` : ''}
                    ${i.totalPorts > 0 ? `<span class="text-muted-xs"><i class="fas fa-plug"></i> ${i.totalPorts}</span>` : ''}
                    ${i.parentPort ? `<span class="text-muted-xs"><i class="fas fa-link"></i> ${esc(i.parentPort)}</span>` : ''}
                    ${i.lat&&i.lng ? `<span class="text-muted-xs"><i class="fas fa-map-marker-alt"></i> ${i.lat.toFixed(4)}, ${i.lng.toFixed(4)}</span>` : ''}
                  </div>
                </div>
                <div class="ftth-item-actions">
                  ${i.lat&&i.lng?`<a href="map.html?lat=${i.lat}&lng=${i.lng}&name=${encodeURIComponent(i.label)}" class="ftth-map-link" title="Lihat di peta">🗺</a>`:''}
                  ${i.isDraft ? `<button class="ftth-edit" onclick="confirmDraft(${i.id})" title="Konfirmasi entri ini" aria-label="Konfirmasi ${esc(i.label)}" style="color:var(--sem-success-strong);"><i class="fas fa-check"></i></button>` : ''}
                  <button class="ftth-edit" onclick="editItem('${type}',${i.id})" title="Edit" aria-label="Edit ${esc(i.label)}"><i class="fas fa-edit"></i></button>
                  ${isOwner ? `<button class="ftth-del" onclick="confirmDel(${i.id},'${esc(i.label)}')" title="Hapus" aria-label="Hapus ${esc(i.label)}"><i class="fas fa-trash"></i></button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
      }).join('');
    }

  // Initial render
  renderCardGrid(type, items, borderColor, '');
}

// ==================== ADD MODAL ====================
  window.showForm = function(type) {
    const cfg = TYPE_CONFIG[type];
    const parentType = { odc:'olt', odp:'odc', onu:'odp' }[type];

    document.getElementById('addModalTitle').textContent = `Tambah ${cfg.title}`;
    document.getElementById('addLabel').value = '';
    document.getElementById('addPort').value = '';
    document.getElementById('addLat').value = '';
    document.getElementById('addLng').value = '';

    const hasGroup = !!parentType;
    document.getElementById('addGroupWrap').classList.toggle('hidden', !hasGroup);
    document.getElementById('addAvailPorts').classList.add('hidden');
    document.getElementById('addPortWrap').classList.toggle('hidden', !hasGroup);
    document.getElementById('addBrandWrap').classList.toggle('hidden', !cfg.hasBrand);
    document.getElementById('addPortsWrap').classList.toggle('hidden', !cfg.hasPorts);
    document.getElementById('addSnWrap').classList.toggle('hidden', !cfg.hasSn);

    if (hasGroup) {
      const parents = allData[parentType] || [];
      const sel = document.getElementById('addGroup');
      sel.innerHTML = `<option value="">Pilih ${parentType.toUpperCase()}</option>`;
      parents.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.label; opt.textContent = p.label;
        sel.appendChild(opt);
      });
      sel.onchange = () => onParentChange(type);
    }

    window._addingType = type;
    document.getElementById('addModal').classList.add('show');
  };

  async function onParentChange(type) {
    const parent = document.getElementById('addGroup').value;
    if (!parent) { document.getElementById('addAvailPorts').classList.add('hidden'); document.getElementById('addPort').value = ''; return; }
    try {
      const r = await fetch(`/api/ftth/available-ports?type=${type}&parent=${encodeURIComponent(parent)}`);
      const data = await r.json();
      const container = document.getElementById('addAvailPorts');
      if (data.available && data.available.length > 0) {
        container.innerHTML = `<div class="ftth-port-head"><i class="fas fa-plug"></i> Port tersedia (${data.used}/${data.parent.totalPorts} terpakai):</div>
          <div class="ftth-port-list">${
            data.available.map(p => `<button type="button" class="port-chip" onclick="document.getElementById('addPort').value='${esc(p.port)}'; document.querySelectorAll('#addAvailPorts .port-chip').forEach(x=>x.classList.remove('selected')); this.classList.add('selected');">${esc(p.port)}</button>`).join('')
          }</div>`;
        container.classList.remove('hidden');
      } else {
        container.innerHTML = '<div class="text-muted-sm">Tidak ada port tersedia</div>';
        container.classList.remove('hidden');
      }
    } catch(e) { /* silent */ }
  }

  window.saveItem = async function() {
    const type = window._addingType;
    if (!type) return;
    const cfg = TYPE_CONFIG[type];
    const parentType = { odc:'olt', odp:'odc', onu:'odp' }[type];

    const label = document.getElementById('addLabel').value.trim();
    if (!label) { toast('Label wajib diisi', 'error'); return; }

    const group = parentType ? document.getElementById('addGroup').value : '';
    const parentPort = parentType ? document.getElementById('addPort').value.trim() : '';
    const lat = document.getElementById('addLat').value.trim();
    const lng = document.getElementById('addLng').value.trim();

    if (parentType && !group) { toast('Pilih induk terlebih dahulu', 'error'); return; }

    const body = { type, label };
    if (group) body.group_name = group;
    if (parentPort) body.parent_port = parentPort;
    if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }

    if (cfg.hasBrand) {
      const brand = document.getElementById('addBrand').value.trim();
      if (!brand) { toast('Brand OLT wajib diisi', 'error'); return; }
      body.brand = brand;
    }
    if (cfg.hasPorts) {
      const ports = parseInt(document.getElementById('addPorts').value) || 0;
      if (ports < 1) { toast('Jumlah port minimal 1', 'error'); return; }
      body.total_ports = ports;
    }
    if (cfg.hasSn) {
      const sn = document.getElementById('addSn').value.trim();
      if (sn) body.serial_number = sn;
    }

    try {
      const r = await csrfFetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        document.getElementById('addModal').classList.remove('show');
        toast('Berhasil ditambahkan');
        await loadData();
        renderDetail(type);
      } else { const d = await r.json(); toast(d.message || 'Gagal', 'error'); }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };

  document.getElementById('cancelAddBtn').onclick = () => document.getElementById('addModal').classList.remove('show');
  document.getElementById('saveAddBtn').onclick = saveItem;
  // Klik overlay kini ditangani sistem global (toast.js) dengan peringatan draft.

  // ==================== EDIT MODAL ====================
  let editData = null;

  window.editItem = async function(type, id) {
    try {
      const r = await fetch(`${API_BASE}/${id}`);
      if (!r.ok) { toast('Gagal load data', 'error'); return; }
      const item = await r.json();
      editData = { type, id };
      const t = TYPE_CONFIG[type].title;
      const hasGroup = !!{ odc:'olt', odp:'odc', onu:'odp' }[type];
      const hasPort = hasGroup;

      document.getElementById('editModalTitle').textContent = `Edit ${t}`;
      document.getElementById('editLabel').value = item.label;
      document.getElementById('editGroupWrap').classList.toggle('hidden', !hasGroup);
      if (hasGroup) document.getElementById('editGroup').value = item.group || '';
      document.getElementById('editPortWrap').classList.toggle('hidden', !hasPort);
      if (hasPort) document.getElementById('editPort').value = item.parentPort || '';
      document.getElementById('editCoordWrap').classList.remove('hidden');
      document.getElementById('editLat').value = item.lat || '';
      document.getElementById('editLng').value = item.lng || '';
      document.getElementById('editBrandWrap').classList.toggle('hidden', !TYPE_CONFIG[type].hasBrand);
      if (TYPE_CONFIG[type].hasBrand) document.getElementById('editBrand').value = item.brand || '';
      document.getElementById('editPortsWrap').classList.toggle('hidden', !TYPE_CONFIG[type].hasPorts);
      if (TYPE_CONFIG[type].hasPorts) document.getElementById('editPorts').value = item.totalPorts || '';
      document.getElementById('editSnWrap').classList.toggle('hidden', !TYPE_CONFIG[type].hasSn);
      if (TYPE_CONFIG[type].hasSn) document.getElementById('editSn').value = item.serialNumber || '';

      document.getElementById('editModal').classList.add('show');
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };

  document.getElementById('saveEditBtn').onclick = async () => {
    if (!editData) return;
    const body = { label: document.getElementById('editLabel').value.trim() };
    const type = editData.type;
    const hasGroup = !!{ odc:'olt', odp:'odc', onu:'odp' }[type];
    if (hasGroup) body.group_name = document.getElementById('editGroup').value.trim() || undefined;
    if (hasGroup) body.parent_port = document.getElementById('editPort').value.trim() || null;
    const el = document.getElementById('editLat').value.trim(), en = document.getElementById('editLng').value.trim();
    if (el && en) { body.latitude = parseFloat(el); body.longitude = parseFloat(en); }
    if (TYPE_CONFIG[type].hasBrand) { const b = document.getElementById('editBrand').value.trim(); if (b) body.brand = b; }
    if (TYPE_CONFIG[type].hasPorts) { const p = parseInt(document.getElementById('editPorts').value) || 0; if (p>0) body.total_ports = p; }
    if (TYPE_CONFIG[type].hasSn) { const s = document.getElementById('editSn').value.trim(); if (s) body.serial_number = s; }

    try {
      const r = await csrfFetch(`${API_BASE}/${editData.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { document.getElementById('editModal').classList.remove('show'); toast('Berhasil diupdate'); editData=null; await loadData(); renderDetail(type); }
      else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };
  document.getElementById('cancelEditBtn').onclick = () => { document.getElementById('editModal').classList.remove('show'); editData=null; };

  // ==================== KONFIRMASI DRAFT ====================
  // Draft ONU dibuat otomatis saat PSB ditandai "Terpasang" (routes/psb.js).
  // Konfirmasi cuma menghapus tanda draft — kalau field-nya (port/label/dst)
  // perlu diperbaiki dulu, staf pakai tombol Edit biasa sebelum konfirmasi.
  window.confirmDraft = async function(id) {
    try {
      const r = await csrfFetch(`${API_BASE}/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ is_draft: false }) });
      if (r.ok) { toast('Entri dikonfirmasi'); await loadData(); renderDetail(activeType); }
      else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };

  // ==================== DELETE ====================
  window.confirmDel = function(id, label) {
    showConfirm(`Hapus "${label}"?`, async () => {
      try {
        const r = await csrfFetch(`${API_BASE}/${id}`, { method:'DELETE' });
        if (r.ok) { toast(`"${label}" dihapus`); await loadData(); renderDetail(activeType); }
        else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
      } catch(e) { toast('Error: '+e.message, 'error'); }
    });
  };

  // ==================== LOAD DATA ====================
  async function loadData() {
    try {
      const r = await fetch(API_BASE);
      const result = await r.json();
      allData = result.data || {};
      // Set total count in home
      TYPES.forEach(type => {
        const el = document.getElementById(`total-${type}`);
        if (el) el.textContent = (allData[type] || []).length;
      });
    } catch(e) {
      homeEl.innerHTML = '<div style="color:#ef4444;padding:20px;text-align:center;">Gagal load data</div>';
    }
  }

  await loadData();
  renderCards();

  // Restore state dari URL hash (support refresh)
  if (window.location.hash) {
    const hashType = window.location.hash.replace('#', '');
    if (TYPES.includes(hashType)) {
      goType(hashType);
    }
  }
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h && TYPES.includes(h)) goType(h);
    else if (!h) goHome();
  });

  // ===== Auto-refresh 30 detik — update bila ada perubahan dari user lain =====
  setInterval(async () => {
    // Jangan ganggu: modal tambah/edit terbuka, atau tab sedang tidak aktif
    const addOpen = document.getElementById('addModal').classList.contains('show');
    const editOpen = document.getElementById('editModal').classList.contains('show');
    if (addOpen || editOpen || document.hidden) return;

    try {
      const r = await fetch(API_BASE);
      const result = await r.json();
      allData = result.data || {};

      // Update hitungan di kartu home
      TYPES.forEach(type => {
        const el = document.getElementById(`total-${type}`);
        if (el) el.textContent = (allData[type] || []).length;
      });

      // Pertahankan tampilan: home atau detail (termasuk search aktif)
      const searchEl = document.getElementById('ftthSearch');
      const q = searchEl ? searchEl.value : '';
      if (homeEl.classList.contains('hidden')) {
        renderDetail(activeType);
        if (q && typeof window.searchDetail === 'function') {
          searchEl.value = q;
          window.searchDetail(activeType);
        }
      } else {
        renderCards();
      }
    } catch(e) {
      /* silent — jangan hancurkan UI kalau fetch gagal */
    }
  }, 30000);
});
