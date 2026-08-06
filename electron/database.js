import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists in OS User Data folder for production
const dataDir = app ? app.getPath('userData') : path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'dine360.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
    }
});

export function runMigrations(callback) {
    db.get('PRAGMA user_version', (err, row) => {
        if (err) {
            console.error('Failed to query PRAGMA user_version:', err);
            if (callback) callback(err);
            return;
        }

        const currentVersion = row ? (row.user_version || 0) : 0;
        console.log(`Current SQLite PRAGMA user_version: ${currentVersion}`);

        db.serialize(() => {
            // Version 0 -> 1 Migration: Baseline tables & default seed data
            if (currentVersion < 1) {
                console.log('Executing SQLite Schema Migration [Version 0 -> 1]...');
                
                db.run('BEGIN TRANSACTION');

                // 1. inventory table
                db.run(`
                    CREATE TABLE IF NOT EXISTS inventory (
                        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        price REAL NOT NULL,
                        category TEXT NOT NULL,
                        type TEXT NOT NULL
                    )
                `);

                // 2. tickets table
                db.run(`
                    CREATE TABLE IF NOT EXISTS tickets (
                        ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_type TEXT NOT NULL,
                        subtotal REAL NOT NULL,
                        tax REAL NOT NULL,
                        grand_total REAL NOT NULL,
                        payment_method TEXT DEFAULT 'Cash',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. ticket_items junction table
                db.run(`
                    CREATE TABLE IF NOT EXISTS ticket_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ticket_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        price_at_time REAL NOT NULL,
                        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
                        FOREIGN KEY (item_id) REFERENCES inventory(item_id)
                    )
                `);

                // 4. users table
                db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        pin_hash TEXT NOT NULL,
                        role TEXT CHECK(role IN ('manager', 'cashier')) NOT NULL
                    )
                `);

                // 5. app_settings table
                db.run(`
                    CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                `);

                // Seed default menu items into inventory table if empty
                db.get('SELECT COUNT(*) AS count FROM inventory', (seedErr, seedRow) => {
                    if (!seedErr && seedRow && seedRow.count === 0) {
                        const seedItems = [
                            { id: 1, name: "Paneer Tikka", price: 280, category: "Starters", type: "veg" },
                            { id: 2, name: "Chicken 65", price: 320, category: "Starters", type: "non-veg" },
                            { id: 3, name: "Butter Chicken", price: 450, category: "Main Course", type: "non-veg" },
                            { id: 4, name: "Dal Makhani", price: 290, category: "Main Course", type: "veg" },
                            { id: 5, name: "Hyderabadi Dum Biryani", price: 380, category: "Biryanis", type: "non-veg" },
                            { id: 6, name: "Veg Pulao", price: 250, category: "Biryanis", type: "veg" },
                            { id: 7, name: "Garlic Naan", price: 60, category: "Breads", type: "veg" },
                            { id: 8, name: "Tandoori Roti", price: 40, category: "Breads", type: "veg" },
                            { id: 9, name: "Fresh Lime Soda", price: 90, category: "Beverages", type: "veg" },
                            { id: 10, name: "Mango Lassi", price: 120, category: "Beverages", type: "veg" }
                        ];

                        const stmt = db.prepare('INSERT INTO inventory (item_id, name, price, category, type) VALUES (?, ?, ?, ?, ?)');
                        seedItems.forEach(item => {
                            stmt.run(item.id, item.name, item.price, item.category, item.type);
                        });
                        stmt.finalize();
                        console.log('Seeded default inventory items.');
                    }
                });

                // Seed default users if empty
                db.get('SELECT COUNT(*) AS count FROM users', (userErr, userRow) => {
                    if (!userErr && userRow && userRow.count === 0) {
                        const adminPinHash = crypto.createHash('sha256').update('1234').digest('hex');
                        const cashierPinHash = crypto.createHash('sha256').update('5678').digest('hex');

                        const stmt = db.prepare('INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)');
                        stmt.run('Admin', adminPinHash, 'manager');
                        stmt.run('Cashier', cashierPinHash, 'cashier');
                        stmt.finalize();
                        console.log('Seeded default users into SQLite: Admin (manager, PIN: 1234), Cashier (cashier, PIN: 5678).');
                    }
                });

                // Update PRAGMA user_version = 1
                db.run('PRAGMA user_version = 1', (verErr) => {
                    if (verErr) {
                        db.run('ROLLBACK');
                        console.error('Failed to set PRAGMA user_version = 1:', verErr);
                        if (callback) callback(verErr);
                        return;
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Failed to commit migration transaction:', commitErr);
                            if (callback) callback(commitErr);
                            return;
                        }
                        console.log('Migration [Version 0 -> 1] committed successfully. PRAGMA user_version updated to 1.');
                    });
                });
            }

            // Version 1 -> 2 Migration: Ensure app_settings table exists and update PRAGMA user_version = 2
            if (currentVersion < 2) {
                console.log('Executing SQLite Schema Migration [Version 1 -> 2]...');
                db.run('BEGIN TRANSACTION');
                db.run(`
                    CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                `);
                db.run('PRAGMA user_version = 2', (verErr) => {
                    if (verErr) {
                        db.run('ROLLBACK');
                        console.error('Failed to set PRAGMA user_version = 2:', verErr);
                        return;
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Failed to commit migration [Version 1 -> 2]:', commitErr);
                            return;
                        }
                        console.log('Migration [Version 1 -> 2] committed successfully. PRAGMA user_version updated to 2.');
                    });
                });
            }

            db.get('PRAGMA user_version', (finalErr, finalRow) => {
                const finalVer = finalRow ? finalRow.user_version : currentVersion;
                if (callback) callback(finalErr, finalVer);
            });
        });
    });
}

// Auto-run migration on module load
runMigrations((err, version) => {
    if (err) {
        console.error('Initial database migration encountered error:', err);
    } else {
        console.log(`SQLite database initialized at PRAGMA user_version = ${version}`);
    }
});

export function saveTicket(orderData, callback) {
    const safeData = orderData || {};
    const order_type = safeData.orderType || safeData.order_type || 'Dine-In';
    const subtotal = Number(safeData.subtotal || 0);
    const tax = Number(safeData.tax || 0);
    const grand_total = Number(safeData.grandTotal || safeData.grand_total || 0);
    const payment_method = safeData.paymentMethod || safeData.payment_method || 'Cash';
    const items = safeData.cartItems || safeData.items || [];

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const insertTicketSql = `
            INSERT INTO tickets (order_type, subtotal, tax, grand_total, payment_method)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.run(insertTicketSql, [order_type, subtotal, tax, grand_total, payment_method], function (err) {
            if (err) {
                db.run('ROLLBACK');
                return callback(err);
            }

            const ticketId = this.lastID;

            if (!items || items.length === 0) {
                db.run('COMMIT');
                return callback(null, ticketId);
            }

            const insertItemSql = `
                INSERT INTO ticket_items (ticket_id, item_id, quantity, price_at_time)
                VALUES (?, ?, ?, ?)
            `;

            const stmt = db.prepare(insertItemSql);
            let hasError = false;
            let pendingCount = items.length;

            items.forEach((item) => {
                const itemId = item.id || item.item_id;
                const quantity = item.qty || item.quantity;
                const priceAtTime = item.price || item.price_at_time;

                stmt.run([ticketId, itemId, quantity, priceAtTime], (itemErr) => {
                    if (itemErr && !hasError) {
                        hasError = true;
                        db.run('ROLLBACK');
                        return callback(itemErr);
                    }
                    pendingCount--;
                    if (pendingCount === 0 && !hasError) {
                        stmt.finalize();
                        db.run('COMMIT');
                        return callback(null, ticketId);
                    }
                });
            });
        });
    });
}

export function getDashboardMetrics(callback) {
    db.serialize(() => {
        const summarySql = `
            SELECT 
                COALESCE(SUM(grand_total), 0) AS total_revenue,
                COUNT(ticket_id) AS total_orders,
                COALESCE(AVG(grand_total), 0) AS avg_order_value,
                COALESCE(SUM(CASE WHEN order_type = 'Dine-In' THEN grand_total ELSE 0 END), 0) AS dine_in_revenue,
                COALESCE(SUM(CASE WHEN order_type != 'Dine-In' THEN grand_total ELSE 0 END), 0) AS takeaway_revenue,
                COALESCE(SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN grand_total ELSE 0 END), 0) AS today_revenue,
                COALESCE(SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END), 0) AS today_orders
            FROM tickets
        `;

        const topItemsSql = `
            SELECT 
                i.name,
                i.category,
                SUM(ti.quantity) AS total_qty,
                SUM(ti.quantity * ti.price_at_time) AS total_sales
            FROM ticket_items ti
            JOIN inventory i ON ti.item_id = i.item_id
            GROUP BY ti.item_id
            ORDER BY total_qty DESC
            LIMIT 5
        `;

        const categorySql = `
            SELECT 
                i.category,
                SUM(ti.quantity) AS total_qty,
                SUM(ti.quantity * ti.price_at_time) AS total_sales
            FROM ticket_items ti
            JOIN inventory i ON ti.item_id = i.item_id
            GROUP BY i.category
            ORDER BY total_sales DESC
        `;

        const recentTicketsSql = `
            SELECT 
                t.ticket_id,
                t.order_type,
                t.subtotal,
                t.tax,
                t.grand_total,
                t.payment_method,
                t.created_at,
                GROUP_CONCAT(i.name || ' (x' || ti.quantity || ')', ', ') AS item_summary
            FROM tickets t
            LEFT JOIN ticket_items ti ON t.ticket_id = ti.ticket_id
            LEFT JOIN inventory i ON ti.item_id = i.item_id
            GROUP BY t.ticket_id
            ORDER BY t.ticket_id DESC
            LIMIT 50
        `;

        db.get(summarySql, [], (err, summary) => {
            if (err) return callback(err);

            db.all(topItemsSql, [], (err2, topItems) => {
                if (err2) return callback(err2);

                db.all(categorySql, [], (err3, categories) => {
                    if (err3) return callback(err3);

                    db.all(recentTicketsSql, [], (err4, recentTickets) => {
                        if (err4) return callback(err4);

                        callback(null, {
                            summary: summary || {},
                            topItems: topItems || [],
                            categories: categories || [],
                            recentTickets: recentTickets || []
                        });
                    });
                });
            });
        });
    });
}

export function getInventory(callback) {
    db.all('SELECT * FROM inventory ORDER BY item_id ASC', [], (err, rows) => {
        if (err) return callback(err);
        callback(null, rows || []);
    });
}

export function addInventoryItem(item, callback) {
    const { name, price, category, type } = item;
    const sql = 'INSERT INTO inventory (name, price, category, type) VALUES (?, ?, ?, ?)';
    db.run(sql, [name, Number(price), category, type], function (err) {
        if (err) return callback(err);
        callback(null, this.lastID);
    });
}

export function updateInventoryItem(item, callback) {
    const { item_id, id, name, price, category, type } = item;
    const targetId = item_id || id;
    const sql = 'UPDATE inventory SET name=?, price=?, category=?, type=? WHERE item_id=?';
    db.run(sql, [name, Number(price), category, type, targetId], function (err) {
        if (err) return callback(err);
        callback(null, this.changes);
    });
}

export function deleteInventoryItem(itemId, callback) {
    const sql = 'DELETE FROM inventory WHERE item_id=?';
    db.run(sql, [itemId], function (err) {
        if (err) return callback(err);
        callback(null, this.changes);
    });
}

export function authenticateUser(pin, callback) {
    const pinHash = crypto.createHash('sha256').update(String(pin)).digest('hex');
    const sql = 'SELECT user_id, name, role FROM users WHERE pin_hash = ?';
    db.get(sql, [pinHash], (err, row) => {
        if (err) return callback(err);
        if (!row) return callback(null, null);
        callback(null, row);
    });
}

export function getSetting(key, callback) {
    const sql = 'SELECT value FROM app_settings WHERE key = ?';
    db.get(sql, [key], (err, row) => {
        if (err) return callback(err);
        callback(null, row ? row.value : null);
    });
}

export function saveActivationData(data, callback) {
    const { restaurant_name, license_key, hardware_id } = data || {};
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const sql = 'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)';
        const stmt = db.prepare(sql);
        
        stmt.run('is_registered', 'true');
        stmt.run('restaurant_name', restaurant_name || '');
        stmt.run('license_key', license_key || '');
        if (hardware_id) {
            stmt.run('hardware_id', String(hardware_id));
        }
        
        stmt.finalize((err) => {
            if (err) {
                db.run('ROLLBACK');
                return callback(err);
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) return callback(commitErr);
                callback(null, { success: true });
            });
        });
    });
}

export function verifyHardwareBinding(currentHardwareId, callback) {
    const sql = "SELECT value FROM app_settings WHERE key = 'hardware_id'";
    db.get(sql, [], (err, row) => {
        if (err) return callback(err);
        if (!row || !row.value) {
            // Not bound yet
            return callback(null, { isValid: true });
        }
        if (String(row.value).trim() === String(currentHardwareId).trim()) {
            return callback(null, { isValid: true });
        } else {
            console.warn(`Hardware Mismatch! Database bound to [${row.value}], current host is [${currentHardwareId}]`);
            return callback(null, { isValid: false, reason: 'hardware_mismatch' });
        }
    });
}

export default db;
