document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const activityForm = document.getElementById('activityForm');
    const tableBody = document.getElementById('activityTableBody');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    // Modal elements
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalOkBtn = document.getElementById('modalOkBtn');

    let myActivities = [];

    function showModal(title, message, isError = false) {
        modalTitle.textContent = title;
        modalTitle.style.color = isError ? '#ef4444' : '#10b981';
        modalMessage.textContent = message;
        modalOkBtn.style.backgroundColor = isError ? '#ef4444' : '#10b981';
        modal.classList.add('show');
    }

    modalOkBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    function renderActivityList(activities) {
        const listContainer = document.getElementById('activityList');
        const emptyState = document.getElementById('emptyState');

        listContainer.innerHTML = '';

        if (activities.length === 0) {
            listContainer.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        listContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');

        // Sort by date descending
        const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));

        const isPrivileged = user.role === 'Owner' || user.role === 'Operator';

        sorted.forEach(activity => {
            const li = document.createElement('li');

            let deleteBtnHtml = '';
            if (isPrivileged) {
                deleteBtnHtml = `
                    <button class="btn-delete-activity" data-id="${activity.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 5px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
            }

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="stat-icon" style="width: 32px; height: 32px; background: #f1f5f9; font-size: 0.9rem; color: var(--text-muted);">
                            <i class="fas fa-history"></i>
                        </div>
                        <div>
                            <strong style="display: block; color: var(--text-main);">
                                ${activity.username ? `<span class="text-primary">${activity.username}</span>: ` : ''}${activity.description}
                            </strong>
                            <small style="color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                                <i class="far fa-calendar-alt"></i> ${new Date(activity.date).toLocaleString()}
                            </small>
                        </div>
                    </div>
                    ${deleteBtnHtml}
                </div>
            `;
            listContainer.appendChild(li);
        });

        // Add event listeners for delete buttons
        if (isPrivileged) {
            document.querySelectorAll('.btn-delete-activity').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this activity log?')) { // Simple confirm for now
                        await deleteActivity(id);
                    }
                });
            });
        }
    }

    async function deleteActivity(id) {
        try {
            const response = await fetch(`/activities/${id}`, { method: 'DELETE' });
            if (response.ok) {
                showModal('Success', 'Activity deleted successfully');
                fetchActivities(); // Refresh list
            } else {
                const res = await response.json();
                showModal('Error', res.message || 'Failed to delete activity', true);
            }
        } catch (error) {
            console.error('Error deleting activity:', error);
            showModal('Error', 'An error occurred while deleting', true);
        }
    }

    async function fetchActivities() {
        try {
            let url = '/activities';
            // If NOT privileged, filter by own username. 
            // If Privileged, fetch all (backend defaults to Teknisi logs if no username)
            if (user.role !== 'Owner' && user.role !== 'Operator') {
                url += `?username=${encodeURIComponent(user.username)}`;
            }

            const response = await fetch(url);
            myActivities = await response.json();
            renderActivityList(myActivities);
        } catch (error) {
            console.error('Error fetching activities:', error);
            showModal('Error', 'Failed to load activities', true);
        }
    }

    // Initial Fetch
    fetchActivities();

    // Form Submit
    activityForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const description = document.getElementById('activityDescription').value;

        try {
            const response = await fetch('/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description,
                    username: user.username
                })
            });

            if (response.ok) {
                showModal('Success', 'Activity logged successfully!');
                activityForm.reset();
                fetchActivities();
            } else {
                showModal('Error', 'Failed to log activity', true);
            }
        } catch (error) {
            console.error('Error logging activity:', error);
            showModal('Error', 'An error occurred', true);
        }
    });

    // Export CSV
    exportCsvBtn.addEventListener('click', () => {
        if (myActivities.length === 0) {
            showModal('Info', 'No activities to export', true);
            return;
        }

        const headers = ['Date & Time', 'Description'];
        const csvContent = [
            headers.join(','),
            ...myActivities.map(a => [
                `"${new Date(a.date).toLocaleString()}"`, // Escape date
                `"${(a.description || '').replace(/"/g, '""').replace(/\n/g, ' ')}"` // Escape description
            ].join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `my_activities_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    });

    // Export PDF
    exportPdfBtn.addEventListener('click', () => {
        if (myActivities.length === 0) {
            showModal('Info', 'No activities to export', true);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.text('My Activity Log', 14, 15);
        doc.setFontSize(10);
        doc.text(`User: ${user.fullName} (${user.username})`, 14, 22);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 27);

        const tableData = myActivities.map(a => [
            new Date(a.date).toLocaleString(),
            a.description
        ]);

        doc.autoTable({
            head: [['Date & Time', 'Description']],
            body: tableData,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [79, 70, 229] }, // Primary color
            columnStyles: {
                1: { cellWidth: 'auto' } // Description gets remaining space
            }
        });

        doc.save(`my_activities_${new Date().toISOString().split('T')[0]}.pdf`);
    });
});
