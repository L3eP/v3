document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageModal = document.getElementById('messageModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalOkBtn = document.querySelector('.modal-ok-btn');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    let redirectUrl = null;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(registerForm);

        try {
            const response = await fetch('/register', {
                method: 'POST',
                body: formData // Fetch handles Content-Type for FormData automatically
            });

            const data = await response.json();

            if (response.ok) {
                // Check if current user is Owner (to prevent logout)
                const currentUser = JSON.parse(localStorage.getItem('user'));
                const isOwner = currentUser && currentUser.role === 'Owner';

                if (isOwner) {
                    // If Owner, show success and clear form, stay on page
                    showModal('Success', 'User created successfully!', null); // Using showModal instead of alert
                    registerForm.reset(); // Using registerForm.reset() instead of e.target.reset()
                } else {
                    // If regular user (self-registration), redirect to login
                    showModal('Success', data.message, 'index.html'); // Using showModal for redirection
                }
            } else {
                showModal('Error', data.message, null);
            }
        } catch (error) {
            showModal('Error', 'An error occurred. Please try again.', null);
        }
    });

    function showModal(title, message, redirect) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        if (title === 'Success') {
            modalTitle.style.color = '#10b981'; // Green
            modalOkBtn.style.backgroundColor = '#10b981';
        } else {
            modalTitle.style.color = '#ef4444'; // Red
            modalOkBtn.style.backgroundColor = '#ef4444';
        }

        messageModal.classList.add('show');
        redirectUrl = redirect;
    }

    function closeModal() {
        messageModal.classList.remove('show');
        if (redirectUrl) {
            window.location.href = redirectUrl;
        }
    }

    closeBtn.addEventListener('click', closeModal);
    modalOkBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            closeModal();
        }
    });
});
