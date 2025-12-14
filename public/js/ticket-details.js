document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const ticketId = urlParams.get('id');

    if (!ticketId) {
        window.location.href = 'ticket-list.html';
        return;
    }

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalOkBtn = document.getElementById('modalOkBtn');

    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editTicketForm');
    const editPicSelect = document.getElementById('editPic');

    function showModal(title, message, isSuccess = false) {
        modalTitle.textContent = title;
        modalTitle.style.color = isSuccess ? '#10b981' : '#ef4444';
        modalOkBtn.style.backgroundColor = isSuccess ? '#10b981' : '#ef4444';
        modalMessage.textContent = message;
        modal.classList.add('show');

        modalOkBtn.onclick = () => {
            modal.classList.remove('show');
            if (isSuccess) {
                fetchTicketDetails(); // Refresh details after successful update
            }
        };
    }

    let currentTicket = null;

    async function fetchTicketDetails() {
        try {
            const response = await fetch(`/tickets/${ticketId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch ticket');
            }
            const ticket = await response.json();
            currentTicket = ticket;

            document.getElementById('ticketSubject').textContent = ticket.aktifitas;
            document.getElementById('ticketMeta').textContent = `Created by ${ticket.createdBy} on ${new Date(ticket.createdAt).toLocaleString()}`;

            const statusBadge = document.getElementById('ticketStatusBadge');
            statusBadge.textContent = ticket.status;
            statusBadge.className = `status-badge status-${ticket.status.toLowerCase()}`;

            const priorityBadge = document.getElementById('ticketPriority');
            priorityBadge.textContent = ticket.priority;
            priorityBadge.className = `priority-badge priority-${ticket.priority.toLowerCase()}`;

            document.getElementById('ticketSubNode').textContent = ticket.subNode || '-';
            document.getElementById('ticketOdc').textContent = ticket.odc || '-';
            document.getElementById('ticketLokasi').textContent = ticket.lokasi;
            document.getElementById('ticketPic').textContent = ticket.pic;
            document.getElementById('ticketDescription').textContent = ticket.info;

            const evidenceSection = document.getElementById('evidenceSection');
            const evidenceImg = document.getElementById('evidenceImage');
            if (ticket.evidence) {
                evidenceImg.src = ticket.evidence;
                evidenceSection.style.display = 'block';
            } else {
                evidenceSection.style.display = 'none';
            }

        } catch (error) {
            console.error('Error:', error);
            showModal('Error', 'Failed to load ticket details.');
        }
    }

    // Initial fetch
    fetchTicketDetails();
    fetchTicketHistory(ticketId);

    // Edit Button Logic
    const editBtn = document.getElementById('editTicketBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    editBtn.addEventListener('click', async () => {
        if (!currentTicket) return;

        // Fetch users for PIC dropdown
        try {
            const response = await fetch('/users');
            const users = await response.json();
            editPicSelect.innerHTML = '';
            users.forEach(u => {
                const option = document.createElement('option');
                option.value = u.username;
                option.textContent = u.username; // Or u.fullName if available
                editPicSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching users:', error);
        }

        // Populate form
        document.getElementById('editAktifitas').value = currentTicket.aktifitas;
        document.getElementById('editSubNode').value = currentTicket.subNode;
        document.getElementById('editOdc').value = currentTicket.odc || '';
        document.getElementById('editLokasi').value = currentTicket.lokasi;
        document.getElementById('editPic').value = currentTicket.pic;
        document.getElementById('editPriority').value = currentTicket.priority;
        document.getElementById('editStatus').value = currentTicket.status;
        document.getElementById('editInfo').value = currentTicket.info;

        editModal.classList.add('show');
    });

    cancelEditBtn.addEventListener('click', () => {
        editModal.classList.remove('show');
    });

    // Handle Update Submission
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(editForm);
        // formData automatically captures all inputs with 'name' attributes
        // including the file input 'evidence'

        try {
            const response = await fetch(`/tickets/${ticketId}/update`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                editModal.classList.remove('show');
                showModal('Success', 'Ticket updated successfully!', true);
            } else {
                showModal('Error', result.message || 'Failed to update ticket');
            }
        } catch (error) {
            console.error('Error:', error);
            showModal('Error', 'An error occurred while updating.');
        }
    });

    // Delete Ticket Logic
    const deleteBtn = document.getElementById('deleteTicketBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
                deleteTicket();
            }
        });
    }

    async function deleteTicket() {
        try {
            const response = await fetch(`/tickets/${ticketId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Ticket deleted successfully.');
                window.location.href = 'ticket-list.html';
            } else {
                const result = await response.json();
                showModal('Error', result.message || 'Failed to delete ticket');
            }
        } catch (error) {
            console.error('Error:', error);
            showModal('Error', 'An error occurred while deleting.');
        }
    }
});

async function fetchTicketHistory(id) {
    try {
        const response = await fetch(`/tickets/${id}/history`);
        if (!response.ok) throw new Error('Failed to load history');
        const history = await response.json();

        const historyList = document.getElementById('statusHistoryList');
        if (history.length === 0) {
            historyList.innerHTML = '<li class=\"text-muted\">No status changes recorded.</li>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <li style=\"padding: 10px; border-bottom: 1px solid var(--border-color);\">
                <div style=\"display: flex; justify-content: space-between; align-items: center;\">
                    <div>
                        <span class=\"status-badge status-${item.new_status.toLowerCase()}\">${item.new_status}</span>
                        <span class=\"text-muted\" style=\"font-size: 0.85rem; margin-left: 8px;\">
                            from ${item.old_status || 'Unknown'}
                        </span>
                    </div>
                    <small class=\"text-muted\">${new Date(item.changed_at).toLocaleString()}</small>
                </div>
                <div style=\"margin-top: 4px; font-size: 0.9rem; color: var(--text-main);\">
                    by <strong>${item.full_name || item.changed_by}</strong> (${item.role})
                </div>
            </li>
        `).join('');

    } catch (error) {
        console.error('Error fetching history:', error);
        document.getElementById('statusHistoryList').innerHTML = '<li class=\"text-danger\">Error loading history.</li>';
    }
}
