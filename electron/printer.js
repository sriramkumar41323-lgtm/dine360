import { BrowserWindow } from 'electron';

export class KOTPrinter {
    constructor(printerName = '') {
        this.printerName = printerName;
        this.commands = [];
        this.items = [];
        this.orderType = 'Dine-In';
        this.tableNumber = 'N/A';
        this.isCut = false;
    }

    boldHeader(headerText) {
        this.headerText = headerText;
        this.commands.push({ type: 'header', text: headerText, bold: true });
    }

    setOrderInfo(orderType, tableNumber) {
        this.orderType = orderType;
        this.tableNumber = tableNumber;
    }

    addItem(name, quantity) {
        this.items.push({ name, quantity });
    }

    cut() {
        this.isCut = true;
    }

    generateHTML() {
        const headerTitle = this.headerText || '*** KITCHEN ORDER TICKET (KOT) ***';
        const itemRows = this.items.map(item => `
            <tr style="border-bottom: 1px dashed #ccc;">
                <td style="padding: 6px 0; font-size: 16px; font-weight: bold;">${item.name}</td>
                <td style="padding: 6px 0; font-size: 18px; font-weight: bold; text-align: right;">x${item.quantity}</td>
            </tr>
        `).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    @page { margin: 0; size: 80mm auto; }
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        width: 76mm;
                        margin: 0 auto;
                        padding: 10px 5px;
                        color: #000;
                        background: #fff;
                    }
                    .header {
                        text-align: center;
                        font-size: 18px;
                        font-weight: 900;
                        margin-bottom: 10px;
                        border-bottom: 2px solid #000;
                        padding-bottom: 8px;
                    }
                    .info {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 10px;
                        border-bottom: 1px dashed #000;
                        padding-bottom: 6px;
                    }
                    .info div {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 3px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th {
                        text-align: left;
                        font-size: 14px;
                        border-bottom: 1px solid #000;
                        padding-bottom: 4px;
                    }
                    .cut-notice {
                        margin-top: 20px;
                        text-align: center;
                        font-size: 10px;
                        border-top: 1px dashed #000;
                        padding-top: 5px;
                    }
                </style>
            </head>
            <body>
                <div class="header">${headerTitle}</div>
                <div class="info">
                    <div><span>Order Type:</span> <span>${this.orderType}</span></div>
                    <div><span>Table Number:</span> <span>${this.tableNumber}</span></div>
                    <div><span>Time:</span> <span>${new Date().toLocaleTimeString()}</span></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th style="text-align: right;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemRows}
                    </tbody>
                </table>
                ${this.isCut ? '<div class="cut-notice">--- KOT CUT COMMAND EXECUTED ---</div>' : ''}
            </body>
            </html>
        `;
    }

    async execute() {
        console.log('Printing KOT for Table:', this.tableNumber, 'Items count:', this.items.length);
        
        console.log('=== KOT PRINT OUTPUT START ===');
        console.log(this.headerText || '*** KITCHEN ORDER TICKET (KOT) ***');
        console.log(`Order Type: ${this.orderType}`);
        console.log(`Table Number: ${this.tableNumber}`);
        this.items.forEach(i => console.log(` - ${i.name} x${i.quantity}`));
        if (this.isCut) console.log('[CUT COMMAND EXECUTED]');
        console.log('=== KOT PRINT OUTPUT END ===');

        const htmlContent = this.generateHTML();

        return new Promise((resolve) => {
            let printWin = new BrowserWindow({
                show: false,
                webPreferences: { nodeIntegration: false }
            });

            printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

            printWin.webContents.on('did-finish-load', () => {
                const printOptions = {
                    silent: true,
                    margins: { marginType: 'none' },
                    printBackground: true
                };

                if (this.printerName) {
                    printOptions.deviceName = this.printerName;
                }

                printWin.webContents.print(printOptions, (success, failureReason) => {
                    if (success) {
                        console.log('KOT printed silently');
                        printWin.destroy();
                        resolve({ success: true, silent: true });
                    } else {
                        console.warn('Silent KOT print failed/unsupported. Attempting system dialog fallback:', failureReason);
                        printWin.webContents.print({ silent: false, printBackground: true }, (fallbackSuccess, fallbackReason) => {
                            printWin.destroy();
                            if (fallbackSuccess) {
                                resolve({ success: true, silent: false });
                            } else {
                                resolve({ success: false, error: failureReason || fallbackReason || 'KOT Print error' });
                            }
                        });
                    }
                });
            });
        });
    }
}

export async function printKOT(orderData, printerName = '', senderWebContents = null, isAddOn = false) {
    const printer = new KOTPrinter(printerName);

    const headerText = isAddOn ? '*** ADD-ON / RUNNING KOT ***' : '*** KITCHEN ORDER TICKET (KOT) ***';
    printer.boldHeader(headerText);

    const orderType = orderData?.orderType || orderData?.order_type || 'Dine-In';
    const tableNumber = orderData?.tableNumber || orderData?.table_number || orderData?.selectedTable || 'N/A';
    printer.setOrderInfo(orderType, tableNumber);

    const items = orderData?.cartItems || orderData?.items || [];
    items.forEach(item => {
        const name = item.name || item.item_name || 'Unknown Item';
        const qty = item.qty || item.quantity || 1;
        printer.addItem(name, qty);
    });

    printer.cut();
    return await printer.execute(senderWebContents);
}
