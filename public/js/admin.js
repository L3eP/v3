document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || user.role !== ROLES.OWNER) { window.location.href = 'dashboard.html'; return; }

  // ==================== DARK MODE TOGGLE ====================
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleLabel = document.getElementById('themeToggleLabel');
  function syncThemeToggleUI() {
    const isDark = getTheme() === 'dark';
    themeToggleBtn.setAttribute('aria-pressed', String(isDark));
    themeToggleBtn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    themeToggleLabel.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
  }
  syncThemeToggleUI();
  themeToggleBtn.addEventListener('click', () => {
    toggleTheme();
    syncThemeToggleUI();
  });

  const homeEl = document.getElementById('adminHome');
  const detailEl = document.getElementById('adminDetail');
  let allData = {};
  let editId = null, editType = '';

  const SECTIONS = {
    aktifitas: { icon:'fa-tasks',   label:'Aktifitas', color:'#2563eb', coord:false },
    sub_node:  { icon:'fa-sitemap', label:'Sub-Node',  color:'#7c3aed', coord:true  },
    priority:  { icon:'fa-flag', label:'Priority', color:'#d97706', coord:false },
    device_brand: { icon:'fa-tag', label:'Device Brand', color:'#0891b2', coord:false },
    inventory_type: { icon:'fa-box', label:'Tipe Inventory', color:'#059669', coord:false },
  };

  // esc() — global from toast.js

  // Toast — delegasikan ke showToast() dari toast.js
  function toast(m, type = 'success') {
    showToast(m, type);
  }

  // ==================== CARDS ====================
  function renderCards() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = Object.entries(SECTIONS).map(([k, s]) => {
      let countHtml = '';
      const data = allData[k];
      // ftth → standalone page
      if (data) {
        countHtml = `<div class="admin-card-count">${data.length}</div>`;
      }
      return `<button type="button" class="admin-card" onclick="goSection('${k}')" aria-label="Kelola ${s.label}">
        <div class="admin-card-icon" style="color:${s.color}"><i class="fas ${s.icon}"></i></div>
        <div class="admin-card-title">${s.label}</div>
        ${countHtml}
        <div class="admin-card-sub">Klik untuk kelola</div>
      </button>`;
    }).join('') + `
      <button type="button" class="admin-card" onclick="openCompanyModal()" style="border:2px dashed var(--border-color);" aria-label="Atur nama & logo perusahaan">
        <div class="admin-card-icon" style="color:var(--accent-violet);"><i class="fas fa-building"></i></div>
        <div class="admin-card-title">Company Settings</div>
        <div class="admin-card-sub">Atur nama & logo perusahaan</div>
      </button>
      <button type="button" class="admin-card" onclick="openAuditModal()" style="border:2px dashed var(--border-color);" aria-label="Lihat log audit">
        <div class="admin-card-icon" style="color:#6b7280;"><i class="fas fa-history"></i></div>
        <div class="admin-card-title">Log Audit</div>
        <div class="admin-card-sub">Riwayat perubahan data</div>
      </button>`;
  }

  window.goSection = function(key) {
    window.location.hash = key;
    homeEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    renderList(key);
  };

    window.goHome = function() {
    window.location.hash = '';
    homeEl.classList.remove('hidden');
    detailEl.classList.add('hidden');
    detailEl.innerHTML = '';
  };

  // ==================== SIMPLE LIST (seperti FTTH) ====================
  function renderList(type) {
    const s = SECTIONS[type];
    const items = allData[type] || [];
    const borderColor = s.color;
    detailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;flex:1;">
          <button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button>
          <h2 style="margin:0;font-size:1.2rem;"><i class="fas ${s.icon}" style="color:${borderColor};"></i> ${s.label} <span style="font-weight:400;color:var(--text-muted);font-size:.9rem;">(${items.length})</span></h2>
          <div style="position:relative;flex:1;min-width:150px;max-width:280px;">
            <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:.8rem;"></i>
            <input type="text" id="adminSearch" aria-label="Cari ${s.label}" class="filter-select" placeholder="Cari ${s.label}..." style="padding-left:28px;width:100%;" oninput="searchAdminItems('${type}')">
          </div>
          <button class="login-btn btn-header" style="margin-left:auto;width:auto;" onclick="showAddForm('${type}')"><i class="fas fa-plus-circle"></i> Tambah ${s.label}</button>
        </div>
      </div>
      <div class="admin-card" style="overflow:hidden;">
        <div id="listItems">${renderItems(type, items, '')}</div>
      </div>
      <div id="addForm${type}" style="display:none;margin-top:12px;"></div>`;
  }

  window.searchAdminItems = function(type) {
    const q = (document.getElementById('adminSearch').value || '').toLowerCase();
    const items = allData[type] || [];
    const filtered = items.filter(i =>
      (i.label || '').toLowerCase().includes(q)
    );
    document.getElementById('listItems').innerHTML = renderItems(type, filtered, q);
  };

  function renderItems(type, items) {
    if (!items.length) return '<div class="empty-state"><i class="fas fa-search" style="font-size:2rem;opacity:.5;display:block;margin-bottom:10px;"></i>Tidak ditemukan</div>';
    return items.map(i =>
      `<div class="ftth-card-item" style="border:none;border-bottom:1px solid var(--border-color);border-radius:0;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="field-label">${i.lat&&i.lng?'📍 ':''}${esc(i.label)}</span>
            ${i.group ? `<span class="tag-chip">${esc(i.group)}</span>` : ''}
            ${i.lat&&i.lng ? `<span class="text-muted-xs">${i.lat.toFixed(4)}, ${i.lng.toFixed(4)}</span>` : ''}
          </div>
        </div>
        <div class="ref-actions" style="display:flex;gap:4px;flex-shrink:0;">
          <button class="ftth-edit" onclick="openEdit('${type}',${i.id},'${esc(i.label)}','','${i.lat||''}','${i.lng||''}')" title="Edit"><i class="fas fa-edit" style="color:#2563eb;"></i></button>
          <button class="ftth-del" onclick="openDelete(${i.id},'${esc(i.label)}')" title="Hapus"><i class="fas fa-trash" style="color:#ef4444;"></i></button>
        </div>
      </div>`
    ).join('');
  }

let _addRefType = '';

  // ==================== AUDIT LOG MODAL ====================
  async function openAuditModal() {
    const modal = document.getElementById('auditModal');
    const listEl = document.getElementById('auditList');
    modal.classList.add('show');
    listEl.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:10px;"></i>Memuat...</div>';

    try {
      const r = await fetch('/api/audit');
      const result = await r.json();
      const logs = result.data || [];
      const countEl = document.getElementById('auditCount');
      if (countEl && result.pagination) countEl.textContent = `(${result.pagination.total} log)`;

      if (!logs.length) {
        listEl.innerHTML = '<div class="empty-state"><i class="fas fa-inbox" style="font-size:2rem;opacity:.5;display:block;margin-bottom:10px;"></i>Belum ada log</div>';
        return;
      }

      const actionColors = { CREATE:'#10b981', UPDATE:'#f59e0b', DELETE:'#ef4444', LOGIN:'#3b82f6', LOGOUT:'#6b7280' };
      listEl.innerHTML = logs.map(log => {
        // Parse details per row — kalau 1 row rusak, jangan mematikan seluruh list
        let detailText = '';
        if (log.details) {
          try {
            const details = JSON.parse(log.details);
            detailText = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ');
          } catch(e) { detailText = '(detail tidak terbaca)'; }
        }
        const color = actionColors[log.action] || '#6b7280';
        return `<div class="ftth-card-item" style="border:none;border-bottom:1px solid var(--border-color);padding:10px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600;text-transform:uppercase;">${log.action}</span>
              <span style="font-weight:600;font-size:.85rem;color:var(--text-main);">${log.target_type}</span>
              ${log.target_id ? `<span class="text-muted-sm">#${log.target_id}</span>` : ''}
              <span class="text-muted-sm">oleh <strong>${esc(log.username)}</strong></span>
            </div>
            <small style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;">${new Date(log.created_at).toLocaleString()}</small>
          </div>
          ${detailText ? `<div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">${esc(detailText)}</div>` : ''}
        </div>`;
      }).join('');
    } catch(e) {
      listEl.innerHTML = '<div class="empty-state" style="color:#ef4444;">Gagal memuat log audit</div>';
    }
  }
  // Expose global — dipanggil dari onclick card di HTML
  window.openAuditModal = openAuditModal;

  window.showAddForm = function(type) {
    _addRefType = type;
    const s = SECTIONS[type];
    const wrap = document.getElementById('addRefCoordWrap');
    if (s.coord) {
      wrap.style.display = 'flex';
    } else {
      wrap.style.display = 'none';
    }
    document.getElementById('addRefTitle').textContent = `Tambah ${s.label}`;
    document.getElementById('addRefLabel').value = '';
    document.getElementById('addRefLat').value = '';
    document.getElementById('addRefLng').value = '';
    document.getElementById('addRefModal').classList.add('show');
  };

  document.getElementById('addRefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = _addRefType;
    const label = document.getElementById('addRefLabel').value.trim();
    if (!label) { toast('Label wajib diisi'); return; }
    const s = SECTIONS[type];
    const lat = s.coord ? (document.getElementById('addRefLat').value.trim()||'') : '';
    const lng = s.coord ? (document.getElementById('addRefLng').value.trim()||'') : '';
    const btn = document.getElementById('addRefForm').querySelector('.login-btn');
    setLoading(btn, true, 'Menyimpan...');
    try {
      const body = { type, label };
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await csrfFetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        toast('Berhasil ditambahkan');
        document.getElementById('addRefModal').classList.remove('show');
        goHome(); await loadData(); goSection(type);
      } else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
    finally { setLoading(btn, false); }
  });

  // ==================== EDIT (via modal) ====================
  window.openEdit = function(type, id, label, group, lat, lng, parentPort) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP', onu:'ONU', aktifitas:'Aktifitas', sub_node:'Sub-Node', priority:'Priority' };
    editId = id; editType = type;
    const t = titles[type] || type;
    const hasCoord = ['olt','odc','odp','sub_node'].includes(type);
    const hasGroup = ['odc','odp'].includes(type);
    const hasPort = ['odc','odp','onu'].includes(type);

    document.getElementById('editModalTitle').textContent = `Edit ${t}`;
    document.getElementById('editModalBody').style.display = 'block';
    document.getElementById('addFormContainer').style.display = 'none';
    document.getElementById('editLabel').value = label;
    document.getElementById('editGroupWrap').style.display = hasGroup ? 'block' : 'none';
    if (hasGroup) document.getElementById('editGroup').value = group;
    document.getElementById('editPortWrap').style.display = hasPort ? 'block' : 'none';
    if (hasPort) document.getElementById('editPort').value = parentPort || '';
    document.getElementById('editCoordWrap').style.display = hasCoord ? 'block' : 'none';
    if (hasCoord) { document.getElementById('editLat').value = lat; document.getElementById('editLng').value = lng; }
    document.getElementById('editModal').classList.add('show');
  };

  document.getElementById('saveEditBtn').onclick = async () => {
    if (!editId) return;
    const hasCoord = ['olt','odc','odp','sub_node'].includes(editType);
    const hasGroup = ['odc','odp'].includes(editType);
    const hasPort = ['odc','odp','onu'].includes(editType);
    const body = { label: document.getElementById('editLabel').value.trim() };
    if (hasGroup) body.group_name = document.getElementById('editGroup').value.trim() || undefined;
    if (hasPort) body.parent_port = document.getElementById('editPort').value.trim() || null;
    if (hasCoord) {
      const el = document.getElementById('editLat').value.trim();
      const en = document.getElementById('editLng').value.trim();
      if (el && en) { body.latitude = parseFloat(el); body.longitude = parseFloat(en); }
    }
    try {
      const r = await csrfFetch(`/api/references/${editId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        document.getElementById('editModal').classList.remove('show');
        toast('Berhasil diupdate');
        goHome(); await loadData();
        goSection(editType);
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
    showConfirm(`Hapus "${label}"?`, async () => {
      try {
        const r = await csrfFetch(`/api/references/${id}`, { method:'DELETE' });
        if (r.ok) {
          toast(`"${label}" berhasil dihapus`);
          goHome(); await loadData();
        } else { const d = await r.json(); toast(d.message||'Gagal'); }
      } catch(e) { toast('Error: '+e.message); }
    });
  };

  // ==================== COMPANY SETTINGS (modal) ====================
  window.openCompanyModal = function() {
    loadCompanyData();
    document.getElementById('companyModal').classList.add('show');
  };

  async function loadCompanyData() {
    try {
      const [nameRes, logoRes] = await Promise.all([
        fetch('/settings/company-name'),
        fetch('/settings/company-logo')
      ]);
      const nameData = await nameRes.json();
      if (nameData.companyName) {
        document.getElementById('companyName').value = nameData.companyName;
      }
      const logoData = await logoRes.json();
      if (logoData.logoUrl) {
        const preview = document.getElementById('logoPreview');
        preview.src = logoData.logoUrl;
        preview.style.display = 'block';
      }
    } catch (e) {
      console.error('Error loading company settings:', e);
    }
  }

  // Preview logo 3x3
  document.getElementById('companyLogo').addEventListener('change', function() {
    const preview = document.getElementById('logoPreview');
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      reader.readAsDataURL(this.files[0]);
    }
  });

  // Submit company form
  document.getElementById('companyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const companyName = document.getElementById('companyName').value.trim();
    if (!companyName) { toast('Nama perusahaan wajib diisi', 'error'); return; }

    const btn = document.getElementById('companyForm').querySelector('.login-btn');
    setLoading(btn, true, 'Menyimpan...');

    try {
      const nameRes = await csrfFetch('/settings/company-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName })
      });
      if (!nameRes.ok) {
        const d = await nameRes.json();
        toast(d.message || 'Gagal', 'error');
        setLoading(btn, false);
        return;
      }
      localStorage.setItem('companyName', companyName);

      const logoFile = document.getElementById('companyLogo').files[0];
      if (logoFile) {
        const logoForm = new FormData();
        logoForm.append('logo', logoFile);
        const logoRes = await csrfFetch('/settings/company-logo', { method: 'POST', body: logoForm });
        if (logoRes.ok) {
          const logoData = await logoRes.json();
          if (logoData.logoUrl) {
            localStorage.setItem('companyLogo', logoData.logoUrl);
            localStorage.setItem('companyLogoVersion', Date.now().toString());
          }
        } else {
          toast('Nama tersimpan, logo gagal upload', 'warning');
          setLoading(btn, false);
          return;
        }
      }

      toast('Company settings saved!', 'success');
      document.getElementById('companyModal').classList.remove('show');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

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

  // Restore state dari URL hash
  if (window.location.hash) {
    const h = window.location.hash.replace('#', '');
    if (Object.keys(SECTIONS).includes(h)) goSection(h);
  }
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h && Object.keys(SECTIONS).includes(h)) goSection(h);
    else if (!h) goHome();
  });
});
