// =============================================================
// نظام الصيانة الوقائية للكاميرات - منطق الواجهة
// =============================================================
const state = {
  user: null,
  zones: [],
  technicians: [],
  users: [],
  tasks: [],
  stats: {},
  view: "all",          // all | camera | normal | reports | admin
  status: "",
  zoneFilter: "",
  techFilter: "",
  search: "",
  createSelectedBranches: new Set(),
  completeSelectedBranches: new Set(),
  completeTaskId: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// -------------------------------------------------------------
// أدوات مساعدة لطلبات الـ API
// -------------------------------------------------------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* لا يوجد محتوى JSON */ }
  if (!res.ok) {
    throw new Error((data && data.error) || "حدث خطأ غير متوقع");
  }
  return data;
}

function toast(message, type = "default") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("#toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmtDate(str) {
  if (!str) return "—";
  return str.split(" ")[0];
}

// =============================================================
// المصادقة
// =============================================================
async function checkSession() {
  const me = await api("/api/me");
  if (me.authenticated) {
    state.user = me;
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app-shell").classList.add("hidden");
}

async function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");

  $("#user-name").textContent = state.user.full_name;
  $("#user-role").textContent = state.user.role === "admin" ? "مدير النظام" : "فني صيانة";
  $("#user-avatar").textContent = state.user.full_name.trim().charAt(0);

  document.body.classList.toggle("is-admin", state.user.role === "admin");
  $$(".admin-only").forEach(el => {
    el.style.display = state.user.role === "admin" ? "" : "none";
  });

  await Promise.all([loadZones(), loadTechnicians()]);
  await refreshAll();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("#login-username").value.trim();
  const password = $("#login-password").value;
  $("#login-error").classList.add("hidden");
  try {
    const user = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
    state.user = { ...user, authenticated: true };
    await showApp();
  } catch (err) {
    $("#login-error").textContent = err.message;
    $("#login-error").classList.remove("hidden");
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  location.reload();
});

// =============================================================
// تحميل البيانات الأساسية
// =============================================================
async function loadZones() {
  state.zones = await api("/api/zones");
  const zoneSelects = [$("#filter-zone"), $("#task-zone")];
  zoneSelects.forEach(sel => {
    const keepFirst = sel.firstElementChild;
    sel.innerHTML = "";
    sel.appendChild(keepFirst);
    state.zones.forEach(z => {
      const opt = document.createElement("option");
      opt.value = z.id;
      opt.textContent = z.name;
      sel.appendChild(opt);
    });
  });
}

async function loadTechnicians() {
  state.technicians = await api("/api/technicians");
  const techSelects = [$("#filter-technician"), $("#task-technician")];
  techSelects.forEach(sel => {
    if (!sel) return;
    const keepFirst = sel.firstElementChild;
    sel.innerHTML = "";
    sel.appendChild(keepFirst);
    state.technicians.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  });
  renderTechniciansList();
}

async function loadStats() {
  state.stats = await api("/api/stats");
  $("#stat-total").textContent = state.stats.total ?? 0;
  $("#stat-pending").textContent = state.stats.pending ?? 0;
  $("#stat-progress").textContent = state.stats.in_progress ?? 0;
  $("#stat-done").textContent = state.stats.completed ?? 0;
  $("#stat-camera").textContent = state.stats.camera_tasks ?? 0;
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.view === "camera") params.set("task_type", "camera");
  if (state.view === "normal") params.set("task_type", "normal");
  if (state.zoneFilter) params.set("zone_id", state.zoneFilter);
  if (state.techFilter) params.set("technician_id", state.techFilter);
  if (state.search) params.set("q", state.search);

  state.tasks = await api(`/api/tasks?${params.toString()}`);
  renderTasks();
}

async function refreshAll() {
  await Promise.all([loadStats(), loadTasks()]);
}

// =============================================================
// عرض المهام (الشرائط)
// =============================================================
const TYPE_ICON = {
  camera: `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="4"/><path d="M3 9h3l1.5-2h9L18 9h3v10H3z"/></svg>`,
  normal: `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>`,
};

function statusClass(status) {
  return "status-" + status.replace(/\s+/g, "-");
}

function renderTasks() {
  const list = $("#task-list");
  list.innerHTML = "";

  if (state.tasks.length === 0) {
    $("#empty-state").classList.remove("hidden");
    return;
  }
  $("#empty-state").classList.add("hidden");

  state.tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = `task-row ${task.task_type === "camera" ? "is-camera" : ""}`;

    const pct = task.progress.total ? Math.round((task.progress.done / task.progress.total) * 100) : 0;

    row.innerHTML = `
      <div class="task-icon">${TYPE_ICON[task.task_type]}</div>
      <div class="task-main">
        <div class="title-line">
          <span class="task-code">${task.task_code}</span>
          <span class="task-title">${escapeHtml(task.title)}</span>
        </div>
        <div class="task-meta">
          <span>📍 ${escapeHtml(task.zone_name)}</span>
          <span>👤 ${escapeHtml(task.technician_name || "بدون تحديد")}</span>
          <span>📅 ${fmtDate(task.start_date)}</span>
        </div>
      </div>
      <span class="badge ${task.task_type === "camera" ? "badge-camera" : "badge-normal"}">
        ${task.task_type === "camera" ? "صيانة كاميرات" : "مهمة عادية"}
      </span>
      <span class="badge badge-${task.maintenance_kind}">${task.maintenance_kind}</span>
      <div class="progress-chip">
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span>${task.progress.done}/${task.progress.total}</span>
      </div>
      <select class="status-pill ${statusClass(task.status)}" data-status-select="${task.id}">
        <option value="قيد الانتظار" ${task.status === "قيد الانتظار" ? "selected" : ""}>قيد الانتظار</option>
        <option value="قيد التنفيذ" ${task.status === "قيد التنفيذ" ? "selected" : ""}>قيد التنفيذ</option>
        <option value="مكتمل" ${task.status === "مكتمل" ? "selected" : ""}>مكتمل</option>
      </select>
      <div class="task-actions">
        <button class="icon-btn" data-details="${task.id}" title="التفاصيل">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
        </button>
        <button class="icon-btn admin-only" data-delete="${task.id}" title="حذف" style="${state.user.role !== 'admin' ? 'display:none' : ''}">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    `;
    list.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// تفويض الأحداث على قائمة المهام
$("#task-list").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-status-select]");
  if (!sel) return;
  const taskId = sel.dataset.statusSelect;
  const newStatus = sel.value;
  const task = state.tasks.find(t => t.id === Number(taskId));

  if (newStatus === "مكتمل") {
    openCompleteModal(task);
    sel.value = task.status; // لا نغيّر العرض حتى يتم التأكيد من النافذة
    return;
  }
  try {
    await api(`/api/tasks/${taskId}/status`, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
    toast("تم تحديث حالة المهمة", "success");
    refreshAll();
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#task-list").addEventListener("click", async (e) => {
  const detailsBtn = e.target.closest("[data-details]");
  if (detailsBtn) return openDetailsModal(Number(detailsBtn.dataset.details));

  const delBtn = e.target.closest("[data-delete]");
  if (delBtn) {
    if (!confirm("هل أنت متأكد من حذف هذه المهمة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    try {
      await api(`/api/tasks/${delBtn.dataset.delete}`, { method: "DELETE" });
      toast("تم حذف المهمة", "success");
      refreshAll();
    } catch (err) {
      toast(err.message, "error");
    }
  }
});

// =============================================================
// التنقل بين الأقسام (الشريط الجانبي)
// =============================================================
const VIEW_TITLES = {
  all: ["كل المهام", "عرض جميع المهام التشغيلية ومهام صيانة الكاميرات"],
  camera: ["صيانة الكاميرات", "مهام الصيانة الوقائية، التنظيف، والطوارئ الخاصة بالكاميرات"],
  normal: ["المهام العادية", "المهام التشغيلية غير المرتبطة بالكاميرات"],
  reports: ["التقارير والتصدير", "تصدير بيانات الصيانة بصيغ Excel و PDF"],
  admin: ["الإدارة", "إدارة المناطق والفروع، الفنيين، وحسابات المستخدمين"],
};

$$(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    $$(".nav-item").forEach(b => b.classList.toggle("active", b === btn));

    const [title, subtitle] = VIEW_TITLES[state.view];
    $("#view-title").textContent = title;
    $("#view-subtitle").textContent = subtitle;

    const isTaskView = ["all", "camera", "normal"].includes(state.view);
    $("#view-tasks").classList.toggle("hidden", !isTaskView);
    $("#view-reports").classList.toggle("hidden", state.view !== "reports");
    $("#view-admin").classList.toggle("hidden", state.view !== "admin");
    $("#add-task-btn").style.display = isTaskView ? "" : "none";

    closeMobileSidebar();
    if (isTaskView) loadTasks();
    if (state.view === "admin") refreshAdminView();
  });
});

// قائمة الموبايل
$("#mobile-menu-btn").addEventListener("click", () => {
  $(".sidebar").classList.add("open");
  $("#sidebar-overlay").classList.remove("hidden");
});
function closeMobileSidebar() {
  $(".sidebar").classList.remove("open");
  $("#sidebar-overlay").classList.add("hidden");
}
$("#sidebar-overlay").addEventListener("click", closeMobileSidebar);

// =============================================================
// الفلاتر
// =============================================================
$("#status-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  $$(".tab", $("#status-tabs")).forEach(t => t.classList.toggle("active", t === tab));
  state.status = tab.dataset.status;
  loadTasks();
});

$("#filter-zone").addEventListener("change", (e) => { state.zoneFilter = e.target.value; loadTasks(); });
$("#filter-technician").addEventListener("change", (e) => { state.techFilter = e.target.value; loadTasks(); });

let searchTimer;
$("#search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); loadTasks(); }, 300);
});

// =============================================================
// مودال إضافة مهمة
// =============================================================
function openCreateModal() {
  $("#create-task-form").reset();
  $("#task-all-branches").checked = false;
  state.createSelectedBranches = new Set();
  $("#task-branches-grid").innerHTML = `<p class="placeholder-text">اختر المنطقة أولاً لعرض الفروع</p>`;
  $("#create-task-error").classList.add("hidden");
  $("#task-start-date").value = new Date().toISOString().slice(0, 10);
  openModal("#modal-create");
}

$("#add-task-btn").addEventListener("click", openCreateModal);

$("#task-zone").addEventListener("change", () => {
  const zoneId = Number($("#task-zone").value);
  const zone = state.zones.find(z => z.id === zoneId);
  state.createSelectedBranches = new Set();
  $("#task-all-branches").checked = false;
  renderBranchGrid($("#task-branches-grid"), zone, state.createSelectedBranches, false);
});

$("#task-all-branches").addEventListener("change", (e) => {
  const grid = $("#task-branches-grid");
  $$("input[type=checkbox]", grid).forEach(cb => {
    cb.checked = e.target.checked;
    const branchId = Number(cb.dataset.branchId);
    if (e.target.checked) state.createSelectedBranches.add(branchId);
    else state.createSelectedBranches.delete(branchId);
    cb.closest(".branch-check").classList.toggle("is-done", e.target.checked);
  });
});

function renderBranchGrid(container, zone, selectedSet, completedMode, completedIds = new Set()) {
  if (!zone || !zone.branches.length) {
    container.innerHTML = `<p class="placeholder-text">لا توجد فروع لهذه المنطقة</p>`;
    return;
  }
  container.innerHTML = "";
  zone.branches.forEach(b => {
    const label = document.createElement("label");
    const checked = completedMode ? completedIds.has(b.id) : selectedSet.has(b.id);
    label.className = `branch-check ${checked ? "is-done" : ""}`;
    label.innerHTML = `<input type="checkbox" data-branch-id="${b.id}" ${checked ? "checked" : ""}> ${escapeHtml(b.name)}`;
    container.appendChild(label);
  });
}

$("#task-branches-grid").addEventListener("change", (e) => {
  const cb = e.target.closest("input[type=checkbox]");
  if (!cb) return;
  const id = Number(cb.dataset.branchId);
  if (cb.checked) state.createSelectedBranches.add(id);
  else state.createSelectedBranches.delete(id);
  cb.closest(".branch-check").classList.toggle("is-done", cb.checked);
});

$("#create-task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = $("#create-task-error");
  errorBox.classList.add("hidden");

  const payload = {
    task_type: $('input[name="task_type"]:checked').value,
    maintenance_kind: $("#task-kind").value,
    zone_id: Number($("#task-zone").value) || null,
    technician_id: Number($("#task-technician").value) || null,
    start_date: $("#task-start-date").value,
    title: $("#task-title").value.trim(),
    notes: $("#task-notes").value.trim(),
    target_all_branches: $("#task-all-branches").checked,
    branch_ids: Array.from(state.createSelectedBranches),
  };

  try {
    await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    toast("تمت إضافة المهمة بنجاح", "success");
    closeModal("#modal-create");
    refreshAll();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
  }
});

// =============================================================
// مودال إكمال المهمة (تحديد الفروع المنجزة)
// =============================================================
function openCompleteModal(task) {
  state.completeTaskId = task.id;
  state.completeSelectedBranches = new Set(task.branches.filter(b => b.is_completed).map(b => b.id));
  $("#complete-task-code").textContent = `(${task.task_code})`;
  $("#complete-all-branches").checked = false;
  $("#complete-task-error").classList.add("hidden");

  const zone = { branches: task.branches };
  renderBranchGrid($("#complete-branches-grid"), zone, state.completeSelectedBranches, false);
  openModal("#modal-complete");
}

$("#complete-branches-grid").addEventListener("change", (e) => {
  const cb = e.target.closest("input[type=checkbox]");
  if (!cb) return;
  const id = Number(cb.dataset.branchId);
  if (cb.checked) state.completeSelectedBranches.add(id);
  else state.completeSelectedBranches.delete(id);
  cb.closest(".branch-check").classList.toggle("is-done", cb.checked);
});

$("#complete-all-branches").addEventListener("change", (e) => {
  $$("input[type=checkbox]", $("#complete-branches-grid")).forEach(cb => {
    cb.checked = e.target.checked;
    cb.closest(".branch-check").classList.toggle("is-done", e.target.checked);
    const id = Number(cb.dataset.branchId);
    if (e.target.checked) state.completeSelectedBranches.add(id);
    else state.completeSelectedBranches.delete(id);
  });
});

$("#confirm-complete-btn").addEventListener("click", async () => {
  const errorBox = $("#complete-task-error");
  errorBox.classList.add("hidden");

  if (!$("#complete-all-branches").checked && state.completeSelectedBranches.size === 0) {
    errorBox.textContent = "يجب تحديد فرع واحد على الأقل أو اختيار كل الفروع";
    errorBox.classList.remove("hidden");
    return;
  }

  try {
    await api(`/api/tasks/${state.completeTaskId}/status`, {
      method: "PUT",
      body: JSON.stringify({
        status: "مكتمل",
        complete_all_branches: $("#complete-all-branches").checked,
        completed_branch_ids: Array.from(state.completeSelectedBranches),
      }),
    });
    toast("تم إكمال المهمة بنجاح", "success");
    closeModal("#modal-complete");
    refreshAll();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
  }
});

// =============================================================
// مودال تفاصيل المهمة
// =============================================================
function openDetailsModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const branchesHtml = task.branches.map(b => `
    <label class="branch-check ${b.is_completed ? "is-done" : ""}" style="cursor:default">
      <input type="checkbox" ${b.is_completed ? "checked" : ""} disabled>
      ${escapeHtml(b.name)}
    </label>
  `).join("");

  $("#details-body").innerHTML = `
    <div class="details-grid">
      <div class="detail-item"><label>كود المهمة</label><span>${task.task_code}</span></div>
      <div class="detail-item"><label>النوع</label><span>${task.task_type === "camera" ? "صيانة وقائية للكاميرات" : "مهمة عادية"}</span></div>
      <div class="detail-item"><label>نوع الصيانة</label><span>${task.maintenance_kind}</span></div>
      <div class="detail-item"><label>الحالة</label><span>${task.status}</span></div>
      <div class="detail-item"><label>المنطقة</label><span>${escapeHtml(task.zone_name)}</span></div>
      <div class="detail-item"><label>الفني</label><span>${escapeHtml(task.technician_name || "بدون تحديد")}</span></div>
      <div class="detail-item"><label>تاريخ البدء</label><span>${fmtDate(task.start_date)}</span></div>
      <div class="detail-item"><label>تاريخ الإكمال</label><span>${fmtDate(task.completed_at) || "—"}</span></div>
    </div>
    ${task.notes ? `<div class="detail-item"><label>ملاحظات</label><span style="font-weight:600">${escapeHtml(task.notes)}</span></div>` : ""}
    <div class="details-branches">
      <h4>الفروع المستهدفة (${task.progress.done}/${task.progress.total} منجز)</h4>
      <div class="branches-grid">${branchesHtml}</div>
    </div>
  `;
  openModal("#modal-details");
}

// =============================================================
// لوحة الإدارة: تبويبات فرعية
// =============================================================
let adminTab = "zones";

$(".admin-subtabs")?.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-admin-tab]");
  if (!tab) return;
  adminTab = tab.dataset.adminTab;
  $$(".admin-subtabs .tab").forEach(t => t.classList.toggle("active", t === tab));
  $$(".admin-tab-panel").forEach(panel => {
    panel.classList.toggle("hidden", panel.id !== `admin-tab-${adminTab}`);
  });
});

async function refreshAdminView() {
  await Promise.all([loadZones(), loadTechnicians()]);
  renderZonesManageList();
  await loadUsers();
}

// =============================================================
// إدارة المناطق والفروع
// =============================================================
function renderZonesManageList() {
  const container = $("#zones-manage-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.zones.length) {
    container.innerHTML = `<p class="placeholder-text">لا توجد مناطق مضافة بعد</p>`;
    return;
  }

  state.zones.forEach(zone => {
    const card = document.createElement("div");
    card.className = "zone-manage-card";

    const branchesHtml = zone.branches.length
      ? zone.branches.map(b => `
          <div class="branch-manage-row">
            <span>${escapeHtml(b.name)}</span>
            <div class="row-actions">
              <button class="icon-btn btn-sm" data-edit-branch="${b.id}" title="تعديل الفرع">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="icon-btn btn-sm" data-delete-branch="${b.id}" title="حذف الفرع">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
            </div>
          </div>
        `).join("")
      : `<p class="no-branches-text">لا توجد فروع في هذه المنطقة</p>`;

    card.innerHTML = `
      <div class="zone-manage-header">
        <strong>${escapeHtml(zone.name)}</strong>
        <div class="row-actions">
          <button class="icon-btn" data-edit-zone="${zone.id}" title="تعديل اسم المنطقة">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn" data-delete-zone="${zone.id}" title="حذف المنطقة">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>
      <div class="branch-manage-list">
        ${branchesHtml}
        <form class="add-branch-form" data-add-branch-zone="${zone.id}">
          <input type="text" placeholder="اسم فرع جديد لهذه المنطقة" required>
          <button type="submit" class="btn btn-outline btn-sm">إضافة فرع</button>
        </form>
      </div>
    `;
    container.appendChild(card);
  });
}

$("#add-zone-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#zone-name");
  const name = input.value.trim();
  if (!name) return;
  try {
    await api("/api/zones", { method: "POST", body: JSON.stringify({ name }) });
    toast("تمت إضافة المنطقة بنجاح", "success");
    input.value = "";
    await loadZones();
    renderZonesManageList();
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#zones-manage-list")?.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-add-branch-zone]");
  if (!form) return;
  e.preventDefault();
  const zoneId = form.dataset.addBranchZone;
  const input = form.querySelector("input");
  const name = input.value.trim();
  if (!name) return;
  try {
    await api(`/api/zones/${zoneId}/branches`, { method: "POST", body: JSON.stringify({ name }) });
    toast("تمت إضافة الفرع بنجاح", "success");
    await loadZones();
    renderZonesManageList();
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#zones-manage-list")?.addEventListener("click", async (e) => {
  const editZoneBtn = e.target.closest("[data-edit-zone]");
  if (editZoneBtn) {
    const zone = state.zones.find(z => z.id === Number(editZoneBtn.dataset.editZone));
    const newName = prompt("اسم المنطقة الجديد:", zone?.name || "");
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return toast("اسم المنطقة مطلوب", "error");
    try {
      await api(`/api/zones/${editZoneBtn.dataset.editZone}`, { method: "PUT", body: JSON.stringify({ name: trimmed }) });
      toast("تم تعديل المنطقة بنجاح", "success");
      await loadZones();
      renderZonesManageList();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const deleteZoneBtn = e.target.closest("[data-delete-zone]");
  if (deleteZoneBtn) {
    if (!confirm("هل أنت متأكد من حذف هذه المنطقة وكل فروعها؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    try {
      await api(`/api/zones/${deleteZoneBtn.dataset.deleteZone}`, { method: "DELETE" });
      toast("تم حذف المنطقة بنجاح", "success");
      await loadZones();
      renderZonesManageList();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const editBranchBtn = e.target.closest("[data-edit-branch]");
  if (editBranchBtn) {
    const branchId = Number(editBranchBtn.dataset.editBranch);
    let currentName = "";
    state.zones.forEach(z => z.branches.forEach(b => { if (b.id === branchId) currentName = b.name; }));
    const newName = prompt("اسم الفرع الجديد:", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return toast("اسم الفرع مطلوب", "error");
    try {
      await api(`/api/branches/${branchId}`, { method: "PUT", body: JSON.stringify({ name: trimmed }) });
      toast("تم تعديل الفرع بنجاح", "success");
      await loadZones();
      renderZonesManageList();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const deleteBranchBtn = e.target.closest("[data-delete-branch]");
  if (deleteBranchBtn) {
    if (!confirm("هل أنت متأكد من حذف هذا الفرع؟ سيتم إزالته من أي مهام مرتبطة به.")) return;
    try {
      await api(`/api/branches/${deleteBranchBtn.dataset.deleteBranch}`, { method: "DELETE" });
      toast("تم حذف الفرع بنجاح", "success");
      await loadZones();
      renderZonesManageList();
    } catch (err) {
      toast(err.message, "error");
    }
  }
});

// =============================================================
// إدارة الفنيين
// =============================================================
function renderTechniciansList() {
  const container = $("#technicians-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.technicians.length) {
    container.innerHTML = `<p class="placeholder-text">لا يوجد فنيون مضافون بعد</p>`;
    return;
  }

  state.technicians.forEach(t => {
    const row = document.createElement("div");
    row.className = `tech-row ${t.is_active === false ? "is-inactive" : ""}`;
    row.innerHTML = `
      <div class="avatar">${t.name.charAt(0)}</div>
      <strong>${escapeHtml(t.name)}</strong>
      <span>${t.phone ? escapeHtml(t.phone) : "بدون رقم هاتف"}</span>
      ${t.linked_username ? `<span class="tag-pill tag-success">مرتبط بحساب: ${escapeHtml(t.linked_username)}</span>` : `<span class="tag-pill tag-muted">بدون حساب دخول</span>`}
      ${t.is_active === false ? `<span class="tag-pill">غير مفعّل</span>` : ""}
      <div class="row-actions">
        <button class="icon-btn btn-sm" data-edit-tech="${t.id}" title="تعديل">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn btn-sm" data-delete-tech="${t.id}" title="حذف">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

$("#add-technician-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#tech-name").value.trim();
  const phone = $("#tech-phone").value.trim();
  try {
    await api("/api/technicians", { method: "POST", body: JSON.stringify({ name, phone }) });
    toast("تمت إضافة الفني بنجاح", "success");
    $("#add-technician-form").reset();
    await loadTechnicians();
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#technicians-list")?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit-tech]");
  if (editBtn) {
    const tech = state.technicians.find(t => t.id === Number(editBtn.dataset.editTech));
    const newName = prompt("اسم الفني:", tech?.name || "");
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return toast("اسم الفني مطلوب", "error");
    const newPhone = prompt("رقم الهاتف (اختياري):", tech?.phone || "");
    try {
      await api(`/api/technicians/${editBtn.dataset.editTech}`, {
        method: "PUT",
        body: JSON.stringify({ name: trimmedName, phone: (newPhone || "").trim() }),
      });
      toast("تم تعديل بيانات الفني بنجاح", "success");
      await loadTechnicians();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-tech]");
  if (deleteBtn) {
    if (!confirm("هل أنت متأكد من حذف هذا الفني؟ ستصبح مهامه السابقة بدون فني مسؤول.")) return;
    try {
      await api(`/api/technicians/${deleteBtn.dataset.deleteTech}`, { method: "DELETE" });
      toast("تم حذف الفني بنجاح", "success");
      await loadTechnicians();
    } catch (err) {
      toast(err.message, "error");
    }
  }
});

// =============================================================
// إدارة المستخدمين (حسابات الدخول)
// =============================================================
async function loadUsers() {
  state.users = await api("/api/users");
  renderUsersList();
}

function renderUsersList() {
  const container = $("#users-list");
  if (!container) return;
  container.innerHTML = "";

  if (!state.users.length) {
    container.innerHTML = `<p class="placeholder-text">لا يوجد مستخدمون</p>`;
    return;
  }

  state.users.forEach(u => {
    const row = document.createElement("div");
    row.className = `user-row ${!u.is_active ? "is-inactive" : ""}`;
    row.innerHTML = `
      <div class="avatar">${u.full_name.charAt(0)}</div>
      <div class="user-row-main">
        <strong>${escapeHtml(u.full_name)} <span style="color:var(--text-faint); font-weight:500;">(${escapeHtml(u.username)})</span></strong>
        <span>${u.role === "admin" ? "مدير النظام" : `فني${u.technician_name ? " — " + escapeHtml(u.technician_name) : ""}`}</span>
      </div>
      <span class="tag-pill ${u.role === "admin" ? "tag-success" : ""}">${u.role === "admin" ? "مدير" : "فني"}</span>
      ${!u.is_active ? `<span class="tag-pill">غير مفعّل</span>` : ""}
      <div class="row-actions">
        <button class="icon-btn btn-sm" data-edit-user="${u.id}" title="تعديل">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn btn-sm" data-delete-user="${u.id}" title="حذف">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

function refreshUserTechnicianSelect(currentTechnicianId = null) {
  const select = $("#user-technician-select");
  select.innerHTML = `<option value="">اختر الفني…</option>`;
  state.technicians
    .filter(t => t.is_active !== false)
    .filter(t => !t.linked_username || t.id === currentTechnicianId)
    .forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  select.value = currentTechnicianId || "";
}

function toggleUserTechnicianField() {
  const role = $('input[name="user_role"]:checked').value;
  $("#user-technician-field").classList.toggle("hidden", role !== "technician");
}

$$('input[name="user_role"]').forEach(r => r.addEventListener("change", toggleUserTechnicianField));

function openUserModal(user = null) {
  $("#user-form").reset();
  $("#user-form-error").classList.add("hidden");
  $("#user-id").value = user ? user.id : "";
  $("#user-modal-title").textContent = user ? "تعديل الحساب" : "حساب جديد";
  $("#user-full-name").value = user ? user.full_name : "";
  $("#user-username").value = user ? user.username : "";
  $("#user-password").value = "";
  $("#user-password-hint").textContent = user ? "(اتركها فارغة للاحتفاظ بكلمة المرور الحالية)" : "(مطلوبة، 4 أحرف على الأقل)";
  $("#user-password").required = !user;
  $("#user-is-active").checked = user ? !!user.is_active : true;

  const role = user ? user.role : "admin";
  $(`input[name="user_role"][value="${role}"]`).checked = true;
  refreshUserTechnicianSelect(user ? user.technician_id : null);
  toggleUserTechnicianField();

  openModal("#modal-user");
}

$("#add-user-btn")?.addEventListener("click", () => openUserModal());

$("#users-list")?.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-user]");
  if (editBtn) {
    const user = state.users.find(u => u.id === Number(editBtn.dataset.editUser));
    if (user) openUserModal(user);
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-user]");
  if (deleteBtn) {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    api(`/api/users/${deleteBtn.dataset.deleteUser}`, { method: "DELETE" })
      .then(() => {
        toast("تم حذف الحساب بنجاح", "success");
        loadUsers();
      })
      .catch(err => toast(err.message, "error"));
  }
});

$("#user-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = $("#user-form-error");
  errorBox.classList.add("hidden");

  const userId = $("#user-id").value;
  const role = $('input[name="user_role"]:checked').value;
  const password = $("#user-password").value;

  const payload = {
    full_name: $("#user-full-name").value.trim(),
    username: $("#user-username").value.trim(),
    role,
    technician_id: role === "technician" ? (Number($("#user-technician-select").value) || null) : null,
    is_active: $("#user-is-active").checked,
  };
  if (password) payload.password = password;

  try {
    if (userId) {
      await api(`/api/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("تم تعديل الحساب بنجاح", "success");
    } else {
      if (!password) {
        errorBox.textContent = "كلمة المرور مطلوبة";
        errorBox.classList.remove("hidden");
        return;
      }
      await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
      toast("تمت إضافة الحساب بنجاح", "success");
    }
    closeModal("#modal-user");
    await Promise.all([loadUsers(), loadTechnicians()]);
    renderZonesManageList();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
  }
});

// =============================================================
// التصدير
// =============================================================
$$("[data-export]").forEach(btn => {
  btn.addEventListener("click", () => {
    const format = btn.dataset.export;
    const type = btn.dataset.type;
    const params = new URLSearchParams();
    if (type === "camera") params.set("type", "camera");
    window.open(`/api/export/${format}?${params.toString()}`, "_blank");
  });
});

// =============================================================
// أدوات النوافذ المنبثقة المشتركة
// =============================================================
function openModal(sel) { $(sel).classList.remove("hidden"); }
function closeModal(sel) { $(sel).classList.add("hidden"); }

$$(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});
$$("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".modal-overlay").classList.add("hidden"));
});

// =============================================================
// بدء التطبيق
// =============================================================
checkSession();
