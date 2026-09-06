import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import electron from 'electron';
const app = typeof electron === 'object' && electron ? electron.app : null;
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
                        table_number TEXT,
                        subtotal REAL NOT NULL,
                        tax REAL NOT NULL,
                        grand_total REAL NOT NULL,
                        payment_method TEXT DEFAULT 'Cash',
                        status TEXT DEFAULT 'paid',
                        total_paid REAL DEFAULT 0,
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
                        kot_printed INTEGER DEFAULT 0,
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

            // Version 2 -> 3 Migration: Add status, total_paid, and table_number columns to tickets table
            if (currentVersion < 3) {
                console.log('Executing SQLite Schema Migration [Version 2 -> 3]...');
                db.run('BEGIN TRANSACTION');
                db.run("ALTER TABLE tickets ADD COLUMN status TEXT DEFAULT 'paid'", () => {});
                db.run("ALTER TABLE tickets ADD COLUMN total_paid REAL DEFAULT 0", () => {});
                db.run("ALTER TABLE tickets ADD COLUMN table_number TEXT", () => {});
                db.run('PRAGMA user_version = 3', (verErr) => {
                    if (verErr) {
                        db.run('ROLLBACK');
                        console.error('Failed to set PRAGMA user_version = 3:', verErr);
                        return;
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Failed to commit migration [Version 2 -> 3]:', commitErr);
                            return;
                        }
                        console.log('Migration [Version 2 -> 3] committed successfully. PRAGMA user_version updated to 3.');
                    });
                });
            }

            // Version 3 -> 4 Migration: Add kot_printed column to ticket_items table
            if (currentVersion < 4) {
                console.log('Executing SQLite Schema Migration [Version 3 -> 4]...');
                db.run('BEGIN TRANSACTION');
                db.run("ALTER TABLE ticket_items ADD COLUMN kot_printed INTEGER DEFAULT 0", () => {});
                db.run('PRAGMA user_version = 4', (verErr) => {
                    if (verErr) {
                        db.run('ROLLBACK');
                        console.error('Failed to set PRAGMA user_version = 4:', verErr);
                        return;
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Failed to commit migration [Version 3 -> 4]:', commitErr);
                            return;
                        }
                        console.log('Migration [Version 3 -> 4] committed successfully. PRAGMA user_version updated to 4.');
                    });
                });
            }

            // Version 4 -> 5 Migration: Add subscriptions_payments table for offline/online payment logging
            if (currentVersion < 5) {
                console.log('Executing SQLite Schema Migration [Version 4 -> 5]...');
                db.run('BEGIN TRANSACTION');
                db.run(`
                    CREATE TABLE IF NOT EXISTS subscriptions_payments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        plan_name TEXT NOT NULL,
                        amount REAL NOT NULL,
                        payment_method TEXT DEFAULT 'UPI',
                        transaction_id TEXT,
                        validity_days INTEGER NOT NULL,
                        status TEXT DEFAULT 'completed',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                db.run('PRAGMA user_version = 5', (verErr) => {
                    if (verErr) {
                        db.run('ROLLBACK');
                        console.error('Failed to set PRAGMA user_version = 5:', verErr);
                        return;
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Failed to commit migration [Version 4 -> 5]:', commitErr);
                            return;
                        }
                        console.log('Migration [Version 4 -> 5] committed successfully. PRAGMA user_version updated to 5.');
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
    const table_number = safeData.tableNumber || safeData.table_number || (safeData.selectedTable ? String(safeData.selectedTable) : null);
    const subtotal = Number(safeData.subtotal || 0);
    const tax = Number(safeData.tax || 0);
    const grand_total = Number(safeData.grandTotal || safeData.grand_total || 0);
    const payment_method = safeData.paymentMethod || safeData.payment_method || 'Cash';
    const status = safeData.status || 'paid';
    const total_paid = safeData.totalPaid !== undefined ? Number(safeData.totalPaid) : (safeData.total_paid !== undefined ? Number(safeData.total_paid) : (status === 'open' ? 0 : grand_total));
    const items = safeData.cartItems || safeData.items || [];

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const insertTicketSql = `
            INSERT INTO tickets (order_type, table_number, subtotal, tax, grand_total, payment_method, status, total_paid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(insertTicketSql, [order_type, table_number, subtotal, tax, grand_total, payment_method, status, total_paid], function (err) {
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
                INSERT INTO ticket_items (ticket_id, item_id, quantity, price_at_time, kot_printed)
                VALUES (?, ?, ?, ?, ?)
            `;

            const stmt = db.prepare(insertItemSql);
            let hasError = false;
            let pendingCount = items.length;

            items.forEach((item) => {
                const itemId = item.id || item.item_id;
                const quantity = item.qty || item.quantity;
                const priceAtTime = item.price || item.price_at_time;
                const kotPrinted = (item.kot_printed === 1 || item.kot_printed === true || item.kotPrinted === 1) ? 1 : 0;

                stmt.run([ticketId, itemId, quantity, priceAtTime, kotPrinted], (itemErr) => {
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

export function holdTicket(orderData, callback) {
    const heldOrderData = {
        ...orderData,
        status: 'open',
        totalPaid: 0,
        total_paid: 0
    };
    return saveTicket(heldOrderData, callback);
}

export function getOpenTickets(callback) {
    const ticketsSql = `
        SELECT 
            t.ticket_id,
            t.order_type,
            t.table_number,
            t.subtotal,
            t.tax,
            t.grand_total,
            t.payment_method,
            t.status,
            t.total_paid,
            t.created_at
        FROM tickets t
        WHERE t.status = 'open'
        ORDER BY t.ticket_id DESC
    `;

    db.all(ticketsSql, [], (err, tickets) => {
        if (err) return callback(err);
        if (!tickets || tickets.length === 0) return callback(null, []);

        const itemsSql = `
            SELECT 
                ti.ticket_id,
                ti.id AS ticket_item_id,
                ti.item_id,
                ti.quantity AS qty,
                ti.quantity,
                ti.price_at_time AS price,
                ti.price_at_time,
                ti.kot_printed,
                i.name,
                i.category,
                i.type
            FROM ticket_items ti
            JOIN inventory i ON ti.item_id = i.item_id
            WHERE ti.ticket_id IN (${tickets.map(() => '?').join(',')})
        `;

        const ticketIds = tickets.map(t => t.ticket_id);
        db.all(itemsSql, ticketIds, (err2, items) => {
            if (err2) return callback(err2);

            const itemsByTicket = {};
            (items || []).forEach(item => {
                if (!itemsByTicket[item.ticket_id]) {
                    itemsByTicket[item.ticket_id] = [];
                }
                itemsByTicket[item.ticket_id].push({
                    id: item.item_id,
                    item_id: item.item_id,
                    ticket_item_id: item.ticket_item_id,
                    name: item.name,
                    price: item.price,
                    qty: item.qty,
                    quantity: item.quantity,
                    category: item.category,
                    type: item.type,
                    kot_printed: (item.kot_printed === 1 || item.kot_printed === true) ? 1 : 0
                });
            });

            const result = tickets.map(t => ({
                ...t,
                items: itemsByTicket[t.ticket_id] || [],
                cartItems: itemsByTicket[t.ticket_id] || []
            }));

            callback(null, result);
        });
    });
}

export function markKotPrinted(ticketId, callback) {
    if (!ticketId) {
        if (callback) callback(null, { success: true });
        return;
    }
    const sql = `UPDATE ticket_items SET kot_printed = 1 WHERE ticket_id = ?`;
    db.run(sql, [ticketId], function (err) {
        if (err) {
            console.error(`Failed to mark kot_printed = 1 for ticket #${ticketId}:`, err);
            if (callback) callback(err);
        } else {
            console.log(`Marked kot_printed = 1 for ticket #${ticketId}, rows modified:`, this.changes);
            if (callback) callback(null, { success: true, changes: this.changes });
        }
    });
}

export function updateOpenTicket(ticketId, updatedData, callback) {
    const safeData = updatedData || {};
    const subtotal = Number(safeData.subtotal || 0);
    const tax = Number(safeData.tax || 0);
    const grand_total = Number(safeData.grandTotal || safeData.grand_total || 0);
    const items = safeData.cartItems || safeData.items || [];

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const updateSql = `
            UPDATE tickets
            SET subtotal = ?, tax = ?, grand_total = ?
            WHERE ticket_id = ? AND status = 'open'
        `;

        db.run(updateSql, [subtotal, tax, grand_total, ticketId], function (err) {
            if (err) {
                db.run('ROLLBACK');
                return callback(err);
            }

            db.run('DELETE FROM ticket_items WHERE ticket_id = ?', [ticketId], (delErr) => {
                if (delErr) {
                    db.run('ROLLBACK');
                    return callback(delErr);
                }

                if (!items || items.length === 0) {
                    db.run('COMMIT');
                    return callback(null, { success: true, ticketId });
                }

                const insertItemSql = `
                    INSERT INTO ticket_items (ticket_id, item_id, quantity, price_at_time, kot_printed)
                    VALUES (?, ?, ?, ?, ?)
                `;

                const stmt = db.prepare(insertItemSql);
                let hasError = false;
                let pendingCount = items.length;

                items.forEach((item) => {
                    const itemId = item.id || item.item_id;
                    const quantity = item.qty || item.quantity;
                    const priceAtTime = item.price || item.price_at_time;
                    const kotPrinted = (item.kot_printed === 1 || item.kot_printed === true || item.kotPrinted === 1) ? 1 : 0;

                    stmt.run([ticketId, itemId, quantity, priceAtTime, kotPrinted], (itemErr) => {
                        if (itemErr && !hasError) {
                            hasError = true;
                            db.run('ROLLBACK');
                            return callback(itemErr);
                        }
                        pendingCount--;
                        if (pendingCount === 0 && !hasError) {
                            stmt.finalize();
                            db.run('COMMIT');
                            return callback(null, { success: true, ticketId });
                        }
                    });
                });
            });
        });
    });
}

export function closeTicket(ticketId, paymentMethod, callback) {
    let payMethod = 'Cash';
    let cb = callback;
    if (typeof paymentMethod === 'function') {
        cb = paymentMethod;
    } else if (typeof paymentMethod === 'string' && paymentMethod.trim().length > 0) {
        payMethod = paymentMethod;
    }

    const sql = `
        UPDATE tickets
        SET status = 'paid', payment_method = ?, total_paid = grand_total
        WHERE ticket_id = ?
    `;
    db.run(sql, [payMethod, ticketId], function (err) {
        if (cb) {
            if (err) return cb(err);
            cb(null, { success: true, ticketId, changes: this.changes });
        }
    });
}

/**
 * Save new Restaurant Registration with 7-Day Free Trial and persistent auto-login
 */
export function saveRestaurantRegistration(data, callback) {
    const {
        restaurant_name,
        phone,
        owner_name,
        branch,
        location,
        password,
        hardware_id
    } = data || {};

    const cleanName = (restaurant_name || 'My Restaurant').trim();
    const cleanPhone = (phone || '').trim();
    const cleanOwner = (owner_name || '').trim();
    const cleanBranch = (branch || 'Main Branch').trim();
    const cleanLocation = (location || '').trim();

    // Auto-generate Restaurant ID (e.g. D360-HYD-7492)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const cityCode = cleanLocation ? cleanLocation.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'POS') : 'IND';
    const generatedRestaurantId = data.restaurant_id || `D360-${cityCode}-${randomSuffix}`;

    const passwordHash = password ? crypto.createHash('sha256').update(String(password)).digest('hex') : '';

    const now = new Date();
    const trialDays = 7;
    const expiryDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const sql = 'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)';
        const stmt = db.prepare(sql);

        stmt.run('is_registered', 'true');
        stmt.run('restaurant_id', generatedRestaurantId);
        stmt.run('restaurant_name', cleanName);
        stmt.run('phone', cleanPhone);
        stmt.run('owner_name', cleanOwner);
        stmt.run('branch', cleanBranch);
        stmt.run('location', cleanLocation);
        stmt.run('password_hash', passwordHash);
        stmt.run('plan_status', 'trial');
        stmt.run('trial_start_date', now.toISOString());
        stmt.run('trial_end_date', expiryDate.toISOString());
        stmt.run('plan_validity_days', String(trialDays));
        stmt.run('plan_expiry_date', expiryDate.toISOString());
        stmt.run('auto_login_enabled', 'true');

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
                callback(null, {
                    success: true,
                    restaurant_id: generatedRestaurantId,
                    restaurant_name: cleanName,
                    owner_name: cleanOwner,
                    phone: cleanPhone,
                    branch: cleanBranch,
                    location: cleanLocation,
                    plan_status: 'trial',
                    plan_validity_days: trialDays,
                    plan_expiry_date: expiryDate.toISOString(),
                    days_remaining: trialDays
                });
            });
        });
    });
}

/**
 * Login existing restaurant and configure terminal auto-login
 */
export function loginRestaurant(data, callback) {
    const {
        restaurant_id,
        phone,
        password,
        restaurant_name,
        owner_name,
        branch,
        location,
        hardware_id,
        plan_status,
        plan_expiry_date
    } = data || {};

    const passHash = password ? crypto.createHash('sha256').update(String(password)).digest('hex') : '';

    // Check against local stored settings or cloud-passed payload
    getSetting('password_hash', (err, storedHash) => {
        getSetting('restaurant_id', (errId, storedId) => {
            getSetting('phone', (errPhone, storedPhone) => {
                const isLocalMatch = (storedId && storedId === restaurant_id) || (storedPhone && storedPhone === phone);
                if (isLocalMatch && storedHash && passHash && storedHash !== passHash) {
                    return callback(null, { success: false, error: 'Incorrect password' });
                }

                // Save or refresh session & enable auto-login
                const now = new Date();
                const defaultExpiry = plan_expiry_date || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    const sql = 'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)';
                    const stmt = db.prepare(sql);

                    stmt.run('is_registered', 'true');
                    stmt.run('restaurant_id', restaurant_id || storedId || 'D360-CLIENT');
                    if (restaurant_name) stmt.run('restaurant_name', restaurant_name);
                    if (phone) stmt.run('phone', phone);
                    if (owner_name) stmt.run('owner_name', owner_name);
                    if (branch) stmt.run('branch', branch);
                    if (location) stmt.run('location', location);
                    if (passHash) stmt.run('password_hash', passHash);
                    if (plan_status) stmt.run('plan_status', plan_status);
                    stmt.run('plan_expiry_date', defaultExpiry);
                    stmt.run('auto_login_enabled', 'true');
                    if (hardware_id) stmt.run('hardware_id', String(hardware_id));

                    stmt.finalize((finErr) => {
                        if (finErr) {
                            db.run('ROLLBACK');
                            return callback(finErr);
                        }
                        db.run('COMMIT', (cErr) => {
                            if (cErr) return callback(cErr);
                            callback(null, {
                                success: true,
                                restaurant_id: restaurant_id || storedId,
                                restaurant_name: restaurant_name,
                                auto_login_enabled: true
                            });
                        });
                    });
                });
            });
        });
    });
}

/**
 * Retrieve all app settings and calculate remaining trial/plan validity days
 */
export function getLicenseAndPlanStatus(callback) {
    db.all('SELECT key, value FROM app_settings', [], (err, rows) => {
        if (err) return callback(err);

        const settings = {};
        (rows || []).forEach(r => {
            settings[r.key] = r.value;
        });

        const isRegistered = settings.is_registered === 'true';
        const planExpiry = settings.plan_expiry_date ? new Date(settings.plan_expiry_date) : null;
        const now = new Date();

        let daysRemaining = 0;
        let isExpired = false;

        if (planExpiry) {
            const diffMs = planExpiry.getTime() - now.getTime();
            daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            if (daysRemaining <= 0) {
                isExpired = true;
            }
        } else if (isRegistered) {
            // Default 7 days if no expiry set yet
            daysRemaining = 7;
        }

        const planStatus = isExpired ? 'expired' : (settings.plan_status || 'trial');

        callback(null, {
            isRegistered,
            restaurantId: settings.restaurant_id || '',
            restaurantName: settings.restaurant_name || '',
            ownerName: settings.owner_name || '',
            phone: settings.phone || '',
            branch: settings.branch || 'Main Branch',
            location: settings.location || '',
            planStatus: planStatus,
            planExpiryDate: settings.plan_expiry_date || null,
            daysRemaining: daysRemaining,
            isExpired: isExpired,
            autoLoginEnabled: settings.auto_login_enabled === 'true'
        });
    });
}

/**
 * Update Subscription Payment & Extend Plan Validity
 */
export function updateSubscriptionPayment(paymentData, callback) {
    const {
        plan_name = 'Starter Monthly',
        amount = 999,
        payment_method = 'UPI',
        validity_days = 30,
        transaction_id = `TXN-${Date.now()}`
    } = paymentData || {};

    const now = new Date();
    const newExpiry = new Date(now.getTime() + validity_days * 24 * 60 * 60 * 1000);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Record payment in subscriptions_payments table
        const insertPaymentSql = `
            INSERT INTO subscriptions_payments (plan_name, amount, payment_method, transaction_id, validity_days, status)
            VALUES (?, ?, ?, ?, ?, 'completed')
        `;
        db.run(insertPaymentSql, [plan_name, amount, payment_method, transaction_id, validity_days], (payErr) => {
            if (payErr) {
                console.warn('Could not insert subscription record:', payErr.message);
            }

            // 2. Update app_settings with active status and new expiry date
            const updateSettingsSql = 'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)';
            const stmt = db.prepare(updateSettingsSql);

            stmt.run('plan_status', 'active');
            stmt.run('plan_validity_days', String(validity_days));
            stmt.run('plan_expiry_date', newExpiry.toISOString());
            stmt.run('last_payment_date', now.toISOString());
            stmt.run('last_transaction_id', transaction_id);

            stmt.finalize((stmtErr) => {
                if (stmtErr) {
                    db.run('ROLLBACK');
                    return callback(stmtErr);
                }

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) return callback(commitErr);
                    callback(null, {
                        success: true,
                        plan_status: 'active',
                        plan_expiry_date: newExpiry.toISOString(),
                        days_remaining: validity_days,
                        transaction_id: transaction_id
                    });
                });
            });
        });
    });
}

/**
 * Reset Registration State (Clears terminal activation to show Registration screen again)
 */
export function resetRegistration(callback) {
    const sql = `
        DELETE FROM app_settings 
        WHERE key IN ('is_registered', 'restaurant_id', 'restaurant_name', 'phone', 'owner_name', 'branch', 'location', 'password_hash', 'plan_status', 'trial_start_date', 'trial_end_date', 'plan_expiry_date', 'auto_login_enabled')
    `;
    db.run(sql, [], function (err) {
        if (callback) {
            if (err) return callback(err);
            callback(null, { success: true, changes: this.changes });
        }
    });
}

export default db;

