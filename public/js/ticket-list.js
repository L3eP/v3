document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const tableBody = document.getElementById('ticketTableBody');
    const searchInput = document.getElementById('searchInput'); // New Search Input
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    const paginationControls = document.getElementById('paginationControls');

    let allTickets = [];
    let currentPage = 1;
    const itemsPerPage = 10;

    function renderTable(ticketsToRender) {
        if (ticketsToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;">No tickets found</td></tr>';
            return;
        }

        tableBody.innerHTML = ticketsToRender.map(ticket => {
            const date = new Date(ticket.createdAt).toLocaleDateString();

            const priorityClass = `priority-${ticket.priority.toLowerCase()}`;

            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            return `
                <tr>
                    <td>#${ticket.id}</td>
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

    function renderPagination(totalItems) {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (totalPages <= 1) return;

        // Previous Button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>`;
        prevLi.onclick = (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                filterTickets();
            }
        };
        paginationControls.appendChild(prevLi);

        // Page Numbers
        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.onclick = (e) => {
                e.preventDefault();
                currentPage = i;
                filterTickets();
            };
            paginationControls.appendChild(li);
        }

        // Next Button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>`;
        nextLi.onclick = (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentPage++;
                filterTickets();
            }
        };
        paginationControls.appendChild(nextLi);
    }

    function filterTickets() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = statusFilter.value;
        const priorityValue = priorityFilter.value;
        const startDateValue = startDateFilter.value ? new Date(startDateFilter.value) : null;
        const endDateValue = endDateFilter.value ? new Date(endDateFilter.value) : null;

        // Normalize end date to end of day
        if (endDateValue) {
            endDateValue.setHours(23, 59, 59, 999);
        }

        const filtered = allTickets.filter(ticket => {
            // Search Filter
            const matchesSearch = !searchTerm ||
                (ticket.id && ticket.id.toString().includes(searchTerm)) ||
                (ticket.aktifitas && ticket.aktifitas.toLowerCase().includes(searchTerm)) ||
                (ticket.subNode && ticket.subNode.toLowerCase().includes(searchTerm)) ||
                (ticket.odc && ticket.odc.toLowerCase().includes(searchTerm)) ||
                (ticket.lokasi && ticket.lokasi.toLowerCase().includes(searchTerm)) ||
                (ticket.pic && ticket.pic.toLowerCase().includes(searchTerm)) ||
                (ticket.info && ticket.info.toLowerCase().includes(searchTerm));

            const statusMatch = statusValue === 'All' || ticket.status === statusValue;
            const priorityMatch = priorityValue === 'All' || ticket.priority === priorityValue;

            let dateMatch = true;
            if (startDateValue || endDateValue) {
                const ticketDate = new Date(ticket.createdAt);
                if (startDateValue && ticketDate < startDateValue) dateMatch = false;
                if (endDateValue && ticketDate > endDateValue) dateMatch = false;
            }

            return matchesSearch && statusMatch && priorityMatch && dateMatch;
        });

        // Pagination Logic
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedTickets = filtered.slice(startIndex, endIndex);

        renderTable(paginatedTickets);
        renderPagination(filtered.length);

        return filtered; // Return full filtered list for export
    }

    // Sorting Logic
    let currentSort = { column: 'createdAt', direction: 'desc' }; // Default sort

    function sortTickets(tickets) {
        return tickets.sort((a, b) => {
            let valA = a[currentSort.column];
            let valB = b[currentSort.column];

            // Handle date sorting
            if (currentSort.column === 'createdAt') {
                valA = new Date(valA);
                valB = new Date(valB);
            }

            // Handle numeric sorting (ID)
            if (currentSort.column === 'id') {
                valA = parseInt(valA);
                valB = parseInt(valB);
            }

            // Handle string sorting (case insensitive)
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Update Filter Logic to include Sorting
    const originalFilterTickets = filterTickets;
    filterTickets = function () {
        const filtered = originalFilterTickets.apply(this, arguments);
        const sorted = sortTickets(filtered);

        // Re-paginate sorted results
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedTickets = sorted.slice(startIndex, endIndex);

        renderTable(paginatedTickets);
        renderPagination(sorted.length);
        updateSortIcons();

        return sorted;
    };

    function updateSortIcons() {
        document.querySelectorAll('th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            icon.style.opacity = '0.3';
        });

        const activeHeader = document.querySelector(`th[data-sort="${currentSort.column}"]`);
        if (activeHeader) {
            const icon = activeHeader.querySelector('i');
            icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
            icon.style.opacity = '1';
        }
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
            filterTickets();
        });
    });

    try {
        const response = await fetch('/tickets');
        allTickets = await response.json();

        filterTickets(); // Initial render with pagination

        // Event Listeners for Filters (Reset to page 1)
        const resetPagination = () => { currentPage = 1; filterTickets(); };
        searchInput.addEventListener('input', resetPagination);
        statusFilter.addEventListener('change', resetPagination);
        priorityFilter.addEventListener('change', resetPagination);
        startDateFilter.addEventListener('change', resetPagination);
        endDateFilter.addEventListener('change', resetPagination);

        // Export CSV
        exportCsvBtn.addEventListener('click', () => {
            const visibleTickets = filterTickets(); // Get all filtered tickets (not just current page)
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

            // Add BOM for Excel compatibility
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        });

        // Export PDF
        exportPdfBtn.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
            const visibleTickets = filterTickets();

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
                    1: { cellWidth: 30 }, // Aktifitas
                    9: { cellWidth: 'auto' } // Info
                }
            });

            doc.save(`tickets_export_${new Date().toISOString().split('T')[0]}.pdf`);
        });

    } catch (error) {
        console.error('Error fetching tickets:', error);
        tableBody.innerHTML = '<tr><td colspan="7" style="color: red; text-align: center;">Failed to load tickets</td></tr>';
    }
});
