document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }
  const isPrivileged = user.role === 'Owner' || user.role === 'Operator';
  let items = [];

  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const toast = (msg) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;';
    el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2500);
  };

  async function loadItems() {
    try { const r = await fetch('/api/inventory'); items = await r.json(); renderList(); }
    catch(e) { /* silent */ }
  }

  function renderList() {
    const container = document.getElementById('invListContainer');
    const count = document.getElementById('invCount');
    count.textContent = `(${items.length})`;
    if (!items.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-box-open" style="font-size:2rem;opacity:.5;"></i><p>Belum ada item</p></div>';
      return;
    }
    container.innerHTML = items.map(i => {
      const remaining = (i.total_stock || 0) - (i.used_stock || 0);
      const stockClass = remaining <= 2 ? 'inv-low' : 'inv-ok';
      return `<div class="inv-item">
        <div class="inv-info">
          <div class="inv-name">${esc(i.device_name)} <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">${esc(i.device_type)}</span></div>
          <div class="inv-meta">${i.location ? '📍 '+esc(i.location) : ''} ${i.notes ? '— '+esc(i.notes) : ''}</div>
        </div>
        <div style="text-align:right;">
          <div class="inv-stock ${stockClass}">${remaining}</div>
          <div class="inv-meta">dari ${i.total_stock} (${i.used_stock} terpakai)</div>
        </div>
        ${isPrivileged ? `<div class="ref-actions" style="margin-left:8px;">
          <button class="btn-edit-ref" onclick="editItem(${i.id})"><i class="fas fa-edit"></i></button>
          <button class="btn-del-ref" onclick="deleteItem(${i.id})"><i class="fas fa-trash"></i></button>
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

    const btn = document.getElementById('invSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    try {
      const r = await csrfFetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ deviceType, deviceName, totalStock, location, notes }) });
      if (r.ok) {
        toast('Item ditambahkan');
        document.getElementById('invDeviceName').value = '';
        document.getElementById('invTotalStock').value = '';
        document.getElementById('invLocation').value = '';
        document.getElementById('invNotes').value = '';
        await loadItems();
      } else { const d = await r.json(); toast(d.message || 'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Tambah ke Inventory'; }
  });

  window.editItem = async function(id) {
    const r = await fetch(`/api/inventory?id=${id}`);
    // Modal edit sederhana via prompt
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newTotal = prompt('Total stok:', item.total_stock);
    if (newTotal === null) return;
    const newUsed = prompt('Stok terpakai:', item.used_stock);
    if (newUsed === null) return;
    try {
      const res = await csrfFetch(`/api/inventory/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ totalStock: parseInt(newTotal), usedStock: parseInt(newUsed) }) });
      if (res.ok) { toast('Stok diupdate'); await loadItems(); }
      else { const d = await res.json(); toast(d.message || 'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };

  window.deleteItem = function(id) {
    document.getElementById('confirmMessage').textContent = 'Yakin ingin menghapus item ini?';
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmDelBtn').onclick = async () => {
      try {
        const r = await csrfFetch(`/api/inventory/${id}`, { method:'DELETE' });
        if (r.ok) { document.getElementById('confirmModal').classList.remove('show'); toast('Item dihapus'); await loadItems(); }
        else { const d = await r.json(); toast(d.message || 'Gagal'); }
      } catch(e) { toast('Error: '+e.message); }
    };
  };
  document.getElementById('cancelDelBtn').onclick = () => document.getElementById('confirmModal').classList.remove('show');

  // Tambah link inventory di navbar (Panel section)
  // Ini akan ditambahkan via navbar.js edit

  await loadItems();
});
