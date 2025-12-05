document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const form = document.getElementById('newTicketForm');
    const picSelect = document.getElementById('pic');

    // Fetch users to populate PIC dropdown
    try {
        const response = await fetch('/users');
        if (response.ok) {
            const users = await response.json();
            users.forEach(u => {
                const option = document.createElement('option');
                option.value = u.username;
                option.textContent = u.fullName;
                picSelect.appendChild(option);
            });
        } else {
            // Non-admin fallback: only self
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.fullName || user.username;
            picSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        // Fallback
        const option = document.createElement('option');
        option.value = user.username;
        option.textContent = user.fullName || user.username;
        picSelect.appendChild(option);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        formData.append('createdBy', user.username);

        try {
            const response = await fetch('/tickets', {
                method: 'POST',
                body: formData // Send as FormData to handle file upload
            });

            if (response.ok) {
                window.location.href = 'ticket-list.html';
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to create ticket');
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            alert('An error occurred');
        }
    });
});
