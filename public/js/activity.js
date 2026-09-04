document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const activityForm = document.getElementById("activityForm");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportPdfBtn = document.getElementById("exportPdfBtn");

  let allTickets = [];
  let myActivities = [];
  const ACTIVITIES_PER_PAGE = 10;
  let currentPage = 1;

  function renderActivityList(activities) {
    const listContainer = document.getElementById("activityList");
    const emptyState = document.getElementById("emptyState");

    listContainer.innerHTML = "";

    if (activities.length === 0) {
      listContainer.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }

    listContainer.classList.remove("hidden");
    emptyState.classList.add("hidden");

    // Sort by date descending
    const sorted = [...activities].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );

    if (sorted.length === 0) {
      listContainer.classList.add("hidden");
      emptyState.classList.remove("hidden");
      renderPagination(0);
      return;
    }

    // Pagination client-side: data utuh, tampilan dibatasi per halaman
    const totalPages = Math.ceil(sorted.length / ACTIVITIES_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex = (currentPage - 1) * ACTIVITIES_PER_PAGE;
    const pageItems = sorted.slice(startIndex, startIndex + ACTIVITIES_PER_PAGE);

    const isPrivileged = user.role === ROLES.OWNER || user.role === ROLES.OPERATOR;
    const isOwner = user.role === ROLES.OWNER;

    pageItems.forEach((activity) => {
      const li = document.createElement("li");

      let deleteBtnHtml = "";
      if (isOwner) {
        deleteBtnHtml = `
                    <button class="btn-delete-activity" data-id="${activity.id}" title="Hapus aktivitas" aria-label="Hapus aktivitas">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
      }

      li.innerHTML = `
                <div class="dash-item-row-start spread">
                    <div class="dash-item-row">
                        <div class="dash-item-icon">
                            <i class="fas fa-history"></i>
                        </div>
                        <div>
                            <strong class="dash-item-title">
                                ${activity.username ? `<span class="text-primary">${esc(activity.username)}</span>: ` : ""}${esc(activity.description)}
                            </strong>
                            <small class="dash-item-meta">
                                <i class="far fa-calendar-alt"></i> ${new Date(activity.date).toLocaleString()}
                            </small>
                        </div>
                    </div>
                    ${deleteBtnHtml}
                </div>
            `;
      listContainer.appendChild(li);
    });

    // Add event listeners for delete buttons
    if (isOwner) {
      document.querySelectorAll(".btn-delete-activity").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = e.currentTarget.getAttribute("data-id");
          showConfirm("Are you sure you want to delete this activity log?", () => deleteActivity(id));
        });
      });
    }

    renderPagination(sorted.length);
  }

  // Kontrol pagination (markup sama dengan ticket-list: ul.pagination > li.page-item > a.page-link)
  function renderPagination(total) {
    const controls = document.getElementById("activityPagination");
    controls.innerHTML = "";
    if (!total) return;

    const totalPages = Math.max(1, Math.ceil(total / ACTIVITIES_PER_PAGE));
    if (totalPages <= 1) return;

    // Info jumlah
    const info = document.createElement("li");
    info.className = "page-item disabled";
    info.innerHTML = `<a class="page-link" href="#">${total} aktivitas</a>`;
    controls.appendChild(info);

    // Tombol sebelumnya
    const prev = document.createElement("li");
    prev.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
    prev.innerHTML = `<a class="page-link" href="#" aria-label="Sebelumnya"><span aria-hidden="true">&laquo;</span></a>`;
    prev.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      if (currentPage > 1) {
        currentPage--;
        goToPage();
      }
    });
    controls.appendChild(prev);

    // Nomor halaman (maks 7 tombol)
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    for (let i = startPage; i <= endPage; i++) {
      const li = document.createElement("li");
      li.className = `page-item ${i === currentPage ? "active" : ""}`;
      li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      li.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        if (i !== currentPage) {
          currentPage = i;
          goToPage();
        }
      });
      controls.appendChild(li);
    }

    // Tombol berikutnya
    const next = document.createElement("li");
    next.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
    next.innerHTML = `<a class="page-link" href="#" aria-label="Berikutnya"><span aria-hidden="true">&raquo;</span></a>`;
    next.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      if (currentPage < totalPages) {
        currentPage++;
        goToPage();
      }
    });
    controls.appendChild(next);
  }

  // Pindah halaman: render ulang + gulir ke daftar agar nyaman di mobile
  function goToPage() {
    renderActivityList(filterActivities());
    document.querySelector(".activity-list-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function deleteActivity(id) {
    try {
      const response = await csrfFetch(`/activities/${id}`, { method: "DELETE" });
      if (response.ok) {
        showModal("Success", "Activity deleted successfully", "success");
        fetchActivities(); // Refresh list
      } else {
        const res = await response.json();
        showModal("Error", res.message || "Failed to delete activity", "error");
      }
    } catch (error) {
      console.error("Error deleting activity:", error);
      showModal("Error", "An error occurred while deleting", "error");
    }
  }

  async function fetchActivities() {
    try {
      let url = "/activities";
      // If NOT privileged, filter by own username.
      // If Privileged, fetch all (backend defaults to Teknisi logs if no username)
      if (user.role !== ROLES.OWNER && user.role !== ROLES.OPERATOR) {
        url += `?username=${encodeURIComponent(user.username)}`;
      }

      const response = await fetch(url);
      myActivities = await response.json();
      renderActivityList(myActivities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      showModal("Error", "Failed to load activities", "error");
    }
  }

  // Initial Fetch
  fetchActivities();

  // Form Submit
  activityForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const description = document.getElementById("activityDescription").value;
    const ticketId = document.getElementById("ticket_id").value || "";

    try {
      const response = await csrfFetch("/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          username: user.username,
          ticket_id: ticketId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const msg = data.autoTransition
          ? `Activity logged! Tiket #${data.autoTransition.ticketId} otomatis dimulai (${data.autoTransition.oldStatus} → Dikerjakan).`
          : "Activity logged successfully!";
        showModal("Success", msg, "success");
        activityForm.reset();
        fetchActivities();
      } else {
        showModal("Error", "Failed to log activity", "error");
      }
    } catch (error) {
      console.error("Error logging activity:", error);
      showModal("Error", "An error occurred", "error");
    }
  });

  // Export CSV
  exportCsvBtn.addEventListener("click", () => {
    const filtered = filterActivities();
    if (filtered.length === 0) {
      showModal("Info", "No activities to export", "info");
      return;
    }

    const headers = ["Date & Time", "Ticket", "Description"];
    const csvContent = [
      headers.join(","),
      ...filtered.map((a) =>
        [
          `"${new Date(a.date).toLocaleString()}"`,
          `"${(a.aktifitas || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
          `"${(a.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `my_activities_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  });

  // Export PDF — library dimuat lazy saat export diklik (lihat pdf-loader.js)
  exportPdfBtn.addEventListener("click", async () => {
    const filtered = filterActivities();
    if (filtered.length === 0) {
      showModal("Info", "No activities to export", "info");
      return;
    }

    try {
      await window.loadPdfLibs();
    } catch (e) {
      showModal("Error", e.message || "Gagal memuat library PDF", "error");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text("My Activity Log", 14, 15);
    doc.setFontSize(10);
    doc.text(`User: ${user.fullName} (${user.username})`, 14, 22);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 27);

    const tableData = filtered.map((a) => [
      new Date(a.date).toLocaleString(),
      a.aktifitas,
      a.description,
    ]);

    doc.autoTable({
      head: [["Date & Time", "Ticket", "Description"]],
      body: tableData,
      startY: 30,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] }, // Primary color
      columnStyles: {
        1: { cellWidth: "auto" }, // Description gets remaining space
      },
    });

    doc.save(`my_activities_${new Date().toISOString().split("T")[0]}.pdf`);
  });

  async function fetchTicketList() {
    const response = await fetch("/tickets");
    allTickets = await response.json();

    const ticketSelect = document.getElementById("ticket_id");
    ticketSelect.innerHTML = "";
    // Opsi pertama: tidak memilih ticket (untuk log kedatangan/kepulangan dll)
    ticketSelect.appendChild(new Option("— No Ticket (General) —", ""));

    // Filter ticket yang statusnya bukan Selesai (sedang dikerjakan)
    const activeTickets = allTickets.filter(
      (ticket) => ticket.status !== "Selesai",
    );

    activeTickets.forEach((ticket) => {
      const label = `${ticket.lokasi} — ${ticket.aktifitas} — ${ticket.pic}`;
      ticketSelect.appendChild(new Option(label, ticket.id));
    });
  }

  // Search filter untuk activity list
  // Filter function: search + date range
  function filterActivities() {
    const term = (document.getElementById('activitySearch')?.value || '').toLowerCase();
    const startDate = document.getElementById('activityStartDate')?.value;
    const endDate = document.getElementById('activityEndDate')?.value;

    return myActivities.filter(a => {
      // Search filter
      if (term && !(a.description || '').toLowerCase().includes(term) &&
          !(a.username || '').toLowerCase().includes(term) &&
          !(a.aktifitas || '').toLowerCase().includes(term)) {
        return false;
      }
      // Date filter
      const d = new Date(a.date);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59); // include end date fully
        if (d > end) return false;
      }
      return true;
    });
  }

  function applyFilters() {
    currentPage = 1; // Filter berubah → kembali ke halaman 1
    renderActivityList(filterActivities());
  }

  const searchInput = document.getElementById('activitySearch');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyFilters, 300));
  }

  // Date filter listeners
  const startDateInput = document.getElementById('activityStartDate');
  const endDateInput = document.getElementById('activityEndDate');
  if (startDateInput) {
    startDateInput.addEventListener('change', () => {
      if (endDateInput && startDateInput.value && endDateInput.value && startDateInput.value > endDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
      applyFilters();
    });
  }
  if (endDateInput) {
    endDateInput.addEventListener('change', () => {
      if (startDateInput && startDateInput.value && endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
      applyFilters();
    });
  }

  fetchTicketList();
});
