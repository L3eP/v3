document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }

  const isPrivileged = user.role === 'Owner' || user.role === 'Operator';
  let odpOptions = [];
  let psbList = [];

  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Toast
  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:.95rem;animation:fadein .3s;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2500);
  }

  // Load ODP options
  async function loadOdp() {
    try {
      const r = await fetch('/api/references');
      const data = await r.json();
      odpOptions = data.odp || [];
      const select = document.getElementById('psbOdp');
      select.innerHTML = '<option value="">Pilih Parent ODP (opsional)</option>' +
        odpOptions.map(o => `<option value="${esc(o.label)}">${esc(o.label)}</option>`).join('');
    } catch(e) { /* silent */ }
  }

  // Load PSB list
  async function loadPsb() {
    try {
      const r = await fetch('/api/psb');
      psbList = await r.json();
      renderList();
    } catch(e) { /* silent */ }
  }

  // Render list
  function renderList() {
    const container = document.getElementById('psbListContainer');
    const count = document.getElementById('psbCount');
    count.textContent = `(${psbList.length})`;

    if (!psbList.length) {
      container.innerHTML = `<div class="psb-empty"><i class="fas fa-inbox"></i><p>Belum ada pendaftaran</p></div>`;
      return;
    }

    const statusColors = { Terdaftar:'#f59e0b', Terpasang:'#3b82f6', Aktif:'#10b981', Batal:'#ef4444' };

    container.innerHTML = psbList.map(p => {
      const sc = statusColors[p.status] || '#6b7280';
      return `<div class="psb-item">
        <div class="psb-info" onclick="showDetail(${p.id})" style="cursor:pointer;">
          <div class="psb-name">${esc(p.customer_name)}</div>
          <div class="psb-meta">${esc(p.address.substring(0,80))}${p.address.length>80?'...':''}</div>
          <div style="display:flex;gap:8px;margin-top:4px;align-items:center;flex-wrap:wrap;">
            ${p.onu_sn ? `<span class="psb-sn">SN: ${esc(p.onu_sn)}</span>` : ''}
            <span class="status-badge-psb" style="background:${sc};">${p.status}</span>
            <span class="psb-sn">${p.created_by ? `oleh ${esc(p.created_by)}` : ''}</span>
          </div>
        </div>
        <div class="ref-actions" style="display:flex;gap:5px;flex-shrink:0;">
          ${isPrivileged ? `<button class="btn-edit-ref" onclick="editPsb(${p.id})"><i class="fas fa-edit"></i></button>` : ''}
          <button class="btn-del-ref" onclick="viewDetail(${p.id})" title="Lihat detail"><i class="fas fa-eye"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  // Submit form — FormData (support file upload)
  document.getElementById('psbSubmitBtn').addEventListener('click', async () => {
    const customerName = document.getElementById('psbName').value.trim();
    const address = document.getElementById('psbAddress').value.trim();
    if (!customerName || !address) { toast('Nama dan alamat wajib diisi'); return; }

    const formData = new FormData();
    formData.append('customerName', customerName);
    formData.append('address', address);

    const phone = document.getElementById('psbPhone').value.trim();
    const onuSn = document.getElementById('psbOnuSn').value.trim();
    const lat = document.getElementById('psbLat').value.trim();
    const lng = document.getElementById('psbLng').value.trim();
    const odpLabel = document.getElementById('psbOdp').value;
    const photoFile = document.getElementById('psbPhoto').files[0];
    const notes = document.getElementById('psbNotes').value.trim();

    if (phone) formData.append('phone', phone);
    if (onuSn) formData.append('onuSn', onuSn);
    if (lat && lng) { formData.append('latitude', parseFloat(lat)); formData.append('longitude', parseFloat(lng)); }
    if (odpLabel) formData.append('odpLabel', odpLabel);
    if (photoFile) formData.append('photo', photoFile);
    if (notes) formData.append('notes', notes);

    const btn = document.getElementById('psbSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
      const r = await csrfFetch('/api/psb', { method:'POST', body: formData });
      if (r.ok) {
        toast('PSB berhasil didaftarkan');
        document.getElementById('psbName').value = '';
        document.getElementById('psbAddress').value = '';
        document.getElementById('psbPhone').value = '';
        document.getElementById('psbOnuSn').value = '';
        document.getElementById('psbLat').value = '';
        document.getElementById('psbLng').value = '';
        document.getElementById('psbOdp').value = '';
        document.getElementById('psbPhoto').value = '';
        document.getElementById('psbNotes').value = '';
        await loadPsb();
      } else {
        const d = await r.json();
        toast(d.message || 'Gagal', 'error');
      }
    } catch(e) { toast('Error: '+e.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Daftarkan PSB'; }
  });

  // View detail (all roles)
  window.viewDetail = async function(id) {
    try {
      const r = await fetch(`/api/psb/${id}`);
      const p = await r.json();
      const statusColors = { Terdaftar:'#f59e0b', Terpasang:'#3b82f6', Aktif:'#10b981', Batal:'#ef4444' };
      const sc = statusColors[p.status] || '#6b7280';
      document.getElementById('detailModalTitle').textContent = 'Detail PSB';
      document.getElementById('detailModalBody').innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ['Nama Pelanggan', p.customer_name],
            ['Alamat', p.address],
            ['No Telepon', p.phone || '-'],
            ['SN ONU', p.onu_sn || '-'],
            ['Parent ODP', p.odp_label || '-'],
            ['Koordinat', p.latitude && p.longitude ? p.latitude+', '+p.longitude : '-'],
            ['Foto Modem', p.photo ? `<img src="${esc(p.photo)}" style="max-width:200px;max-height:150px;border-radius:6px;cursor:pointer;" onclick="window.open('${esc(p.photo)}','_blank')">` : '-'],
            ['Catatan', p.notes || '-'],
            ['Didaftarkan oleh', p.created_by],
            ['Tanggal', new Date(p.created_at).toLocaleString()],
          ].map(([label, value]) => `<tr><td style="padding:6px 8px;font-weight:500;color:var(--text-muted);font-size:.85rem;border-bottom:1px solid var(--border-color);width:140px;">${label}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border-color);">${value}</td></tr>`).join('')}
        </table>`;
      document.getElementById('detailModal').classList.add('show');
    } catch(e) { toast('Error loading detail', 'error'); }
  };

  // Edit (Owner/Operator only) — inline modal
  window.editPsb = async function(id) {
    if (!isPrivileged) return;
    try {
      const r = await fetch(`/api/psb/${id}`);
      const p = await r.json();
      const statusOptions = ['Terdaftar','Terpasang','Aktif','Batal'];

      document.getElementById('detailModalTitle').textContent = 'Edit PSB';
      document.getElementById('detailModalBody').innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <input type="text" id="epsbName" value="${esc(p.customer_name)}" placeholder="Nama *" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
          <textarea id="epsbAddress" rows="2" placeholder="Alamat *" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;">${esc(p.address)}</textarea>
          <div style="display:flex;gap:8px;">
            <input type="text" id="epsbPhone" value="${esc(p.phone||'')}" placeholder="Telepon" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
            <input type="text" id="epsbOnuSn" value="${esc(p.onu_sn||'')}" placeholder="SN ONU" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
          </div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="epsbLat" value="${p.latitude||''}" placeholder="Latitude" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
            <input type="text" id="epsbLng" value="${p.longitude||''}" placeholder="Longitude" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
          </div>
          <select id="epsbOdp" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="">Pilih ODP</option>
            ${odpOptions.map(o => `<option value="${esc(o.label)}" ${o.label===p.odp_label?'selected':''}>${esc(o.label)}</option>`).join('')}
          </select>
          <select id="epsbStatus" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;">
            ${statusOptions.map(s => `<option value="${s}" ${s===p.status?'selected':''}>${s}</option>`).join('')}
          </select>
          <div>
            <label style="display:block;font-size:.85rem;color:var(--text-muted);margin-bottom:4px;">Foto Belakang Modem</label>
            ${p.photo ? `<div style="margin-bottom:6px;"><img src="${esc(p.photo)}" style="max-width:180px;max-height:120px;border-radius:4px;border:1px solid #e5e7eb;"></div>` : ''}
            <input type="file" id="epsbPhoto" accept="image/*" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;">
          </div>
          <textarea id="epsbNotes" rows="2" placeholder="Catatan" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;">${esc(p.notes||'')}</textarea>
          <div style="display:flex;gap:8px;">
            <button class="login-btn" style="background:#6b7280;flex:1;" onclick="document.getElementById('detailModal').classList.remove('show')">Batal</button>
            <button class="login-btn" style="flex:1;" onclick="saveEdit(${p.id})">Simpan</button>
          </div>
          ${isPrivileged ? `<button class="login-btn" style="background:#ef4444;" onclick="deletePsb(${p.id})"><i class="fas fa-trash"></i> Hapus PSB</button>` : ''}
        </div>`;
      document.getElementById('detailModal').classList.add('show');
    } catch(e) { toast('Error loading data', 'error'); }
  };

  window.saveEdit = async function(id) {
    const name = document.getElementById('epsbName').value.trim();
    const address = document.getElementById('epsbAddress').value.trim();
    if (!name || !address) { toast('Nama dan alamat wajib diisi'); return; }

    const formData = new FormData();
    formData.append('customerName', name);
    formData.append('address', address);

    const phone = document.getElementById('epsbPhone').value.trim();
    const onuSn = document.getElementById('epsbOnuSn').value.trim();
    const lat = document.getElementById('epsbLat').value.trim();
    const lng = document.getElementById('epsbLng').value.trim();
    const odpLabel = document.getElementById('epsbOdp').value;
    const status = document.getElementById('epsbStatus').value;
    const photoFile = document.getElementById('epsbPhoto').files[0];
    const notes = document.getElementById('epsbNotes').value.trim();

    if (phone) formData.append('phone', phone);
    if (onuSn) formData.append('onuSn', onuSn);
    if (lat && lng) { formData.append('latitude', parseFloat(lat)); formData.append('longitude', parseFloat(lng)); }
    if (odpLabel) formData.append('odpLabel', odpLabel);
    if (status) formData.append('status', status);
    if (photoFile) formData.append('photo', photoFile);
    if (notes) formData.append('notes', notes);

    try {
      const r = await csrfFetch(`/api/psb/${id}`, { method:'PUT', body: formData });
      if (r.ok) {
        toast('PSB berhasil diupdate');
        document.getElementById('detailModal').classList.remove('show');
        await loadPsb();
      } else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };

  window.deletePsb = function(id) {
    document.getElementById('confirmMessage').textContent = 'Yakin ingin menghapus PSB ini?';
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmDelBtn').onclick = async () => {
      try {
        const r = await csrfFetch(`/api/psb/${id}`, { method:'DELETE' });
        if (r.ok) {
          document.getElementById('confirmModal').classList.remove('show');
          document.getElementById('detailModal').classList.remove('show');
          toast('PSB berhasil dihapus');
          await loadPsb();
        } else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
      } catch(e) { toast('Error: '+e.message, 'error'); }
    };
  };

  document.getElementById('cancelDelBtn').onclick = () => document.getElementById('confirmModal').classList.remove('show');

  // Load initial data
  await Promise.all([loadOdp(), loadPsb()]);
});
