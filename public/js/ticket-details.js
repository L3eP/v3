document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const isOwner = user.role === ROLES.OWNER;
    // Sembunyikan tombol delete untuk non-Owner
    if (!isOwner) {
        const delBtn = document.getElementById('deleteTicketBtn');
        if (delBtn) delBtn.style.display = 'none';
    }

    const urlParams = new URLSearchParams(window.location.search);
    const ticketId = urlParams.get('id');

    if (!ticketId) {
        window.location.href = 'ticket-list.html';
        return;
    }

    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editTicketForm');
    const editPicSelect = document.getElementById('editPic');

    let currentTicket = null;

    async function fetchTicketDetails() {
        // Show skeleton
        const detailTextEls = document.querySelectorAll('#ticketSubject, #ticketMeta, #ticketStatusBadge, #ticketPriority, #ticketSubNode, #ticketOdc, #ticketLokasi, #ticketPic, #ticketDescription');
        detailTextEls.forEach(el => el.classList.add('skeleton'));
        try {
            const response = await fetch(`/tickets/${ticketId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch ticket');
            }
            const ticket = await response.json();
            // Hide skeleton
            detailTextEls.forEach(el => el.classList.remove('skeleton'));
            currentTicket = ticket;

            document.getElementById('ticketSubject').textContent = ticket.aktifitas;
            document.getElementById('ticketMeta').textContent = `Created by ${ticket.createdBy} on ${new Date(ticket.createdAt).toLocaleString()}`;
            document.getElementById('ticketIdDisplay').textContent = formatId(ticket.id);

            const statusBadge = document.getElementById('ticketStatusBadge');
            statusBadge.textContent = ticket.status;
            statusBadge.className = `status-badge status-${ticket.status.toLowerCase()}`;

            const priorityBadge = document.getElementById('ticketPriority');
            priorityBadge.textContent = ticket.priority;
            priorityBadge.className = `priority-badge priority-${ticket.priority.toLowerCase()}`;

            document.getElementById('ticketSubNode').textContent = ticket.subNode || '-';
            document.getElementById('ticketOdc').textContent = ticket.odc || '-';
            document.getElementById('ticketLokasi').textContent = ticket.lokasi;
            document.getElementById('ticketPic').textContent = ticket.pic;
            document.getElementById('ticketDescription').textContent = ticket.info;

            const evidenceSection = document.getElementById('evidenceSection');
            const evidenceImg = document.getElementById('evidenceImage');
            if (ticket.evidence) {
                evidenceImg.src = ticket.evidence;
                evidenceSection.style.display = 'block';
            } else {
                evidenceSection.style.display = 'none';
            }

        } catch (error) {
            console.error('Error:', error);
            // Hide skeleton on error too
            const detailTextEls = document.querySelectorAll('#ticketSubject, #ticketMeta, #ticketStatusBadge, #ticketPriority, #ticketSubNode, #ticketOdc, #ticketLokasi, #ticketPic, #ticketDescription');
            detailTextEls.forEach(el => el.classList.remove('skeleton'));
            showModal('Error', 'Gagal memuat detail tiket. Coba lagi?', 'error', () => fetchTicketDetails());
        }
    }

    // Initial fetch
    fetchTicketDetails();
    fetchTicketHistory(ticketId);

    // Edit Button Logic
    const editBtn = document.getElementById('editTicketBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    let editReferences = {};
    let editFtth = {};
    let editPsbList = [];

    // Global handlers untuk HTML onchange
    window.onEditAktifitasChange = function() {
        const aktifitas = document.getElementById('editAktifitas').value.trim().toLowerCase();
        const wrap = document.getElementById('editPsbWrap');
        if (aktifitas === 'psb') {
            wrap.style.display = 'block';
        } else {
            wrap.style.display = 'none';
            document.getElementById('editPsbInfo').textContent = '';
        }
    };

    // preselectOdp: dipakai onEditPsbSelect() untuk auto-isi ODP setelah ganti ODC terprogram
    window.onEditOdcChange = function(preselectOdp) {
        const odpSel = document.getElementById('editOdp');
        const selectedOdc = document.getElementById('editOdc').value;
        odpSel.innerHTML = '<option value="">Pilih ODP</option>';
        // Dari ftth_devices, bukan reference_options — lihat catatan di
        // public/js/psb.js loadOdp().
        (editFtth.odp || [])
            .filter(item => item.group === selectedOdc)
            .forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                odpSel.appendChild(opt);
            });
        if (preselectOdp) odpSel.value = preselectOdp;
    };

    window.onEditPsbSelect = function() {
        const selectedId = document.getElementById('editPsbSelect').value;
        const psb = editPsbList.find(p => p.id == selectedId);
        if (psb) {
            document.getElementById('editLokasi').value = psb.address || '';

            // Auto-isi ODC & ODP dari data PSB — dipilih beneran di dropdown
            // terstruktur (bukan cuma disebut di teks info) supaya kolom
            // tickets.odc/odp ikut tersimpan. Sama seperti onPsbSelect() di
            // ticket-list.js (form Buat Tiket Baru).
            if (psb.odp_label) {
                const odpDevice = (editFtth.odp || []).find(o => o.label === psb.odp_label);
                if (odpDevice && odpDevice.group) {
                    document.getElementById('editOdc').value = odpDevice.group;
                    window.onEditOdcChange(psb.odp_label);
                }
            }

            const infoParts = [`PSB - ${psb.customer_name}`];
            if (psb.phone) infoParts.push(`Telp: ${psb.phone}`);
            if (psb.onu_sn) infoParts.push(`SN ONU: ${psb.onu_sn}`);
            if (psb.odp_label) infoParts.push(`ODP: ${psb.odp_label}`);
            if (psb.onu_port) infoParts.push(`Port: ${psb.onu_port}`);
            document.getElementById('editInfo').value = infoParts.join(' | ');
            document.getElementById('editPsbInfo').textContent = `📍 ${psb.customer_name}${psb.phone ? ' · ' + psb.phone : ''}${psb.onu_sn ? ' · SN: ' + psb.onu_sn : ''}`;
        }
    };

    window.onEditEvidenceChange = function() {
        const preview = document.getElementById('editEvidencePreview');
        const fileInput = document.getElementById('editEvidence');
        if (fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            preview.style.display = 'none';
        }
    };

    editBtn.addEventListener('click', async () => {
        if (!currentTicket) return;

        // Fetch references + ftth + users untuk dropdown
        try {
            const [refRes, ftthRes, usersRes] = await Promise.all([
                fetch('/api/references'),
                fetch('/api/ftth'),
                fetch('/users').catch(() => null)
            ]);
            editReferences = await refRes.json();
            // ODC/ODP HARUS dari /api/ftth (ftth_devices) — reference_options
            // menyimpan salinan lama yang tidak ikut ter-update lagi sejak
            // topologi FTTH dipisah ke tabelnya sendiri.
            const ftthJson = await ftthRes.json();
            editFtth = ftthJson.data || {};

            // Populate PIC dropdown (hanya jika fetch users berhasil)
            if (usersRes && usersRes.ok) {
                const users = await usersRes.json();
                if (Array.isArray(users)) {
                    editPicSelect.innerHTML = '<option value="">Select PIC</option>';
                    users.forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u.username;
                        opt.textContent = `${u.fullName || u.username} (${u.role})`;
                        editPicSelect.appendChild(opt);
                    });
                }
            }

            // Populate Aktifitas (select)
            const aktifitasSel = document.getElementById('editAktifitas');
            aktifitasSel.innerHTML = '<option value="">Pilih Aktifitas</option>';
            (editReferences.aktifitas || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                aktifitasSel.appendChild(opt);
            });

            // Populate Sub-Node
            const subNodeSelect = document.getElementById('editSubNode');
            subNodeSelect.innerHTML = '<option value="">Pilih Sub-Node</option>';
            (editReferences.sub_node || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                subNodeSelect.appendChild(opt);
            });

            // Populate ODC (grouped by group_name) — dari ftth_devices
            const odcSelect = document.getElementById('editOdc');
            odcSelect.innerHTML = '<option value="">Pilih ODC</option>';
            const grouped = {};
            (editFtth.odc || []).forEach(item => {
                const group = item.group || 'Lainnya';
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(item);
            });
            Object.keys(grouped).sort().forEach(group => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group;
                grouped[group].forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.label;
                    opt.textContent = item.label;
                    optgroup.appendChild(opt);
                });
                odcSelect.appendChild(optgroup);
            });

            // Populate ODP (kosong — diisi saat ODC berubah)
            const odpSel = document.getElementById('editOdp');
            odpSel.innerHTML = '<option value="">Pilih ODP</option>';

            // Populate Priority
            const prioritySelect = document.getElementById('editPriority');
            prioritySelect.innerHTML = '<option value="">Pilih Priority</option>';
            (editReferences.priority || []).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label;
                prioritySelect.appendChild(opt);
            });

            // Load PSB list for dropdown
            try {
                const r = await fetch('/api/psb');
                editPsbList = await r.json();
                const sel = document.getElementById('editPsbSelect');
                sel.innerHTML = '<option value="">— Pilih Pelanggan —</option>';
                editPsbList
                    .filter(p => p.status === 'Terdaftar')
                    .forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = `${p.customer_name} — ${p.address ? p.address.substring(0, 40) : ''}${p.onu_sn ? ' [SN:' + p.onu_sn + ']' : ''}`;
                        sel.appendChild(opt);
                    });
            } catch(e) {
                console.error('Error loading PSB:', e);
            }
        } catch (error) {
            console.error('Error fetching data for edit modal:', error);
        }

        // Populate form dengan data tiket saat ini — PASTI JALAN walau fetch user gagal
        document.getElementById('editAktifitas').value = currentTicket.aktifitas || '';
        document.getElementById('editSubNode').value = currentTicket.subNode || '';
        document.getElementById('editOdc').value = currentTicket.odc || '';
        // Trigger ODC change to populate ODP
        window.onEditOdcChange();
        document.getElementById('editOdp').value = currentTicket.odp || '';
        document.getElementById('editLokasi').value = currentTicket.lokasi || '';
        document.getElementById('editPriority').value = currentTicket.priority || '';
        document.getElementById('editStatus').value = currentTicket.status || '';
        document.getElementById('editInfo').value = currentTicket.info || '';

        // Pastikan PIC terisi — tambah opsi jika belum ada
        const picSel = document.getElementById('editPic');
        if (currentTicket.pic) {
            const exists = Array.from(picSel.options).some(o => o.value === currentTicket.pic);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = currentTicket.pic;
                opt.textContent = currentTicket.pic;
                picSel.appendChild(opt);
            }
            picSel.value = currentTicket.pic;
        }

        // Reset evidence preview
        document.getElementById('editEvidencePreview').style.display = 'none';
        document.getElementById('editEvidence').value = '';

        // Show/hide PSB section based on current aktifitas
        window.onEditAktifitasChange();

        editModal.classList.add('show');
    });

    cancelEditBtn.addEventListener('click', () => {
        editModal.classList.remove('show');
    });

    // Close modal on overlay click
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.classList.remove('show');
    });

    // Handle Update Submission
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const lokasi = document.getElementById('editLokasi').value.trim();
        // Verifikasi alamat sebelum simpan (ambang panjang > 5 karakter dihapus)
        if (lokasi) {
            const confirmed = await new Promise(resolve => {
                showConfirm(`Simpan perubahan untuk "${lokasi}"?`, () => resolve(true), () => resolve(false), { danger: false, confirmLabel: 'Ya, Simpan' });
            });
            if (!confirmed) return;
        }

        const submitBtn = editForm.querySelector('.login-btn');
        setLoading(submitBtn, true, 'Menyimpan...');

        const formData = new FormData(editForm);

        try {
            const response = await csrfFetch(`/tickets/${ticketId}/update`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                editModal.classList.remove('show');
                showToast('Ticket updated successfully!', 'success');
                // Refresh detail + timeline riwayat status (tanpa reload halaman)
                fetchTicketDetails();
                fetchTicketHistory(ticketId);
            } else {
                showModal('Error', result.message || 'Failed to update ticket', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showModal('Error', 'An error occurred while updating.', 'error');
        } finally {
            setLoading(submitBtn, false);
        }
    });

    // Delete Ticket Logic
    const deleteBtn = document.getElementById('deleteTicketBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showConfirm('Hapus tiket ini? Data akan diarsipkan.', deleteTicket, null, { danger: true, confirmLabel: 'Ya, Arsipkan' });
        });
    }

    async function deleteTicket() {
        try {
            const response = await csrfFetch(`/tickets/${ticketId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast('Ticket deleted successfully.', 'success');
                window.location.href = 'ticket-list.html';
            } else {
                const result = await response.json();
                showModal('Error', result.message || 'Failed to delete ticket', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showModal('Error', 'An error occurred while deleting.', 'error');
        }
    }
});

async function fetchTicketHistory(id) {
    try {
        const response = await fetch(`/tickets/${id}/history`);
        if (!response.ok) throw new Error('Failed to load history');
        const history = await response.json();

        const historyList = document.getElementById('statusHistoryList');
        if (history.length === 0) {
            historyList.innerHTML = '<li class="text-muted">No status changes recorded.</li>';
            return;
        }

        historyList.innerHTML = history.map(item => {
            const statusKey = (item.new_status || '').toLowerCase().replace(' ', '-');
            const tlClass = statusKey === 'selesai' ? 'tl-done'
                : statusKey === 'dikerjakan' ? 'tl-work'
                : statusKey === 'pending' ? 'tl-pending'
                : 'tl-new';
            return `
            <li class="${tlClass}">
                <div class="td-tl-title">
                    <span class="status-badge status-${statusKey}">${esc(item.new_status)}</span>
                    ${item.old_status ? `<span style="font-size:.8rem;color:var(--text-muted);"> ← ${esc(item.old_status)}</span>` : ''}
                </div>
                <div class="td-tl-sub">
                    <i class="far fa-clock"></i> ${new Date(item.changed_at).toLocaleString()}
                    &nbsp;•&nbsp; <i class="fas fa-user"></i> ${esc(item.full_name || item.changed_by)} (${esc(item.role)})
                </div>
            </li>
        `;
        }).join('');

    } catch (error) {
        console.error('Error fetching history:', error);
        document.getElementById('statusHistoryList').innerHTML = '<li class="text-danger">Gagal memuat history. <a href="#" onclick="fetchTicketHistory(' + id + ');return false;" style="color:#2563eb;text-decoration:underline;">Coba lagi</a></li>';
    }
}
