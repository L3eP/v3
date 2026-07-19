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
    // ftth → standalone page (ftth.html)
    priority:  { icon:'fa-flag',    label:'Priority',   color:'#d97706', coord:false },
    adduser:   { icon:'fa-user-plus',label:'Add User',  color:'#0891b2', coord:false },
    // psb → standalone page (psb.html)
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
      // ftth → standalone page
      if (data) {
        countHtml = `<div class="admin-card-count">${data.length}</div>`;
      }
      return `<div class="admin-card" onclick="goSection('${k}')">
        <div class="admin-card-icon" style="color:${s.color}"><i class="fas ${s.icon}"></i></div>
        <div class="admin-card-title">${s.label}</div>
        ${countHtml}
        <div class="admin-card-sub">Klik untuk kelola</div>
      </div>`;
    }).join('');
  }

  window.goSection = function(key) {
    homeEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    if (key === 'adduser') renderAddUser();
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
      const r = await csrfFetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { toast('Berhasil ditambahkan'); goHome(); await loadData(); goSection(type); }
      else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };

  // ==================== FTTH TREE ====================
  // ==================== ADD USER ====================
  function renderAddUser() {
    detailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="back-btn" onclick="goHome()"><i class="fas fa-arrow-left"></i></button>
        <h2 style="margin:0;"><i class="fas fa-user-plus" style="color:#0891b2;"></i> Add User</h2>
      </div>
      <div class="admin-card" style="max-width:500px;padding:24px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:10px;">
            <input type="text" id="auFullName" placeholder="Nama Lengkap *" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;">
            <input type="text" id="auUsername" placeholder="Username *" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;">
          </div>
          <input type="password" id="auPassword" placeholder="Password * (min 6 karakter)" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;">
          <div style="display:flex;gap:10px;">
            <input type="tel" id="auPhone" placeholder="No Telepon (628xx)" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;">
            <select id="auRole" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="Teknisi">Teknisi</option>
              <option value="Operator">Operator</option>
              <option value="Owner">Owner</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:.85rem;color:var(--text-muted);margin-bottom:4px;">Foto Profil (opsional)</label>
            <input type="file" id="auPhoto" accept="image/*" style="width:100%;padding:6px;">
          </div>
          <button id="auSubmitBtn" class="login-btn" style="width:auto;padding:10px 24px;">
            <i class="fas fa-user-plus"></i> Buat User
          </button>
        </div>
      </div>`;

    document.getElementById('auSubmitBtn').addEventListener('click', submitAddUser);
  }

  async function submitAddUser() {
    const fullName = document.getElementById('auFullName').value.trim();
    const username = document.getElementById('auUsername').value.trim();
    const password = document.getElementById('auPassword').value.trim();
    if (!fullName || !username || !password) { toast('Nama, username, dan password wajib diisi'); return; }
    if (password.length < 6) { toast('Password minimal 6 karakter'); return; }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('username', username);
    formData.append('password', password);
    const phone = document.getElementById('auPhone').value.trim();
    if (phone) formData.append('phone', phone);
    formData.append('role', document.getElementById('auRole').value);
    const photo = document.getElementById('auPhoto').files[0];
    if (photo) formData.append('photo', photo);

    const btn = document.getElementById('auSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    try {
      const r = await csrfFetch('/register', { method:'POST', body: formData });
      const data = await r.json();
      if (r.ok) {
        toast('User berhasil dibuat');
        document.getElementById('auFullName').value = '';
        document.getElementById('auUsername').value = '';
        document.getElementById('auPassword').value = '';
        document.getElementById('auPhone').value = '';
        document.getElementById('auPhoto').value = '';
      } else {
        toast(data.message || (data.errors ? data.errors.map(e => e.msg).join(', ') : 'Gagal'), 'error');
      }
    } catch(e) { toast('Error: '+e.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Buat User'; }
  }

  // ==================== EDIT (via modal) ====================
  window.openEdit = function(type, id, label, group, lat, lng, parentPort) {
    const titles = { olt:'OLT', odc:'ODC', odp:'ODP', aktifitas:'Aktifitas', sub_node:'Sub-Node', priority:'Priority' };
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
    deleteId = id; deleteLabel = label;
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;
  };

  document.getElementById('confirmDelBtn').onclick = async () => {
    if (!deleteId) return;
    try {
      const r = await csrfFetch(`/api/references/${deleteId}`, { method:'DELETE' });
      if (r.ok) {
        document.getElementById('confirmModal').classList.remove('show');
        toast(`"${deleteLabel}" berhasil dihapus`);
        deleteId = null;
        goHome(); await loadData();
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
