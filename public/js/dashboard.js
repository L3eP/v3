document.addEventListener('DOMContentLoaded', async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = '/index.html';
        return;
    }

    const user = JSON.parse(userStr);
    const isPrivileged = user.role === ROLES.OWNER || user.role === ROLES.OPERATOR;

    // Role-adaptive: hub priviliged disembunyikan untuk Teknisi,
    // strip "Tugas Saya" ditampilkan sebaliknya.
    if (!isPrivileged) {
        document.querySelectorAll('.privileged-only').forEach(el => el.classList.add('hidden'));
    }
    const teknisiHub = document.getElementById('teknisiHub');
    if (teknisiHub) teknisiHub.classList.toggle('hidden', isPrivileged);

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const response = await csrfFetch('/logout', { method: 'POST' });
                const result = await response.json();
                if (result.redirect) {
                    window.location.href = result.redirect;
                }
            } catch (error) {
                console.error('Logout failed:', error);
            }
        });
    }

    // Wrapper fetch dengan auto-redirect 401 — hanya untuk API calls
    const apiFetch = async (url, opts) => {
        const res = await fetch(url, opts);
        if (res.status === 401) window.location.href = '/index.html';
        return res;
    };

    const setText = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    };

    // ======================================================================
    // 1) Stats bulanan — SATU ambilan agregat dari /api/stats/month
    // ======================================================================
    async function fetchStats(quiet = false) {
        try {
            const res = await apiFetch('/api/stats/month');
            if (!res.ok) throw new Error('Stats failed');
            const stats = await res.json();
            window.stats = stats;
            if (isPrivileged) renderHeroCards(stats);
            else renderTeknisiStrip(stats.teknisi || {}, stats.sla ? stats.sla.avgHours : null);
        } catch (error) {
            console.error('Error loading stats:', error);
            if (!quiet) {
                showModal('Error', 'Gagal memuat statistik dashboard. Coba lagi?', 'error', () => fetchStats());
            }
        }
    }

    function renderHeroCards(s) {
        // Antrian + aging
        setText('heroAntrianTotal', s.totalOpen);
        setText('agingToday', s.aging.today);
        setText('aging12', s.aging.oneTwoDays);
        setText('agingOver', s.aging.older);
        setText('bdTerlapor', s.statusBreakdown['Terlapor'] || 0);
        setText('bdDikerjakan', s.statusBreakdown['Dikerjakan'] || 0);
        setText('bdPending', s.statusBreakdown['Pending'] || 0);

        // Selesai bulan ini + rasio + pekan ini
        setText('heroSelesai', s.done.month);
        const aktifTotal = s.totalOpen + s.done.month;
        const rasio = aktifTotal > 0 ? Math.round((s.done.month / aktifTotal) * 100) : 0;
        setText('selesaiRasio', `${rasio}%`);
        const bar = document.getElementById('selesaiRasioBar');
        if (bar) bar.style.width = `${Math.min(100, rasio)}%`;
        setText('selesaiPekanIni', s.done.week);
        setText('selesaiBulanLabel', new Date().toLocaleDateString('id-ID', { month: 'long' }));

        // SLA — fallback jujur: belum bermakna sebelum ada tiket selesai
        const slaEl = document.getElementById('heroSla');
        const sub = document.getElementById('slaSubtext');
        if (s.sla.doneCount > 0 && s.sla.avgHours !== null) {
            slaEl.textContent = formatHours(s.sla.avgHours);
            sub.textContent = `${s.sla.doneCount} tiket selesai dihitung`;
        } else {
            slaEl.textContent = '—';
            sub.textContent = 'menunggu data selesai';
        }
    }

    // "3 h 12 j" kalau ≥1 hari, "18 jam" kalau di bawah itu — dipakai hero
    // card (SLA tim) maupun strip Teknisi (SLA pribadi) supaya formatnya konsisten.
    function formatHours(hours) {
        const days = Math.floor(hours / 24);
        const rem = Math.round(hours % 24);
        return days > 0 ? `${days} h ${rem} j` : `${Math.round(hours)} jam`;
    }

    function renderTeknisiStrip(t, teamSlaAvgHours) {
        setText('tMyOpen', t.myOpen ?? '–');
        setText('tMyAttention', t.myAttention ?? '–');
        setText('tMyDoneMonth', t.myDoneMonth ?? '–');
        setText('tMyActivitiesToday', t.myActivitiesToday ?? '–');

        // Warna tiap kartu sekarang statis lewat class di dashboard.html (biru
        // info / merah perlu-perhatian / hijau selesai / amber SLA) — bukan
        // di-toggle kondisional lagi. Enam kartu sama-sama berwarna supaya
        // baris terasa satu set, bukan satu kartu mencolok di antara yang polos.

        // SLA saya vs SLA tim — angka baru bermakna kalau ada pembanding,
        // bukan berdiri sendiri.
        const slaLabelEl = document.getElementById('tMySlaLabel');
        if (t.mySlaAvgHours !== null && t.mySlaAvgHours !== undefined) {
            setText('tMySla', formatHours(t.mySlaAvgHours));
            if (slaLabelEl) {
                slaLabelEl.textContent = (teamSlaAvgHours !== null && teamSlaAvgHours !== undefined)
                    ? `SLA saya (tim: ${formatHours(teamSlaAvgHours)})`
                    : 'rata-rata SLA saya';
            }
        } else {
            setText('tMySla', '—');
            if (slaLabelEl) slaLabelEl.textContent = 'SLA saya — belum ada tiket selesai';
        }
        setText('tMyWeekActivities', t.myWeekActivities ?? '–');
    }

    // ======================================================================
    // 2) Chart "Tren Bulan Ini" — paket data terbatas (100 tiket terakhir)
    // ======================================================================
    let chartInstance = null;
    let currentChartType = 'bar'; // Default type

    // Palette diambil dari token CSS (bukan array hex hardcoded)
    function chartPalette() {
        const cs = getComputedStyle(document.documentElement);
        const token = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
        return [
            token('--primary-color', '#DC2626'),
            token('--accent-violet', '#7C3AED'),
            token('--sem-warn-strong', '#B45309'),
            token('--sem-success-strong', '#047857'),
            token('--sem-info-strong', '#1D4ED8'),
            token('--sem-danger-strong', '#B91C1C')
        ];
    }

    function hexToRgba(hex, alpha) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return `rgba(220, 38, 38, ${alpha})`;
        const n = parseInt(m[1], 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    // Chart.js dimuat LAZY: sebelumnya <script> eager di <head> (~200 KB,
    // render-blocking di landing page), padahal chart hanya untuk Owner/Operator
    // dan butuh data yang datang belakangan. Sekarang: tak pernah dimuat oleh
    // Teknisi, dan dialog pemuatannya tidak memblokir parse halaman.
    let chartLibPromise = null;
    function loadChartLib() {
        if (window.Chart) return Promise.resolve(window.Chart);
        if (!chartLibPromise) {
            chartLibPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
                s.async = true;
                s.onload = () => resolve(window.Chart);
                s.onerror = () => {
                    chartLibPromise = null;
                    reject(new Error('Gagal memuat Chart.js'));
                };
                document.head.appendChild(s);
            });
        }
        return chartLibPromise;
    }

    async function fetchChartTickets() {
        if (!isPrivileged) return;
        try {
            const res = await apiFetch('/tickets?page=1&limit=100&sort=createdAt&order=desc');
            if (!res.ok) throw new Error('Chart failed');
            const data = await res.json();
            const tickets = Array.isArray(data) ? data : (data.data || []);
            window.monthlyTickets = tickets;
            const chartSelect = document.getElementById('chartGroupBy');
            renderChart(tickets, chartSelect ? chartSelect.value : 'subNode');
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    async function renderChart(tickets, groupBy = 'subNode') {
        const ctx = document.getElementById('ticketsChart');
        if (!ctx) return;

        // Chart.js diunduh saat pertama kali chart benar-benar dirender
        try {
            await loadChartLib();
        } catch (e) {
            const summaryElement = document.getElementById('chartSummary');
            if (summaryElement) summaryElement.textContent = 'Grafik gagal dimuat — cek koneksi internet.';
            console.warn('Chart.js load failed:', e);
            return;
        }

        const palette = chartPalette();

        // Aggregate data
        const counts = {};
        tickets.forEach(t => {
            const key = t[groupBy] || 'Unknown';
            counts[key] = (counts[key] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const data = Object.values(counts);

        // Kategori terbesar untuk ringkasan
        let topCategory = '';
        let maxCount = 0;
        for (const [key, value] of Object.entries(counts)) {
            if (value > maxCount) {
                maxCount = value;
                topCategory = key;
            }
        }

        const summaryElement = document.getElementById('chartSummary');
        if (summaryElement) {
            if (maxCount > 0) {
                summaryElement.innerHTML = `Mayoritas tiket di <strong>${esc(topCategory)}</strong> (${esc(maxCount)} tiket, dari ${tickets.length} terbaru).`;
            } else {
                summaryElement.textContent = 'Belum ada data tren bulan ini.';
            }
        }

        // Destroy existing chart if it exists
        if (chartInstance) {
            chartInstance.destroy();
        }

        const suffixMap = {
            'subNode': 'Sub-Node',
            'odc': 'ODC',
            'aktifitas': 'Aktifitas'
        };

        const chartConfig = {
            type: currentChartType,
            data: {
                labels: labels,
                datasets: [{
                    label: `Tren per ${suffixMap[groupBy] || groupBy}`,
                    data: data,
                    backgroundColor: currentChartType === 'pie'
                        ? labels.map((_, i) => palette[i % palette.length])
                        : hexToRgba(palette[0], 0.8),
                    borderColor: currentChartType === 'pie' ? '#ffffff' : palette[0],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: currentChartType === 'pie', // Show legend only for pie
                        position: 'right',
                        labels: {
                            color: '#4B5563'
                        }
                    }
                },
                scales: currentChartType === 'bar' ? {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: '#4B5563' },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        ticks: { color: '#4B5563' },
                        grid: { color: '#e2e8f0' }
                    }
                } : {} // No scales for pie chart
            }
        };

        chartInstance = new Chart(ctx, chartConfig);
    }

if (isPrivileged) {
    // Event listener untuk pemilihan grup chart
    const chartSelect = document.getElementById('chartGroupBy');
    if (chartSelect) {
        chartSelect.addEventListener('change', async (e) => {
            if (window.monthlyTickets) {
                await renderChart(window.monthlyTickets, e.target.value);
            }
        });
    }

    // Toggle tipe chart
    const btnBar = document.getElementById('btnChartBar');
    const btnPie = document.getElementById('btnChartPie');

    if (btnBar && btnPie) {
        btnBar.addEventListener('click', async () => {
            if (currentChartType !== 'bar') {
                currentChartType = 'bar';
                btnBar.classList.add('active');
                btnPie.classList.remove('active');
                if (window.monthlyTickets && chartSelect) {
                    await renderChart(window.monthlyTickets, chartSelect.value);
                }
            }
        });

        btnPie.addEventListener('click', async () => {
            if (currentChartType !== 'pie') {
                currentChartType = 'pie';
                btnPie.classList.add('active');
                btnBar.classList.remove('active');
                if (window.monthlyTickets && chartSelect) {
                    await renderChart(window.monthlyTickets, chartSelect.value);
                }
            }
        });
    }

    // Download Chart
    const btnDownload = document.getElementById('btnDownloadChart');
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            const canvas = document.getElementById('ticketsChart');
            if (canvas) {
                const link = document.createElement('a');
                link.download = `dashboard-chart-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }
        });
    }
}

    // ======================================================================
    // 3) Recent Tickets — slice server-side (10 teratas, pencarian 'q')
    // Filter status (sembunyikan Selesai) berlaku utk SEMUA role, bukan cuma
    // Owner/Operator — sebelumnya Teknisi ikut melihat tiketnya yang sudah
    // Selesai di widget ini, tidak konsisten dengan versi Owner/Operator.
    // ======================================================================
    async function fetchRecentTickets(q = '') {
        let url = '/tickets?page=1&limit=10&status=Terlapor,Dikerjakan,Pending';
        if (q) url += `&search=${encodeURIComponent(q)}`;
        try {
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('Recent failed');
            const data = await res.json();
            window.currentTickets = data.data || [];
            renderRecentTickets(window.currentTickets);
        } catch (error) {
            console.error('Error loading recent tickets:', error);
        }
    }

    const recentSearchInput = document.getElementById('ticketSearch');
    if (recentSearchInput) {
        recentSearchInput.addEventListener('input', debounce((e) => {
            fetchRecentTickets(e.target.value.trim());
        }, 300));
    }

    function renderRecentTickets(tickets) {
        const recentList = document.getElementById('recentTicketsList');
        const emptyState = document.getElementById('emptyState');
        if (!recentList) return;
        recentList.innerHTML = '';

        if (tickets.length === 0) {
            recentList.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        recentList.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        tickets.forEach(ticket => {
            const li = document.createElement('li');
            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            // Status Icon Mapping
            let statusIcon = '';
            if (ticket.status === 'Selesai') statusIcon = '<i class="fas fa-check-circle"></i>';
            else if (ticket.status === 'Dikerjakan') statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
            else if (ticket.status === 'Pending') statusIcon = '<i class="fas fa-clock"></i>';
            else statusIcon = '<i class="fas fa-exclamation-circle"></i>';

            li.innerHTML = `
                <a class="dash-item-link" href="/ticket-details.html?id=${Number(ticket.id)}">
                    <div class="dash-item-icon">
                        <i class="fas fa-ticket-alt"></i>
                    </div>
                    <div class="flex-1">
                        <strong class="dash-item-title">${formatId(ticket.id)} ${esc(ticket.aktifitas)}</strong>
                        <small class="dash-item-meta">
                            <i class="far fa-building"></i> ${esc(ticket.subNode)}
                            <span class="dash-item-sep">•</span>
                            <i class="far fa-calendar-alt"></i> ${new Date(ticket.createdAt).toLocaleDateString()}
                        </small>
                    </div>
                    <span class="status-badge ${statusClass} dash-item-badge">
                        ${statusIcon} ${esc(ticket.status)}
                    </span>
                </a>
            `;
            recentList.appendChild(li);
        });
    }

    // ======================================================================
    // 4) Activity Log — slice server-side (10 teratas, pencarian 'q')
    //    Teknisi otomatis dibatasi ke aktivitasnya sendiri oleh server.
    // ======================================================================
    async function fetchActivities(q = '') {
        let url = '/activities?page=1&limit=10';
        if (q) url += `&search=${encodeURIComponent(q)}`;
        try {
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('Activities failed');
            const activities = await res.json();
            window._allActivities = activities.data || [];
            renderActivityLog(window._allActivities);
        } catch (error) {
            console.error('Error loading activities:', error);
            document.getElementById('activityLogList').innerHTML = `<li class="p-4 text-center text-danger">Error loading activities</li>`;
        }
    }

    const activitySearchInput = document.getElementById('activitySearch');
    if (activitySearchInput) {
        activitySearchInput.addEventListener('input', debounce((e) => {
            fetchActivities(e.target.value.trim());
        }, 300));
    }

    function renderActivityLog(activities) {
        const activityList = document.getElementById('activityLogList');
        if (!activityList) return;
        if (!activities || activities.length === 0) {
            activityList.innerHTML = `<li class="p-4 text-center text-muted">No recent activity</li>`;
            return;
        }

        activityList.innerHTML = '';
        activities.forEach(activity => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="dash-item-row-start">
                    <div class="dash-item-icon bg-info-light">
                        <i class="fas fa-user-clock text-info"></i>
                    </div>
                    <div>
                        <strong class="dash-item-title sm">${esc(activity.description)}</strong>
                         <small class="dash-item-meta">
                            <i class="fas fa-user-circle"></i> ${esc(activity.username)}
                            <span class="dash-item-sep">•</span>
                            <i class="far fa-clock"></i> ${new Date(activity.date).toLocaleString()}
                        </small>
                    </div>
                </div>
            `;
            activityList.appendChild(li);
        });
    }

    // ======================================================================
    // 5) Quick Log Activity Modal
    // ======================================================================
    const quickLogBtn = document.getElementById('quickLogBtn');
    const quickLogForm = document.getElementById('quickLogForm');
    if (quickLogBtn && quickLogForm) {
        quickLogBtn.addEventListener('click', () => {
            // Dropdown memakai tiket terbuka yang sudah dimuat (slice)
            const select = document.getElementById('qlTicketId');
            if (select && window.currentTickets) {
                select.innerHTML = '<option value="">— No Ticket (General) —</option>';
                window.currentTickets
                    .filter(t => t.status !== 'Selesai')
                    .forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = `${t.lokasi} — ${t.aktifitas}`;
                        select.appendChild(opt);
                    });
            }
            document.getElementById('quickLogModal').classList.add('show');
        });

        quickLogForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const description = document.getElementById('qlDescription').value.trim();
            if (!description) return;

            const btn = quickLogForm.querySelector('.login-btn');
            setLoading(btn, true, 'Logging...');

            try {
                const r = await csrfFetch('/activities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description,
                        username: user.username,
                        ticket_id: document.getElementById('qlTicketId').value || ''
                    })
                });
                if (r.ok) {
                    const data = await r.json();
                    showToast(
                        data.autoTransition
                            ? `Activity logged! Tiket #${data.autoTransition.ticketId} otomatis dimulai (Dikerjakan).`
                            : 'Activity logged!',
                        'success'
                    );
                    quickLogForm.reset();
                    document.getElementById('quickLogModal').classList.remove('show');
                    fetchActivities(); // Refresh log
                    if (data.autoTransition) fetchStats(true); // status tiket ikut berubah — hero card jangan basi
                } else {
                    showToast('Failed to log activity', 'error');
                }
            } catch (e) {
                showToast('Error logging activity', 'error');
            } finally {
                setLoading(btn, false);
            }
        });
    }

    // ======================================================================
    // 6) Auto-refresh 60 detik (semua ambilan sudah dibatasi — slice data)
    // ======================================================================
    function updateLastUpdate() {
        const el = document.getElementById('lastUpdate');
        if (el) el.innerHTML = `<i class="far fa-clock"></i> ${new Date().toLocaleTimeString()}`;
    }

    setInterval(async () => {
        try {
            await Promise.all([
                fetchStats(true),
                fetchRecentTickets((document.getElementById('ticketSearch')?.value || '').trim()),
                fetchActivities((document.getElementById('activitySearch')?.value || '').trim()),
                fetchChartTickets()
            ]);
            updateLastUpdate();
        } catch (e) {
            // Silent fail — jangan ganggu user dengan error polling
            console.warn('Polling error:', e);
        }
    }, 60000);

    // ===== Muat awal =====
    fetchStats();
    fetchChartTickets();
    fetchRecentTickets();
    fetchActivities();

    // Update timestamp setelah fetch pertama
    setTimeout(updateLastUpdate, 1000);
});
