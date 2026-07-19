document.addEventListener('DOMContentLoaded', () => {
    // Security: hanya Owner yang bisa akses halaman register
    const currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser || currentUser.role !== 'Owner') {
        window.location.href = 'dashboard.html';
        return;
    }

    const registerForm = document.getElementById('registerForm');
    const messageModal = document.getElementById('messageModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalOkBtn = document.querySelector('.modal-ok-btn');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(registerForm);

        try {
            const response = await csrfFetch('/register', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showModal('Success', 'User created successfully!');
                registerForm.reset();
            } else if (response.status === 401) {
                // Session expired — redirect ke login
                localStorage.removeItem('user');
                window.location.href = 'index.html';
            } else {
                showModal('Error', data.message || data.errors?.[0]?.msg || 'Failed to create user');
            }
        } catch (error) {
            showModal('Error', 'An error occurred. Please try again.');
        }
    });

    function showModal(title, message) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        if (title === 'Success') {
            modalTitle.style.color = '#10b981';
            modalOkBtn.style.backgroundColor = '#10b981';
        } else {
            modalTitle.style.color = '#ef4444';
            modalOkBtn.style.backgroundColor = '#ef4444';
        }

        messageModal.classList.add('show');
    }

    function closeModal() {
        messageModal.classList.remove('show');
    }

    closeBtn.addEventListener('click', closeModal);
    modalOkBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            closeModal();
        }
    });
});
