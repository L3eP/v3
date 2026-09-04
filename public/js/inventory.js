document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }
  const isPrivileged = user.role === ROLES.OWNER || user.role === ROLES.OPERATOR;
  const isOwner = user.role === ROLES.OWNER;
  let items = [];

  // esc() — global from toast.js
  const toast = (msg) => showToast(msg, 'info');

  // ===== Konfigurasi Field Dinamis per Tipe =====
  const TYPE_FIELDS = {
    ONU: [
      { key: 'ports', label: 'Jumlah Port', type: 'number' },
      { key: 'gpon', label: 'GPON', type: 'checkbox' },
      { key: 'wifi', label: 'WiFi', type: 'checkbox' },
      { key: 'speed', label: 'Kecepatan', type: 'text' }
    ],
    Kabel: [
      { key: 'length_m', label: 'Panjang (meter)', type: 'number' },
      { key: 'type', label: 'Tipe Kabel', type: 'select', options: ['Single Mode', 'Multi Mode', 'UTP Cat5', 'UTP Cat6', 'Fiber'] },
      { key: 'core', label: 'Jumlah Core', type: 'number' }
    ],
    Spliter: [
      { key: 'ports', label: 'Jumlah Port', type: 'number' },
      { key: 'split_ratio', label: 'Split Ratio', type: 'text' },
      { key: 'connector', label: 'Tipe Konektor', type: 'text' }
    ],
    Switch: [
      { key: 'ports', label: 'Jumlah Port', type: 'number' },
      { key: 'gigabit', label: 'Gigabit', type: 'checkbox' },
      { key: 'manageable', label: 'Manageable', type: 'checkbox' }
    ],
    Konektor: [
      { key: 'type', label: 'Tipe Konektor', type: 'text' },
      { key: 'fast_connector', label: 'Fast Connector', type: 'checkbox' }
    ],
    Adaptor: [
      { key: 'type', label: 'Tipe Adaptor', type: 'text' },
      { key: 'voltage', label: 'Voltase', type: 'text' }
    ],
    'Power Supply': [
      { key: 'watts', label: 'Daya (Watt)', type: 'number' }
    ]
  };

  // Render field dinamis berdasarkan tipe
  function renderAttrFields(containerId, type, values = {}) {
    const container = document.getElementById(containerId);
    const fields = TYPE_FIELDS[type] || [];
    if (!fields.length) { container.innerHTML = ''; container.style.display = 'none'; return; }
    container.style.display = 'flex';
    container.innerHTML = fields.map(f => {
      const val = values[f.key] !== undefined ? values[f.key] : '';
      if (f.type === 'checkbox') {
        const checked = val ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer;">
          <input type="checkbox" data-attr="${f.key}" ${checked}> ${f.label}
        </label>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
        ).join('');
        return `<div class="flex-col" style="gap:2px;">
          <label class="text-muted-sm">${f.label}</label>
          <select data-attr="${f.key}" class="field" style="font-size:.85rem;">
            <option value="">Pilih ${f.label}</option>${opts}
          </select>
        </div>`;
      }
      return `<div class="flex-col" style="gap:2px;">
        <label class="text-muted-sm">${f.label}</label>
        <input type="${f.type}" data-attr="${f.key}" value="${esc(String(val))}" placeholder="${f.label}" class="field" style="font-size:.85rem;">
      </div>`;
    }).join('');
  }

  // Collect attributes dari form
  function collectAttrs(containerId) {
    const container = document.getElementById(containerId);
    if (!container || container.style.display === 'none') return null;
    const attrs = {};
    container.querySelectorAll('[data-attr]').forEach(el => {
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'number') val = parseInt(el.value) || 0;
      else val = el.value.trim() || null;
      if (val !== null && val !== '' && val !== false) attrs[el.dataset.attr] = val;
    });
    return Object.keys(attrs).length ? attrs : null;
  }

  // Format attributes untuk display
  function formatAttrs(attrs) {
    if (!attrs) return '';
    const labels = { ports:'🔌', length_m:'📏', type:'🏷️', core:'🔢', gpon:'📡', wifi:'📶',
      speed:'⚡', split_ratio:'🔀', connector:'🔗', gigabit:'🚀', manageable:'⚙️',
      fast_connector:'⚡', voltage:'🔋', watts:'💡' };
    try {
      const data = typeof attrs === 'string' ? JSON.parse(attrs) : attrs;
      return Object.entries(data).map(([k, v]) => {
        const icon = labels[k] || '•';
        if (v === true) return `<span class="text-muted-xs" style="background:#f3f4f6;padding:1px 6px;border-radius:4px;margin:0 2px;">${icon} ✓</span>`;
        return `<span class="text-muted-xs" style="background:#f3f4f6;padding:1px 6px;border-radius:4px;margin:0 2px;">${icon} ${esc(String(v))}</span>`;
      }).join('');
    } catch(e) { return ''; }
  }

  // Button buka modal tambah item
  const invAddBtn = document.getElementById('invAddBtn');
  const invAddModal = document.getElementById('addInvModal');
  if (invAddBtn && invAddModal) {
    invAddBtn.addEventListener('click', () => { invAddModal.classList.add('show'); });
    invAddModal.addEventListener('click', (e) => { if (e.target === invAddModal) invAddModal.classList.remove('show'); });
  }

  async function loadItems() {
    try { const r = await fetch('/api/inventory'); items = await r.json(); renderList(); }
    catch(e) { /* silent */ }
  }

  // Load device types dari referensi (untuk add & edit modal)
  async function loadDeviceTypes() {
    try {
      const r = await fetch('/api/references');
      const data = await r.json();
      const types = data.inventory_type || [];
      ['invDeviceType', 'editInvDeviceType'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Pilih Tipe</option>';
        types.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.label;
          opt.textContent = t.label;
          sel.appendChild(opt);
        });
      });
    } catch(e) { /* silent */ }
  }

  // Load referensi + items
  await Promise.all([loadItems(), loadDeviceTypes()]);

  // Event listener: tipe berubah → field dinamis berubah
  ['invDeviceType', 'editInvDeviceType'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.addEventListener('change', function() {
      const containerId = id === 'invDeviceType' ? 'invAddAttrs' : 'editInvAttrs';
      renderAttrFields(containerId, this.value);
    });
  });

  function renderList() {
    const container = document.getElementById('invListContainer');
    const count = document.getElementById('invCount');
    count.textContent = `(${items.length})`;
    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-box-open" style="font-size:2rem;opacity:.5;"></i><p>Belum ada item</p></div>';
      return;
    }
    container.innerHTML = items.map(i => {
      const remaining = (i.total_stock || 0) - (i.used_stock || 0);
      const stockClass = remaining <= 2 ? 'inv-low' : 'inv-ok';
      const attrHtml = i.attributes ? formatAttrs(i.attributes) : '';
      return `<div class="inv-item">
        <div class="inv-info">
          <div class="inv-name">${esc(i.device_name)} <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">${esc(i.device_type)}</span></div>
          <div class="inv-meta">${i.location ? '📍 '+esc(i.location) : ''} ${attrHtml}</div>
        </div>
        <div style="text-align:right;">
          <div class="inv-stock ${stockClass}">${remaining}</div>
          <div class="inv-meta">dari ${i.total_stock} (${i.used_stock} terpakai)</div>
        </div>
        ${isPrivileged ? `<div class="ref-actions" style="margin-left:8px;">
          <button class="btn-edit-ref" aria-label="Edit item" onclick="editItem(${i.id})"><i class="fas fa-edit"></i></button>
          ${isOwner ? `<button class="btn-del-ref" aria-label="Hapus item" onclick="deleteItem(${i.id})"><i class="fas fa-trash"></i></button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('');
  }

document.getElementById('invSubmitBtn').addEventListener('click', async () => {
    const deviceType = document.getElementById('invDeviceType').value;
    const deviceName = document.getElementById('invDeviceName').value.trim();
    const totalStock = parseInt(document.getElementById('invTotalStock').value) || 0;
    const location = document.getElementById('invLocation').value.trim();
    const notes = document.getElementById('invNotes').value.trim();
    if (!deviceName) { toast('Nama perangkat wajib diisi'); return; }

    const attributes = collectAttrs('invAddAttrs');

    const btn = document.getElementById('invSubmitBtn');
    setLoading(btn, true, 'Menyimpan...');
    try {
      const body = { deviceType, deviceName, totalStock, location, notes };
      if (attributes) body.attributes = attributes;
      const r = await csrfFetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) {
        toast('Item ditambahkan');
        invAddModal.classList.remove('show');
        document.getElementById('invDeviceName').value = '';
        document.getElementById('invTotalStock').value = '';
        document.getElementById('invLocation').value = '';
        document.getElementById('invNotes').value = '';
        document.getElementById('invDeviceType').value = '';
        renderAttrFields('invAddAttrs', '');
        await loadItems();
      } else { const d = await r.json(); toast(d.message || 'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
    finally { setLoading(btn, false); }
  });

// ===== Edit Item Modal =====
  const editModal = document.getElementById('editInvModal');
  const editForm = document.getElementById('editInvForm');
  editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('show'); });

  window.editItem = async function(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('editInvId').value = item.id;
    document.getElementById('editInvDeviceType').value = item.device_type || '';
    document.getElementById('editInvDeviceName').value = item.device_name || '';
    document.getElementById('editInvTotalStock').value = item.total_stock || 0;
    document.getElementById('editInvUsedStock').value = item.used_stock || 0;
    document.getElementById('editInvLocation').value = item.location || '';
    document.getElementById('editInvNotes').value = item.notes || '';

    // Load attributes untuk edit
    const attrs = item.attributes ? (typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes) : {};
    renderAttrFields('editInvAttrs', item.device_type || '', attrs);

    editModal.classList.add('show');
  };

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editInvId').value;
    const deviceType = document.getElementById('editInvDeviceType').value;
    const deviceName = document.getElementById('editInvDeviceName').value.trim();
    const totalStock = parseInt(document.getElementById('editInvTotalStock').value) || 0;
    const usedStock = parseInt(document.getElementById('editInvUsedStock').value) || 0;
    const location = document.getElementById('editInvLocation').value.trim();
    const notes = document.getElementById('editInvNotes').value.trim();
    if (!deviceName) { toast('Nama perangkat wajib diisi'); return; }
    if (usedStock > totalStock) { toast('Stok terpakai tidak boleh melebihi total stok', 'error'); return; }

    const attributes = collectAttrs('editInvAttrs');

    const btn = editForm.querySelector('.login-btn');
    setLoading(btn, true, 'Menyimpan...');
    try {
      const body = { deviceType, deviceName, totalStock, usedStock, location, notes };
      if (attributes !== null) body.attributes = attributes;
      const res = await csrfFetch(`/api/inventory/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (res.ok) { toast('Item diupdate'); editModal.classList.remove('show'); await loadItems(); }
      else { const d = await res.json(); toast(d.message || 'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
    finally { setLoading(btn, false); }
  });

  window.deleteItem = function(id) {
    showConfirm('Yakin ingin menghapus item ini?', async () => {
      try {
        const r = await csrfFetch(`/api/inventory/${id}`, { method:'DELETE' });
        if (r.ok) { toast('Item dihapus'); await loadItems(); }
        else { const d = await r.json(); toast(d.message || 'Gagal'); }
      } catch(e) { toast('Error: '+e.message); }
    });
  };

  // ===== Export CSV =====
  window.exportCsv = function() {
    if (!items.length) { toast('Tidak ada data untuk diexport'); return; }
    const header = 'Tipe,Nama,Total Stok,Stok Terpakai,Sisa,Lokasi,Catatan';
    const rows = items.map(i => {
      const remaining = (i.total_stock || 0) - (i.used_stock || 0);
      return [i.device_type, i.device_name, i.total_stock, i.used_stock, remaining, i.location||'', (i.notes||'').replace(/,/g,';')].join(',');
    });
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'inventory_export_' + new Date().toISOString().split('T')[0] + '.csv';
    link.click();
    toast('CSV diunduh');
  };

  // ===== Export PDF — library dimuat lazy saat export diklik (lihat pdf-loader.js) =====
  window.exportPdf = async function() {
    if (!items.length) { toast('Tidak ada data untuk diexport'); return; }
    try {
      await window.loadPdfLibs();
    } catch (e) {
      toast(e.message || 'Gagal memuat library PDF');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Summary
    const totalItems = items.length;
    const totalStock = items.reduce((s, i) => s + (i.total_stock || 0), 0);
    const totalUsed = items.reduce((s, i) => s + (i.used_stock || 0), 0);
    const lowStock = items.filter(i => (i.total_stock - i.used_stock) <= 2).length;

    doc.setFontSize(16);
    doc.text('Laporan Inventory', 14, 15);
    doc.setFontSize(10);
    doc.text(`Total: ${totalItems} item — ${new Date().toLocaleDateString()}`, 14, 23);
    doc.setFontSize(9);
    doc.text(`Total stok: ${totalStock} unit`, 14, 31);
    doc.text(`Terpakai: ${totalUsed} unit`, 14, 37);
    doc.text(`Sisa: ${totalStock - totalUsed} unit`, 14, 43);
    doc.text(`Item stok minim (<3): ${lowStock} item`, 14, 49);

    // Table
    const tableData = items.map(i => {
      const remaining = (i.total_stock || 0) - (i.used_stock || 0);
      return [i.device_type, i.device_name, i.total_stock, i.used_stock, remaining, i.location || ''];
    });

    doc.autoTable({
      head: [['Tipe', 'Nama', 'Total', 'Terpakai', 'Sisa', 'Lokasi']],
      body: tableData,
      startY: 56,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [8, 145, 178] },
    });

    doc.save(`inventory_export_${new Date().toISOString().split('T')[0]}.pdf`);
    toast('PDF diunduh');
  };
});
