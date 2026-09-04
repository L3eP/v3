document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const tableBody = document.getElementById('ticketTableBody');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportScope = document.getElementById('exportScope');

    const paginationControls = document.getElementById('paginationControls');

    let allTickets = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    const itemsPerPage = 10;
    let isLoading = false;

    // Format tanggal ke YYYY-MM-DD lokal (bukan UTC). toISOString() bergeser
    // di UTC+8: 1 Agustus lokal jadi "2026-07-31" — tanggal selalu salah bulan.
    function localDateStr(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function renderTable(ticketsToRender) {
        if (ticketsToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><i class="fas fa-inbox"></i><p>Tidak ada tiket yang cocok.</p><p class="text-muted-sm">Longgarkan filter atau buat tiket baru dari tombol di atas.</p></div></td></tr>';
            return;
        }

        // Nomor urut: 1 = ticket tertua, N = ticket termuda
        // Karena sort DESC (terbaru di atas), hitung mundur dari total
        tableBody.innerHTML = ticketsToRender.map((ticket) => {
            const date = new Date(ticket.createdAt).toLocaleDateString();

            const priorityClass = `priority-${ticket.priority.toLowerCase()}`;

            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            // 1 aksi per baris: majukan status lewat tombol advance; detail lewat
            // tautan ID tiket (View digabung ke kolom ID). Selesai/Pending = baris
            // diam tanpa tombol — pintu masuk detail tetap tersedia di ID.
            const isAdvancable = ticket.status === 'Terlapor' || ticket.status === 'Dikerjakan';
            const advanceBtnHtml = isAdvancable
                ? (ticket.status === 'Terlapor'
                    ? `<button type="button" class="action-link btn-small btn-advance" data-advance="Dikerjakan" data-id="${Number(ticket.id)}"><i class="fas fa-play"></i> Mulai Kerjakan</button>`
                    : `<button type="button" class="action-link btn-small btn-advance btn-advance-done" data-advance="Selesai" data-id="${Number(ticket.id)}"><i class="fas fa-check"></i> Tandai Selesai</button>`)
                : '';

            return `
                <tr class="table-row-card">
                    <td data-label="ID"><a class="ticket-id-link" href="ticket-details.html?id=${Number(ticket.id)}">${formatId(ticket.id)}</a></td>
                    <td data-label="Aktifitas"><strong>${esc(ticket.aktifitas)}</strong></td>
                    <td data-label="Sub-node">${esc(ticket.subNode) || '-'}</td>
                    <td data-label="ODC">${esc(ticket.odc) || '-'}</td>
                    <td data-label="Lokasi">${esc(ticket.lokasi)}</td>
                    <td data-label="PIC">${esc(ticket.pic)}</td>
                    <td data-label="Priority"><span class="priority-chip ${priorityClass}">${esc(ticket.priority)}</span></td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${esc(ticket.status)}</span></td>
                    <td data-label="Date">${date}</td>
                    <td data-label="Action" class="table-actions-cell">${advanceBtnHtml}</td>
                </tr>
            `;
        }).join('');
    }

    function renderPagination() {
        paginationControls.innerHTML = '';

        if (totalPages <= 1) return;

        // Catatan: ringkasan jumlah tiket pindah ke strip hasil di atas tabel
        // (#resultsStrip) — li "N tickets" di pagination dihilangkan.

        // Previous Button
        const prevLi = document.createElement('li');
        const prevDisabled = currentPage === 1;
        prevLi.className = `page-item ${prevDisabled ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"${prevDisabled ? ' aria-disabled="true" tabindex="-1"' : ''}><span aria-hidden="true">&laquo;</span></a>`;
        prevLi.onclick = (e) => {
            e.preventDefault();
            if (currentPage > 1 && !isLoading) {
                currentPage--;
                fetchTicketsPage();
            }
        };
        paginationControls.appendChild(prevLi);

        // Page Numbers (show max 7 page buttons)
        const maxVisiblePages = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            const isCurrent = i === currentPage;
            li.className = `page-item ${isCurrent ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#"${isCurrent ? ' aria-current="page" tabindex="-1"' : ''}>${i}</a>`;
            li.onclick = (e) => {
                e.preventDefault();
                if (i !== currentPage && !isLoading) {
                    currentPage = i;
                    fetchTicketsPage();
                }
            };
            paginationControls.appendChild(li);
        }

        // Next Button
        const nextLi = document.createElement('li');
        const nextDisabled = currentPage === totalPages;
        nextLi.className = `page-item ${nextDisabled ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"${nextDisabled ? ' aria-disabled="true" tabindex="-1"' : ''}><span aria-hidden="true">&raquo;</span></a>`;
        nextLi.onclick = (e) => {
            e.preventDefault();
            if (currentPage < totalPages && !isLoading) {
                currentPage++;
                fetchTicketsPage();
            }
        };
        paginationControls.appendChild(nextLi);
    }

    // ===== Strip hasil: ringkasan jumlah + filter aktif + Reset (selalu dirender) =====
    const resultsStripText = document.getElementById('resultsStripText');
    const resetStripBtn = document.getElementById('resetStripBtn');

    function activeFilterParts() {
        const parts = [];
        if (searchInput && searchInput.value.trim()) parts.push(`cari "${searchInput.value.trim()}"`);
        if (statusFilter && statusFilter.value && statusFilter.value !== 'All') parts.push(statusFilter.value);
        if (priorityFilter && priorityFilter.value && priorityFilter.value !== 'All') parts.push(priorityFilter.value);
        if (startDateFilter && startDateFilter.value) {
            parts.push(endDateFilter && endDateFilter.value
                ? `${prettyDate(startDateFilter.value)} → ${prettyDate(endDateFilter.value)}`
                : `sejak ${prettyDate(startDateFilter.value)}`);
        } else if (endDateFilter && endDateFilter.value) {
            parts.push(`sampai ${prettyDate(endDateFilter.value)}`);
        }
        return parts;
    }

    // Tanggal input (YYYY-MM-DD) → label lokal untuk echo filter di strip;
    // konsisten dengan tanggal baris tabel (toLocaleDateString), bukan ISO mentah.
    function prettyDate(value) {
        const d = new Date(`${value}T00:00:00`);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function renderResultsStrip() {
        if (!resultsStripText || !resetStripBtn) return;
        const filters = activeFilterParts();
        resultsStripText.innerHTML = filters.length
            ? `<b>${totalItems}</b> tiket · ${filters.map(esc).join(' · ')}`
            : `<b>${totalItems}</b> tiket`;
        resetStripBtn.classList.toggle('hidden', filters.length === 0);
    }

    // Saat refetch: jumlah basi diganti penanda memuat (bukan angka usang)
    // — echo filter aktif dipertahankan, hanya kuantitas yang dipandu.
    function renderStripLoading() {
        if (!resultsStripText) return;
        const parts = activeFilterParts();
        resultsStripText.innerHTML = parts.length
            ? `… tiket · ${parts.map(esc).join(' · ')} · memuat…`
            : '… tiket · memuat…';
    }

    // Kalau fetch gagal, strip TIDAK BOLEH dibiarkan macet di "memuat…"
    // selamanya (renderStripLoading() sudah terlanjur dipanggil di awal
    // fetchTicketsPage) — ini state gagal yang eksplisit, dipasangkan
    // dengan baris "Coba lagi" di tabel.
    function renderStripError() {
        if (!resultsStripText) return;
        resultsStripText.innerHTML = 'Gagal memuat tiket';
    }

    // ≤640px thead diklip (tak terlihat): keluar dari urutan tab agar tidak ada
    // Tab-stop tak terlihat — jalur keyboard sort di mobile adalah toolbar
    // mobile-sort-select (display:block saat media query aktif).
    const cardLayoutMq = window.matchMedia('(max-width: 640px)');
    function syncSortHeaderTabstops() {
        const t = cardLayoutMq.matches ? -1 : 0;
        document.querySelectorAll('.th-sort-btn').forEach(b => b.setAttribute('tabindex', String(t)));
    }
    cardLayoutMq.addEventListener('change', syncSortHeaderTabstops);
    syncSortHeaderTabstops();

    // Ekspor toggle: <details> dilipat di <=640px (baris toolbar kepanjangan),
    // selalu terbuka di layar >=641px. data-mode dipakai CSS untuk menyembunyikan
    // summary di desktop dan menatanya sebagai tombol 44px di mobile.
    const exportGroup = document.getElementById('exportGroup');
    function syncExportToggle() {
        if (!exportGroup) return;
        if (cardLayoutMq.matches) {
            exportGroup.dataset.mode = 'mobile';   // default tertutup — ketuk "Ekspor"
        } else {
            exportGroup.dataset.mode = 'desktop';  // selalu terbuka, summary tak terlihat
            exportGroup.setAttribute('open', '');
        }
    }
    if (exportGroup) {
        syncExportToggle();
        cardLayoutMq.addEventListener('change', syncExportToggle);
    }

    // Sort mobile: kontrol ≤640px memakai state sort yang sama dengan header
    // tersortir (sinkron dua arah) — header tak terlihat di layout kartu.
    const sortSelect = document.getElementById('sortSelect');
    function syncSortSelect() {
        if (!sortSelect) return;
        const key = `${currentSort.column}|${currentSort.direction}`;
        if (sortSelect.value !== key) sortSelect.value = key;
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const [col, dir] = sortSelect.value.split('|');
            if (!col) return;
            currentSort.column = col;
            currentSort.direction = dir === 'asc' ? 'asc' : 'desc';
            currentPage = 1;
            fetchTicketsPage();
        });
    }

    function updateSortIcons() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.setAttribute('aria-sort', 'none');
            const icon = th.querySelector('.th-sort-icon');
            if (icon) icon.className = 'fas fa-sort th-sort-icon';
        });

        const activeHeader = document.querySelector(`th[data-sort="${currentSort.column}"]`);
        if (activeHeader) {
            const icon = activeHeader.querySelector('.th-sort-icon');
            if (icon) icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'} th-sort-icon active`;
            activeHeader.setAttribute('aria-sort', currentSort.direction === 'asc' ? 'ascending' : 'descending');
        }

        syncSortSelect();
    }

    async function fetchTicketsPage() {
        if (isLoading) return;
        isLoading = true;

        // Show loading state
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10" class="table-status-row"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        }
        renderStripLoading(); // ganti jumlah basi di strip saat refetch berjalan

        try {
            const params = new URLSearchParams();
            params.set('page', currentPage);
            params.set('limit', itemsPerPage);
            if (searchInput && searchInput.value.trim()) {
                params.set('search', searchInput.value.trim());
            }
            if (statusFilter && statusFilter.value && statusFilter.value !== 'All') {
                params.set('status', statusFilter.value);
            }
            if (priorityFilter && priorityFilter.value && priorityFilter.value !== 'All') {
                params.set('priority', priorityFilter.value);
            }
            if (startDateFilter && startDateFilter.value) {
                params.set('startDate', startDateFilter.value);
            }
            if (endDateFilter && endDateFilter.value) {
                params.set('endDate', endDateFilter.value);
            }

            // Server-side sorting params
            params.set('sort', currentSort.column);
            params.set('order', currentSort.direction);

            const response = await fetch(`/tickets?${params.toString()}`);
            const result = await response.json();

            // Backend returns paginated format
            if (result.data && result.pagination) {
                allTickets = result.data;
                totalItems = result.pagination.total;
                totalPages = result.pagination.totalPages;

                // Data sudah ter-sort dari server
                renderTable(allTickets);
                renderPagination();
                updateSortIcons();
            } else if (Array.isArray(result)) {
                // Backward compatible: non-paginated response
                // This shouldn't happen since we always send page param
                allTickets = result;
                totalItems = result.length;
                totalPages = Math.ceil(totalItems / itemsPerPage);
                const sorted = sortTickets([...allTickets]);
                const startIndex = (currentPage - 1) * itemsPerPage;
                renderTable(sorted.slice(startIndex, startIndex + itemsPerPage));
                renderPagination();
                updateSortIcons();
            }
            renderResultsStrip();
        } catch (error) {
            console.error('Error fetching tickets:', error);
            if (tableBody) {
                // Tombol retry memakai delegasi data-retry, bukan onclick global
                // (fetchTicketsPage closure-local tidak pernah ada di window →
                // onclick inline = ReferenceError saat diklik).
                tableBody.innerHTML = '<tr><td colspan="10" class="table-status-row error">Gagal memuat data. <button type="button" class="retry-row-btn" data-retry>Coba lagi</button></td></tr>';
            }
            renderStripError();
        } finally {
            isLoading = false;
        }
    }

    // Export: ambil SEMUA tiket yang cocok filter, paginated berbatas.
    // Jangan pernah minta response tak berbatas (landmine limit-100 bila nanti
    // ada pemanggil menambah `page`): loop halaman limit=100 dengan safety cap.
    // Filter status/priority dikirim server-side — tidak ada filter client-side.
    async function fetchAllFilteredTicketsForExport(onProgress, signal) {
        const out = { tickets: [], total: 0, truncated: false, error: null, aborted: false };
        const MAX_PAGES = 1000; // 1000 request x 100 = cap ekspor 100.000 tiket
        try {
            const scope = exportScope ? exportScope.value : 'all';
            const base = new URLSearchParams();
            base.set('limit', '100');
            if (searchInput && searchInput.value.trim()) {
                base.set('search', searchInput.value.trim());
            }
            if (statusFilter && statusFilter.value && statusFilter.value !== 'All') {
                base.set('status', statusFilter.value);
            }
            if (priorityFilter && priorityFilter.value && priorityFilter.value !== 'All') {
                base.set('priority', priorityFilter.value);
            }

            // Scope "Bulan ini" meng-override filter tanggal (pakai tanggal lokal)
            if (scope === 'month') {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                base.set('startDate', localDateStr(start));
                base.set('endDate', localDateStr(end));
            } else {
                if (startDateFilter && startDateFilter.value) base.set('startDate', startDateFilter.value);
                if (endDateFilter && endDateFilter.value) base.set('endDate', endDateFilter.value);
            }

            let page = 1;
            for (; ;) {
                if (signal && signal.aborted) { out.aborted = true; return out; } // pembatalan user
                if (page > MAX_PAGES) { out.truncated = true; console.warn('Ekspor dibatasi ke 100.000 tiket (safety cap)', { total: out.total }); break; }
                const params = new URLSearchParams(base);
                params.set('page', String(page));
                const response = await fetch(`/tickets?${params.toString()}`, signal ? { signal } : undefined);
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Gagal mengambil data ekspor');

                if (result.data && result.pagination) {
                    out.tickets.push(...result.data);
                    out.total = result.pagination.total;
                    // Umpan balik progres per halaman → strip "Mengekspor… N tiket"
                    if (onProgress) onProgress(out.tickets.length, out.total);
                    if (page >= result.pagination.totalPages) break;
                } else if (Array.isArray(result)) {
                    // Backward compatible: response non-paginated
                    out.tickets = result;
                    out.total = result.length;
                    break;
                } else {
                    throw new Error('Format respons ekspor tidak dikenal');
                }
                page++;
            }
        } catch (error) {
            if (signal && signal.aborted) { out.aborted = true; return out; } // AbortError user — bukan kegagalan
            console.error('Error fetching for export:', error);
            out.error = error.message || 'Gagal mengambil data untuk ekspor';
            showToast(out.error, 'error');
        }
        return out;
    }

    // ===== Ekspor monitor: umpan balik eksplisit selama loop permintaan =====
    // Tombol CSV/PDF dinonaktifkan (anti dobel-klik), strip progres ditampilkan,
    // lalu toast penyelesaian "N tiket → file terunduh" memberi tanda akhir.
    function setExporting(active, label) {
        if (exportCsvBtn) exportCsvBtn.disabled = active;
        if (exportPdfBtn) exportPdfBtn.disabled = active;
        const strip = document.getElementById('exportStatus');
        const text = document.getElementById('exportStatusText');
        if (!strip) return;
        if (active) {
            strip.classList.remove('hidden');
            if (text) text.textContent = label || 'Mengekspor… memuat tiket';
        } else {
            strip.classList.add('hidden');
        }
    }

    // Pembatalan ekspor: controller hidup per-ekspor (di-abort tombol Batal).
    // Cancel tersedia sejak klik — controller dibuat sebelum setExporting(true).
    let exportAbort = null;
    const exportCancelBtn = document.getElementById('exportCancelBtn');
    if (exportCancelBtn) {
        exportCancelBtn.addEventListener('click', () => {
            if (exportAbort) exportAbort.abort();
            if (exportCancelBtn) exportCancelBtn.disabled = true;
        });
    }

    // Toast dengan aksi (Undo): dipakai untuk "Mulai Kerjakan".
    // Tidak menyentuh toast.js — node toast dibuat langsung di container global
    // agar pola showToast() yang ada tetap satu-satunya API di halaman lain.
    function showUndoToast(message, actionLabel, onUndo, duration = 5000) {
        let container = document.querySelector('.toast-container-global');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container-global';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText =
            'background:var(--surface-color);padding:12px 16px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.12);' +
            'display:flex;align-items:center;gap:12px;font-size:0.95rem;font-family:inherit;' +
            'border-left:4px solid #3b82f6;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);';
        toast.innerHTML =
            `<span style="flex:1;color:var(--text-main);font-weight:500;">${esc(message)}</span>` +
            `<button type="button" class="undo-toast-btn" style="background:none;border:none;padding:8px 12px;border-radius:6px;color:var(--primary-color,#DC2626);font-weight:600;font-size:0.9rem;cursor:pointer;">${esc(actionLabel)}</button>`;
        container.appendChild(toast);

        let undone = false;
        let timer;
        const dismiss = () => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        };
        toast.querySelector('.undo-toast-btn')?.addEventListener('click', async () => {
            if (undone) return;
            undone = true;
            clearTimeout(timer);
            dismiss();
            try { await onUndo(); } catch (err) {
                console.error('Undo advance:', err);
                // Rollback gagal harus terlihat (bukan hanya console):
                // user tidak boleh diam-diam percaya status sudah kembali.
                showToast('Undo gagal — ubah status lewat tabel atau detail tiket', 'error');
            }
        });
        requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
        timer = setTimeout(dismiss, duration);
    }

    // Sorting Logic
    let currentSort = { column: 'createdAt', direction: 'desc' };

    function sortTickets(tickets) {
        return tickets.sort((a, b) => {
            let valA = a[currentSort.column];
            let valB = b[currentSort.column];

            if (currentSort.column === 'createdAt') {
                valA = new Date(valA);
                valB = new Date(valB);
            }

            if (currentSort.column === 'id') {
                valA = parseInt(valA);
                valB = parseInt(valB);
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Add Click Listeners to Headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            fetchTicketsPage(); // Re-fetch with new sort applied on current page
        });
    });

    // ===== Stepper: aksi maju status =====
    // "Mulai Kerjakan" = satu sentuhan tanpa konfirmasi (lanjut via backend
    // yang sudah membatasi transisi bertingkat). "Tandai Selesai" = sheet
    // dengan foto bukti opsional, reuse multipart evidence yang ada.
    tableBody.addEventListener('click', async (e) => {
        // Retry baris error (delegasi — bukan onclick global yang ReferenceError)
        const retryBtn = e.target.closest('[data-retry]');
        if (retryBtn) { fetchTicketsPage(); return; }
        const btn = e.target.closest('[data-advance]');
        if (!btn) return;
        const ticketId = parseInt(btn.dataset.id, 10);
        const next = btn.dataset.advance;
        const ticket = allTickets.find(t => t.id === ticketId);
        if (!ticket || !next) return;

        if (next === 'Selesai') {
            openCompleteSheet(ticketId, ticket);
            return;
        }

        btn.disabled = true;
        setLoading(btn, true);
        const prevStatus = ticket.status;
        try {
            const form = new FormData();
            form.append('status', next);
            const res = await csrfFetch(`/tickets/${ticketId}/update`, { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Gagal ubah status');
            showToast(`Status "${next}" disimpan`, 'success');
            // "Mulai Kerjakan" = satu sentuhan tanpa konfirmasi → beri jendela
            // undo 5 detik (API update yang sama, transisi balik Terlapor valid
            // di backend). "Tandai Selesai" tetap lewat sheet (foto bukti).
            if (next === 'Dikerjakan' && prevStatus && prevStatus !== next) {
                showUndoToast(`#${ticket.id} kini ${next}`, 'Undo', async () => {
                    const uform = new FormData();
                    uform.append('status', prevStatus);
                    const ures = await csrfFetch(`/tickets/${ticketId}/update`, { method: 'POST', body: uform });
                    const udata = await ures.json().catch(() => ({}));
                    if (!ures.ok) throw new Error(udata.message || 'Gagal mengembalikan status');
                    showToast(`Status dikembalikan ke "${prevStatus}"`, 'info');
                    fetchTicketsPage();
                });
            }
            fetchTicketsPage();
        } catch (err) {
            console.error('Error advance status:', err);
            showToast(err.message || 'Gagal ubah status. Coba lagi.', 'error');
            setLoading(btn, false);
        }
    });

    // Sheet "Tandai Selesai": foto bukti opsional + Simpan
    function openCompleteSheet(ticketId, ticket) {
        const modal = document.getElementById('completeTicketModal');
        const ref = document.getElementById('ctTicketRef');
        ref.textContent = `#${ticket.id} — ${ticket.aktifitas || '-'}`;
        ref.dataset.id = String(ticketId);
        const evidence = document.getElementById('ctEvidence');
        evidence.value = '';
        const preview = document.getElementById('ctEvidencePreview');
        preview.classList.add('hidden');
        modal.classList.add('show');
        setTimeout(() => evidence.focus(), 60);
    }

    document.getElementById('ctSkipBtn').addEventListener('click', () => {
        document.getElementById('completeTicketModal').classList.remove('show');
    });

    document.getElementById('completeTicketModal').addEventListener('click', (e) => {
        if (e.target.id === 'completeTicketModal') {
            e.target.classList.remove('show');
        }
    });

    document.getElementById('ctEvidence').addEventListener('change', function () {
        const preview = document.getElementById('ctEvidencePreview');
        if (this.files && this.files[0]) {
            preview.src = URL.createObjectURL(this.files[0]);
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    });

    document.getElementById('completeTicketForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const modal = document.getElementById('completeTicketModal');
        const id = parseInt(document.getElementById('ctTicketRef').dataset.id, 10);
        const evidence = document.getElementById('ctEvidence');
        const preview = document.getElementById('ctEvidencePreview');
        const submitBtn = modal.querySelector('button[type="submit"]');
        if (!id) return;
        setLoading(submitBtn, true);
        try {
            const form = new FormData();
            form.append('status', 'Selesai');
            if (evidence.files && evidence.files[0]) form.append('evidence', evidence.files[0]);
            const res = await csrfFetch(`/tickets/${id}/update`, { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Gagal simpan');
            if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
            modal.classList.remove('show');
            showToast('Tiket ditandai Selesai', 'success');
            fetchTicketsPage();
        } catch (err) {
            console.error('Error complete ticket:', err);
            showToast(err.message || 'Gagal simpan. Coba lagi.', 'error');
            setLoading(submitBtn, false);
        }
    });

    // Initial load
    fetchTicketsPage();

    // Event Listeners for Filters (Reset to page 1 and re-fetch)
    const resetAndFetch = () => { currentPage = 1; fetchTicketsPage(); };
    if (searchInput) searchInput.addEventListener('input', debounce(resetAndFetch, 300));
    if (statusFilter) statusFilter.addEventListener('change', resetAndFetch);
    if (priorityFilter) priorityFilter.addEventListener('change', resetAndFetch);
    // Bulan Ini: satu sumber kebenaran. Jika user mengetik/ubah tanggal manual,
    // lampu "Bulan Ini" padam (tidak mengaku aktif padahal rentang sudah beda).
    const btnBulanIni = document.getElementById('btnBulanIni');
    let bulanIniActive = false;

    function syncBulanIniAfterManualEdit() {
        if (!bulanIniActive) return;
        bulanIniActive = false;
        btnBulanIni.classList.remove('active');
        btnBulanIni.setAttribute('aria-pressed', 'false');
        if (exportScope) exportScope.value = 'all';
    }

    if (startDateFilter) {
        startDateFilter.addEventListener('change', () => {
            if (endDateFilter && startDateFilter.value && endDateFilter.value && startDateFilter.value > endDateFilter.value) {
                endDateFilter.value = startDateFilter.value;
            }
            syncBulanIniAfterManualEdit();
            resetAndFetch();
        });
    }
    if (endDateFilter) {
        endDateFilter.addEventListener('change', () => {
            if (startDateFilter && startDateFilter.value && endDateFilter.value && endDateFilter.value < startDateFilter.value) {
                showToast('End date tidak boleh sebelum start date', 'error');
                endDateFilter.value = startDateFilter.value;
                return;
            }
            syncBulanIniAfterManualEdit();
            resetAndFetch();
        });
    }

    if (btnBulanIni && startDateFilter && endDateFilter) {
        btnBulanIni.addEventListener('click', () => {
            bulanIniActive = !bulanIniActive;
            if (bulanIniActive) {
                const now = new Date();
                const first = new Date(now.getFullYear(), now.getMonth(), 1);
                const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                startDateFilter.value = localDateStr(first);
                endDateFilter.value = localDateStr(last);
                btnBulanIni.classList.add('active');
                btnBulanIni.setAttribute('aria-pressed', 'true');
                if (exportScope) exportScope.value = 'month';
            } else {
                startDateFilter.value = '';
                endDateFilter.value = '';
                btnBulanIni.classList.remove('active');
                btnBulanIni.setAttribute('aria-pressed', 'false');
            }
            resetAndFetch();
        });
    }

    // Reset strip hasil: kosongkan semua filter + lampu "Bulan Ini" + scope ekspor
    if (resetStripBtn) {
        resetStripBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (statusFilter) statusFilter.value = 'All';
            if (priorityFilter) priorityFilter.value = 'All';
            if (startDateFilter) startDateFilter.value = '';
            if (endDateFilter) endDateFilter.value = '';
            if (btnBulanIni) {
                btnBulanIni.classList.remove('active');
                btnBulanIni.setAttribute('aria-pressed', 'false');
            }
            if (exportScope) exportScope.value = 'all';
            bulanIniActive = false;
            resetAndFetch();
        });
    }

    // Export CSV
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            exportAbort = new AbortController();
            const signal = exportAbort.signal;
            if (exportCancelBtn) exportCancelBtn.disabled = false;
            setExporting(true, 'Mengekspor CSV… memuat tiket');
            try {
                const exportRes = await fetchAllFilteredTicketsForExport((loaded, total) => {
                    const text = document.getElementById('exportStatusText');
                    if (text) text.textContent = total
                        ? `Mengekspor CSV… ${loaded} dari ${total} tiket dimuat`
                        : `Mengekspor CSV… ${loaded} tiket dimuat`;
                }, signal);
                if (exportRes.aborted) { showToast('Ekspor CSV dibatalkan', 'info'); return; }
                if (exportRes.error) return; // toast error sudah ditampilkan; jangan unduh file kosong
                if (exportRes.truncated) showToast('Ekspor dibatasi ke 100.000 tiket terbaru', 'error');
                const visibleTickets = exportRes.tickets;
                const headers = ['ID', 'Aktifitas', 'Sub-node', 'ODC', 'Lokasi', 'PIC', 'Priority', 'Status', 'Created By', 'Date', 'Info'];

                const csvContent = [
                    headers.join(','),
                    ...visibleTickets.map(t => [
                        t.id,
                        `"${(t.aktifitas || '').replace(/"/g, '""')}"`,
                        t.subNode || '',
                        t.odc || '',
                        `"${(t.lokasi || '').replace(/"/g, '""')}"`,
                        t.pic || '',
                        t.priority,
                        t.status,
                        t.createdBy,
                        `"${new Date(t.createdAt).toLocaleDateString()}"`,
                        `"${(t.info || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
                    ].join(','))
                ].join('\n');

                if (!visibleTickets.length) {
                    showToast('Tidak ada tiket yang cocok untuk diekspor', 'error');
                    return;
                }
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
                showToast(`${visibleTickets.length} tiket \u2192 CSV terunduh`, 'success');
            } finally {
                exportAbort = null;
                setExporting(false);
            }
        });
    }

    // Export PDF (with summary rekap)
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            exportAbort = new AbortController();
            const signal = exportAbort.signal;
            if (exportCancelBtn) exportCancelBtn.disabled = false;
            setExporting(true, 'Mengekspor PDF… memuat tiket');
            try {
                // jsPDF + autotable dimuat lazy saat export diklik (lihat pdf-loader.js)
                await window.loadPdfLibs();
            } catch (e) {
                showToast(e.message || 'Gagal memuat library PDF', 'error');
                exportAbort = null;
                setExporting(false);
                return;
            }
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('l', 'mm', 'a4');
                const exportRes = await fetchAllFilteredTicketsForExport((loaded, total) => {
                    const text = document.getElementById('exportStatusText');
                    if (text) text.textContent = total
                        ? `Mengekspor PDF… ${loaded} dari ${total} tiket dimuat`
                        : `Mengekspor PDF… ${loaded} tiket dimuat`;
                }, signal);
                if (exportRes.aborted) { showToast('Ekspor PDF dibatalkan', 'info'); return; }
                if (exportRes.error) return; // toast error sudah ditampilkan; jangan unduh file kosong
                if (exportRes.truncated) showToast('Ekspor dibatasi ke 100.000 tiket terbaru', 'error');
                const tickets = exportRes.tickets;
                const total = exportRes.total;
                if (!tickets.length) {
                    showToast('Tidak ada tiket yang cocok untuk diekspor', 'error');
                    return;
                }

                // Hitung summary
                const byStatus = {}; const byPriority = {};
                tickets.forEach(t => {
                    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
                    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
                });

                // Header
                doc.setFontSize(16);
                doc.text('Export Tiket', 14, 15);
                doc.setFontSize(10);
                doc.text(`Total: ${total} tiket${exportRes.truncated ? ' (dibatasi cap)' : ''} — ${new Date().toLocaleDateString()}`, 14, 23);

                // Summary by Status
                doc.setFontSize(11);
                doc.text('By Status:', 14, 32);
                doc.setFontSize(9);
                let sy = 38;
                Object.entries(byStatus).forEach(([s, c]) => {
                    doc.text(`  ${s}: ${c} tiket (${Math.round(c / total * 100)}%)`, 14, sy);
                    sy += 6;
                });

                // Summary by Priority
                doc.setFontSize(11);
                doc.text('By Priority:', 110, 32);
                doc.setFontSize(9);
                let py = 38;
                Object.entries(byPriority).forEach(([p, c]) => {
                    doc.text(`  ${p}: ${c} tiket (${Math.round(c / total * 100)}%)`, 110, py);
                    py += 6;
                });

                // Ticket table
                doc.setFontSize(10);
                const tableStartY = Math.max(sy, py) + 6;
                const tableData = tickets.map(t => [
                    t.id, t.aktifitas, t.subNode, t.odc, t.lokasi, t.pic, t.priority, t.status,
                    t.createdBy, new Date(t.createdAt).toLocaleDateString()
                ]);

                doc.autoTable({
                    head: [['ID', 'Aktifitas', 'Sub-node', 'ODC', 'Lokasi', 'PIC', 'Priority', 'Status', 'Created By', 'Date']],
                    body: tableData,
                    startY: tableStartY,
                    theme: 'grid',
                    styles: { fontSize: 7 },
                    headStyles: { fillColor: [75, 85, 99] },
                    columnStyles: { 1: { cellWidth: 30 }, 9: { cellWidth: 'auto' } }
                });

                doc.save(`tickets_export_${new Date().toISOString().split('T')[0]}.pdf`);
                showToast(`${total} tiket → PDF terunduh`, 'success');
            } finally {
                exportAbort = null;
                setExporting(false);
            }
        });
    }

    // ===== New Ticket Modal =====
    const ntBtn = document.getElementById('btnNewTicket');
    const ntForm = document.getElementById('newTicketForm');
    const ntModal = document.getElementById('newTicketModal');
    let ntReferences = {};
    let ntFtth = {};
    let ntPrevFocus = null;

    // Evidence preview
    function resetNtEvidencePreview() {
        const preview = document.getElementById('ntEvidencePreview');
        if (!preview) return;
        preview.src = '';
        preview.classList.add('hidden');
    }
    document.getElementById('ntEvidence')?.addEventListener('change', function () {
        const preview = document.getElementById('ntEvidencePreview');
        if (!preview) return;
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = e => { preview.src = e.target.result; preview.classList.remove('hidden'); };
            reader.readAsDataURL(this.files[0]);
        } else { preview.classList.add('hidden'); }
    });

    // Auto-assign PIC: cari Teknisi dengan wilayah (sub_node) yang cocok dulu,
    // baru beban paling ringan — lihat GET /api/auto-pic (routes/tickets.js).
    // Dipanggil tanpa subNode saat modal baru dibuka (fallback beban paling
    // ringan), lalu dipanggil ulang begitu sub_node dipilih supaya PIC yang
    // disarankan ikut menyesuaikan wilayah.
    async function autoAssignPic(subNode) {
        try {
            const url = subNode ? `/api/auto-pic?subNode=${encodeURIComponent(subNode)}` : '/api/auto-pic';
            const autoPicRes = await fetch(url);
            const autoPic = await autoPicRes.json();
            const picSel = document.getElementById('ntPic');
            if (autoPic.pic && picSel) {
                for (const opt of picSel.options) {
                    if (opt.value === autoPic.pic) {
                        opt.selected = true;
                        break;
                    }
                }
                const autoInfo = document.getElementById('ntPicAuto');
                if (autoInfo) {
                    const wilayahNote = autoPic.matchedSubNode ? ' · sesuai wilayah' : '';
                    autoInfo.textContent = `✓ ${autoPic.fullName} (${autoPic.activeTickets} tiket aktif${wilayahNote})`;
                    autoInfo.classList.add('auto-pic-info');
                }
            }
        } catch (e) {
            console.error('Error auto-assign PIC:', e);
        }
    }
    document.getElementById('ntSubNode')?.addEventListener('change', function () {
        autoAssignPic(this.value);
    });

    async function loadNewTicketData() {
        try {
            const [refRes, ftthRes, usersRes] = await Promise.all([
                fetch('/api/references'),
                fetch('/api/ftth'),
                fetch('/users')
            ]);
            ntReferences = await refRes.json();
            // ODC & ODP untuk form ini HARUS dari /api/ftth (ftth_devices), bukan
            // /api/references (reference_options) — sejak topologi FTTH dipisah
            // ke tabel sendiri, reference_options tidak lagi ikut ter-update saat
            // ODC/ODP baru ditambah/diubah lewat ftth.html (lihat catatan yang
            // sama di public/js/psb.js loadOdp()).
            const ftthJson = await ftthRes.json();
            ntFtth = ftthJson.data || {};
            const users = await usersRes.json();

            // Aktifitas dropdown
            const aktifitasSel = document.getElementById('ntAktifitas');
            aktifitasSel.innerHTML = '<option value="">Pilih Aktifitas</option>';
            (ntReferences.aktifitas || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                aktifitasSel.appendChild(opt);
            });

            // Sub-Node
            const subNodeSel = document.getElementById('ntSubNode');
            subNodeSel.innerHTML = '<option value="">Pilih Sub-Node</option>';
            (ntReferences.sub_node || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                subNodeSel.appendChild(opt);
            });

            // ODC — dari ftth_devices (lihat catatan di atas)
            const odcSel = document.getElementById('ntOdc');
            odcSel.innerHTML = '<option value="">Pilih ODC</option>';
            const grouped = {};
            (ntFtth.odc || []).forEach(item => {
                const g = item.group || 'Lainnya';
                if (!grouped[g]) grouped[g] = [];
                grouped[g].push(item);
            });
            Object.keys(grouped).sort().forEach(group => {
                const og = document.createElement('optgroup');
                og.label = group;
                grouped[group].forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.label;
                    opt.textContent = item.label;
                    og.appendChild(opt);
                });
                odcSel.appendChild(og);
            });

            // ODP (filter by ODC)
            const odpSel = document.getElementById('ntOdp');
            odpSel.innerHTML = '<option value="">Pilih ODP</option>';

            // Priority
            const prioSel = document.getElementById('ntPriority');
            prioSel.innerHTML = '<option value="">Pilih Priority</option>';
            (ntReferences.priority || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                prioSel.appendChild(opt);
            });

            // PIC
            const picSel = document.getElementById('ntPic');
            picSel.innerHTML = '<option value="">Select PIC</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.username;
                opt.textContent = `${u.fullName || u.username} (${u.role})`;
                picSel.appendChild(opt);
            });
        } catch (e) {
            console.error('Error loading create ticket data:', e);
        }
    }

    // Filter ODP saat ODC berubah — dari ftth_devices (lihat catatan di atas).
    // Diekstrak jadi fungsi (bukan cuma listener) supaya bisa dipanggil ulang
    // dari onPsbSelect() saat auto-isi ODC+ODP dari data PSB.
    function populateOdpOptions(selectedOdc, preselectOdp) {
        const odpSel = document.getElementById('ntOdp');
        odpSel.innerHTML = '<option value="">Pilih ODP</option>';
        (ntFtth.odp || [])
            .filter(item => item.group === selectedOdc)
            .forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                odpSel.appendChild(opt);
            });
        if (preselectOdp) odpSel.value = preselectOdp;
    }
    document.getElementById('ntOdc').addEventListener('change', function () {
        populateOdpOptions(this.value);
    });

    // PSB logic
    let psbList = [];

    window.onAktifitasChange = function () {
        const aktifitas = document.getElementById('ntAktifitas').value.trim().toLowerCase();
        const wrap = document.getElementById('ntPsbWrap');
        if (aktifitas === 'psb') {
            wrap.classList.remove('hidden');
        } else {
            wrap.classList.add('hidden');
            document.getElementById('ntPsbInfo').textContent = '';
        }
    };

    window.onPsbSelect = function () {
        const selectedId = document.getElementById('ntPsbSelect').value;
        const psb = psbList.find(p => p.id == selectedId);
        if (psb) {
            document.getElementById('ntLokasi').value = psb.address || '';

            // Auto-isi ODC & ODP dari data PSB — sebelumnya ODP cuma disebut
            // di teks info (ntInfo), sekarang dipilih beneran di dropdown
            // terstruktur supaya kolom tickets.odc/odp ikut tersimpan saat
            // tiket dibuat (bukan cuma nempel di deskripsi bebas).
            if (psb.odp_label) {
                const odpDevice = (ntFtth.odp || []).find(o => o.label === psb.odp_label);
                if (odpDevice && odpDevice.group) {
                    document.getElementById('ntOdc').value = odpDevice.group;
                    populateOdpOptions(odpDevice.group, psb.odp_label);
                } else {
                    // ODP PSB tidak ketemu di ftth_devices (data lama/berbeda
                    // kapitalisasi) — tetap sebut di info text di bawah, jangan
                    // dipaksa pilih dropdown yang salah.
                }
            }

            const infoParts = [`PSB - ${psb.customer_name}`];
            if (psb.phone) infoParts.push(`Telp: ${psb.phone}`);
            if (psb.onu_sn) infoParts.push(`SN ONU: ${psb.onu_sn}`);
            if (psb.odp_label) infoParts.push(`ODP: ${psb.odp_label}`);
            if (psb.onu_port) infoParts.push(`Port: ${psb.onu_port}`);
            document.getElementById('ntInfo').value = infoParts.join(' | ');
            document.getElementById('ntPsbInfo').innerHTML = `<i class="fas fa-location-dot"></i> ${esc(psb.customer_name)}${psb.phone ? ' · ' + esc(psb.phone) : ''}${psb.onu_sn ? ' · SN: ' + esc(psb.onu_sn) : ''}`;
        }
    };

    // Show modal
    if (ntBtn) {
        ntBtn.addEventListener('click', async () => {
            await loadNewTicketData();
            // Reset PSB section
            document.getElementById('ntPsbWrap').classList.add('hidden');
            document.getElementById('ntPsbInfo').textContent = '';
            document.getElementById('ntAktifitas').value = '';

            // Load PSB list for dropdown
            try {
                const r = await fetch('/api/psb');
                psbList = await r.json();
                const sel = document.getElementById('ntPsbSelect');
                sel.innerHTML = '<option value="">— Pilih Pelanggan —</option>';
                psbList
                    .filter(p => p.status === 'Terdaftar')
                    .forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = `${p.customer_name} — ${p.address ? p.address.substring(0, 40) : ''}${p.onu_sn ? ' [SN:' + p.onu_sn + ']' : ''}`;
                        sel.appendChild(opt);
                    });
            } catch (e) {
                console.error('Error loading PSB:', e);
            }

            // Auto-assign PIC awal (belum tahu sub_node — cuma beban paling ringan
            // secara global). Dipanggil lagi & diperhalus begitu sub_node dipilih,
            // lihat listener #ntSubNode di bawah.
            await autoAssignPic();

            ntPrevFocus = document.activeElement;
            resetNtEvidencePreview();
            ntModal.classList.add('show');
            // Fokus ke field pertama setelah animasi bottom-sheet selesai
            setTimeout(() => {
                const firstField = document.getElementById('ntAktifitas');
                if (firstField) firstField.focus();
            }, 80);
        });
    }

    // Submit
    if (ntForm) {
        ntForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Distill: satu sentuhan buat tiket — form `required` sudah menjaga
            // kelengkapan; gerbang showConfirm kedua hanya menambah friksi.
            const submitBtn = ntForm.querySelector('.login-btn');
            setLoading(submitBtn, true, 'Creating...');

            const formData = new FormData(ntForm);
            formData.append('createdBy', user.username);

            try {
                const r = await csrfFetch('/tickets', { method: 'POST', body: formData });
                if (r.ok) {
                    ntModal.classList.remove('show');
                    ntForm.reset();
                    resetNtEvidencePreview();
                    showToast('Ticket created!', 'success');
                    currentPage = 1;
                    fetchTicketsPage();
                } else {
                    const d = await r.json();
                    showToast(d.message || 'Failed', 'error');
                }
            } catch (e) {
                showToast('Error creating ticket', 'error');
            } finally {
                setLoading(submitBtn, false);
            }
        });
    }

    // Close modal on overlay click
    if (ntModal) {
        ntModal.addEventListener('click', (e) => {
            if (e.target === ntModal) {
                ntModal.classList.remove('show');
                if (ntPrevFocus) ntPrevFocus.focus();
            }
        });

        // Tutup dengan ESC + kembalikan fokus ke tombol pemicu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ntModal.classList.contains('show')) {
                ntModal.classList.remove('show');
                if (ntPrevFocus) ntPrevFocus.focus();
            }
        });
    }

});
