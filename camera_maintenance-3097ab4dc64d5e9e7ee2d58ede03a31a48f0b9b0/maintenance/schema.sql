PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    phone TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','technician')),
    technician_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_code TEXT UNIQUE,
    title TEXT,
    task_type TEXT NOT NULL CHECK(task_type IN ('normal','camera')) DEFAULT 'normal',
    maintenance_kind TEXT NOT NULL CHECK(maintenance_kind IN ('وقائية','تنظيف','طارئة')) DEFAULT 'وقائية',
    zone_id INTEGER NOT NULL,
    technician_id INTEGER,
    start_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('قيد الانتظار','قيد التنفيذ','مكتمل')) DEFAULT 'قيد الانتظار',
    target_all_branches INTEGER DEFAULT 0,
    notes TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (zone_id) REFERENCES zones(id),
    FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    is_completed INTEGER DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    UNIQUE(task_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_zone ON tasks(zone_id);
CREATE INDEX IF NOT EXISTS idx_taskbranches_task ON task_branches(task_id);
