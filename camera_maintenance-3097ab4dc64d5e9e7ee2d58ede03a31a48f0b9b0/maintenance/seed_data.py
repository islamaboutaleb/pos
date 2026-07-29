# -*- coding: utf-8 -*-
"""
سكربت تهيئة قاعدة البيانات وتعبئتها بالبيانات الأساسية
يتم تشغيله مرة واحدة (أو في كل مرة لا توجد فيها قاعدة بيانات)
"""
import sqlite3
import os
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "maintenance.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

ZONES = {
    "الصالات": [
        "صالة الإنتاج التام", "صالة المعجون", "صالة الزيت", "صالة السيليكون",
        "صالة الاسمنتيات القديم", "صالة التنر", "صالة المدينة باك", "صالة الوافي",
    ],
    "المخازن": [
        "مخزن الصرف", "مخزن المنظومة1", "مخزن المنظومة2",
        "مخزن الكربونات", "مخزن العبوات", "مخازن التالف",
    ],
    "المختبرات": [
        "الدور الأرضي", "الدور الأول", "الدور الثاني", "الدور الثالث",
    ],
    "الأقسام": [
        "الموارد البشرية", "شئون قانونية", "أرشيف", "مراجعة", "حسابات",
        "ماركتنج", "سيلز", "إنتاج", "تكاليف", "بحث وتطوير",
        "الأمن والسلامة والخدمات والنقل", "السكرتارية", "المشتريات",
        "التسويق", "غرفة Control", "تجارية",
    ],
    "الفروع الخارجية": [
        "معارض", "ياقوت", "أصول",
    ],
}

TECHNICIANS = ["محمد الصغير", "عبدالسلام الورفلي", "أنس بشير", "خالد المصراتي"]


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db(force=False):
    fresh = force or not os.path.exists(DB_PATH)
    conn = get_connection()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()

    cur = conn.execute("SELECT COUNT(*) AS c FROM zones")
    if cur.fetchone()["c"] == 0:
        seed(conn)
    conn.close()
    return fresh


def seed(conn):
    for zone_order, (zone_name, branches) in enumerate(ZONES.items()):
        cur = conn.execute(
            "INSERT INTO zones (name, sort_order) VALUES (?, ?)",
            (zone_name, zone_order),
        )
        zone_id = cur.lastrowid
        for b_order, branch_name in enumerate(branches):
            conn.execute(
                "INSERT INTO branches (zone_id, name, sort_order) VALUES (?, ?, ?)",
                (zone_id, branch_name, b_order),
            )

    for tech_name in TECHNICIANS:
        conn.execute("INSERT INTO technicians (name) VALUES (?)", (tech_name,))

    conn.execute(
        "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
        ("admin", generate_password_hash("admin123"), "مدير النظام", "admin"),
    )

    first_tech = conn.execute("SELECT id FROM technicians LIMIT 1").fetchone()
    conn.execute(
        "INSERT INTO users (username, password_hash, full_name, role, technician_id) VALUES (?, ?, ?, ?, ?)",
        ("tech1", generate_password_hash("tech123"), "محمد الصغير", "technician", first_tech["id"]),
    )

    conn.commit()


if __name__ == "__main__":
    init_db(force=True)
    print("تم إنشاء قاعدة البيانات وتعبئتها بالبيانات الأساسية بنجاح ✅")
    print("بيانات الدخول:")
    print("  المدير  -> admin / admin123")
    print("  الفني   -> tech1 / tech123")
