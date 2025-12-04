document.addEventListener('DOMContentLoaded', async () => {
    const settingsForm = document.getElementById('settingsForm');
    const messageModal = document.getElementById('messageModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalOkBtn = document.querySelector('.modal-ok-btn');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    // Populate form with current user data
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        document.getElementById('settingsUsername').value = user.username;
        document.getElementById('settingsFullName').value = user.fullName;
        if (user.phone) {
            document.getElementById('phone').value = user.phone;
        }

        // Handle Company Name and Logo (Owner only)
        if (user.role === 'Owner') {
            document.getElementById('companyNameGroup').style.display = 'block';
            document.getElementById('companyLogoGroup').style.display = 'block';
            try {
                const response = await fetch('/settings/company-name');
                const data = await response.json();
                if (data.companyName) {
                    document.getElementById('companyName').value = data.companyName;
                }
            } catch (error) {
                console.error('Error fetching company name:', error);
            }
        }
    } else {
        window.location.href = 'index.html';
    }

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(settingsForm);
        formData.set('username', user.username);

        // Remove companyLogo from profile update (it's handled separately and causes Multer error on /update-profile)
        formData.delete('companyLogo');

        try {
            // Update Profile
            const profileResponse = await fetch('/update-profile', {
                method: 'POST',
                body: formData
            });
            const profileData = await profileResponse.json();

            if (!profileResponse.ok) {
                showModal('Error', profileData.message);
                return;
            }

            // Update Company Name and Logo (if Owner)
            if (user.role === 'Owner') {
                const companyName = document.getElementById('companyName').value;
                const companyLogoFile = document.getElementById('companyLogo').files[0];

                // Update Name
                const settingsResponse = await fetch('/settings/company-name', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyName })
                });

                if (!settingsResponse.ok) {
                    const settingsData = await settingsResponse.json();
                    showModal('Warning', `Profile updated, but company name failed: ${settingsData.message}`);
                    return;
                }

                // Update Logo
                if (companyLogoFile) {
                    const logoFormData = new FormData();
                    logoFormData.append('logo', companyLogoFile);

                    const logoResponse = await fetch('/settings/company-logo', {
                        method: 'POST',
                        body: logoFormData
                    });

                    if (!logoResponse.ok) {
                        const logoData = await logoResponse.json();
                        showModal('Warning', `Profile/Name updated, but logo upload failed: ${logoData.message}`);
                        return;
                    }
                }
            }

            // Update localStorage with new user data
            localStorage.setItem('user', JSON.stringify(profileData.user));
            showModal('Success', 'Settings updated successfully');

        } catch (error) {
            console.error('Settings update error:', error);
            showModal('Error', 'An error occurred. Please try again.');
        }
    });

    function showModal(title, message) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        if (title === 'Success') {
            modalTitle.style.color = '#10b981';
            modalOkBtn.style.backgroundColor = '#10b981';
            modalOkBtn.onclick = () => {
                closeModal();
                window.location.reload(); // Reload to update navbar
            };
        } else {
            modalTitle.style.color = '#ef4444';
            modalOkBtn.style.backgroundColor = '#ef4444';
            modalOkBtn.onclick = closeModal;
        }

        messageModal.classList.add('show');
    }

    function closeModal() {
        messageModal.classList.remove('show');
    }

    closeBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            closeModal();
        }
    });
});
