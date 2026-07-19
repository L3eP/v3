/**
 * Shared Toast Utility
 * Menyediakan fungsi toast yang bisa dipakai di semua halaman.
 *
 * Fungsi showModal() sudah didefinisikan inline di masing-masing halaman
 * (activity.js, new-ticket.js, register.js, settings.js, ticket-details.js).
 * File ini menyediakan fungsi tambahan showToast untuk notifikasi ringan.
 */

/**
 * Tampilkan toast notifikasi di pojok kanan atas
 * @param {string} message - Pesan yang ditampilkan
 * @param {'success'|'error'|'info'} type - Tipe toast
 * @param {number} duration - Durasi dalam ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  // Buat container jika belum ada
  let container = document.querySelector('.toast-container-global');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container-global';
    container.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
  };

  const toast = document.createElement('div');
  toast.style.cssText =
    'background:#fff;padding:14px 20px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.12);' +
    'display:flex;align-items:center;gap:10px;font-family:Inter,sans-serif;font-size:0.95rem;' +
    'border-left:4px solid #3b82f6;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);';

  const borderColors = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
  toast.style.borderLeftColor = borderColors[type] || '#3b82f6';

  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}" style="color:${borderColors[type] || '#3b82f6'};font-size:1.2rem;"></i><span style="color:#1f2937;font-weight:500;">${message}</span>`;

  container.appendChild(toast);

  // Animasi masuk
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  // Hapus setelah durasi
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Tampilkan konfirmasi modal (menggantikan confirm() native)
 * @param {string} message - Pesan konfirmasi
 * @param {Function} onConfirm - Callback jika user klik Ya
 * @param {Function} onCancel - Callback jika user klik Batal (opsional)
 */
function showConfirm(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } };

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;padding:32px;border-radius:10px;width:90%;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.2);text-align:center;font-family:Inter,sans-serif;';

  box.innerHTML = `
    <h3 style="margin:0 0 12px 0;color:#ef4444;font-size:1.1rem;"><i class="fas fa-exclamation-triangle"></i> Konfirmasi</h3>
    <p style="margin:0 0 20px 0;color:#374151;font-size:.95rem;">${message}</p>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="confirmNo" style="flex:1;padding:10px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Batal</button>
      <button id="confirmYes" style="flex:1;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Ya, Hapus</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('confirmYes').onclick = () => { overlay.remove(); if (onConfirm) onConfirm(); };
  document.getElementById('confirmNo').onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
}
