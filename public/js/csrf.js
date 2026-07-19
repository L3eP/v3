/**
 * CSRF Helper — Double-Submit Cookie Pattern
 *
 * Fungsi:
 *   getCsrfToken()      — baca token dari cookie csrf-token
 *   csrfFetch(url, opts) — wrapper fetch() dengan CSRF header otomatis
 *
 * Usage — ganti fetch() dengan csrfFetch() untuk state-changing requests:
 *
 *   // JSON body
 *   csrfFetch('/login', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(data)
 *   })
 *
 *   // FormData (multipart — upload file)
 *   csrfFetch('/tickets', {
 *     method: 'POST',
 *     body: formData
 *   })
 *
 *   // DELETE
 *   csrfFetch('/tickets/5', { method: 'DELETE' })
 */

/**
 * Baca nilai cookie berdasarkan nama
 */
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Ambil CSRF token dari cookie
 */
function getCsrfToken() {
  return getCookie('csrf-token');
}

/**
 * Wrapper fetch dengan CSRF header otomatis.
 * Jika cookie csrf-token belum ada, otomatis trigger GET dulu
 * supaya server set cookie, lalu retry request.
 */
async function csrfFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  // Hanya state-changing methods perlu CSRF
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let token = getCsrfToken();

    // Fallback: jika cookie belum ada, trigger GET untuk set cookie
    if (!token) {
      await fetch(window.location.href, { method: 'GET', credentials: 'same-origin' });
      token = getCsrfToken();
    }

    if (token) {
      options.headers = options.headers || {};

      // Untuk FormData: kita perlu set header + append field
      // (header untuk middleware, field untuk fallback jika header tidak terkirim)
      options.headers['X-CSRF-Token'] = token;
      if (options.body instanceof FormData) {
        options.body.append('_csrf_token', token);
      }
    }
  }

  return fetch(url, options);
}
