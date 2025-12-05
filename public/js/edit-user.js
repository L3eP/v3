document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const usernameToEdit = urlParams.get('username');
    const toast = document.getElementById('toast');

    if (!usernameToEdit) {
        window.location.href = 'user-list';
        return;
    }

    // Check if Owner
    const currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser || currentUser.role.trim() !== 'Owner') {
        window.location.href = 'dashboard';
        return;
    }

    // Fetch user details
    try {
        const response = await fetch(`/users/${usernameToEdit}`);
        if (!response.ok) {
            throw new Error('User not found');
        }
        const user = await response.json();

        document.getElementById('originalUsername').value = user.username;
        document.getElementById('username').value = user.username;
        document.getElementById('fullName').value = user.fullName;
        document.getElementById('phone').value = user.phone || '';
        document.getElementById('role').value = user.role;

    } catch (error) {
        console.error('Error fetching user details:', error);
        showToast('Error loading user details');
        setTimeout(() => window.location.href = 'user-list', 2000);
    }

    // Handle Form Submission
    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const originalUsername = document.getElementById('originalUsername').value;
        const fullName = document.getElementById('fullName').value;
        const phone = document.getElementById('phone').value;
        const role = document.getElementById('role').value;
        const password = document.getElementById('password').value;

        const updateData = {
            originalUsername,
            fullName,
            phone,
            role
        };

        if (password) {
            updateData.password = password;
        }

        try {
            const response = await fetch('/admin/users/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                showToast('User updated successfully');
                setTimeout(() => {
                    window.location.href = 'user-list';
                }, 1500);
            } else {
                const data = await response.json();
                showToast(data.message || 'Failed to update user');
            }
        } catch (error) {
            console.error('Error updating user:', error);
            showToast('Error updating user');
        }
    });

    function showToast(message) {
        toast.textContent = message;
        toast.style.visibility = 'visible';
        setTimeout(() => {
            toast.style.visibility = 'hidden';
        }, 3000);
    }
});
