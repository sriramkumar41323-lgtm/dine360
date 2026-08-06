import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    saveTicket: (orderData) => ipcRenderer.send('save-ticket', orderData),
    onSaveTicketResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('save-ticket-response', handler);
        return () => ipcRenderer.removeListener('save-ticket-response', handler);
    },
    getDashboardData: () => ipcRenderer.send('get-dashboard-data'),
    onDashboardDataResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('get-dashboard-data-response', handler);
        return () => ipcRenderer.removeListener('get-dashboard-data-response', handler);
    },
    getInventory: () => ipcRenderer.send('get-inventory'),
    onGetInventoryResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('get-inventory-response', handler);
        return () => ipcRenderer.removeListener('get-inventory-response', handler);
    },
    addItem: (item) => ipcRenderer.send('add-item', item),
    onAddItemResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('add-item-response', handler);
        return () => ipcRenderer.removeListener('add-item-response', handler);
    },
    updateItem: (item) => ipcRenderer.send('update-item', item),
    onUpdateItemResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('update-item-response', handler);
        return () => ipcRenderer.removeListener('update-item-response', handler);
    },
    deleteItem: (itemId) => ipcRenderer.send('delete-item', itemId),
    onDeleteItemResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('delete-item-response', handler);
        return () => ipcRenderer.removeListener('delete-item-response', handler);
    },
    authenticatePin: (pin) => ipcRenderer.invoke('authenticate-pin', pin),
    onAuthenticatePinResponse: (callback) => {
        const handler = (event, response) => callback(response);
        ipcRenderer.on('authenticate-pin-response', handler);
        return () => ipcRenderer.removeListener('authenticate-pin-response', handler);
    },
    triggerManualBackup: () => ipcRenderer.invoke('trigger-manual-backup'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printReceipt: (printerName) => ipcRenderer.invoke('print-receipt', printerName),
    getSetting: (key) => ipcRenderer.invoke('get-setting', key),
    saveActivation: (data) => ipcRenderer.invoke('save-activation', data),
    activateSoftware: (data) => ipcRenderer.invoke('activate-software', data),
    verifyHardware: () => ipcRenderer.invoke('verify-hardware'),
    onUpdateAvailable: (callback) => {
        const handler = (event, info) => callback(info);
        ipcRenderer.on('update-available', handler);
        return () => ipcRenderer.removeListener('update-available', handler);
    },
    onUpdateProgress: (callback) => {
        const handler = (event, percent) => callback(percent);
        ipcRenderer.on('update-progress', handler);
        return () => ipcRenderer.removeListener('update-progress', handler);
    },
    onUpdateDownloaded: (callback) => {
        const handler = (event, info) => callback(info);
        ipcRenderer.on('update-downloaded', handler);
        return () => ipcRenderer.removeListener('update-downloaded', handler);
    },
    restartAndInstallUpdate: () => ipcRenderer.send('restart-and-install-update')
});
