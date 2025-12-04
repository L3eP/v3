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

    function renderTable(activities) {
        if (activities.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px;">No activities found</td></tr>';
            return;
        }

        // Sort by date descending
        const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));

        tableBody.innerHTML = sorted.map(activity => `
            <tr>
                <td>${new Date(activity.date).toLocaleString()}</td>
                <td>${activity.description}</td>
            </tr>
        `).join('');
    }

    async function fetchActivities() {
        try {
            const response = await fetch(`/activities?username=${encodeURIComponent(user.username)}`);
            myActivities = await response.json();
            renderTable(myActivities);
        } catch (error) {
            console.error('Error fetching activities:', error);
            tableBody.innerHTML = '<tr><td colspan="3" style="color: red; text-align: center;">Failed to load activities</td></tr>';
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
