document.addEventListener('DOMContentLoaded', async () => {
    const navbarContainer = document.getElementById('navbar');
    if (!navbarContainer) return;

    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const photoUrl = user.photo || 'https://via.placeholder.com/40';
    const isPrivileged = user.role === 'Owner' || user.role === 'Operator';
    const isOwner = user.role === 'Owner';
    const currentPath = window.location.pathname;
    const dashUrl = isPrivileged ? 'dashboard.html' : 'user-dashboard.html';

    // Struktur menu: 5 utama + sub-nav
    const MENU = [
        {
            icon: 'fa-tachometer-alt', label: 'Dashboard', href: dashUrl,
            roles: ['Owner', 'Operator', 'Teknisi'],
        },
        {
            icon: 'fa-ticket-alt', label: 'Tiket', key: 'tiket',
            roles: ['Owner', 'Operator', 'Teknisi'],
            sub: [
                { label: 'Ticket List', href: 'ticket-list.html', icon: 'fa-list-alt' },
                { label: 'New Ticket', href: 'new-ticket.html', icon: 'fa-plus-circle' },
            ],
        },
        {
            icon: 'fa-clipboard-list', label: 'Laporan', key: 'laporan',
            roles: ['Owner', 'Operator', 'Teknisi'],
            sub: [
                { label: 'Activity', href: 'activity.html', icon: 'fa-history' },
                { label: 'PSB', href: 'psb.html', icon: 'fa-file-alt' },
            ],
        },
        {
            icon: 'fa-network-wired', label: 'Jaringan', key: 'jaringan',
            roles: ['Owner', 'Operator', 'Teknisi'],
            sub: [
                { label: 'FTTH', href: 'ftth.html', icon: 'fa-project-diagram' },
                { label: 'Peta', href: 'map.html', icon: 'fa-map-marked-alt' },
            ],
        },
        {
            icon: 'fa-cogs', label: 'Panel', key: 'panel',
            roles: ['Owner', 'Operator'],
            sub: [
                { label: 'Users', href: 'user-list.html', icon: 'fa-users' },
                { label: 'Inventory', href: 'inventory.html', icon: 'fa-boxes' },
                ...(isOwner ? [{ label: 'Admin', href: 'admin.html', icon: 'fa-shield-alt' }] : []),
            ],
        },
    ];

    // Filter menu berdasarkan role
    const visibleMenu = MENU.filter(m =>
        m.roles.includes(user.role) && (!m.sub || m.sub.length > 0)
    );

    // Cari menu/sub yang aktif
    function isActive(item) {
        if (item.href && currentPath.includes(item.href.replace('.html', ''))) return true;
        if (item.sub) return item.sub.some(s => currentPath.includes(s.href.replace('.html', '')));
        return false;
    }

    // State expand
    const expandedKey = localStorage.getItem('navExpanded') || null;

    // Fetch Company Name and Logo
    let companyName = 'MAYUNG';
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

    // Render menu
    function renderNav() {
        return visibleMenu.map(m => {
            const active = isActive(m);
            const isExpanded = expandedKey === m.key;
            const hasSub = m.sub && m.sub.length > 0;

            if (hasSub) {
                return `
                    <div class="nav-group ${active ? 'active' : ''} ${isExpanded ? 'expanded' : ''}">
                        <a href="#" class="nav-link nav-parent" data-key="${m.key}">
                            <i class="fas ${m.icon}"></i>
                            <span>${m.label}</span>
                            <i class="fas fa-chevron-down nav-arrow" style="margin-left:auto;font-size:.7rem;transition:transform .2s;"></i>
                        </a>
                        <div class="nav-sub" style="${isExpanded ? 'display:block;' : 'display:none;'}">
                            ${m.sub.map(s => `
                                <a href="${s.href}" class="nav-link nav-sub-link ${currentPath.includes(s.href.replace('.html','')) ? 'active' : ''}">
                                    <i class="fas ${s.icon}" style="margin-left:28px;width:16px;"></i>
                                    <span>${s.label}</span>
                                </a>
                            `).join('')}
                        </div>
                    </div>`;
            }

            return `
                <a href="${m.href}" class="nav-link ${active ? 'active' : ''}">
                    <i class="fas ${m.icon}"></i>
                    <span>${m.label}</span>
                </a>`;
        }).join('');
    }

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
                    <button id="stopImpersonationBtn" style="width:100%;padding:8px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;">
                        <i class="fas fa-user-secret"></i> Stop Impersonating
                    </button>
                </div>
            ` : ''}

            <nav class="nav-links">
                ${renderNav()}
            </nav>

            <div class="sidebar-footer">
                <div class="user-profile" id="userProfile">
                    <img src="${photoUrl}" alt="Profile" class="profile-pic">
                    <div class="user-info">
                        <span class="username">${user.username}</span>
                        <span class="user-role">${user.role}</span>
                    </div>
                    <i class="fas fa-chevron-up" style="font-size:0.8rem;color:var(--text-muted);"></i>
                </div>

                <div class="dropdown-menu" id="dropdownMenu">
                    <a href="settings.html" class="dropdown-item">
                        <i class="fas fa-cog" style="width:20px;text-align:center;margin-right:8px;"></i> Settings
                    </a>
                    <a href="#" class="dropdown-item" id="logoutBtn">
                        <i class="fas fa-sign-out-alt" style="width:20px;text-align:center;margin-right:8px;"></i> Logout
                    </a>
                </div>
            </div>
        </div>`;

    navbarContainer.innerHTML = navbarHTML;

    // === Event handlers ===
    const sidebar = document.getElementById('sidebar');
    const userProfile = document.getElementById('userProfile');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    // Expand/collapse sub-nav
    document.querySelectorAll('.nav-parent').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const key = el.dataset.key;
            const group = el.closest('.nav-group');
            const sub = group.querySelector('.nav-sub');
            const isOpen = sub.style.display === 'block';

            // Tutup semua
            document.querySelectorAll('.nav-sub').forEach(s => s.style.display = 'none');
            document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('expanded'));

            // Buka yang diklik
            if (!isOpen) {
                sub.style.display = 'block';
                group.classList.add('expanded');
                localStorage.setItem('navExpanded', key);
            } else {
                localStorage.removeItem('navExpanded');
            }
        });
    });

    // Impersonation
    const stopBtn = document.getElementById('stopImpersonationBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            localStorage.removeItem('originalUser');
            location.reload();
        });
    }

    // Sidebar collapse
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    });

    // Mobile
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const toggleMobile = () => { sidebar.classList.toggle('open'); sidebarOverlay.classList.toggle('show'); };
    if (mobileToggle) mobileToggle.addEventListener('click', toggleMobile);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleMobile);

    // User dropdown
    userProfile.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('show'); });
    window.addEventListener('click', () => dropdownMenu.classList.remove('show'));

    // Logout
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await fetch('/logout', { method: 'POST' }); } catch (err) {}
        localStorage.removeItem('user');
        localStorage.removeItem('originalUser');
        window.location.href = 'index.html';
    });

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.warn('SW registration failed:', err.message));
        });
    }
});
