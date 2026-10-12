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

    setOrderInfo(orderType, tableNumber, captain = '', station = 'Kitchen', kotNumber = 1) {
        this.orderType = orderType;
        this.tableNumber = tableNumber;
        this.captain = captain;
        this.station = station;
        this.kotNumber = kotNumber;
    }

    addItem(name, quantity) {
        this.items.push({ name, quantity });
    }

    cut() {
        this.isCut = true;
    }

    generateHTML() {
        const headerTitle = this.headerText || `*** ${this.station.toUpperCase()} ORDER TICKET (KOT #${this.kotNumber}) ***`;
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
                        font-size: 17px;
                        font-weight: 900;
                        margin-bottom: 10px;
                        border-bottom: 2px solid #000;
                        padding-bottom: 8px;
                    }
                    .station-badge {
                        display: inline-block;
                        border: 2px solid #000;
                        padding: 2px 8px;
                        font-size: 14px;
                        margin-top: 4px;
                        font-weight: 900;
                    }
                    .info {
                        font-size: 13px;
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
                        font-size: 13px;
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
                <div class="header">
                    <div>${headerTitle}</div>
                    <div class="station-badge">ROUTED TO: ${this.station.toUpperCase()} PRINTER</div>
                </div>
                <div class="info">
                    <div><span>Order Type:</span> <span>${this.orderType}</span></div>
                    <div><span>Table Number:</span> <span>${this.tableNumber}</span></div>
                    <div><span>KOT Sequence:</span> <span>KOT #${this.kotNumber}</span></div>
                    ${this.captain ? `<div><span>Captain / Waiter:</span> <span>${this.captain}</span></div>` : ''}
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
        console.log(`[ROUTING] Printing ${this.station} Ticket for Table:`, this.tableNumber, 'Items count:', this.items.length);

        console.log('=== KOT PRINT OUTPUT START ===');
        console.log(`TARGET STATION: ${this.station.toUpperCase()}`);
        console.log(this.headerText || `*** ${this.station.toUpperCase()} ORDER TICKET ***`);
        console.log(`Order Type: ${this.orderType} | Table: ${this.tableNumber} | Captain: ${this.captain || 'None'}`);
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
                        console.log(`${this.station} ticket printed silently`);
                        printWin.destroy();
                        resolve({ success: true, silent: true, station: this.station });
                    } else {
                        console.warn(`Silent ${this.station} print fallback:`, failureReason);
                        printWin.webContents.print({ silent: false, printBackground: true }, (fallbackSuccess, fallbackReason) => {
                            printWin.destroy();
                            if (fallbackSuccess) {
                                resolve({ success: true, silent: false, station: this.station });
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
    const orderType = orderData?.orderType || orderData?.order_type || 'Dine-In';
    const tableNumber = orderData?.tableNumber || orderData?.table_number || orderData?.selectedTable || 'N/A';
    const captain = orderData?.captain || orderData?.waiter || '';
    const kotNumber = orderData?.kotNumber || (isAddOn ? 2 : 1);

    const items = orderData?.cartItems || orderData?.items || [];
    
    // Intelligently separate Food items (Kitchen) vs Drink items (Bar)
    const isDrink = (item) => {
        const cat = String(item.category || '').toLowerCase();
        const name = String(item.name || item.item_name || '').toLowerCase();
        const drinkKeywords = ['beverage', 'drink', 'bar', 'soda', 'lassi', 'juice', 'shake', 'mojito', 'tea', 'coffee', 'water', 'cooler'];
        return drinkKeywords.some(k => cat.includes(k) || name.includes(k));
    };

    const foodItems = items.filter(i => !isDrink(i));
    const barItems = items.filter(i => isDrink(i));

    let kitchenRes = { success: true };
    let barRes = { success: true };

    // 1. Route Food items to Kitchen Printer
    if (foodItems.length > 0) {
        const kitchenPrinter = new KOTPrinter(orderData?.kitchenPrinter || printerName);
        const kitchenTitle = isAddOn ? `*** ADD-ON KITCHEN TICKET (KOT #${kotNumber}) ***` : `*** KITCHEN ORDER TICKET (KOT #${kotNumber}) ***`;
        kitchenPrinter.boldHeader(kitchenTitle);
        kitchenPrinter.setOrderInfo(orderType, tableNumber, captain, 'Kitchen', kotNumber);
        foodItems.forEach(item => {
            kitchenPrinter.addItem(item.name || item.item_name || 'Item', item.qty || item.quantity || 1);
        });
        kitchenPrinter.cut();
        kitchenRes = await kitchenPrinter.execute(senderWebContents);
    }

    // 2. Route Drinks to Bar Printer
    if (barItems.length > 0) {
        const barPrinter = new KOTPrinter(orderData?.barPrinter || printerName);
        const barTitle = isAddOn ? `*** ADD-ON BAR TICKET (BOT #${kotNumber}) ***` : `*** BAR ORDER TICKET (BOT #${kotNumber}) ***`;
        barPrinter.boldHeader(barTitle);
        barPrinter.setOrderInfo(orderType, tableNumber, captain, 'Bar', kotNumber);
        barItems.forEach(item => {
            barPrinter.addItem(item.name || item.item_name || 'Drink', item.qty || item.quantity || 1);
        });
        barPrinter.cut();
        barRes = await barPrinter.execute(senderWebContents);
    }

    const bothSuccess = kitchenRes.success && barRes.success;
    const routedMsg = foodItems.length > 0 && barItems.length > 0
        ? `KOT Routed: Food sent to Kitchen Printer (${foodItems.length} items), Drinks sent to Bar Printer (${barItems.length} items)`
        : foodItems.length > 0 
            ? `KOT sent to Kitchen Printer (${foodItems.length} items)`
            : `BOT sent to Bar Printer (${barItems.length} items)`;

    return {
        success: bothSuccess,
        message: routedMsg,
        kitchenRes,
        barRes
    };
}
