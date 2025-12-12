document.addEventListener('DOMContentLoaded', async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = '/index.html';
        return;
    }

    const user = JSON.parse(userStr);

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('/logout', { method: 'POST' });
                const result = await response.json();
                if (result.redirect) {
                    window.location.href = result.redirect;
                }
            } catch (error) {
                console.error('Logout failed:', error);
            }
        });
    }

    // Check for unauthorized access globally
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        if (response.status === 401) {
            window.location.href = '/index.html';
        }
        return response;
    };

    async function fetchTickets() {
        try {
            const response = await fetch('/tickets');
            const tickets = await response.json();
            window.currentTickets = tickets; // Store ALL tickets for search/recent list

            // Filter for Current Month for Stats and Chart
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const monthlyTickets = tickets.filter(t => {
                const d = new Date(t.createdAt);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            });

            window.monthlyTickets = monthlyTickets; // Store for chart updates

            updateStats(monthlyTickets);
            renderChart(monthlyTickets);

            // Recent tickets should probably show ALL recent tickets, not just this month's, 
            // but the user request specifically said "Card 1 and Card 2". 
            // Card 3 (Recent Tickets) usually implies global recent.
            // However, if the user wants "dashboard" to show data per month, maybe they mean everything?
            // The prompt said "on card 1 and card 2 showing data per month". 
            // So I will keep renderRecentTickets using the full 'tickets' list or maybe filtered?
            // "Recent" usually means "latest created", regardless of month, but let's stick to the prompt: "card 1 and card 2".
            // So Card 3 (Recent) remains untouched (using all tickets).
            renderRecentTickets(tickets);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    function updateStats(tickets) {
        const totalDone = tickets.filter(t => t.status === 'Selesai').length;
        const totalOnProgress = tickets.filter(t => t.status === 'Dikerjakan').length;
        const totalPending = tickets.filter(t => t.status === 'Pending' || t.status === 'Terlapor').length;
        const totalTickets = tickets.length;

        // Calculate New This Week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const newThisWeek = tickets.filter(t => new Date(t.createdAt) >= oneWeekAgo).length;

        // Calculate Completion Rate
        const completionRate = totalTickets > 0 ? Math.round((totalDone / totalTickets) * 100) : 0;

        // Update DOM
        document.getElementById('totalDone').textContent = totalDone;
        document.getElementById('totalOnProgress').textContent = totalOnProgress;
        document.getElementById('totalPending').textContent = totalPending;
        document.getElementById('totalTickets').textContent = totalTickets;

        document.getElementById('newThisWeek').textContent = newThisWeek;
        document.getElementById('completionRate').textContent = `${completionRate}%`;
        document.getElementById('completionBar').style.width = `${completionRate}%`;
    }

    let chartInstance = null;
    let currentChartType = 'bar'; // Default type

    function renderChart(tickets, groupBy = 'subNode') {
        const ctx = document.getElementById('ticketsChart').getContext('2d');

        // Aggregate data
        const counts = {};
        tickets.forEach(t => {
            const key = t[groupBy] || 'Unknown';
            counts[key] = (counts[key] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const data = Object.values(counts);

        // Find top category for summary
        let topCategory = '';
        let maxCount = 0;
        for (const [key, value] of Object.entries(counts)) {
            if (value > maxCount) {
                maxCount = value;
                topCategory = key;
            }
        }

        // Update Summary Text
        const summaryElement = document.getElementById('chartSummary');
        if (summaryElement) {
            if (maxCount > 0) {
                summaryElement.innerHTML = `Most tickets are in <strong>${topCategory}</strong> with <strong>${maxCount}</strong> tickets.`;
            } else {
                summaryElement.textContent = 'No data available for chart.';
            }
        }

        // Destroy existing chart if it exists
        if (chartInstance) {
            chartInstance.destroy();
        }

        // Update title suffix
        const suffixMap = {
            'subNode': 'Sub-Node',
            'odc': 'ODC',
            'aktifitas': 'Aktifitas'
        };
        const suffixElement = document.getElementById('chartTitleSuffix');
        if (suffixElement) {
            suffixElement.textContent = suffixMap[groupBy] || groupBy;
        }

        // Chart Config
        const chartConfig = {
            type: currentChartType,
            data: {
                labels: labels,
                datasets: [{
                    label: `Trend by ${suffixMap[groupBy]}`,
                    data: data,
                    backgroundColor: currentChartType === 'pie' ?
                        ['#DC2626', '#EA580C', '#D97706', '#65A30D', '#059669', '#0891B2', '#2563EB', '#7C3AED', '#DB2777'] :
                        'rgba(220, 38, 38, 0.8)',
                    borderColor: currentChartType === 'pie' ? '#ffffff' : 'rgba(220, 38, 38, 1)',
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

    // Event listener for chart grouping
    const chartSelect = document.getElementById('chartGroupBy');
    if (chartSelect) {
        chartSelect.addEventListener('change', (e) => {
            if (window.monthlyTickets) {
                renderChart(window.monthlyTickets, e.target.value);
            }
        });
    }

    // Chart Type Toggles
    const btnBar = document.getElementById('btnChartBar');
    const btnPie = document.getElementById('btnChartPie');

    if (btnBar && btnPie) {
        btnBar.addEventListener('click', () => {
            if (currentChartType !== 'bar') {
                currentChartType = 'bar';
                btnBar.classList.add('active');
                btnPie.classList.remove('active');
                if (window.monthlyTickets && chartSelect) {
                    renderChart(window.monthlyTickets, chartSelect.value);
                }
            }
        });

        btnPie.addEventListener('click', () => {
            if (currentChartType !== 'pie') {
                currentChartType = 'pie';
                btnPie.classList.add('active');
                btnBar.classList.remove('active');
                if (window.monthlyTickets && chartSelect) {
                    renderChart(window.monthlyTickets, chartSelect.value);
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
                link.download = 'chart-export.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            }
        });
    }

    // Search Functionality
    const searchInput = document.getElementById('ticketSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            if (window.currentTickets) {
                const filtered = window.currentTickets.filter(t =>
                    t.id.toString().includes(searchTerm) ||
                    t.aktifitas.toLowerCase().includes(searchTerm) ||
                    t.subNode.toLowerCase().includes(searchTerm)
                );
                renderRecentTickets(filtered);
            }
        });
    }

    function renderRecentTickets(tickets) {
        // Filter out 'Selesai' (Done) tickets
        tickets = tickets.filter(t => t.status !== 'Selesai');

        const recentList = document.getElementById('recentTicketsList');
        const emptyState = document.getElementById('emptyState');
        recentList.innerHTML = '';

        if (tickets.length === 0) {
            recentList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        recentList.classList.remove('hidden');
        emptyState.classList.add('hidden');

        // Sort by date desc and take top 10 (or all if filtered)
        // If searching, show all matches up to a limit? Let's keep it simple: top 10 of filtered.
        const recent = tickets.slice(0, 10);

        recent.forEach(ticket => {
            const li = document.createElement('li');
            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            // Status Icon Mapping
            let statusIcon = '';
            if (ticket.status === 'Selesai') statusIcon = '<i class="fas fa-check-circle"></i>';
            else if (ticket.status === 'Dikerjakan') statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
            else if (ticket.status === 'Pending') statusIcon = '<i class="fas fa-clock"></i>';
            else statusIcon = '<i class="fas fa-exclamation-circle"></i>';

            li.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="stat-icon" style="width: 32px; height: 32px; background: #f1f5f9; font-size: 0.9rem; color: var(--text-muted);">
                        <i class="fas fa-ticket-alt"></i>
                    </div>
                    <div>
                        <strong style="display: block; color: var(--text-main);">#${ticket.id} ${ticket.aktifitas}</strong>
                        <small style="color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                            <i class="far fa-building"></i> ${ticket.subNode} 
                            <span style="margin: 0 4px;">•</span> 
                            <i class="far fa-calendar-alt"></i> ${new Date(ticket.createdAt).toLocaleDateString()}
                        </small>
                    </div>
                </div>
                <span class="status-badge ${statusClass}" style="display: flex; align-items: center; gap: 5px;">
                    ${statusIcon} ${ticket.status}
                </span>
            `;
            li.onclick = () => window.location.href = `/ticket-details.html?id=${ticket.id}`;
            li.style.cursor = 'pointer';
            recentList.appendChild(li);
        });
    }

    fetchTickets();
    fetchActivities();
    fetchTeknisiUsers();

    async function fetchTeknisiUsers() {
        try {
            const response = await fetch('/users');
            if (!response.ok) throw new Error('Failed to fetch users');
            const users = await response.json();

            // Filter for Teknisi only
            const teknisiUsers = users.filter(u => u.role === 'Teknisi');

            const filterSelect = document.getElementById('activityUserFilter');
            if (filterSelect) {
                teknisiUsers.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.username;
                    option.textContent = user.username; // Or user.fullName if preferred
                    filterSelect.appendChild(option);
                });

                filterSelect.addEventListener('change', (e) => {
                    fetchActivities(e.target.value);
                });
            }
        } catch (error) {
            console.error('Error loading users for filter:', error);
        }
    }

    async function fetchActivities(username = '') {
        try {
            let url = '/activities';
            if (username) {
                url += `?username=${encodeURIComponent(username)}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch activities');
            const activities = await response.json();
            renderActivityLog(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
            document.getElementById('activityLogList').innerHTML = `<li class="p-4 text-center text-danger">Error loading activities</li>`;
        }
    }

    function renderActivityLog(activities) {
        const activityList = document.getElementById('activityLogList');
        if (!activities || activities.length === 0) {
            activityList.innerHTML = `<li class="p-4 text-center text-muted">No recent activity</li>`;
            return;
        }

        activityList.innerHTML = '';
        // Show top 10 activities
        const recentActivities = activities.slice(0, 10);

        recentActivities.forEach(activity => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display: flex; align-items: start; gap: 12px;">
                    <div class="stat-icon bg-info-light" style="width: 32px; height: 32px; font-size: 0.9rem;">
                        <i class="fas fa-user-clock text-info"></i>
                    </div>
                    <div>
                        <strong style="display: block; color: var(--text-main); font-size: 0.95rem;">${activity.description}</strong>
                         <small style="color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-user-circle"></i> ${activity.username}
                            <span style="margin: 0 4px;">•</span>
                            <i class="far fa-clock"></i> ${new Date(activity.date).toLocaleString()}
                        </small>
                    </div>
                </div>
            `;
            activityList.appendChild(li);
        });
    }
});
