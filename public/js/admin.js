document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || user.role !== 'Owner') {
    window.location.href = 'dashboard.html';
    return;
  }

  const tabsEl = document.getElementById('adminTabs');
  const panelsEl = document.getElementById('adminPanels');
  let editCallback = null;
  let deleteCallback = null;
  let activeTab = 'aktifitas';
  let allData = {};

  const TYPES = ['aktifitas', 'sub_node', 'olt', 'odc', 'priority'];
  const TYPE_CONFIG = {
    aktifitas: { icon: 'fa-tasks', title: 'Aktifitas', hasGroup: false, hasCoord: false },
    sub_node:  { icon: 'fa-sitemap', title: 'Sub-Node',  hasGroup: false, hasCoord: true },
    olt:       { icon: 'fa-server', title: 'OLT',        hasGroup: false, hasCoord: true },
    odc:       { icon: 'fa-network-wired', title: 'ODC & ODP', hasGroup: true, hasCoord: true, groupLabel: 'OLT Group' },
    priority:  { icon: 'fa-flag', title: 'Priority',      hasGroup: false, hasCoord: false }
  };

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show';
    setTimeout(() => t.className = 'toast', 2500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function switchTab(type) {
    activeTab = type;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.dataset.type === type));
  }

  function renderTabs() {
    tabsEl.innerHTML = TYPES.map(t => `
      <button class="admin-tab ${t === activeTab ? 'active' : ''}" data-type="${t}" onclick="switchTab('${t}')">
        <i class="fas ${TYPE_CONFIG[t].icon}"></i> ${TYPE_CONFIG[t].title}
      </button>
    `).join('');
  }

  function renderPanel(type, items) {
    const cfg = TYPE_CONFIG[type];
    const panel = document.createElement('div');
    panel.className = `admin-panel ${type === activeTab ? 'active' : ''}`;
    panel.dataset.type = type;
    panel.innerHTML = `
      <div class="admin-card">
        <h3 style="margin:0 0 15px 0;display:flex;align-items:center;gap:8px;color:var(--text-main);">
          <i class="fas ${cfg.icon}" style="color:#4f46e5;"></i> ${cfg.title}
          <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;">(${items.length})</span>
        </h3>
        <div id="list-${type}"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn-add-ref" onclick="showAddForm('${type}','odc')" style="flex:1;">
            <i class="fas fa-plus"></i> Tambah ODC
          </button>
          <button class="btn-add-ref" onclick="showAddForm('${type}','odp')" style="flex:1;">
            <i class="fas fa-plug"></i> Tambah ODP
          </button>
        </div>
        <div id="form-${type}" style="display:none;"></div>
      </div>
    `;
    panelsEl.appendChild(panel);
    renderOdcList(items);
  }

  function renderOdcList(odcItems) {
    const container = document.getElementById('list-odc');
    const odpItems = allData.odp || [];

    if (!odcItems || odcItems.length === 0) {
      container.innerHTML = '<div class="empty-ref">Belum ada ODC</div>';
      return;
    }

    // Group ODP by parent ODC label
    const odpByParent = {};
    odpItems.forEach(o => {
      const parent = o.group || '';
      if (!odpByParent[parent]) odpByParent[parent] = [];
      odpByParent[parent].push(o);
    });

    container.innerHTML = odcItems.map(odc => {
      const hasCoord = odc.lat && odc.lng;
      const children = odpByParent[odc.label] || [];
      return `
        <div class="ref-item" style="border-bottom:1px solid #e5e7eb;padding:8px 0;margin-bottom:0;">
          <div class="ref-label">
            ${hasCoord ? '<span style="font-size:0.85rem;">📍</span>' : '<span style="width:16px;display:inline-block;"></span>'}
            <strong>${escapeHtml(odc.label)}</strong>
            ${odc.group ? `<span class="ref-group">${escapeHtml(odc.group)}</span>` : ''}
          </div>
          <div class="ref-actions">
            <button class="btn-edit-ref" onclick="editRef(${odc.id},'odc','${escapeHtml(odc.label)}','${escapeHtml(odc.group||'')}','${odc.lat||''}','${odc.lng||''}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-del-ref" onclick="confirmDel(${odc.id},'${escapeHtml(odc.label)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        ${children.map(odp => `
          <div class="ref-item" style="padding:6px 0 6px 28px;border-bottom:none;background:#f9fafb;border-radius:4px;margin:2px 0;">
            <div class="ref-label">
              <span style="font-size:0.8rem;color:#9ca3af;width:16px;">└─</span>
              <span style="color:#4b5563;font-size:0.9rem;">${escapeHtml(odp.label)}</span>
              ${odp.lat && odp.lng ? '<span style="font-size:0.75rem;">📍</span>' : ''}
            </div>
            <div class="ref-actions">
              <button class="btn-edit-ref" onclick="editRef(${odp.id},'odp','${escapeHtml(odp.label)}','${escapeHtml(odp.group||'')}','${odp.lat||''}','${odp.lng||''}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-del-ref" onclick="confirmDel(${odp.id},'${escapeHtml(odp.label)}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `).join('')}
      `;
    }).join('');
  }

  window.showAddForm = function(type, subType) {
    const cfg = TYPE_CONFIG[type];
    const formEl = document.getElementById(`form-${type}`);
    formEl.style.display = 'block';

    if (type === 'odc') {
      if (subType === 'odp') {
        // Form tambah ODP — pilih induk ODC dari dropdown
        const odcLabels = (allData.odc || []).map(o => o.label);
        formEl.innerHTML = `
          <div class="inline-form" style="flex-wrap:wrap;">
            <input type="text" id="new-odp-label" placeholder="Label ODP" autofocus style="min-width:150px;">
            <select id="new-odp-parent" style="min-width:180px;">
              <option value="">Pilih Induk ODC</option>
              ${odcLabels.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')}
            </select>
            <input type="text" id="new-odp-lat" placeholder="Latitude" style="min-width:100px;">
            <input type="text" id="new-odp-lng" placeholder="Longitude" style="min-width:100px;">
            <button class="btn-save" onclick="addOdp()"><i class="fas fa-check"></i> Simpan</button>
            <button class="btn-cancel" onclick="document.getElementById('form-odc').style.display='none'"><i class="fas fa-times"></i></button>
          </div>`;
      } else {
        // Form tambah ODC
        formEl.innerHTML = `
          <div class="inline-form">
            <input type="text" id="new-odc-label" placeholder="Label ODC" autofocus>
            <input type="text" id="new-odc-group" placeholder="OLT Group">
            <input type="text" id="new-odc-lat" placeholder="Latitude" style="min-width:100px;">
            <input type="text" id="new-odc-lng" placeholder="Longitude" style="min-width:100px;">
            <button class="btn-save" onclick="addRef('odc')"><i class="fas fa-check"></i> Simpan</button>
            <button class="btn-cancel" onclick="document.getElementById('form-odc').style.display='none'"><i class="fas fa-times"></i></button>
          </div>`;
      }
      document.querySelectorAll(`.btn-add-ref[onclick*="odc"]`).forEach(b => b.style.display = 'none');
    } else {
      // Non-ODC types (aktifitas, sub_node, priority)
      formEl.innerHTML = `
        <div class="inline-form">
          <input type="text" id="new-${type}-label" placeholder="Label ${cfg.title}" autofocus>
          ${cfg.hasGroup ? `<input type="text" id="new-${type}-group" placeholder="${cfg.groupLabel || 'Group'}">` : ''}
          ${cfg.hasCoord ? `<input type="text" id="new-${type}-lat" placeholder="Latitude" style="min-width:100px;">` : ''}
          ${cfg.hasCoord ? `<input type="text" id="new-${type}-lng" placeholder="Longitude" style="min-width:100px;">` : ''}
          <button class="btn-save" onclick="addRef('${type}')"><i class="fas fa-check"></i> Simpan</button>
          <button class="btn-cancel" onclick="document.getElementById('form-${type}').style.display='none'"><i class="fas fa-times"></i></button>
        </div>`;
      const btn = document.querySelector(`.btn-add-ref[onclick*="'${type}'"]`);
      if (btn) btn.style.display = 'none';
    }
  };

  window.addOdp = async function() {
    const label = document.getElementById('new-odp-label').value.trim();
    const parent = document.getElementById('new-odp-parent').value;
    if (!label || !parent) { showToast('Label dan induk ODC harus diisi'); return; }
    const lat = document.getElementById('new-odp-lat').value.trim();
    const lng = document.getElementById('new-odp-lng').value.trim();
    try {
      const body = { type: 'odp', label, group_name: parent };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const res = await fetch('/api/references', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (res.ok) { showToast('ODP berhasil ditambahkan'); loadReferences(); }
      else { const d = await res.json(); showToast('Error: ' + (d.message || 'Gagal')); }
    } catch (e) { showToast('Error: ' + e.message); }
  };

  window.addRef = async function(type) {
    const label = document.getElementById(`new-${type}-label`).value.trim();
    if (!label) return;
    const cfg = TYPE_CONFIG[type];
    const group = cfg.hasGroup ? (document.getElementById(`new-${type}-group`)?.value.trim() || '') : '';
    const lat = cfg.hasCoord ? (document.getElementById(`new-${type}-lat`)?.value.trim() || '') : '';
    const lng = cfg.hasCoord ? (document.getElementById(`new-${type}-lng`)?.value.trim() || '') : '';
    try {
      const body = { type, label, group_name: group || undefined };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const res = await fetch('/api/references', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (res.ok) { showToast(`${cfg.title} berhasil ditambahkan`); loadReferences(); }
      else { const d = await res.json(); showToast('Error: ' + (d.message || 'Gagal')); }
    } catch (e) { showToast('Error: ' + e.message); }
  };

  window.editRef = function(id, type, label, group, lat, lng) {
    const cfg = type === 'odp'
      ? { title: 'ODP', hasGroup: true, hasCoord: true, groupLabel: 'Induk ODC' }
      : TYPE_CONFIG[type] || TYPE_CONFIG.odc;
    document.getElementById('editModalTitle').textContent = `Edit ${cfg.title}`;
    document.getElementById('editLabel').value = label;
    document.getElementById('editGroupWrap').style.display = cfg.hasGroup ? 'block' : 'none';
    if (cfg.hasGroup) {
      document.querySelector('#editGroupWrap label').textContent = cfg.groupLabel || 'Group';
      document.getElementById('editGroup').value = group;
    }
    document.getElementById('editCoordWrap').style.display = cfg.hasCoord ? 'block' : 'none';
    if (cfg.hasCoord) {
      document.getElementById('editLat').value = lat;
      document.getElementById('editLng').value = lng;
    }
    document.getElementById('editModal').classList.add('show');
    editCallback = async () => {
      const newLabel = document.getElementById('editLabel').value.trim();
      if (!newLabel) return;
      const body = { label: newLabel };
      if (cfg.hasGroup) { body.group_name = document.getElementById('editGroup').value.trim() || undefined; }
      if (cfg.hasCoord) {
        const elat = document.getElementById('editLat').value.trim();
        const elng = document.getElementById('editLng').value.trim();
        if (elat && elng) { body.latitude = parseFloat(elat); body.longitude = parseFloat(elng); }
      }
      try {
        const res = await fetch(`/api/references/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (res.ok) { document.getElementById('editModal').classList.remove('show'); showToast(`${cfg.title} berhasil diupdate`); loadReferences(); }
        else { const d = await res.json(); showToast('Error: ' + (d.message || 'Gagal')); }
      } catch (e) { showToast('Error: ' + e.message); }
    };
  };

  window.confirmDel = function(id, label) {
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;
    deleteCallback = async () => {
      try {
        const res = await fetch(`/api/references/${id}`, { method: 'DELETE' });
        if (res.ok) { document.getElementById('confirmModal').classList.remove('show'); showToast(`"${label}" berhasil dihapus`); loadReferences(); }
        else { const d = await res.json(); showToast('Error: ' + (d.message || 'Gagal')); }
      } catch (e) { showToast('Error: ' + e.message); }
    };
  };

  // Expose to global for onclick
  window.switchTab = switchTab;
  window.showAddForm = showAddForm;
  window.addRef = addRef;
  window.addOdp = addOdp;
  window.editRef = editRef;
  window.confirmDel = confirmDel;

  // Modal handlers
  document.getElementById('saveEditBtn').addEventListener('click', () => { if (editCallback) editCallback(); });
  document.getElementById('cancelEditBtn').addEventListener('click', () => document.getElementById('editModal').classList.remove('show'));
  document.getElementById('confirmDelBtn').addEventListener('click', () => { if (deleteCallback) deleteCallback(); });
  document.getElementById('cancelDelBtn').addEventListener('click', () => document.getElementById('confirmModal').classList.remove('show'));

  async function loadReferences() {
    tabsEl.innerHTML = '<div style="padding:10px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    panelsEl.innerHTML = '';
    try {
      const res = await fetch('/api/references');
      allData = await res.json();
      tabsEl.innerHTML = '';
      panelsEl.innerHTML = '';
      renderTabs();
      TYPES.forEach(type => {
        if (type === 'odc') {
          renderPanel(type, allData.odc || []);
        } else {
          renderRegularPanel(type, allData[type] || []);
        }
      });
    } catch (e) {
      tabsEl.innerHTML = '<div style="color:#ef4444;padding:10px;">Gagal load data</div>';
    }
  }

  function renderRegularPanel(type, items) {
    const cfg = TYPE_CONFIG[type];
    const panel = document.createElement('div');
    panel.className = `admin-panel ${type === activeTab ? 'active' : ''}`;
    panel.dataset.type = type;
    panel.innerHTML = `
      <div class="admin-card">
        <h3 style="margin:0 0 15px 0;display:flex;align-items:center;gap:8px;color:var(--text-main);">
          <i class="fas ${cfg.icon}" style="color:#4f46e5;"></i> ${cfg.title}
          <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;">(${items.length})</span>
        </h3>
        <div id="list-${type}"></div>
        <button class="btn-add-ref" onclick="showAddForm('${type}')">
          <i class="fas fa-plus"></i> Tambah ${cfg.title}
        </button>
        <div id="form-${type}" style="display:none;"></div>
      </div>
    `;
    panelsEl.appendChild(panel);
    renderRegularList(type, items);
  }

  function renderRegularList(type, items) {
    const container = document.getElementById(`list-${type}`);
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-ref">Belum ada data</div>';
      return;
    }
    container.innerHTML = items.map(item => {
      const hasCoord = item.lat && item.lng;
      return `
        <div class="ref-item">
          <div class="ref-label">
            ${hasCoord ? '<span style="font-size:0.85rem;">📍</span>' : ''}
            <span>${escapeHtml(item.label)}</span>
            ${item.group ? `<span class="ref-group">${escapeHtml(item.group)}</span>` : ''}
          </div>
          <div class="ref-actions">
            <button class="btn-edit-ref" onclick="editRef(${item.id},'${type}','${escapeHtml(item.label)}','${escapeHtml(item.group||'')}','${item.lat||''}','${item.lng||''}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-del-ref" onclick="confirmDel(${item.id},'${escapeHtml(item.label)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  loadReferences();
});
