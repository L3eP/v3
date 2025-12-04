document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorModal = document.getElementById('errorModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalOkBtn = document.querySelector('.modal-ok-btn');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Scenario 2: Login Successful
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = data.redirect;
            } else {
                // Scenario 1: Login Failed
                showError(data.message);
            }
        } catch (error) {
            showError('An error occurred. Please try again.');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorModal.classList.add('show');
    }

    function closeModal() {
        errorModal.classList.remove('show');
    }

    closeBtn.addEventListener('click', closeModal);
    modalOkBtn.addEventListener('click', closeModal);

    // Close modal if clicking outside of it
    window.addEventListener('click', (e) => {
        if (e.target === errorModal) {
            closeModal();
        }
    });
});
