document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }

  const isPrivileged = user.role === ROLES.OWNER || user.role === ROLES.OPERATOR;
  const isOwner = user.role === ROLES.OWNER;
  let odpOptions = [];
  let onuInventory = [];
  let psbList = [];
  // Pagination daftar — 8 baris per halaman, search-aware.
  const PSB_PAGE_SIZE = 8;
  let psbCurrentPage = 1;

  // Status PSB → varian strong-semantik (tunggal, dipakai render + detail).
  const PSB_STATUS_COLORS = { Terdaftar:'var(--sem-warn-strong)', Terpasang:'var(--sem-info-strong)', Aktif:'var(--sem-success-strong)', Batal:'var(--sem-danger-strong)' };

  // esc() — global from toast.js

  // Toast — delegasikan ke showToast() dari toast.js
  function toast(msg, type = 'success') {
    showToast(msg, type);
  }

  // Button buka modal tambah PSB
  const addBtn = document.getElementById('psbAddBtn');
  const addModal = document.getElementById('addPsbModal');
  if (addBtn && addModal) {
    addBtn.addEventListener('click', () => { addModal.classList.add('show'); });
    // Klik overlay kini ditangani sistem global (toast.js) dengan peringatan draft.
  }

  // Load ODP options — dari /api/ftth (ftth_devices), BUKAN /api/references.
  // reference_options masih menyimpan salinan lama tipe olt/odc/odp/onu dari
  // sebelum topologi FTTH dipisah ke tabel ftth_devices sendiri (lihat
  // scripts/add_ftth_devices_table.sql) — daftar ODP di sana sudah basi dan
  // tidak ikut ter-update saat ODP baru ditambah/diubah lewat ftth.html.
  async function loadOdp() {
    try {
      const r = await fetch('/api/ftth');
      const { data } = await r.json();
      odpOptions = (data && data.odp) || [];
      const select = document.getElementById('psbOdp');
      select.innerHTML = '<option value="">Pilih Parent ODP (opsional)</option>' +
        odpOptions.map(o => `<option value="${esc(o.label)}">${esc(o.label)}</option>`).join('');
    } catch(e) { /* silent */ }
  }

  // Item ONU di inventory — dipakai saat status PSB diubah ke "Terpasang"
  // (lihat editPsb/saveEdit di bawah). Cuma relevan untuk Owner/Operator.
  async function loadOnuInventory() {
    if (!isPrivileged) return;
    try {
      const r = await fetch('/api/inventory');
      const items = await r.json();
      onuInventory = (items || []).filter(i => i.device_type === 'ONU');
    } catch(e) { /* silent */ }
  }

  // Port ONU tersedia di ODP terpilih — dipakai saat tambah maupun edit PSB.
  // Sama persis dengan available-ports di ftth.js saat menambah ONU: pada
  // dasarnya PSB adalah penempatan satu ONU di satu port ODP, jadi list-nya
  // (dan endpoint-nya, GET /api/ftth/available-ports) disamakan.
  let selectedPort = { add: '', edit: '' };

  async function loadAvailablePorts(parent, mode, currentPort) {
    const wrap = document.getElementById(mode === 'edit' ? 'epsbPortWrap' : 'psbPortWrap');
    const container = document.getElementById(mode === 'edit' ? 'epsbAvailPorts' : 'psbAvailPorts');
    const head = document.getElementById(mode === 'edit' ? 'epsbPortHead' : 'psbPortHead');
    if (!wrap || !container) return;
    selectedPort[mode] = '';
    if (!parent) { wrap.classList.add('hidden'); container.innerHTML = ''; return; }

    wrap.classList.remove('hidden');
    container.innerHTML = '<span class="text-muted-sm">Memuat port...</span>';
    try {
      const r = await fetch(`/api/ftth/available-ports?type=onu&parent=${encodeURIComponent(parent)}`);
      const data = await r.json();
      // Port yang sedang dipakai PSB ini sendiri (mode edit) tetap ditawarkan —
      // dari sudut pandang ftth_devices port itu memang belum dipakai device
      // ONU sungguhan, jadi otomatis ikut muncul di data.available.
      const available = data.available || [];
      if (head) {
        const totalPorts = data.parent ? data.parent.totalPorts : 0;
        head.textContent = totalPorts
          ? `Port ONU tersedia (${data.used || 0}/${totalPorts} terpakai)`
          : 'Port ONU tersedia';
      }
      if (available.length) {
        container.innerHTML = available.map(p =>
          `<button type="button" class="port-chip" data-port="${esc(p.port)}">${esc(p.port)}</button>`
        ).join('');
        container.querySelectorAll('.port-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            container.querySelectorAll('.port-chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedPort[mode] = chip.dataset.port;
          });
          if (currentPort && chip.dataset.port === currentPort) {
            chip.classList.add('selected');
            selectedPort[mode] = currentPort;
          }
        });
      } else {
        container.innerHTML = '<span class="text-muted-sm">Tidak ada port tersedia</span>';
      }
    } catch (e) {
      container.innerHTML = '<span class="text-muted-sm">Gagal memuat port</span>';
    }
  }

  document.getElementById('psbOdp').addEventListener('change', function () {
    loadAvailablePorts(this.value, 'add');
  });

  // Load PSB list
  async function loadPsb() {
    try {
      const r = await fetch('/api/psb');
      psbList = await r.json();
      renderList();
    } catch(e) { /* silent */ }
  }

  // Render list (search-aware, paginated) — teks item rata kiri.
  function renderList(list) {
    const items = list || psbList;
    const searchInput = document.getElementById('psbSearch');
    const q = searchInput ? (searchInput.value || '').toLowerCase().trim() : '';
    const filtered = q ? items.filter(p =>
      (p.customer_name || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.onu_sn || '').toLowerCase().includes(q) ||
      (p.status || '').toLowerCase().includes(q)
    ) : items;

    const container = document.getElementById('psbListContainer');
    const count = document.getElementById('psbCount');
    count.textContent = `(${filtered.length})`;

    if (!filtered.length) {
      container.innerHTML = `<div class="psb-empty"><i class="fas fa-inbox"></i><p>${items.length ? 'Tidak ditemukan' : 'Belum ada pendaftaran'}</p></div>`;
      renderPagination(0);
      return;
    }

    // Halaman aktif dijepit ke rentang yang valid setelah filter/hapus.
    const totalPages = Math.max(1, Math.ceil(filtered.length / PSB_PAGE_SIZE));
    if (psbCurrentPage > totalPages) psbCurrentPage = totalPages;
    if (psbCurrentPage < 1) psbCurrentPage = 1;
    const start = (psbCurrentPage - 1) * PSB_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PSB_PAGE_SIZE);

    const statusColors = PSB_STATUS_COLORS;

    container.innerHTML = pageItems.map(p => {
      const sc = statusColors[p.status] || '#6b7280';
      return `<div class="psb-item">
        <button type="button" class="psb-info" onclick="viewDetail(${p.id})" aria-label="Detail ${esc(p.customer_name)}">
          <div class="psb-name">${esc(p.customer_name)}</div>
          <div class="psb-meta">${esc((p.address||'').substring(0,80))}${(p.address||'').length>80?'...':''}</div>
          <div style="display:flex;gap:8px;margin-top:4px;align-items:center;flex-wrap:wrap;">
            ${p.onu_sn ? `<span class="psb-sn">SN: ${esc(p.onu_sn)}</span>` : ''}
            <span class="status-badge-psb" style="background:${sc};">${p.status}</span>
            <span class="psb-sn">${p.created_by ? `oleh ${esc(p.created_by)}` : ''}</span>
          </div>
        </button>
        <div class="ref-actions" style="display:flex;gap:5px;flex-shrink:0;">
          ${isPrivileged ? `<button class="btn-edit-ref" aria-label="Edit PSB" onclick="editPsb(${p.id})"><i class="fas fa-edit"></i></button>` : ''}
          <button class="btn-del-ref" aria-label="Lihat detail PSB" onclick="viewDetail(${p.id})" title="Lihat detail"><i class="fas fa-eye"></i></button>
        </div>
      </div>`;
    }).join('');

    renderPagination(filtered.length);
  }

  // Kontrol pagination — markup sama dengan activity/ticket-list: ul.pagination > li.page-item > a.page-link
  function renderPagination(total) {
    const controls = document.getElementById('psbPagination');
    if (!controls) return;
    controls.innerHTML = '';
    if (!total) return;

    const totalPages = Math.max(1, Math.ceil(total / PSB_PAGE_SIZE));
    if (totalPages <= 1) return;

    // Info jumlah item
    const info = document.createElement('li');
    info.className = 'page-item disabled';
    info.innerHTML = `<a class="page-link" href="#" tabindex="-1" aria-disabled="true" aria-label="${total} item">${total} pelanggan</a>`;
    controls.appendChild(info);

    // Tombol sebelumnya — disabled dikunci dari tab (aria-disabled + tabindex=-1), pola sama ticket-list.js
    const prev = document.createElement('li');
    const prevDisabled = psbCurrentPage === 1;
    prev.className = `page-item ${prevDisabled ? 'disabled' : ''}`;
    prev.innerHTML = `<a class="page-link" href="#" aria-label="Halaman sebelumnya"${prevDisabled ? ' aria-disabled="true" tabindex="-1"' : ''}><span aria-hidden="true">&laquo;</span></a>`;
    prev.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      if (psbCurrentPage > 1) { psbCurrentPage--; renderList(); }
    });
    controls.appendChild(prev);

    // Nomor halaman (maks 7 tombol)
    const maxVisiblePages = 7;
    let startPage = Math.max(1, psbCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    startPage = Math.max(1, endPage - maxVisiblePages + 1);

    for (let i = startPage; i <= endPage; i++) {
      const li = document.createElement('li');
      li.className = `page-item ${i === psbCurrentPage ? 'active' : ''}`;
      li.innerHTML = `<a class="page-link" href="#" aria-label="Halaman ${i}"${i === psbCurrentPage ? ' aria-current="page" tabindex="-1"' : ''}>${i}</a>`;
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        psbCurrentPage = i;
        renderList();
      });
      controls.appendChild(li);
    }

    // Tombol berikutnya
    const next = document.createElement('li');
    const nextDisabled = psbCurrentPage === totalPages;
    next.className = `page-item ${nextDisabled ? 'disabled' : ''}`;
    next.innerHTML = `<a class="page-link" href="#" aria-label="Halaman berikutnya"${nextDisabled ? ' aria-disabled="true" tabindex="-1"' : ''}><span aria-hidden="true">&raquo;</span></a>`;
    next.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      if (psbCurrentPage < totalPages) { psbCurrentPage++; renderList(); }
    });
    controls.appendChild(next);
  }

  // Search handler — dipanggil dari oninput di HTML (kembali ke halaman 1)
  window.filterPsb = function() {
    psbCurrentPage = 1;
    renderList(psbList);
  };

  // Submit form — FormData (support file upload)
  document.getElementById('psbSubmitBtn').addEventListener('click', async () => {
    const customerName = document.getElementById('psbName').value.trim();
    const address = document.getElementById('psbAddress').value.trim();
    if (!customerName || !address) { toast('Nama dan alamat wajib diisi'); return; }

    const confirmed = await new Promise(resolve => {
      showConfirm(`Daftarkan PSB untuk "${customerName}"?`, () => resolve(true), () => resolve(false), { danger: false, confirmLabel: 'Ya, Daftarkan' });
    });
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('customerName', customerName);
    formData.append('address', address);

    const phone = document.getElementById('psbPhone').value.trim();
    // Validasi no. HP — blokir simpan kalau format salah
    if (phone) {
      const phoneErr = validatePhone(phone);
      if (phoneErr) {
        toast(phoneErr, 'error');
        document.getElementById('psbPhone').focus();
        return;
      }
    }
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
    if (selectedPort.add) formData.append('onuPort', selectedPort.add);
    if (photoFile) formData.append('photo', photoFile);
    if (notes) formData.append('notes', notes);

    const btn = document.getElementById('psbSubmitBtn');
    setLoading(btn, true, 'Menyimpan...');

    try {
      const r = await csrfFetch('/api/psb', { method:'POST', body: formData });
      if (r.ok) {
        toast('PSB berhasil didaftarkan');
        addModal.classList.remove('show');
        document.getElementById('psbName').value = '';
        document.getElementById('psbAddress').value = '';
        document.getElementById('psbPhone').value = '';
        document.getElementById('psbOnuSn').value = '';
        document.getElementById('psbLat').value = '';
        document.getElementById('psbLng').value = '';
        document.getElementById('psbOdp').value = '';
        document.getElementById('psbPhoto').value = '';
        document.getElementById('psbNotes').value = '';
        document.getElementById('psbPortWrap').classList.add('hidden');
        document.getElementById('psbAvailPorts').innerHTML = '';
        selectedPort.add = '';
        psbCurrentPage = 1; // entri baru muncul di halaman pertama
        await loadPsb();
      } else {
        const d = await r.json();
        toast(d.message || 'Gagal', 'error');
      }
    } catch(e) { toast('Error: '+e.message, 'error'); }
    finally { setLoading(btn, false); }
  });

  // View detail (all roles)
  window.viewDetail = async function(id) {
    try {
      const r = await fetch(`/api/psb/${id}`);
      const p = await r.json();
      const sc = PSB_STATUS_COLORS[p.status] || '#6b7280';
      document.getElementById('detailModalTitle').textContent = 'Detail PSB';
      document.getElementById('detailModalBody').innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ['Nama Pelanggan', p.customer_name],
            ['Alamat', p.address],
            ['No Telepon', p.phone || '-'],
            ['SN ONU', p.onu_sn || '-'],
            ['Parent ODP', p.odp_label || '-'],
            ['Port ONU', p.onu_port || '-'],
            ['Koordinat', p.latitude && p.longitude ? p.latitude+', '+p.longitude : '-'],
            ['Foto Modem', p.photo ? `<img src="${esc(p.photo)}" alt="Foto belakang modem" loading="lazy" style="max-width:200px;max-height:150px;border-radius:6px;cursor:pointer;" onclick="window.open('${esc(p.photo)}','_blank')">` : '-'],
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
          <input type="text" id="epsbName" value="${esc(p.customer_name)}" placeholder="Nama *" class="field">
          <textarea id="epsbAddress" rows="2" placeholder="Alamat *" class="field" style="resize:vertical;">${esc(p.address)}</textarea>
          <div class="flex-row">
            <input type="text" id="epsbPhone" value="${esc(p.phone||'')}" placeholder="Telepon" class="field flex-1">
            <input type="text" id="epsbOnuSn" value="${esc(p.onu_sn||'')}" placeholder="SN ONU" class="field flex-1">
          </div>
          <div class="flex-row">
            <input type="text" id="epsbLat" value="${p.latitude||''}" placeholder="Latitude" class="field flex-1">
            <input type="text" id="epsbLng" value="${p.longitude||''}" placeholder="Longitude" class="field flex-1">
          </div>
          <select id="epsbOdp" class="field">
            <option value="">Pilih ODP</option>
            ${odpOptions.map(o => `<option value="${esc(o.label)}" ${o.label===p.odp_label?'selected':''}>${esc(o.label)}</option>`).join('')}
          </select>
          <div id="epsbPortWrap" class="hidden">
            <div class="ftth-port-head"><i class="fas fa-plug"></i> <span id="epsbPortHead">Port ONU tersedia</span></div>
            <div id="epsbAvailPorts" class="ftth-port-list"></div>
          </div>
          <select id="epsbStatus" class="field">
            ${statusOptions.map(s => `<option value="${s}" ${s===p.status?'selected':''}>${s}</option>`).join('')}
          </select>
          <div id="epsbInventoryWrap" class="hidden">
            <label style="display:block;font-size:.85rem;color:var(--text-muted);margin-bottom:4px;">Item ONU dipakai (stok berkurang otomatis) *</label>
            <select id="epsbInventory" class="field">
              <option value="">— Pilih item ONU —</option>
              ${onuInventory.map(i => `<option value="${i.id}" ${i.remaining < 1 ? 'disabled' : ''}>${esc(i.device_name)} (sisa ${i.remaining})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:.85rem;color:var(--text-muted);margin-bottom:4px;">Foto Belakang Modem</label>
            ${p.photo ? `<div style="margin-bottom:6px;"><img src="${esc(p.photo)}" alt="Foto belakang modem" loading="lazy" style="max-width:180px;max-height:120px;border-radius:4px;border:1px solid var(--border-color);"></div>` : ''}
            <input type="file" id="epsbPhoto" accept="image/*" class="field" style="padding:6px;">
          </div>
          <textarea id="epsbNotes" rows="2" placeholder="Catatan" class="field" style="resize:vertical;">${esc(p.notes||'')}</textarea>
          <div class="flex-row">
            <button class="btn-secondary flex-1" onclick="document.getElementById('detailModal').classList.remove('show')">Batal</button>
            <button class="login-btn flex-1" onclick="saveEdit(${p.id})">Simpan</button>
          </div>
          ${isOwner ? `<button class="login-btn" style="background:var(--sem-danger-strong);" onclick="deletePsb(${p.id})"><i class="fas fa-trash"></i> Hapus PSB</button>` : ''}
        </div>`;
      document.getElementById('epsbOdp').addEventListener('change', function () {
        loadAvailablePorts(this.value, 'edit');
      });
      if (p.odp_label) loadAvailablePorts(p.odp_label, 'edit', p.onu_port);

      // Picker item ONU cuma muncul saat memilih Terpasang DAN PSB ini belum
      // Terpasang sebelumnya (transisi sungguhan) — cocok dengan guard
      // isNewlyTerpasang di backend (routes/psb.js).
      const inventoryWrap = document.getElementById('epsbInventoryWrap');
      const toggleInventoryWrap = () => {
        const wantsTerpasang = document.getElementById('epsbStatus').value === 'Terpasang' && p.status !== 'Terpasang';
        inventoryWrap.classList.toggle('hidden', !wantsTerpasang);
      };
      document.getElementById('epsbStatus').addEventListener('change', toggleInventoryWrap);
      toggleInventoryWrap();

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

    const inventoryWrap = document.getElementById('epsbInventoryWrap');
    const needsInventory = inventoryWrap && !inventoryWrap.classList.contains('hidden');
    const inventoryId = needsInventory ? document.getElementById('epsbInventory').value : '';
    if (needsInventory && !inventoryId) {
      toast('Pilih item ONU yang dipakai untuk instalasi ini', 'error');
      return;
    }

    if (phone) formData.append('phone', phone);
    if (onuSn) formData.append('onuSn', onuSn);
    if (lat && lng) { formData.append('latitude', parseFloat(lat)); formData.append('longitude', parseFloat(lng)); }
    if (odpLabel) formData.append('odpLabel', odpLabel);
    if (selectedPort.edit) formData.append('onuPort', selectedPort.edit);
    if (status) formData.append('status', status);
    if (inventoryId) formData.append('inventoryId', inventoryId);
    if (photoFile) formData.append('photo', photoFile);
    if (notes) formData.append('notes', notes);

    try {
      const r = await csrfFetch(`/api/psb/${id}`, { method:'PUT', body: formData });
      if (r.ok) {
        const d = await r.json();
        toast(d.draftFtthId
          ? 'PSB berhasil diupdate — entri ONU draft dibuat, perlu dikonfirmasi di halaman FTTH'
          : 'PSB berhasil diupdate');
        document.getElementById('detailModal').classList.remove('show');
        await loadPsb();
      } else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  };

  window.deletePsb = function(id) {
    showConfirm('Yakin ingin menghapus PSB ini?', async () => {
      try {
        const r = await csrfFetch(`/api/psb/${id}`, { method:'DELETE' });
        if (r.ok) {
          document.getElementById('detailModal').classList.remove('show');
          toast('PSB berhasil dihapus');
          await loadPsb();
        } else { const d = await r.json(); toast(d.message||'Gagal', 'error'); }
      } catch(e) { toast('Error: '+e.message, 'error'); }
    });
  };

  // Image upload preview — PSB photo
  document.getElementById('psbPhoto')?.addEventListener('change', function() {
    const previewId = 'psbPhotoPreview';
    let preview = document.getElementById(previewId);
    if (!preview) {
      preview = document.createElement('img');
      preview.id = previewId;
      preview.style.cssText = 'max-width:200px;max-height:150px;margin-top:8px;border-radius:6px;display:block;';
      this.parentNode.appendChild(preview);
    }
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      reader.readAsDataURL(this.files[0]);
    } else {
      preview.style.display = 'none';
    }
  });

  // Load initial data
  await Promise.all([loadOdp(), loadOnuInventory(), loadPsb()]);
});
