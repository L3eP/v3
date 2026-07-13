document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) { window.location.href = 'index.html'; return; }

  // Batas peta: Provinsi NTB (Lombok + Sumbawa)
  const ntbBounds = L.latLngBounds(
    L.latLng(-9.2, 115.5),  // Barat Daya
    L.latLng(-7.8, 119.5)   // Timur Laut
  );

  const map = L.map('map', {
    maxBounds: ntbBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 9,
    maxZoom: 18
  }).setView([-8.6, 117.0], 10);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    bounds: ntbBounds
  }).addTo(map);

  try {
    const res = await fetch('/api/geo');
    const data = await res.json();

    // Update stats
    document.getElementById('statOlt').textContent = data.stats.olt;
    document.getElementById('statOdc').textContent = data.stats.odc;
    document.getElementById('statOdp').textContent = data.stats.odp;

    // Simple circle markers — OLT (ungu, besar)
    const oltGroup = L.layerGroup().addTo(map);
    (data.olt || []).forEach(o => {
      if (!o.lat || !o.lng) return;
      L.circleMarker([o.lat, o.lng], {
        radius: 10, fillColor: '#7c3aed', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>🖥 OLT</b><br>${o.name}`).addTo(oltGroup);
    });

    // ODC (biru, sedang)
    const odcGroup = L.layerGroup().addTo(map);
    data.odc.forEach(o => {
      if (!o.lat || !o.lng) return;
      L.circleMarker([o.lat, o.lng], {
        radius: 8, fillColor: '#2563eb', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>📡 ODC</b><br>${o.name}<br><small>${o.area || ''}</small>`).addTo(odcGroup);
    });

    // ODP (hijau, kecil)
    const odpGroup = L.layerGroup();
    data.odp.forEach(o => {
      if (!o.lat || !o.lng) return;
      L.circleMarker([o.lat, o.lng], {
        radius: 6, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>🔌 ODP</b><br>${o.name}<br><small>${o.parentOdc || ''}</small>`).addTo(odpGroup);
    });
    if (data.odp.length) odpGroup.addTo(map);

    // Fit bounds, jangan keluar dari NTB
    const all = [...(data.olt||[]), ...data.odc, ...data.odp].filter(p => p.lat && p.lng);
    if (all.length > 0) {
      const bounds = L.latLngBounds(all.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds.intersects(ntbBounds) ? bounds : ntbBounds, { padding: [30,30] });
    }
  } catch (e) {
    console.error('Map error:', e);
  }
});
