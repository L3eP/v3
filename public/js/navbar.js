document.addEventListener('DOMContentLoaded', async () => {
    const navbarContainer = document.getElementById('navbar');
    if (!navbarContainer) return;

    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        // Not logged in, redirect to login
        window.location.href = 'index.html';
        return;
    }

    const photoUrl = user.photo || 'https://via.placeholder.com/40';
    const isPrivileged = user && (user.role === 'Owner' || user.role === 'Operator');
    const isOwner = user && user.role === 'Owner';
    const currentPage = window.location.pathname;

    // Fetch Company Name and Logo
    let companyName = 'Acme Corp';
    let companyLogo = null;
    try {
        const [nameRes, logoRes] = await Promise.all([
            fetch('/settings/company-name'),
            fetch('/settings/company-logo')
        ]);

        const nameData = await nameRes.json();
        if (nameData.companyName) companyName = nameData.companyName;

        const logoData = await logoRes.json();
        if (logoData.logoUrl) companyLogo = logoData.logoUrl;

    } catch (error) {
        console.error('Error fetching company settings:', error);
    }

    const logoHTML = companyLogo
        ? `<img src="${companyLogo}" alt="Logo" style="height: 45px; margin-right: 10px; vertical-align: middle;">`
        : `<i class="fas fa-cube"></i>`;

    const navbarHTML = `
        <div class="sidebar-overlay" id="sidebarOverlay"></div>
        <button id="mobileToggle" class="mobile-toggle-btn">
            <i class="fas fa-bars"></i>
        </button>

        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="company-logo" id="companyLogoContainer">
                    ${logoHTML} <span id="navCompanyName" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${companyName}</span>
                </div>
                <button id="sidebarToggle" class="sidebar-toggle">
                    <i class="fas fa-bars"></i>
                </button>
            </div>
            
            ${localStorage.getItem('originalUser') ? `
                <div style="padding: 0 20px; margin-bottom: 10px;">
                    <button id="stopImpersonationBtn" style="width: 100%; padding: 8px; background-color: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                        <i class="fas fa-user-secret"></i> Stop Impersonating
                    </button>
                </div>
            ` : ''}
            
            <nav class="nav-links">
                <a href="${(user.role === 'Owner' || user.role === 'Operator') ? 'dashboard.html' : 'user-dashboard.html'}" class="nav-link ${currentPage.includes('dashboard') ? 'active' : ''}">
                    <i class="fas fa-tachometer-alt"></i> <span>Dashboard</span>
                </a>
                
                <a href="ticket-list.html" class="nav-link ${currentPage.includes('ticket-list') ? 'active' : ''}">
                    <i class="fas fa-list-alt"></i> <span>Tickets</span>
                </a>

                
                <a href="activity.html" class="nav-link ${currentPage.includes('activity') ? 'active' : ''}">
                    <i class="fas fa-history"></i> <span>Activity</span>
                </a>

                ${isPrivileged ? `
                    <a href="user-list.html" class="nav-link ${currentPage.includes('user-list') ? 'active' : ''}">
                        <i class="fas fa-users"></i> <span>Users</span>
                    </a>
                ` : ''}
            </nav>

            <div class="sidebar-footer">
                <div class="user-profile" id="userProfile">
                    <img src="${photoUrl}" alt="Profile" class="profile-pic">
                    <div class="user-info">
                        <span class="username">${user.username}</span>
                        <span class="user-role">${user.role}</span>
                    </div>
                    <i class="fas fa-chevron-up" style="font-size: 0.8rem; color: var(--text-muted);"></i>
                </div>
                
                <div class="dropdown-menu" id="dropdownMenu">
                    <a href="settings.html" class="dropdown-item">
                        <i class="fas fa-cog" style="width: 20px; text-align: center; margin-right: 8px;"></i> Settings
                    </a>
                    <a href="#" class="dropdown-item" id="logoutBtn">
                        <i class="fas fa-sign-out-alt" style="width: 20px; text-align: center; margin-right: 8px;"></i> Logout
                    </a>
                </div>
            </div>
        </div>
    `;

    navbarContainer.innerHTML = navbarHTML;

    // Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Auto-resize Header Layout (Name and Logo)
    function adjustHeaderLayout() {
        const container = document.getElementById('companyLogoContainer');
        const nameSpan = document.getElementById('navCompanyName');
        const logoImg = container ? container.querySelector('img') : null;
        const logoIcon = container ? container.querySelector('i') : null;

        if (!container || !nameSpan) return;

        // Reset sizes to start fresh
        nameSpan.style.fontSize = '1.25rem';
        if (logoImg) logoImg.style.height = '45px';
        if (logoIcon) logoIcon.style.fontSize = '1.25rem';

        // If sidebar is collapsed, don't resize
        if (document.getElementById('sidebar').classList.contains('collapsed')) return;

        let fontSize = 1.25;
        const minFontSize = 0.8;
        const step = 0.05;

        // Shrink Text First
        while (nameSpan.scrollWidth > nameSpan.clientWidth && fontSize > minFontSize) {
            fontSize -= step;
            nameSpan.style.fontSize = `${fontSize}rem`;
        }

        // If still overflowing (or if we want to be safer about total width), check container overflow
        // Note: flexbox usually handles this by shrinking items, but we want to avoid truncation if possible by shrinking size.
        // However, nameSpan.scrollWidth > clientWidth checks if the text itself is overflowing its box.
        // If the text is at min size and still overflowing, we can try shrinking the logo.

        if (nameSpan.scrollWidth > nameSpan.clientWidth) {
            let logoSize = 45; // px for img, or relative for icon
            const minLogoSize = 20;

            while (nameSpan.scrollWidth > nameSpan.clientWidth && logoSize > minLogoSize) {
                logoSize -= 2;
                if (logoImg) logoImg.style.height = `${logoSize}px`;
                if (logoIcon) logoIcon.style.fontSize = `${logoSize / 16}rem`; // approx conversion
            }
        }
    }

    // Call initially and on resize
    adjustHeaderLayout();
    window.addEventListener('resize', adjustHeaderLayout);

    // Also call when sidebar toggle changes state
    sidebarToggle.addEventListener('click', () => {
        setTimeout(adjustHeaderLayout, 300);
    });
    const userProfile = document.getElementById('userProfile');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    // Sidebar Collapse Logic (Desktop)
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    });

    // Mobile Toggle Logic
    const toggleMobileSidebar = () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('show');
    };

    if (mobileToggle) {
        mobileToggle.addEventListener('click', toggleMobileSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', toggleMobileSidebar);
    }

    // Dropdown Logic
    userProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    window.addEventListener('click', () => {
        if (dropdownMenu.classList.contains('show')) {
            dropdownMenu.classList.remove('show');
        }
    });

    // Logout Logic
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('user');
        localStorage.removeItem('originalUser');
        window.location.href = 'index.html';
    });

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }
});
