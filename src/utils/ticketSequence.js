// Daily Sequential Ticket Helper
// Generates clean daily ticket numbers (#1, #2, #3...) for restaurants,
// while creating unique INT4 safe IDs for Supabase (YYMMDDxxx).

export function getNextDailyTicket() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // 'YYYY-MM-DD'
    const lastDate = localStorage.getItem('dine360_daily_ticket_date');
    let currentSeq = parseInt(localStorage.getItem('dine360_daily_ticket_seq') || '0', 10);

    if (lastDate !== today || isNaN(currentSeq) || currentSeq <= 0) {
        currentSeq = 1;
        localStorage.setItem('dine360_daily_ticket_date', today);
    } else {
        currentSeq += 1;
    }

    localStorage.setItem('dine360_daily_ticket_seq', currentSeq.toString());

    // Unique integer for database (PostgreSQL INT4 max is 2,147,483,647)
    // Format: YYMMDD000 + seq (e.g. 261005001, max 9 digits, fits easily in INT4)
    const [year, month, day] = today.split('-');
    const yy = year.slice(-2);
    const dbTicketId = parseInt(`${yy}${month}${day}${String(currentSeq).padStart(3, '0')}`, 10);

    return {
        dailySeq: currentSeq,
        dbTicketId: dbTicketId
    };
}

export function formatDisplayTicketNumber(ticketId, dailySeq) {
    if (dailySeq && typeof dailySeq === 'number') {
        return `#${dailySeq}`;
    }
    if (!ticketId) return '#1';
    
    const num = Number(ticketId);
    if (!isNaN(num)) {
        // If it's our YYMMDDxxx format (9 digits, e.g. 261005001)
        if (num >= 200000000 && num <= 999999999) {
            const seqStr = String(num).slice(6);
            return `#${parseInt(seqStr, 10)}`;
        }
        // If it's an old Unix millisecond timestamp (13 digits like 1791175660330)
        if (num > 1000000000000) {
            const smallSeq = (num % 1000) || 1;
            return `#${smallSeq}`;
        }
        // If it's already a clean small number (1, 2, 101, etc.)
        if (num < 10000) {
            return `#${num}`;
        }
    }
    return `#${ticketId}`;
}
