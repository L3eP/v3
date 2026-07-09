document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const form = document.getElementById('newTicketForm');
    const picSelect = document.getElementById('pic');
    const aktifitasSelect = document.getElementById('aktifitas');
    const subNodeSelect = document.getElementById('subNode');
    const odcSelect = document.getElementById('odc');
    const prioritySelect = document.getElementById('priority');

    // Simpan semua references
    let references = {};

    // Load references dari API
    async function loadReferences() {
        try {
            const res = await fetch('/api/references');
            references = await res.json();

            // Aktifitas — text input + datalist untuk saran
            setupAktifitasDatalist(references.aktifitas || []);

            // Populate Sub-Node
            populateSelect(subNodeSelect, references.sub_node || [], 'Pilih Sub-Node');

            // Populate Priority (tambah Urgent dari reference)
            populateSelect(prioritySelect, references.priority || [], 'Pilih Priority', false);

            // Populate ODC (akan diisi ulang saat sub-node berubah)
            updateOdcOptions('');

            // PIC dropdown
            await loadPicUsers();
        } catch (error) {
            console.error('Error loading references:', error);
            populateSelect(prioritySelect, [
                { label: 'Low' }, { label: 'Moderate' }, { label: 'Critical' }
            ], 'Pilih Priority', false);
            await loadPicUsers();
        }
    }

    function populateSelect(select, items, placeholder, showPlaceholder = true) {
        select.innerHTML = '';
        if (showPlaceholder) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = placeholder;
            select.appendChild(opt);
        }
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.label;
            opt.textContent = item.label;
            if (item.group) opt.dataset.group = item.group;
            select.appendChild(opt);
        });
    }

    function updateOdcOptions(selectedGroup) {
        const odcItems = references.odc || [];
        odcSelect.innerHTML = '<option value="">Pilih ODC</option>';

        // Group ODC berdasarkan group_name
        const grouped = {};
        odcItems.forEach(item => {
            const group = item.group || 'Lainnya';
            if (!grouped[group]) grouped[group] = [];
            grouped[group].push(item);
        });

        // Urutkan group
        const groupOrder = ['OLT JRG', 'OLT SKM', 'OLT HNM', 'OLT DMS', 'OLT HIOSO'];
        const sortedGroups = groupOrder.filter(g => grouped[g]);
        // Tambah group yang tidak ada di urutan
        Object.keys(grouped).forEach(g => {
            if (!sortedGroups.includes(g)) sortedGroups.push(g);
        });

        sortedGroups.forEach(group => {
            // Filter berdasarkan sub-node yang dipilih
            const items = grouped[group];
            if (selectedGroup && !group.toLowerCase().includes(selectedGroup.toLowerCase())) {
                // Tapi tetap tampilkan semua jika tidak ada filter
            }
            const optgroup = document.createElement('optgroup');
            optgroup.label = group;
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                optgroup.appendChild(opt);
            });
            odcSelect.appendChild(optgroup);
        });
    }

    async function loadPicUsers() {
        try {
            const response = await fetch('/users');
            if (response.ok) {
                const users = await response.json();
                users.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.username;
                    option.textContent = `${u.fullName} (${u.role})`;
                    picSelect.appendChild(option);
                });
            } else {
                // Fallback: hanya diri sendiri
                const option = document.createElement('option');
                option.value = user.username;
                option.textContent = user.fullName || user.username;
                picSelect.appendChild(option);
            }
        } catch (error) {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.fullName || user.username;
            picSelect.appendChild(option);
        }
    }

    function setupAktifitasDatalist(items) {
        // Hapus datalist lama jika ada
        const old = document.getElementById('aktifitasList');
        if (old) old.remove();

        const datalist = document.createElement('datalist');
        datalist.id = 'aktifitasList';
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.label;
            datalist.appendChild(opt);
        });
        aktifitasSelect.parentNode.appendChild(datalist);
        aktifitasSelect.setAttribute('list', 'aktifitasList');
    }

    // Filter ODC saat sub-node berubah
    subNodeSelect.addEventListener('change', () => {
        const selected = subNodeSelect.value;
        updateOdcOptions(selected);
    });

    // Filter ODP saat ODC berubah
    odcSelect.addEventListener('change', () => {
        const selectedOdc = odcSelect.value;
        const odpSelect = document.getElementById('odp');
        const odpItems = references.odp || [];
        odpSelect.innerHTML = '<option value="">Pilih ODP (opsional)</option>';
        odpItems
            .filter(item => item.group === selectedOdc)
            .forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                odpSelect.appendChild(opt);
            });
    });

    function setupOdpDropdown(items) {
        // Populate ODP jika ada ODC yang sudah terpilih
        if (odcSelect.value) {
            const event = new Event('change');
            odcSelect.dispatchEvent(event);
        }
    }

    // Submit form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.login-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        const formData = new FormData(form);
        formData.append('createdBy', user.username);

        try {
            const response = await fetch('/tickets', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                window.location.href = 'ticket-list.html';
            } else {
                const data = await response.json();
                showError(data.message || 'Failed to create ticket');
            }
        } catch (error) {
            showError('An error occurred');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Ticket';
        }
    });

    function showError(message) {
        const modal = document.getElementById('modal');
        if (modal) {
            document.getElementById('modalTitle').textContent = 'Error';
            document.getElementById('modalMessage').textContent = message;
            document.getElementById('modalOkBtn').style.backgroundColor = '#ef4444';
            modal.classList.add('show');
        } else {
            alert(message);
        }
    }

    // Modal OK button
    const modalOkBtn = document.getElementById('modalOkBtn');
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', () => {
            document.getElementById('modal').classList.remove('show');
        });
    }

    // Start
    await loadReferences();
});
