document.addEventListener('DOMContentLoaded', async () => {
    const settingsForm = document.getElementById('settingsForm');

    // Populate form with current user data
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        document.getElementById('settingsUsername').value = user.username;
        document.getElementById('settingsFullName').value = user.fullName;
        if (user.phone) {
            document.getElementById('phone').value = user.phone;
        }
    } else {
        window.location.href = 'index.html';
    }

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validasi no. HP — blokir simpan kalau format salah
        const phoneValue = document.getElementById('phone').value.trim();
        if (phoneValue) {
            const phoneErr = validatePhone(phoneValue);
            if (phoneErr) {
                showModal('Error', phoneErr, 'error');
                document.getElementById('phone').focus();
                return;
            }
        }

        const formData = new FormData(settingsForm);
        formData.set('username', user.username);

        try {
            const profileResponse = await csrfFetch('/update-profile', {
                method: 'POST',
                body: formData
            });
            const profileData = await profileResponse.json();

            if (!profileResponse.ok) {
                showModal('Error', profileData.message, 'error');
                return;
            }

            localStorage.setItem('user', JSON.stringify(profileData.user));
            showModal('Success', 'Settings updated successfully', 'success', () => { window.location.reload(); });

        } catch (error) {
            console.error('Settings update error:', error);
            showModal('Error', 'An error occurred. Please try again.', 'error');
        }
    });
});
