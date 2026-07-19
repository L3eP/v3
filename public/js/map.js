// Global: marker perangkat berdasarkan nama (untuk navigasi dari popup)
const markerByName = {};
const deviceCoords = {};

/**
 * Terbang ke marker yang sudah ada dan buka popup-nya
 * Dipanggil dari onclick di popup HTML
 */
function flyToDevice(lat, lng, name) {
  const map = window._map;
  if (!map) return;
  map.flyTo([lat, lng], 16, { duration: 1 });

  // Cari marker yang sudah ada, buka popup-nya
  const existing = markerByName[name];
  if (existing) {
    setTimeout(() => existing.openPopup(), 500); // Tunggu animasi flyTo selesai
  }
}

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
  window._map = map; // Simpan referensi global untuk flyToDevice

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    bounds: ntbBounds
  }).addTo(map);

  // Cek URL params: ?lat=X&lng=Y&name=N — untuk navigasi dari halaman FTTH
  const urlParams = new URLSearchParams(window.location.search);
  const focusLat = parseFloat(urlParams.get('lat'));
  const focusLng = parseFloat(urlParams.get('lng'));
  const focusName = urlParams.get('name');
  let hasFocus = false;

  if (focusLat && focusLng) {
    map.setView([focusLat, focusLng], 16);
    hasFocus = true;
  }

  try {
    const res = await fetch('/api/geo');
    const data = await res.json();

    // Update stats
    document.getElementById('statOlt').textContent = data.stats.olt;
    document.getElementById('statOdc').textContent = data.stats.odc;
    document.getElementById('statOdp').textContent = data.stats.odp;
    document.getElementById('statOnu').textContent = data.stats.onu;

    // Isi global lookup + siapkan link navigasi
    (data.olt || []).forEach(o => { if (o.lat && o.lng) deviceCoords[o.name] = { lat: o.lat, lng: o.lng }; });
    data.odc.forEach(o => { if (o.lat && o.lng) deviceCoords[o.name] = { lat: o.lat, lng: o.lng }; });
    data.odp.forEach(o => { if (o.lat && o.lng) deviceCoords[o.name] = { lat: o.lat, lng: o.lng }; });
    data.onu.forEach(o => { if (o.lat && o.lng) deviceCoords[o.name] = { lat: o.lat, lng: o.lng }; });

    // Helper: link menuju perangkat lain di peta
    const devLink = (name) => {
      const c = deviceCoords[name];
      if (!c) return '';
      return ` <a href="#" onclick="flyToDevice(${c.lat},${c.lng},'${name.replace(/'/g,"\\'")}');return false;" style="color:#2563eb;text-decoration:underline;cursor:pointer;" title="Klik untuk lihat di peta">📍</a>`;
    };

    // Helper: Google Maps link
    const gmLink = (lat, lng) => `<br><a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener" style="font-size:0.8rem;color:#2563eb;text-decoration:none;">📍 Buka di Google Maps</a>`;

    // Build lookup maps untuk chain koneksi
    const oltByName = {}; (data.olt||[]).forEach(o => oltByName[o.name] = o);
    const odcByName = {}; data.odc.forEach(o => odcByName[o.name] = o);
    const odpByName = {}; data.odp.forEach(o => odpByName[o.name] = o);

    // Bangun chain koneksi dari parent ke child (dengan link navigasi)
    function buildChain(item, type) {
      let chain = '';
      let parent = null, parentName = '', parentType = '', parentPort = item.parentPort;
      if (type === 'odc') { parent = oltByName[item.area]; parentName = item.area; parentType = 'OLT'; }
      else if (type === 'odp') { parent = odcByName[item.parentOdc]; parentName = item.parentOdc; parentType = 'ODC'; }
      else if (type === 'onu') { parent = odpByName[item.parentOdp]; parentName = item.parentOdp; parentType = 'ODP'; }

      // Tampilkan induk — selalu muncul walaupun tanpa koordinat
      if (parentName) {
        const portInfo = parentPort ? ' · ' + parentPort : '';
        const devIcon = parent && parent.lat && parent.lng ? devLink(parentName) : '';
        chain += `<br><span style="font-size:0.82rem;color:#4f46e5;">⬆ ${parentType}: ${parentName}${portInfo}${devIcon}</span>`;
      }
      // Kakek: OLT dari ODC, atau ODC dari ODP
      if (parent && parentType === 'ODC') {
        const gpName = parent.area;
        const gpPort = parent.parentPort;
        if (gpName) {
          const gp = oltByName[gpName];
          const gpIcon = gp && gp.lat && gp.lng ? devLink(gpName) : '';
          chain += `<br><span style="font-size:0.78rem;color:#7c3aed;">⬆ OLT: ${gpName}${gpPort ? ' · ' + gpPort : ''}${gpIcon}</span>`;
        }
      } else if (parent && parentType === 'ODP') {
        const gpName = parent.parentOdc;
        const gpPort = parent.parentPort;
        if (gpName) {
          const gp = odcByName[gpName];
          const gpIcon = gp && gp.lat && gp.lng ? devLink(gpName) : '';
          chain += `<br><span style="font-size:0.78rem;color:#4f46e5;">⬆ ODC: ${gpName}${gpPort ? ' · ' + gpPort : ''}${gpIcon}</span>`;
          // Buyut: OLT dari ODC
          if (gp) {
            const ggpName = gp.area;
            if (ggpName) {
              const ggp = oltByName[ggpName];
              const ggpIcon = ggp && ggp.lat && ggp.lng ? devLink(ggpName) : '';
              chain += `<br><span style="font-size:0.76rem;color:#7c3aed;">⬆ OLT: ${ggpName}${gp.parentPort ? ' · ' + gp.parentPort : ''}${ggpIcon}</span>`;
            }
          }
        }
      }
      return chain;
    }

    // Simple circle markers — OLT (ungu, besar)
    const oltGroup = L.layerGroup().addTo(map);
    (data.olt || []).forEach(o => {
      if (!o.lat || !o.lng) return;
      const m = L.circleMarker([o.lat, o.lng], {
        radius: 10, fillColor: '#7c3aed', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>🖥 OLT</b><br>${o.name}${gmLink(o.lat, o.lng)}`).addTo(oltGroup);
      markerByName[o.name] = m;
    });

    // ODC (biru, sedang)
    const odcGroup = L.layerGroup().addTo(map);
    data.odc.forEach(o => {
      if (!o.lat || !o.lng) return;
      const mOdc = L.circleMarker([o.lat, o.lng], {
        radius: 8, fillColor: '#2563eb', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>📡 ODC</b><br>${o.name}${buildChain(o, 'odc')}${gmLink(o.lat, o.lng)}`).addTo(odcGroup);
      markerByName[o.name] = mOdc;
    });

    // ODP (hijau, kecil)
    const odpGroup = L.layerGroup();
    data.odp.forEach(o => {
      if (!o.lat || !o.lng) return;
      const mOdp = L.circleMarker([o.lat, o.lng], {
        radius: 6, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>🔌 ODP</b><br>${o.name}${buildChain(o, 'odp')}${gmLink(o.lat, o.lng)}`).addTo(odpGroup);
      markerByName[o.name] = mOdp;
    });
    if (data.odp.length) odpGroup.addTo(map);

    // ONU (oranye, paling kecil)
    const onuGroup = L.layerGroup();
    data.onu.forEach(o => {
      if (!o.lat || !o.lng) return;
      const mOnu = L.circleMarker([o.lat, o.lng], {
        radius: 5, fillColor: '#f59e0b', color: '#fff', weight: 2, fillOpacity: 0.9
      }).bindPopup(`<b>📶 ONU</b><br>${o.name}${buildChain(o, 'onu')}${gmLink(o.lat, o.lng)}`).addTo(onuGroup);
      markerByName[o.name] = mOnu;
    });
    if (data.onu.length) onuGroup.addTo(map);

    // Jika ada focus dari URL params, cari marker yang sudah ada
    if (hasFocus && focusName) {
      const focusMarker = markerByName[focusName];
      if (focusMarker) {
        setTimeout(() => focusMarker.openPopup(), 300);
      } else {
        L.circleMarker([focusLat, focusLng], {
          radius: 14, fillColor: '#f59e0b', color: '#000', weight: 3, fillOpacity: 0.9
        }).addTo(map).bindPopup(`<b>📍 ${focusName}</b>`).openPopup();
      }
    }

    // Fit bounds, jangan keluar dari NTB
    const all = [...(data.olt||[]), ...data.odc, ...data.odp, ...data.onu].filter(p => p.lat && p.lng);
    if (all.length > 0 && !hasFocus) {
      const bounds = L.latLngBounds(all.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds.intersects(ntbBounds) ? bounds : ntbBounds, { padding: [30,30] });
    }
  } catch (e) {
    console.error('Map error:', e);
  }
});
