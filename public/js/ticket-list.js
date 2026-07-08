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

    const paginationControls = document.getElementById('paginationControls');

    let allTickets = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    const itemsPerPage = 10;
    let isLoading = false;

    function renderTable(ticketsToRender) {
        if (ticketsToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;">No tickets found</td></tr>';
            return;
        }

        // Nomor urut: 1 = ticket tertua, N = ticket termuda
        // Karena sort DESC (terbaru di atas), hitung mundur dari total
        tableBody.innerHTML = ticketsToRender.map((ticket, idx) => {
            const rowNumber = totalItems - (currentPage - 1) * itemsPerPage - idx;
            const date = new Date(ticket.createdAt).toLocaleDateString();

            const priorityClass = `priority-${ticket.priority.toLowerCase()}`;

            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            return `
                <tr>
                    <td>${rowNumber}</td>
                    <td>${ticket.aktifitas}</td>
                    <td>${ticket.subNode || '-'}</td>
                    <td>${ticket.odc || '-'}</td>
                    <td>${ticket.lokasi}</td>
                    <td>${ticket.pic}</td>
                    <td><span class="priority-badge ${priorityClass}">${ticket.priority}</span></td>
                    <td><span class="status-badge ${statusClass}">${ticket.status}</span></td>
                    <td>${date}</td>
                    <td>
                        <a href="ticket-details.html?id=${ticket.id}" class="action-link">View</a>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderPagination() {
        paginationControls.innerHTML = '';

        if (totalPages <= 1) return;

        // Info text showing total items
        const infoLi = document.createElement('li');
        infoLi.className = 'page-item disabled';
        infoLi.innerHTML = `<a class="page-link" href="#">${totalItems} tickets</a>`;
        paginationControls.appendChild(infoLi);

        // Previous Button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>`;
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
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
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
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>`;
        nextLi.onclick = (e) => {
            e.preventDefault();
            if (currentPage < totalPages && !isLoading) {
                currentPage++;
                fetchTicketsPage();
            }
        };
        paginationControls.appendChild(nextLi);
    }

    function updateSortIcons() {
        document.querySelectorAll('th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            icon.style.opacity = '0.3';
        });

        const activeHeader = document.querySelector(`th[data-sort="${currentSort.column}"]`);
        if (activeHeader) {
            const icon = activeHeader.querySelector('i');
            icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
            icon.style.opacity = '1';
        }
    }

    async function fetchTicketsPage() {
        if (isLoading) return;
        isLoading = true;

        // Show loading state
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        }

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

            const response = await fetch(`/tickets?${params.toString()}`);
            const result = await response.json();

            // Backend returns paginated format
            if (result.data && result.pagination) {
                allTickets = result.data;
                totalItems = result.pagination.total;
                totalPages = result.pagination.totalPages;

                // Apply frontend sorting on current page data
                const sorted = sortTickets([...allTickets]);
                renderTable(sorted);
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
        } catch (error) {
            console.error('Error fetching tickets:', error);
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="10" style="color: red; text-align: center;">Failed to load tickets</td></tr>';
            }
        } finally {
            isLoading = false;
        }
    }

    // Export: fetch all tickets that match current filters for export
    async function fetchAllFilteredTicketsForExport() {
        try {
            let url = '/tickets';
            if (searchInput && searchInput.value.trim()) {
                url += `?search=${encodeURIComponent(searchInput.value.trim())}`;
            }
            const response = await fetch(url);
            const result = await response.json();

            // Can be paginated format or array
            let tickets = Array.isArray(result) ? result : (result.data || []);

            // Apply status/priority/date filters client-side
            const statusValue = statusFilter ? statusFilter.value : 'All';
            const priorityValue = priorityFilter ? priorityFilter.value : 'All';
            const startDateValue = startDateFilter && startDateFilter.value ? new Date(startDateFilter.value) : null;
            const endDateValue = endDateFilter && endDateFilter.value ? new Date(endDateFilter.value) : null;

            if (endDateValue) endDateValue.setHours(23, 59, 59, 999);

            return tickets.filter(ticket => {
                const statusMatch = statusValue === 'All' || ticket.status === statusValue;
                const priorityMatch = priorityValue === 'All' || ticket.priority === priorityValue;

                let dateMatch = true;
                if (startDateValue || endDateValue) {
                    const ticketDate = new Date(ticket.createdAt);
                    if (startDateValue && ticketDate < startDateValue) dateMatch = false;
                    if (endDateValue && ticketDate > endDateValue) dateMatch = false;
                }
                return statusMatch && priorityMatch && dateMatch;
            });
        } catch (error) {
            console.error('Error fetching for export:', error);
            return [];
        }
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
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : 1;
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

    // Initial load
    fetchTicketsPage();

    // Event Listeners for Filters (Reset to page 1 and re-fetch)
    const resetAndFetch = () => { currentPage = 1; fetchTicketsPage(); };
    if (searchInput) searchInput.addEventListener('input', resetAndFetch);
    if (statusFilter) statusFilter.addEventListener('change', resetAndFetch);
    if (priorityFilter) priorityFilter.addEventListener('change', resetAndFetch);
    if (startDateFilter) startDateFilter.addEventListener('change', resetAndFetch);
    if (endDateFilter) endDateFilter.addEventListener('change', resetAndFetch);

    // Export CSV
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            const visibleTickets = await fetchAllFilteredTicketsForExport();
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

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        });
    }

    // Export PDF
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const visibleTickets = await fetchAllFilteredTicketsForExport();

            doc.text('Ticket List Export', 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

            const tableData = visibleTickets.map(t => [
                t.id,
                t.aktifitas,
                t.subNode,
                t.odc,
                t.lokasi,
                t.pic,
                t.priority,
                t.status,
                t.createdBy,
                new Date(t.createdAt).toLocaleDateString(),
                (t.info || '').substring(0, 30) + (t.info && t.info.length > 30 ? '...' : '')
            ]);

            doc.autoTable({
                head: [['ID', 'Aktifitas', 'Sub-node', 'ODC', 'Lokasi', 'PIC', 'Priority', 'Status', 'Created By', 'Date', 'Info']],
                body: tableData,
                startY: 25,
                theme: 'grid',
                styles: { fontSize: 7 },
                headStyles: { fillColor: [75, 85, 99] },
                columnStyles: {
                    1: { cellWidth: 30 },
                    9: { cellWidth: 'auto' }
                }
            });

            doc.save(`tickets_export_${new Date().toISOString().split('T')[0]}.pdf`);
        });
    }

});
