import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import axios from 'axios';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import log from 'electron-log';
import nodeMachineId from 'node-machine-id';
const { machineIdSync } = nodeMachineId;
import { fileURLToPath } from 'url';
import { 
    saveTicket, 
    getDashboardMetrics, 
    getInventory, 
    addInventoryItem, 
    updateInventoryItem, 
    deleteInventoryItem,
    authenticateUser,
    getSetting,
    saveActivationData,
    runMigrations
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCurrentHardwareId() {
    try {
        return machineIdSync({ original: true });
    } catch (err) {
        console.error('Failed to retrieve machine hardware UUID:', err);
        return 'UNKNOWN_HARDWARE_ID';
    }
}

let mainWindow;

const activeDbPath = path.join(app.getPath('userData'), 'dine360.sqlite');

function getBackupDir() {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}

function backupDatabase() {
    try {
        const backupDir = getBackupDir();
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const fileName = `dine360_backup_${dateStr}_${timeStr}.sqlite`;
        const destPath = path.join(backupDir, fileName);

        if (!fs.existsSync(activeDbPath)) {
            console.error('Backup failed: Active SQLite database file not found at:', activeDbPath);
            return { success: false, error: 'Database file not found' };
        }

        fs.copyFileSync(activeDbPath, destPath);
        console.log(`Database backup created successfully: ${destPath}`);

        // Pruning logic: Keep at most 30 backup files
        const backupFiles = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('dine360_backup_') && f.endsWith('.sqlite'))
            .map(f => {
                const filePath = path.join(backupDir, f);
                const stat = fs.statSync(filePath);
                return { fileName: f, filePath, mtime: stat.mtimeMs };
            })
            .sort((a, b) => a.mtime - b.mtime); // Oldest first

        if (backupFiles.length > 30) {
            const filesToDelete = backupFiles.slice(0, backupFiles.length - 30);
            filesToDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.filePath);
                    console.log(`Pruned old backup file: ${file.fileName}`);
                } catch (delErr) {
                    console.error(`Failed to prune file ${file.fileName}:`, delErr);
                }
            });
        }

        return { success: true, fileName, backupPath: destPath };
    } catch (err) {
        console.error('Database backup failed with exception:', err);
        return { success: false, error: err.message };
    }
}

autoUpdater.logger = log;
if (autoUpdater.logger.transports && autoUpdater.logger.transports.file) {
    autoUpdater.logger.transports.file.level = 'info';
}
log.info('Dine360 POS starting up...');

function initializeUpdater(win) {
    if (!win) return;

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for software update...');
        win.webContents.send('checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info);
        win.webContents.send('update-available', info);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = progressObj ? (progressObj.percent || 0) : 0;
        log.info(`Download progress: ${percent.toFixed(1)}%`);
        win.webContents.send('update-progress', percent);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded and ready to install:', info);
        win.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('error', (err) => {
        log.error('Auto-updater error:', err);
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log.warn('Failed to check for updates (offline or unpublished repo):', err?.message || err);
    });
}

// IPC Listener to trigger immediate restart and update installation
ipcMain.on('restart-and-install-update', () => {
    log.info('Received restart-and-install-update IPC trigger from renderer');
    autoUpdater.quitAndInstall();
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }

    initializeUpdater(mainWindow);
}

// IPC Listener to save tickets to SQLite database
ipcMain.on('save-ticket', (event, orderData) => {
    console.log('IPC received save-ticket request:', orderData);
    saveTicket(orderData, (err, ticketId) => {
        if (err) {
            console.error('Failed to save ticket to database:', err);
            event.reply('save-ticket-response', {
                success: false,
                error: err.message || 'Database error occurred'
            });
        } else {
            console.log(`Ticket #${ticketId} saved successfully.`);
            event.reply('save-ticket-response', {
                success: true,
                ticketId: ticketId
            });
        }
    });
});

// IPC Listener to fetch Admin Dashboard metrics from SQLite database
ipcMain.on('get-dashboard-data', (event) => {
    getDashboardMetrics((err, data) => {
        if (err) {
            console.error('Failed to fetch dashboard metrics:', err);
            event.reply('get-dashboard-data-response', {
                success: false,
                error: err.message
            });
        } else {
            event.reply('get-dashboard-data-response', {
                success: true,
                data: data
            });
        }
    });
});

// 1. Get Inventory List
ipcMain.on('get-inventory', (event) => {
    getInventory((err, items) => {
        if (err) {
            console.error('Failed to fetch inventory:', err);
            event.reply('get-inventory-response', { success: false, error: err.message });
        } else {
            event.reply('get-inventory-response', { success: true, items });
        }
    });
});

// 2. Add Inventory Item
ipcMain.on('add-item', (event, item) => {
    addInventoryItem(item, (err, itemId) => {
        if (err) {
            console.error('Failed to add item:', err);
            event.reply('add-item-response', { success: false, error: err.message });
        } else {
            event.reply('add-item-response', { success: true, itemId });
        }
    });
});

// 3. Update Inventory Item
ipcMain.on('update-item', (event, item) => {
    updateInventoryItem(item, (err, changes) => {
        if (err) {
            console.error('Failed to update item:', err);
            event.reply('update-item-response', { success: false, error: err.message });
        } else {
            event.reply('update-item-response', { success: true, changes });
        }
    });
});

// 4. Delete Inventory Item
ipcMain.on('delete-item', (event, itemId) => {
    deleteInventoryItem(itemId, (err, changes) => {
        if (err) {
            console.error('Failed to delete item:', err);
            event.reply('delete-item-response', { success: false, error: err.message });
        } else {
            event.reply('delete-item-response', { success: true, changes });
        }
    });
});

// 5. Authenticate PIN
ipcMain.handle('authenticate-pin', async (event, pin) => {
    return new Promise((resolve) => {
        authenticateUser(pin, (err, user) => {
            if (err) {
                console.error('Authentication error:', err);
                resolve({ success: false, message: 'Database authentication error' });
            } else if (!user) {
                resolve({ success: false, message: 'Invalid PIN' });
            } else {
                resolve({ success: true, user });
            }
        });
    });
});

// 6. Manual Database Backup Trigger
ipcMain.handle('trigger-manual-backup', async () => {
    return backupDatabase();
});

ipcMain.on('trigger-manual-backup', (event) => {
    const res = backupDatabase();
    event.reply('trigger-manual-backup-response', res);
});

// 7. Get Connected Printers
ipcMain.handle('get-printers', async (event) => {
    try {
        return await event.sender.getPrintersAsync();
    } catch (err) {
        console.error('Failed to get printers:', err);
        return [];
    }
});

// 8. Silent 80mm Thermal Receipt Print (with OS Dialog Fallback)
ipcMain.handle('print-receipt', async (event, printerName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'BrowserWindow not found' };

    return new Promise((resolve) => {
        try {
            const printOptions = {
                silent: true,
                margins: { marginType: 'none' },
                printBackground: true
            };

            if (printerName) {
                printOptions.deviceName = printerName;
            }

            win.webContents.print(printOptions, (success, failureReason) => {
                if (success) {
                    console.log(`Receipt printed silently via printer: ${printerName || 'OS Default'}`);
                    resolve({ success: true, silent: true });
                } else {
                    console.warn(`Silent print failed (${failureReason || 'No physical thermal printer or virtual PDF driver'}). Opening system print fallback...`);
                    // Fallback to standard print dialog if silent print fails
                    win.webContents.print({ silent: false, printBackground: true }, (fallbackSuccess, fallbackReason) => {
                        if (fallbackSuccess) {
                            resolve({ success: true, silent: false });
                        } else {
                            resolve({ 
                                success: false, 
                                error: failureReason || fallbackReason || 'No printer connected or print spooled error' 
                            });
                        }
                    });
                }
            });
        } catch (err) {
            console.error('Error executing webContents.print:', err);
            resolve({ success: false, error: err.message || 'Print execution error' });
        }
    });
});

// 9. Get App Setting
ipcMain.handle('get-setting', async (event, key) => {
    return new Promise((resolve) => {
        getSetting(key, (err, value) => {
            if (err) {
                console.error(`Failed to get setting ${key}:`, err);
                resolve({ success: false, value: null });
            } else {
                resolve({ success: true, value });
            }
        });
    });
});

// 10. Cloud Software Activation IPC
ipcMain.handle('activate-software', async (event, payload) => {
    const licenseKey = typeof payload === 'string' ? payload : (payload?.license_key || payload?.licenseKey || '');
    const restaurantName = payload?.restaurant_name || payload?.restaurantName || 'Royal Spice';

    let cloudValid;
    try {
        const response = await axios.post('https://api.dine360.com/verify-license', {
            licenseKey,
            restaurantName
        }, { timeout: 3000 });
        cloudValid = response.data === true || response.data?.valid === true || response.data?.success === true;
    } catch (err) {
        console.warn('Cloud license verification endpoint offline/placeholder fallback. Granting dev verification:', err.message);
        cloudValid = true; // Offline / dev mode fallback
    }

    if (!cloudValid) {
        return { success: false, error: 'Invalid activation license key.' };
    }

    const hwId = getCurrentHardwareId();
    const activationPayload = {
        restaurant_name: restaurantName,
        license_key: licenseKey,
        hardware_id: hwId
    };

    return new Promise((resolve) => {
        saveActivationData(activationPayload, (err, result) => {
            if (err) {
                console.error('Failed to save cloud activation:', err);
                resolve({ success: false, error: err.message || 'Activation save error' });
            } else {
                resolve(result || { success: true });
            }
        });
    });
});

// Alias save-activation handler for backward compatibility
ipcMain.handle('save-activation', async (event, data) => {
    const hwId = getCurrentHardwareId();
    const activationPayload = { ...data, hardware_id: hwId };
    return new Promise((resolve) => {
        saveActivationData(activationPayload, (err, result) => {
            if (err) {
                console.error('Failed to save activation:', err);
                resolve({ success: false, error: err.message || 'Activation save error' });
            } else {
                resolve(result || { success: true });
            }
        });
    });
});

// 11. Offline Boot Security & Hardware Verification Check
ipcMain.handle('verify-hardware', async () => {
    const currentHwId = getCurrentHardwareId();
    return new Promise((resolve) => {
        getSetting('is_registered', (regErr, isRegistered) => {
            if (regErr || isRegistered !== 'true') {
                return resolve({ activated: false, isValid: true, reason: 'unregistered' });
            }
            getSetting('hardware_id', (hwErr, boundHwId) => {
                if (hwErr || !boundHwId) {
                    return resolve({ activated: false, isValid: true, reason: 'unregistered' });
                }
                if (String(boundHwId).trim() === String(currentHwId).trim()) {
                    return resolve({ activated: true, isValid: true });
                } else {
                    console.warn(`Hardware Mismatch! Database bound to [${boundHwId}], current machine is [${currentHwId}]`);
                    return resolve({ activated: false, isValid: false, reason: 'hardware_mismatch' });
                }
            });
        });
    });
});

app.whenReady().then(() => {
    runMigrations((err, version) => {
        if (err) {
            console.error('Database migration failed on startup:', err);
        } else {
            console.log(`Database schema verified at PRAGMA user_version = ${version}`);
        }
        getBackupDir();
        createWindow();
    });

    // Schedule daily automated backup at 3:00 AM
    cron.schedule('0 3 * * *', () => {
        console.log('Running scheduled 3:00 AM database backup...');
        backupDatabase();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});