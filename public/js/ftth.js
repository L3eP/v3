document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }

  const tabContainer = document.getElementById('ftthTabs');
  const panelContainer = document.getElementById('ftthPanels');
  let allData = {};
  let activeTab = 'olt';

  const TYPES = ['olt', 'odc', 'odp', 'onu'];
  const TYPE_CONFIG = {
    olt: { icon: 'fa-server', title: 'OLT', hasGroup: false, hasCoord: true },
    odc: { icon: 'fa-network-wired', title: 'ODC', hasGroup: true, groupLabel: 'Pilih OLT', hasCoord: true },
    odp: { icon: 'fa-plug', title: 'ODP', hasGroup: true, groupLabel: 'Pilih ODC', hasCoord: true },
    onu: { icon: 'fa-wifi', title: 'ONU', hasGroup: true, groupLabel: 'Pilih ODP', hasCoord: true }
  };

  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const toast = m => { const t = document.getElementById('ftthToast'); t.textContent=m; t.className='ftth-show'; setTimeout(()=>t.className='',2500); };

  function switchTab(type) {
    activeTab = type;
    document.querySelectorAll('.ftth-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    document.querySelectorAll('.ftth-panel').forEach(p => p.classList.toggle('active', p.dataset.type === type));
    renderPanel(type);
  }
  window.switchTab = switchTab;

  function renderTabs() {
    tabContainer.innerHTML = TYPES.map(t =>
      `<button class="ftth-tab ${t===activeTab?'active':''}" data-type="${t}" onclick="switchTab('${t}')">
        <i class="fas ${TYPE_CONFIG[t].icon}"></i> ${TYPE_CONFIG[t].title}
      </button>`
    ).join('');
    panelContainer.innerHTML = '';
    TYPES.forEach(type => {
      const cfg = TYPE_CONFIG[type];
      const panel = document.createElement('div');
      panel.className = `ftth-panel ${type===activeTab?'active':''}`;
      panel.dataset.type = type;
      panel.innerHTML = `<div class="ftth-card"><h3><i class="fas ${cfg.icon}" style="color:#4f46e5;"></i> ${cfg.title} <span class="ftth-count" id="count-${type}">0</span></h3>
        <div id="list-${type}"></div>
        <button class="ftth-add" onclick="showForm('${type}')"><i class="fas fa-plus"></i> Tambah ${cfg.title}</button>
        <div id="form-${type}" style="display:none;"></div></div>`;
      panelContainer.appendChild(panel);
    });
  }

  function renderPanel(type) {
    const items = allData[type] || [];
    document.getElementById(`count-${type}`).textContent = `(${items.length})`;
    const container = document.getElementById(`list-${type}`);
    if (!items.length) { container.innerHTML = '<div class="ftth-empty">Belum ada data</div>'; return; }
    container.innerHTML = items.map(i =>
      `<div class="ftth-item">
        <div class="ftth-label">${i.lat&&i.lng?'📍 ':''}<span>${esc(i.label)}</span>${i.group?` <span class="ftth-group">${esc(i.group)}</span>`:''}${i.parentPort?` <span style="font-size:.75rem;color:#6366f1;">🔗 ${esc(i.parentPort)}</span>`:''}</div>
        <div class="ftth-actions">
          ${i.lat&&i.lng?`<a href="map.html?lat=${i.lat}&lng=${i.lng}&name=${encodeURIComponent(i.label)}" class="ftth-edit" style="text-decoration:none;" title="Lihat di peta">🗺</a>`:''}
          <button class="ftth-edit" onclick="editItem('${type}',${i.id},'${esc(i.label)}','${esc(i.group||'')}','${i.lat||''}','${i.lng||''}','${esc(i.parentPort||'')}')"><i class="fas fa-edit"></i></button>
          <button class="ftth-del" onclick="confirmDel(${i.id},'${esc(i.label)}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`
    ).join('');
  }

  window.showForm = function(type) {
    const cfg = TYPE_CONFIG[type];
    const formEl = document.getElementById(`form-${type}`);
    formEl.style.display = 'block';
    let groupHtml = '';
    if (cfg.hasGroup) {
      const parentType = { odc:'olt', odp:'odc', onu:'odp' }[type];
      const parents = allData[parentType] || [];
      groupHtml = `<select id="inp-${type}-g" class="ftth-input" style="min-width:150px;"><option value="">${cfg.groupLabel}</option>${parents.map(p => `<option value="${esc(p.label)}">${esc(p.label)}</option>`).join('')}</select>`;
    }
    const portPlaceholder = { odc:'Port di OLT', odp:'Port di ODC', onu:'Port di ODP' }[type] || '';
    formEl.innerHTML = `<div class="ftth-inline">
      <input type="text" id="inp-${type}-lbl" class="ftth-input" placeholder="Label ${cfg.title}" autofocus>
      ${groupHtml}
      ${cfg.hasGroup ? `<input type="text" id="inp-${type}-p" class="ftth-input" placeholder="${portPlaceholder}" style="min-width:100px;">` : ''}
      <input type="text" id="inp-${type}-lat" class="ftth-input" placeholder="Latitude" style="min-width:90px;">
      <input type="text" id="inp-${type}-lng" class="ftth-input" placeholder="Longitude" style="min-width:90px;">
      <button class="ftth-save" onclick="saveItem('${type}')"><i class="fas fa-check"></i> Simpan</button>
      <button class="ftth-cancel" onclick="document.getElementById('form-${type}').style.display='none';document.querySelector('.ftth-add.on-${type}')?document.querySelector('.ftth-add.on-${type}').style.display='block':''"><i class="fas fa-times"></i></button>
    </div>`;
    const addBtn = document.querySelector(`.ftth-add`);
    if (addBtn) addBtn.style.display = 'none';
  };

  window.saveItem = async function(type) {
    const label = document.getElementById(`inp-${type}-lbl`).value.trim();
    if (!label) return;
    const cfg = TYPE_CONFIG[type];
    const group = cfg.hasGroup ? (document.getElementById(`inp-${type}-g`)?.value||'') : '';
    const parentPort = cfg.hasGroup ? (document.getElementById(`inp-${type}-p`)?.value.trim()||'') : '';
    const lat = (document.getElementById(`inp-${type}-lat`)?.value.trim()||'');
    const lng = (document.getElementById(`inp-${type}-lng`)?.value.trim()||'');
    if (cfg.hasGroup && !group) { toast('Pilih induk terlebih dahulu'); return; }
    try {
      const body = { type, label };
      if (group) body.group_name = group;
      if (parentPort) body.parent_port = parentPort;
      if (lat && lng) { body.latitude = parseFloat(lat); body.longitude = parseFloat(lng); }
      const r = await csrfFetch('/api/references', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { toast('Berhasil ditambahkan'); await loadData(); switchTab(type); }
      else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };

  // Modal-based edit/delete
  let editData = null, deleteData = null;

  window.editItem = function(type, id, label, group, lat, lng, parentPort) {
    editData = { type, id, label, group, lat, lng, parentPort: parentPort || '' };
    const t = TYPE_CONFIG[type].title;
    const hasCoord = true;
    const hasGroup = TYPE_CONFIG[type].hasGroup;
    const hasPort = hasGroup; // odc, odp, onu punya parent port
    document.getElementById('editModalTitle').textContent = `Edit ${t}`;
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
    if (!editData) return;
    const body = { label: document.getElementById('editLabel').value.trim() };
    const hasGroup = TYPE_CONFIG[editData.type].hasGroup;
    const hasPort = hasGroup;
    if (hasGroup) body.group_name = document.getElementById('editGroup').value.trim() || undefined;
    if (hasPort) body.parent_port = document.getElementById('editPort').value.trim() || null;
    const el = document.getElementById('editLat').value.trim(), en = document.getElementById('editLng').value.trim();
    if (el && en) { body.latitude = parseFloat(el); body.longitude = parseFloat(en); }
    try {
      const r = await csrfFetch(`/api/references/${editData.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok) { document.getElementById('editModal').classList.remove('show'); toast('Berhasil diupdate'); editData=null; await loadData(); switchTab(activeTab); }
      else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };
  document.getElementById('cancelEditBtn').onclick = () => { document.getElementById('editModal').classList.remove('show'); editData=null; };

  window.confirmDel = function(id, label) {
    deleteData = { id, label };
    document.getElementById('confirmModal').classList.add('show');
    document.getElementById('confirmMessage').textContent = `Hapus "${label}"?`;
  };

  document.getElementById('confirmDelBtn').onclick = async () => {
    if (!deleteData) return;
    try {
      const r = await csrfFetch(`/api/references/${deleteData.id}`, { method:'DELETE' });
      if (r.ok) { document.getElementById('confirmModal').classList.remove('show'); toast(`"${deleteData.label}" dihapus`); deleteData=null; await loadData(); switchTab(activeTab); }
      else { const d = await r.json(); toast(d.message||'Gagal'); }
    } catch(e) { toast('Error: '+e.message); }
  };
  document.getElementById('cancelDelBtn').onclick = () => { document.getElementById('confirmModal').classList.remove('show'); deleteData=null; };

  async function loadData() {
    try { const r = await fetch('/api/references'); allData = await r.json(); renderTabs(); TYPES.forEach(t => renderPanel(t)); }
    catch(e) { panelContainer.innerHTML = '<div style="color:#ef4444;padding:20px;">Gagal load data</div>'; }
  }

  await loadData();
});
