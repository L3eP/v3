document.addEventListener('DOMContentLoaded', async () => {
    const userTableBody = document.getElementById('userTableBody');
    initPasswordToggle('editPassword');
    initPasswordToggle('auPassword');

    // Avatar fallback lokal (data URI) — jangan placeholder pihak ketiga agar berfungsi offline.
    const DEFAULT_AVATAR = "data:image/svg+xml," + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>" +
        "<rect width='40' height='40' rx='20' fill='#e2e8f0'/>" +
        "<circle cx='20' cy='16' r='8' fill='#94a3b8'/>" +
        "<path d='M6 36a14 14 0 0 1 28 0z' fill='#94a3b8'/>" +
        "</svg>"
    );


    // Check if privileged
    const currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser || (currentUser.role !== ROLES.OWNER && currentUser.role !== ROLES.OPERATOR)) {
        window.location.href = 'dashboard.html';
        return;
    }

    let allUsers = [];

    // Wilayah (sub_node) untuk auto-PIC — dropdown edit user, sumbernya sama
    // dengan dropdown sub_node di form tiket (reference_options type=sub_node).
    async function loadSubNodeOptions() {
        const sel = document.getElementById('editDefaultSubNode');
        if (!sel) return;
        try {
            const r = await fetch('/api/references');
            const refs = await r.json();
            (refs.sub_node || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                sel.appendChild(opt);
            });
        } catch (e) { /* dropdown tetap bisa dipakai tanpa opsi tambahan */ }
    }
    loadSubNodeOptions();

    async function fetchUsers() {
        try {
            const response = await fetch('/users');

            if (response.status === 401 || response.status === 403) {
                window.location.href = 'dashboard.html';
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }

            const data = await response.json();

            if (Array.isArray(data)) {
                allUsers = data;
                renderUsers(allUsers);
            } else {
                console.error('Invalid user data received:', data);
                userTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading users. Data format invalid.</td></tr>';
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            userTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading users. Please try again.</td></tr>';
        }
    }

    function renderUsers(users) {
        userTableBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');

            const companyLogo = localStorage.getItem('companyLogo');
            const photoUrl = user.photo || companyLogo || DEFAULT_AVATAR;

            tr.className = 'table-row-card';
            tr.innerHTML = `
                <td data-label="Photo"><img src="${esc(photoUrl)}" alt="${esc(user.username)}" loading="lazy" class="user-photo"></td>
                <td data-label="Full Name"><strong>${esc(user.fullName)}</strong></td>
                <td data-label="Username">${esc(user.username)}</td>
                <td data-label="Role">
                    <span class="role-badge ${esc(String(user.role || '').toLowerCase())}">${esc(user.role)}</span>
                </td>
                <td data-label="Actions" class="table-actions-cell">
                    ${currentUser.role === ROLES.OWNER || currentUser.role === ROLES.OPERATOR ? `<button class="btn-small btn-warning" onclick="openEditModal('${esc(user.username)}')"><i class="fas fa-edit"></i> Edit</button>` : ''}
                    ${currentUser.role === ROLES.OWNER ? `<button class="btn-small btn-danger" onclick="deleteUser('${esc(user.username)}')"><i class="fas fa-trash"></i> Hapus</button>` : ''}
                </td>
            `;
            userTableBody.appendChild(tr);
        });
    }

    window.deleteUser = (username) => {
        showConfirm(`Hapus user "${username}"?`, () => doDelete(username));
    };

    async function doDelete(username) {
        try {
            const response = await csrfFetch(`/users/${username}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast(`User ${username} deleted`, 'success');
                fetchUsers();
            } else {
                const data = await response.json();
                showToast(data.message || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Error deleting user', 'error');
        }
    }







    fetchUsers();

    // ===== Add User =====
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserForm = document.getElementById('addUserForm');
    if (addUserBtn && addUserForm) {
        addUserBtn.addEventListener('click', () => {
            document.getElementById('addUserModal').classList.add('show');
        });
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('auFullName').value.trim();
            const username = document.getElementById('auUsername').value.trim();
            const password = document.getElementById('auPassword').value.trim();
            if (!fullName || !username || !password) { showToast('Nama, username, dan password wajib diisi', 'error'); return; }
            if (password.length < 6) { showToast('Password minimal 6 karakter', 'error'); return; }

            const formData = new FormData();
            formData.append('fullName', fullName);
            formData.append('username', username);
            formData.append('password', password);
            const phone = document.getElementById('auPhone').value.trim();
            if (phone) {
                const phoneErr = validatePhone(phone);
                if (phoneErr) {
                    showToast(phoneErr, 'error');
                    document.getElementById('auPhone').focus();
                    return;
                }
                formData.append('phone', phone);
            }
            formData.append('role', document.getElementById('auRole').value);
            const photo = document.getElementById('auPhoto').files[0];
            if (photo) formData.append('photo', photo);

            const btn = addUserForm.querySelector('.login-btn');
            setLoading(btn, true, 'Menyimpan...');
            try {
                const r = await csrfFetch('/register', { method: 'POST', body: formData });
                const data = await r.json();
                if (r.ok) {
                    showToast('User berhasil dibuat', 'success');
                    addUserForm.reset();
                    document.getElementById('addUserModal').classList.remove('show');
                    fetchUsers();
                } else {
                    showToast(data.message || (data.errors ? data.errors.map(e => e.msg).join(', ') : 'Gagal'), 'error');
                }
            } catch (e) { showToast('Error: ' + e.message, 'error'); }
            finally { setLoading(btn, false); }
        });
    }

    window.closeAddUserModal = () => {
        document.getElementById('addUserModal').classList.remove('show');
    };

    // ===== Search Users =====
    window.filterUsers = function() {
        const q = (document.getElementById('userSearch').value || '').toLowerCase().trim();
        const filtered = q ? allUsers.filter(u =>
            (u.fullName || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q) ||
            (u.role || '').toLowerCase().includes(q)
        ) : allUsers;
        renderUsers(filtered);
    };

    // ===== Edit User Modal =====
    window.openEditModal = async (username) => {
        try {
            const r = await fetch(`/users/${username}`);
            if (!r.ok) { showToast('Gagal load data user', 'error'); return; }
            const user = await r.json();

            document.getElementById('editOriginalUsername').value = user.username;
            document.getElementById('editUsername').value = user.username;
            document.getElementById('editFullName').value = user.fullName;
            document.getElementById('editPhone').value = user.phone || '';
            document.getElementById('editRole').value = user.role;
            document.getElementById('editDefaultSubNode').value = user.defaultSubNode || '';
            document.getElementById('editPassword').value = '';
            document.getElementById('editUserModal').classList.add('show');
        } catch (e) {
            showToast('Error loading user', 'error');
        }
    };

    window.closeEditModal = () => {
        document.getElementById('editUserModal').classList.remove('show');
    };

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalUsername = document.getElementById('editOriginalUsername').value;
        const fullName = document.getElementById('editFullName').value.trim();
        const phone = document.getElementById('editPhone').value.trim();
        // Validasi no. HP — blokir simpan kalau format salah
        if (phone) {
            const phoneErr = validatePhone(phone);
            if (phoneErr) {
                showToast(phoneErr, 'error');
                document.getElementById('editPhone').focus();
                return;
            }
        }
        const role = document.getElementById('editRole').value;
        const defaultSubNode = document.getElementById('editDefaultSubNode').value;
        const password = document.getElementById('editPassword').value;

        const updateData = { originalUsername, fullName, phone, role, defaultSubNode };
        if (password) updateData.password = password;

        try {
            const r = await csrfFetch('/admin/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (r.ok) {
                showToast('User updated successfully', 'success');
                closeEditModal();
                fetchUsers();
            } else {
                const d = await r.json();
                showToast(d.message || 'Failed to update user', 'error');
            }
        } catch (e) {
            showToast('Error updating user', 'error');
        }
    });
});
