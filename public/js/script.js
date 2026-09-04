document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    initPasswordToggle('password');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await csrfFetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = data.redirect;
            } else {
                showModal('Login Failed', data.message, 'error');
            }
        } catch (error) {
            showModal('Login Failed', 'An error occurred. Please try again.', 'error');
        }
    });
});
