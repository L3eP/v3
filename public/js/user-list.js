document.addEventListener('DOMContentLoaded', async () => {
    const userTableBody = document.getElementById('userTableBody');
    const toast = document.getElementById('toast');

    // Check if privileged
    const currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser || (currentUser.role !== 'Owner' && currentUser.role !== 'Operator')) {
        window.location.href = 'dashboard';
        return;
    }

    let allUsers = [];

    async function fetchUsers() {
        try {
            const response = await fetch('/users');
            allUsers = await response.json();
            renderUsers(allUsers);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }

    function renderUsers(users) {
        userTableBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');

            const photoUrl = user.photo || 'https://via.placeholder.com/36';

            tr.innerHTML = `
                <td><img src="${photoUrl}" alt="${user.username}" class="user-photo-small"></td>
                <td>${user.fullName}</td>
                <td>${user.username}</td>
                <td>
                    <span class="role-badge">${user.role}</span>
                </td>
                <td>
                    ${currentUser.role === 'Owner' ? `<button class="btn-small btn-warning" onclick="window.location.href='edit-user?username=${user.username}'">Edit</button>` : ''}
                    ${currentUser.role === 'Owner' ? `<button class="btn-small btn-danger" onclick="deleteUser('${user.username}')">Delete</button>` : ''}
                </td>
            `;
            userTableBody.appendChild(tr);
        });
    }

    window.deleteUser = async (username) => {
        if (!confirm(`Are you sure you want to delete user ${username}?`)) return;

        try {
            const response = await fetch(`/users/${username}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast(`User ${username} deleted`);
                fetchUsers();
            } else {
                const data = await response.json();
                showToast(data.message || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Error deleting user');
        }
    };







    function showToast(message) {
        toast.textContent = message;
        toast.style.visibility = 'visible';
        setTimeout(() => {
            toast.style.visibility = 'hidden';
        }, 3000);
    }

    // Show Add User button for Owners
    const addUserBtn = document.getElementById('addUserBtn');
    if (currentUser.role === 'Owner' && addUserBtn) {
        addUserBtn.style.display = 'block';
    }

    // Add User Modal Logic
    const addUserModal = document.getElementById('addUserModal');
    const closeAddUserModal = document.getElementById('closeAddUserModal');
    const addUserForm = document.getElementById('addUserForm');

    if (addUserBtn && addUserModal) {
        addUserBtn.addEventListener('click', () => {
            addUserModal.classList.add('show');
        });

        closeAddUserModal.addEventListener('click', () => {
            addUserModal.classList.remove('show');
        });

        window.addEventListener('click', (e) => {
            if (e.target === addUserModal) {
                addUserModal.classList.remove('show');
            }
        });
    }

    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addUserForm);

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    showToast('User created successfully!');
                    addUserModal.classList.remove('show');
                    addUserForm.reset();
                    fetchUsers();
                } else {
                    showToast(data.message || 'Failed to create user');
                }
            } catch (error) {
                console.error('Error creating user:', error);
                showToast('Error creating user');
            }
        });
    }

    fetchUsers();
});
