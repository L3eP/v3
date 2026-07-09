document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || user.role !== 'Owner') {
    window.location.href = 'dashboard.html';
    return;
  }

  const grid = document.getElementById('adminGrid');
  let editCallback = null;
  let deleteCallback = null;

  const TYPE_CONFIG = {
    aktifitas: { icon: 'fa-tasks', title: 'Aktifitas', hasGroup: false, hasCoord: false },
    sub_node: { icon: 'fa-sitemap', title: 'Sub-Node', hasGroup: false, hasCoord: true },
    odc: { icon: 'fa-network-wired', title: 'ODC', hasGroup: true, hasCoord: true },
    priority: { icon: 'fa-flag', title: 'Priority', hasGroup: false, hasCoord: false }
  };

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show';
    setTimeout(() => t.className = 'toast', 2500);
  }

  function renderSection(type, items) {
    const cfg = TYPE_CONFIG[type];
    const section = document.createElement('div');
    section.className = 'admin-card';
    section.innerHTML = `
      <h3><i class="fas ${cfg.icon}" style="color: #4f46e5;"></i> ${cfg.title}</h3>
      <div id="list-${type}"></div>
      <button class="btn-add-ref" onclick="showAddForm('${type}')">
        <i class="fas fa-plus"></i> Tambah ${cfg.title}
      </button>
      <div id="form-${type}" style="display:none;"></div>
    `;
    grid.appendChild(section);
    renderList(type, items);
  }

  function renderList(type, items) {
    const container = document.getElementById(`list-${type}`);
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-ref">Belum ada data</div>';
      return;
    }
    container.innerHTML = items.map(item => {
      const coord = item.lat && item.lng ? ` [${item.lat}, ${item.lng}]` : '';
      const latParam = item.lat || '';
      const lngParam = item.lng || '';
      return `
      <div class="ref-item">
        <div class="ref-label">
          <span>${escapeHtml(item.label)}</span>
          ${coord ? `<span class="ref-group" style="background:#dbeafe;color:#2563eb;">📍</span>` : ''}
          ${item.group ? `<span class="ref-group">${escapeHtml(item.group)}</span>` : ''}
        </div>
        <div class="ref-actions">
          <button class="btn-edit-ref" onclick="editRef(${item.id}, '${type}', '${escapeHtml(item.label)}', '${escapeHtml(item.group || '')}', '${latParam}', '${lngParam}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-del-ref" onclick="confirmDel(${item.id}, '${escapeHtml(item.label)}')">
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
        ${cfg.hasGroup ? `<input type="text" id="new-${type}-group" placeholder="Group (e.g. OLT JRG)">` : ''}
        ${cfg.hasGroup ? `<input type="text" id="new-${type}-lat" placeholder="Latitude" style="min-width:100px;">` : ''}
        ${cfg.hasGroup ? `<input type="text" id="new-${type}-lng" placeholder="Longitude" style="min-width:100px;">` : ''}
        <button class="btn-save" onclick="addRef('${type}')"><i class="fas fa-check"></i> Simpan</button>
        <button class="btn-cancel" onclick="document.getElementById('form-${type}').style.display='none'"><i class="fas fa-times"></i></button>
      </div>
    `;
    // Hapus tombol tambah biar ga dobel
    document.querySelector(`.btn-add-ref[onclick*="'${type}'"]`).style.display = 'none';
  };

  window.addRef = async function(type) {
    const label = document.getElementById(`new-${type}-label`).value.trim();
    if (!label) return;
    const group = TYPE_CONFIG[type].hasGroup ? document.getElementById(`new-${type}-group`).value.trim() : '';
    const lat = TYPE_CONFIG[type].hasGroup ? document.getElementById(`new-${type}-lat`)?.value.trim() : '';
    const lng = TYPE_CONFIG[type].hasGroup ? document.getElementById(`new-${type}-lng`)?.value.trim() : '';

    try {
      const body = { type, label, group_name: group || undefined };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const res = await fetch('/api/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        showToast(`${TYPE_CONFIG[type].title} berhasil ditambahkan`);
        loadReferences();
      } else {
        const data = await res.json();
        showToast('Error: ' + (data.message || 'Gagal'));
      }
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  };

  window.editRef = function(id, type, label, group, lat, lng) {
    document.getElementById('editModal').classList.add('show');
    document.getElementById('editModalTitle').textContent = `Edit ${TYPE_CONFIG[type].title}`;
    document.getElementById('editLabel').value = label;
    const groupWrap = document.getElementById('editGroupWrap');
    if (TYPE_CONFIG[type].hasGroup) {
      groupWrap.style.display = 'block';
      document.getElementById('editGroup').value = group;
    } else {
      groupWrap.style.display = 'none';
    }

    document.getElementById('editGroupWrap').style.display = TYPE_CONFIG[type].hasGroup ? 'block' : 'none';
    document.getElementById('editCoordWrap').style.display = TYPE_CONFIG[type].hasGroup ? 'block' : 'none';

    editCallback = async () => {
      const newLabel = document.getElementById('editLabel').value.trim();
      if (!newLabel) return;
      const body = { label: newLabel };
      if (TYPE_CONFIG[type].hasGroup) {
        body.group_name = document.getElementById('editGroup').value.trim() || undefined;
        const elat = document.getElementById('editLat').value.trim();
        const elng = document.getElementById('editLng').value.trim();
        if (elat && elng) { body.latitude = parseFloat(elat); body.longitude = parseFloat(elng); }
      }

      try {
        const res = await fetch(`/api/references/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          document.getElementById('editModal').classList.remove('show');
          showToast(`${TYPE_CONFIG[type].title} berhasil diupdate`);
          loadReferences();
        } else {
          const data = await res.json();
          showToast('Error: ' + (data.message || 'Gagal'));
        }
      } catch (e) {
        showToast('Error: ' + e.message);
      }
    };
  };

  window.confirmDel = function(id, label) {
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;

    deleteCallback = async () => {
      try {
        const res = await fetch(`/api/references/${id}`, { method: 'DELETE' });
        if (res.ok) {
          document.getElementById('confirmModal').classList.remove('show');
          showToast(`"${label}" berhasil dihapus`);
          loadReferences();
        } else {
          const data = await res.json();
          showToast('Error: ' + (data.message || 'Gagal'));
        }
      } catch (e) {
        showToast('Error: ' + e.message);
      }
    };
  };

  // Modal handlers
  document.getElementById('saveEditBtn').addEventListener('click', () => { if (editCallback) editCallback(); });
  document.getElementById('cancelEditBtn').addEventListener('click', () => document.getElementById('editModal').classList.remove('show'));
  document.getElementById('confirmDelBtn').addEventListener('click', () => { if (deleteCallback) deleteCallback(); });
  document.getElementById('cancelDelBtn').addEventListener('click', () => document.getElementById('confirmModal').classList.remove('show'));

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function loadReferences() {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;color:var(--text-muted);">Loading...</p></div>';
    try {
      const res = await fetch('/api/references');
      const data = await res.json();
      grid.innerHTML = '';
      for (const type of ['aktifitas', 'sub_node', 'odc', 'priority']) {
        if (data[type]) renderSection(type, data[type]);
      }
    } catch (e) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">Gagal load data</div>';
    }
  }

  loadReferences();
});
