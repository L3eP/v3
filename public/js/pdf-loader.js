/**
 * pdf-loader.js
 * Lazy loader untuk jsPDF + jspdf-autotable.
 *
 * Alasan: kedua library (~380 KB total) sebelumnya dimuat eager via <script>
 * di ticket-list.html / activity.html / inventory.html — biaya parse dibayar di
 * setiap buka halaman, padahal hanya dipakai begitu tombol "Export PDF" diklik.
 *
 * Pemakaian:
 *   await window.loadPdfLibs();
 *   const { jsPDF } = window.jspdf;   // lanjut seperti sebelumnya
 *
 * Idempotent: promise di-cache, dan sekali window.jspdf ada langsung resolve.
 * Saat CDN gagal, promise di-reset agar klik berikutnya mencoba lagi.
 */
(function () {
    'use strict';

    var PDF_SCRIPT_URLS = [
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js'
    ];

    var pdfLibsPromise = null;

    function injectScript(src) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = function () {
                reject(new Error('Gagal memuat library PDF — cek koneksi internet'));
            };
            document.head.appendChild(script);
        });
    }

    window.loadPdfLibs = function () {
        // Sudah termuat (dari klik export sebelumnya) → langsung selesai
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();

        if (!pdfLibsPromise) {
            // Berurutan, BUKAN pararel: plugin autotable harus meng-attach ke
            // window.jspdf yang sudah ada. jspdf (~340 KB) dulu, autotable setelah.
            pdfLibsPromise = PDF_SCRIPT_URLS.reduce(function (chain, src) {
                return chain.then(function () { return injectScript(src); });
            }, Promise.resolve()).catch(function (err) {
                pdfLibsPromise = null; // reset agar percobaan berikutnya tidak memakai promise yang gagal
                throw err;
            });
        }
        return pdfLibsPromise;
    };
})();
