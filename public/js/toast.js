/**
 * Shared Toast Utility & HTML Escaping
 * Menyediakan fungsi esc(), showModal(), showToast(), showConfirm()
 * untuk digunakan di semua halaman.
 *
 * — esc(s)       : sanitasi string untuk innerHTML (XSS protection)
 * — showModal    : modal notifikasi (success/error/info)
 * — showToast    : toast notifikasi pojok kanan atas
 * — showConfirm  : konfirmasi modal (menggantikan confirm() native)
 */

/**
 * Escape HTML entities untuk mencegah XSS saat memasukkan data ke innerHTML.
 * Panggil setiap kali user/API data dimasukkan ke template literal innerHTML.
 * @param {string|number} s - Nilai yang akan di-escape
 * @returns {string}
 */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Debounce utility — batasi eksekusi fungsi sampai delay tertentu sejak panggilan terakhir.
 * @param {Function} fn - Fungsi yang akan di-debounce
 * @param {number} delay - Delay dalam ms (default 300)
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Set loading state pada tombol submit.
 * Menyimpan innerHTML asli dan me-restore saat loading selesai.
 * @param {HTMLElement} btn - Tombol yang akan di-loading
 * @param {boolean} isLoading - true = loading, false = selesai
 * @param {string} [label] - Label saat loading (opsional, default spinner saja)
 */
function setLoading(btn, isLoading, label) {
  if (isLoading) {
    btn.dataset.origHtml = btn.innerHTML;
    btn.dataset.origDisabled = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (label || '');
  } else {
    btn.disabled = btn.dataset.origDisabled === 'true';
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
    }
    delete btn.dataset.origHtml;
    delete btn.dataset.origDisabled;
  }
}

/**
 * Cari atau buat elemen modal DOM.
 * Modal cuma dibuat sekali, reuse untuk semua panggilan.
 * @returns {{ modal, titleEl, msgEl, okBtn }}
 */
function getModalElements() {
  let modal = document.getElementById('globalModal');
  if (modal) return {
    modal,
    titleEl: document.getElementById('globalModalTitle'),
    msgEl: document.getElementById('globalModalMessage'),
    okBtn: document.getElementById('globalModalOk'),
  };

  modal = document.createElement('div');
  modal.id = 'globalModal';
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Notifikasi');
  modal.innerHTML = `
    <div class="modal-content">
      <h3 id="globalModalTitle" style="margin:0 0 12px 0;transition:color .2s;">Title</h3>
      <p id="globalModalMessage" style="margin:0 0 20px 0;color:#4B5563;font-size:.95rem;"></p>
      <button id="globalModalOk" class="modal-ok-btn" style="margin-top:8px;">OK</button>
    </div>`;
  document.body.appendChild(modal);

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });

  return {
    modal,
    titleEl: document.getElementById('globalModalTitle'),
    msgEl: document.getElementById('globalModalMessage'),
    okBtn: document.getElementById('globalModalOk'),
  };
}

/**
 * Tampilkan modal notifikasi terpusat.
 * Menggantikan showModal() inline di masing-masing halaman.
 * @param {string} title - Judul modal
 * @param {string} message - Pesan yang ditampilkan (otomatis di-escape)
 * @param {'success'|'error'|'info'} type - Tipe (default: 'info')
 * @param {Function} [onOk] - Callback saat OK diklik (opsional)
 */
function showModal(title, message, type = 'info', onOk) {
  const { modal, titleEl, msgEl, okBtn } = getModalElements();

  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };
  const color = colors[type] || colors.info;

  titleEl.textContent = title;
  titleEl.style.color = color;
  msgEl.textContent = esc(message);
  okBtn.style.backgroundColor = color;

  // Hapus listener lama, pasang yang baru
  const newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  newOk.addEventListener('click', () => {
    modal.classList.remove('show');
    if (onOk) onOk();
  });

  // Focus trap: simpan elemen yang fokus sebelumnya
  const prevFocus = document.activeElement;
  newOk.focus();

  modal.classList.add('show');

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      modal.classList.remove('show');
      document.removeEventListener('keydown', handleKey);
      if (prevFocus) prevFocus.focus();
      if (onOk) onOk();
    }
    // Trap Tab di dalam modal
    if (e.key === 'Tab') {
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  document.addEventListener('keydown', handleKey);
  // Bersihkan listener saat modal ditutup
  modal.addEventListener('transitionend', () => {
    if (!modal.classList.contains('show')) {
      document.removeEventListener('keydown', handleKey);
    }
  }, { once: true });
}

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
    // Live region: perubahan toast (muncul/hilang) diumumkan ke screen reader
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
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
    'background:var(--surface-color);padding:14px 20px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.12);' +
    'display:flex;align-items:center;gap:10px;font-family:inherit;font-size:0.95rem;' +
    'border-left:4px solid #3b82f6;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);';

  const borderColors = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
  toast.style.borderLeftColor = borderColors[type] || '#3b82f6';

  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}" style="color:${borderColors[type] || '#3b82f6'};font-size:1.2rem;"></i><span style="flex:1;color:var(--text-main);font-weight:500;">${esc(message)}</span><button class="toast-close" aria-label="Tutup" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-muted);padding:0 0 0 8px;line-height:1;">&times;</button>`;

  container.appendChild(toast);

  // Close button handler
  toast.querySelector('.toast-close')?.addEventListener('click', () => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  });

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
 * @param {Function} onConfirm - Callback jika user konfirmasi
 * @param {Function} onCancel - Callback jika user batal (opsional)
 * @param {Object} [options] - Opsi tampilan
 * @param {string} [options.confirmLabel='Ya, Hapus'] - Teks tombol konfirmasi; sebutkan aksinya, jangan "OK"
 * @param {string} [options.cancelLabel='Batal'] - Teks tombol batal
 * @param {boolean} [options.danger=true] - true = gaya merah peringatan; false = netral warna aksen
 */
function showConfirm(message, onConfirm, onCancel, options = {}) {
  const danger = options.danger !== false; // default: perilaku lama (merah) demi kompatibilitas
  const confirmLabel = options.confirmLabel || 'Ya, Hapus';
  const cancelLabel = options.cancelLabel || 'Batal';
  const accent = danger ? 'var(--sem-danger-strong)' : 'var(--accent-violet)'; // 6.47:1 / 5.68:1
  const icon = danger ? 'fa-exclamation-triangle' : 'fa-circle-question';

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay-js';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
  overlay.onclick = (e) => { if (e.target === overlay) closeLightbox(overlay); };
  // diingat untuk close global: fokus sebelumnya + callback batal (ESC/cancel)
  overlay._confirmCancel = onCancel;
  overlay._confirmPrevFocus = document.activeElement;

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;padding:32px;border-radius:10px;width:90%;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.2);text-align:center;font-family:inherit;';

  box.innerHTML = `
    <h3 style="margin:0 0 12px 0;color:${accent};font-size:1.1rem;"><i class="fas ${icon}"></i> Konfirmasi</h3>
    <p style="margin:0 0 20px 0;color:#374151;font-size:.95rem;">${esc(message)}</p>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="confirmNo" style="flex:1;padding:10px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${esc(cancelLabel)}</button>
      <button id="confirmYes" style="flex:1;padding:10px;background:${accent};color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${esc(confirmLabel)}</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('confirmYes').onclick = () => { overlay.remove(); syncScrollLock(); if (onConfirm) onConfirm(); };
  document.getElementById('confirmNo').onclick = () => { overlay.remove(); syncScrollLock(); if (onCancel) onCancel(); };

  // Fokus default: tombol Batal (menghindari tindakan destruktif tak sengaja)
  document.getElementById('confirmNo').focus();
  syncScrollLock();
}

// ==========================================================================
// SISTEM MODAL SERAGAM (initModalSystem)
// Tanpa factory: setiap .modal statis mematuhi perilaku yang sama.
//  - Semantik dialog (role/aria) otomatis jika belum ada atribut eksplisit
//  - ESC global menutup overlay teratas: lightbox konfirmasi dulu, lalu modal
//  - Klik overlay menutup; form kotor → peringatan "Perubahan belum disimpan?"
//  - Fokus disimpan & dipulihkan, Tab terkunci di overlay teratas
//  - Body scroll terkunci selama ada overlay terbuka
// Idempoten & auto-pasang; dipanggil sekali per halaman.
// ==========================================================================

let _modalSystemReady = false;

/**
 * Hitung ulang lock scroll body: hidden saat ada overlay terbuka.
 * Ditutup melalui class "show" (.modal) maupun penghapusan node (lightbox).
 */
function syncScrollLock() {
  const anyOpen =
    document.querySelectorAll('.modal.show').length > 0 ||
    document.querySelectorAll('.confirm-overlay-js').length > 0;
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}

/** Modal .show yang paling akhir dibuka (teratas). */
function getTopModal() {
  const open = Array.from(document.querySelectorAll('.modal.show'));
  return open.length ? open[open.length - 1] : null;
}

/** Lightbox konfirmasi (showConfirm) yang teratas. */
function getTopLightbox() {
  const lbs = document.querySelectorAll('.confirm-overlay-js');
  return lbs.length ? lbs[lbs.length - 1] : null;
}

/**
 * Form dianggap kotor bila salah satu kontrol menyimpang dari baseline
 * (keadaan saat modal dibuka). Baseline di-snapshot sekali lewat initModalSystem.
 */
function isFormDirty(form) {
  if (!form) return false;
  return Array.from(form.querySelectorAll('input, textarea, select')).some((el) => {
    if (el.disabled || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
    const current =
      el.tagName === 'SELECT' ? String(el.selectedIndex)
      : (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked)
      : el.value;
    if (el.dataset.modalBaseline === undefined) {
      el.dataset.modalBaseline = current;
      return false;
    }
    return current !== el.dataset.modalBaseline;
  });
}

/**
 * Tutup modal; bila form di dalamnya kotor, minta konfirmasi dulu
 * (netral, bukan merah — "Ya, Tutup" / "Batal").
 */
function closeModalWithDraftCheck(modal) {
  const form = modal.querySelector('form');
  if (form && isFormDirty(form)) {
    showConfirm(
      'Perubahan belum disimpan. Tutup jendela ini?',
      () => { modal.classList.remove('show'); },
      null,
      { danger: false, confirmLabel: 'Ya, Tutup', cancelLabel: 'Batal' }
    );
    return;
  }
  modal.classList.remove('show');
}

/** Tutup lightbox konfirmasi: hapus, pulihkan fokus, jalankan callback batal. */
function closeLightbox(overlay) {
  const cancel = overlay._confirmCancel;
  const prev = overlay._confirmPrevFocus;
  overlay.remove();
  syncScrollLock();
  setTimeout(() => {
    if (prev && prev.isConnected && !getTopModal() && !getTopLightbox()) prev.focus();
  }, 0);
  if (typeof cancel === 'function') cancel();
}

function initModalSystem() {
  if (_modalSystemReady) return;
  _modalSystemReady = true;

  // 1. Semantik dialog untuk .modal statis yang belum punya atribut eksplisit.
  //    Modal dengan role/aria-label eksplisit (mis. newTicketModal) dipertahankan.
  document.querySelectorAll('.modal').forEach((m) => {
    if (!m.hasAttribute('role')) {
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
    }
    if (!m.hasAttribute('aria-label')) {
      const title = m.querySelector('.modal-title');
      m.setAttribute('aria-label', title && title.textContent.trim() ? title.textContent.trim() : (m.id || 'Dialog'));
    }
  });

  // 2. Observer tunggal berlangganan class "show" : snapshot baseline draft,
  //    simpan fokus saat buka, pulihkan + sync scroll lock saat tutup.
  const MO = window.MutationObserver;
  if (MO) {
    new MO((muts) => {
      let scrollChanged = false;
      for (const mu of muts) {
        if (mu.type !== 'attributes' || mu.attributeName !== 'class') continue;
        const el = mu.target;
        if (!el.classList || !el.classList.contains('modal')) continue;
        if (el.classList.contains('show')) {
          if (!el.__prevFocus) el.__prevFocus = document.activeElement;
          el.querySelectorAll('form').forEach((f) => {
            f.querySelectorAll('input, textarea, select').forEach((c) => {
              if (c.dataset.modalBaseline === undefined) {
                c.dataset.modalBaseline =
                  c.tagName === 'SELECT' ? String(c.selectedIndex)
                  : (c.type === 'checkbox' || c.type === 'radio') ? String(c.checked)
                  : c.value;
              }
            });
          });
          scrollChanged = true;
        } else if (el.__prevFocus) {
          const prev = el.__prevFocus;
          el.__prevFocus = null;
          scrollChanged = true;
          setTimeout(() => {
            if (prev && prev.isConnected && !getTopModal() && !getTopLightbox()) prev.focus();
            syncScrollLock();
          }, 0);
        } else {
          scrollChanged = true;
        }
      }
      if (scrollChanged) syncScrollLock();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // 3. Klik pada overlay modal: tutup langsung (bersih) atau lewat peringatan draft.
  document.body.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal.show');
    if (modal && e.target === modal) closeModalWithDraftCheck(modal);
  });

  // 4. ESC global + Tab trap pada overlay teratas.
  //    Lightbox konfirmasi diutamakan, lalu modal teratas.
  //    Catatan: ESC di showModal sengaja TIDAK diubah (tetap memicu onOk —
  //    keputusan user; handler lama di showModal tetap berjalan).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lb = getTopLightbox();
      if (lb) { e.preventDefault(); closeLightbox(lb); return; }
      const top = getTopModal();
      if (top) { e.preventDefault(); closeModalWithDraftCheck(top); }
      return;
    }
    if (e.key === 'Tab') {
      const container = getTopLightbox() || getTopModal();
      if (!container || container.id === 'globalModal') return; // globalModal punya trap sendiri
      const focusable = Array.from(
        container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// Auto-pasang setelah DOM siap (toast.js dimuat di semua halaman).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModalSystem);
} else {
  initModalSystem();
}
