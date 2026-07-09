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

  const TYPES = ['aktifitas', 'sub_node', 'odc', 'odp', 'priority'];
  const TYPE_CONFIG = {
    aktifitas: { icon: 'fa-tasks', title: 'Aktifitas', hasGroup: false, hasCoord: false },
    sub_node:  { icon: 'fa-sitemap', title: 'Sub-Node',  hasGroup: false, hasCoord: true },
    odc:       { icon: 'fa-network-wired', title: 'ODC',  hasGroup: true,  hasCoord: true, groupLabel: 'OLT Group' },
    odp:       { icon: 'fa-plug', title: 'ODP',           hasGroup: true,  hasCoord: true, groupLabel: 'Induk ODC' },
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
        <button class="btn-add-ref" onclick="showAddForm('${type}')">
          <i class="fas fa-plus"></i> Tambah ${cfg.title}
        </button>
        <div id="form-${type}" style="display:none;"></div>
      </div>
    `;
    panelsEl.appendChild(panel);
    renderList(type, items);
  }

  function renderList(type, items) {
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

  window.showAddForm = function(type) {
    const cfg = TYPE_CONFIG[type];
    const formEl = document.getElementById(`form-${type}`);
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="inline-form">
        <input type="text" id="new-${type}-label" placeholder="Label ${cfg.title}" autofocus>
        ${cfg.hasGroup ? `<input type="text" id="new-${type}-group" placeholder="${cfg.groupLabel || 'Group'}">` : ''}
        ${cfg.hasCoord ? `<input type="text" id="new-${type}-lat" placeholder="Latitude" style="min-width:100px;">` : ''}
        ${cfg.hasCoord ? `<input type="text" id="new-${type}-lng" placeholder="Longitude" style="min-width:100px;">` : ''}
        <button class="btn-save" onclick="addRef('${type}')"><i class="fas fa-check"></i> Simpan</button>
        <button class="btn-cancel" onclick="document.getElementById('form-${type}').style.display='none'"><i class="fas fa-times"></i></button>
      </div>`;
    document.querySelector(`.btn-add-ref[onclick*="'${type}'"]`).style.display = 'none';
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
    const cfg = TYPE_CONFIG[type];
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
      const data = await res.json();
      tabsEl.innerHTML = '';
      panelsEl.innerHTML = '';
      renderTabs();
      TYPES.forEach(type => {
        if (data[type]) renderPanel(type, data[type]);
      });
    } catch (e) {
      tabsEl.innerHTML = '<div style="color:#ef4444;padding:10px;">Gagal load data</div>';
    }
  }

  loadReferences();
});
