export default function Receipt({ ticket }) {
    if (!ticket) return null;

    const {
        ticketId = 1,
        orderType = 'Dine-In',
        createdAt = new Date().toLocaleString(),
        cart = [],
        subtotal = 0,
        cgst = 0,
        sgst = 0,
        grandTotal = 0,
        restaurantName = 'Royal Spice',
        restaurantAddress = '123 Gourmet Street, Jubilee Hills, Hyderabad',
        restaurantPhone = '+91 98765 43210'
    } = ticket;

    return (
        <div id="printable-receipt" className="bg-white text-black p-4 font-mono text-xs w-[300px] mx-auto border border-gray-200 shadow-sm leading-tight select-text">
            {/* Header */}
            <div className="text-center space-y-1 mb-2">
                <h2 className="font-extrabold text-base tracking-wider uppercase">{restaurantName}</h2>
                <p className="text-[10px] text-gray-700 leading-tight">{restaurantAddress}</p>
                <p className="text-[10px] text-gray-700">Ph: {restaurantPhone}</p>
                <p className="text-[10px] font-semibold text-gray-600 mt-1">GSTIN: 36ABCDE1234F1Z5</p>
            </div>

            <div className="text-center font-bold text-[10px] my-1">
                ----------------------------------------
            </div>

            {/* Ticket Metadata */}
            <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between font-bold">
                    <span>TICKET #{ticketId}</span>
                    <span>{orderType.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-600">
                    <span>DATE: {createdAt}</span>
                </div>
            </div>

            <div className="text-center font-bold text-[10px] my-1">
                ----------------------------------------
            </div>

            {/* Item List Header */}
            <div className="flex justify-between font-bold text-[10px] uppercase mb-1">
                <span>ITEM</span>
                <span>QTY x PRICE</span>
                <span className="text-right">AMT</span>
            </div>

            {/* Item List */}
            <div className="space-y-1.5 border-b border-dashed border-black pb-2 mb-2">
                {cart.map((item, idx) => {
                    const itemTotal = (item.price * item.qty).toFixed(2);
                    return (
                        <div key={idx} className="space-y-0.5">
                            <div className="font-bold text-[11px] truncate">{item.name}</div>
                            <div className="flex justify-between text-[10px] text-gray-800">
                                <span>{item.qty} x ₹{item.price}</span>
                                <span className="font-semibold">₹{itemTotal}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-700">
                    <span>CGST (2.5%):</span>
                    <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-700">
                    <span>SGST (2.5%):</span>
                    <span>₹{sgst.toFixed(2)}</span>
                </div>
                <div className="text-center font-bold text-[10px] my-1">
                    ----------------------------------------
                </div>
                <div className="flex justify-between font-extrabold text-sm border-t border-b border-black py-1">
                    <span>GRAND TOTAL:</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center space-y-1 mt-4 pt-2 text-[10px]">
                <p className="font-bold">Thank you for dining with us!</p>
                <p className="text-gray-500">Please visit again</p>
                <div className="mt-2 text-[8px] text-gray-400">
                    Dine360 POS System
                </div>
            </div>

            {/* Print CSS block */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    #printable-receipt, #printable-receipt * {
                        visibility: visible !important;
                    }
                    #printable-receipt {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 80mm !important;
                        margin: 0 !important;
                        padding: 8px !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
