document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }

  const map = L.map('map').setView([-8.65, 116.52], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  try {
    const res = await fetch('/api/geo');
    const data = await res.json();

    // Update stats
    document.getElementById('statOdc').textContent = data.stats.odc;
    document.getElementById('statOdp').textContent = data.stats.odp;
    document.getElementById('statOlt').textContent = data.stats.olt;

    const odcIcon = L.divIcon({ html: '<i class="fas fa-broadcast-tower" style="color:#2563eb;font-size:1.3rem;"></i>', iconSize: [24,24], className: '' });
    const odpIcon = L.divIcon({ html: '<i class="fas fa-plug" style="color:#10b981;font-size:1rem;"></i>', iconSize: [20,20], className: '' });

    const odcGroup = L.layerGroup().addTo(map);
    data.odc.forEach(o => {
      if (!o.lat || !o.lng) return;
      const m = L.marker([o.lat, o.lng], { icon: odcIcon })
        .bindPopup(`<b>📍 ODC</b><br>${o.name}<br><small>${o.area || ''}</small>`);
      odcGroup.addLayer(m);
    });

    const odpGroup = L.layerGroup();
    data.odp.forEach(o => {
      if (!o.lat || !o.lng) return;
      const m = L.marker([o.lat, o.lng], { icon: odpIcon })
        .bindPopup(`<b>🔌 ODP</b><br>${o.name}<br><small>${o.parentOdc || ''}</small>`);
      odpGroup.addLayer(m);
    });

    if (data.odp.length) odpGroup.addTo(map);

    const oltIcon = L.divIcon({ html: '<i class="fas fa-server" style="color:#7c3aed;font-size:1.5rem;"></i>', iconSize: [28,28], className: '' });
    const oltGroup = L.layerGroup();
    (data.olt || []).forEach(o => {
      if (!o.lat || !o.lng) return;
      const m = L.marker([o.lat, o.lng], { icon: oltIcon })
        .bindPopup(`<b>🖥 OLT</b><br>${o.name}`);
      oltGroup.addLayer(m);
    });
    if (data.olt && data.olt.length) oltGroup.addTo(map);

    // Fit bounds
    const all = [...(data.olt||[]), ...data.odc, ...data.odp].filter(p => p.lat && p.lng);
    if (all.length > 0) {
      map.fitBounds(all.map(p => [p.lat, p.lng]), { padding: [30,30] });
    }
  } catch (e) {
    console.error('Map error:', e);
  }
});
