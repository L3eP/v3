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
            renderRecentTickets(tickets, user);
        } catch (error) {
            console.error('Error loading tickets:', error);
        }
    }

    async function fetchActivities() {
        try {
            const response = await fetch(`/activities?username=${encodeURIComponent(user.username)}`);
            const activities = await response.json();
            renderRecentActivity(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }

    function renderRecentTickets(tickets, user) {
        const recentList = document.getElementById('recentTicketsList');
        recentList.innerHTML = '';

        // Show all tickets (no filtering by user)
        const recent = tickets.slice(0, 10);

        if (recent.length === 0) {
            recentList.innerHTML = '<li class="list-group-item text-center text-muted">No recent tickets found.</li>';
            return;
        }

        recent.forEach(ticket => {
            const li = document.createElement('li');
            // li.className is handled by CSS selector .activity-list li

            const statusClass = `status-${ticket.status.toLowerCase().replace(' ', '-')}`;

            li.innerHTML = `
                <div>
                    <strong>#${ticket.id} ${ticket.aktifitas}</strong>
                    <br>
                    <small style="color: var(--text-muted);">${ticket.subNode} - ${new Date(ticket.createdAt).toLocaleDateString()}</small>
                </div>
                <span class="status-badge ${statusClass}">${ticket.status}</span>
            `;
            li.onclick = () => window.location.href = `/ticket-details.html?id=${ticket.id}`;
            li.style.cursor = 'pointer';
            recentList.appendChild(li);
        });
    }

    function renderRecentActivity(activities) {
        const activityList = document.getElementById('recentActivityList');
        activityList.innerHTML = '';

        const recent = activities.slice(0, 10);

        if (recent.length === 0) {
            activityList.innerHTML = '<li style="padding: 15px; text-align: center; color: var(--text-muted);">No recent activity.</li>';
            return;
        }

        recent.forEach(activity => {
            const li = document.createElement('li');
            // li.className handled by CSS
            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <h6 style="margin: 0; font-size: 0.95rem;">${activity.description}</h6>
                    <small style="color: var(--text-muted);">${new Date(activity.date).toLocaleString()}</small>
                </div>
            `;
            activityList.appendChild(li);
        });
    }

    fetchTickets();
    fetchActivities();
});
