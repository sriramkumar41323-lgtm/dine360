import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://gdeqycudvaooypkoiqkj.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZXF5Y3VkdmFvb3lwa29pcWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwOTM0MzUsImV4cCI6MjEwMzY2OTQzNX0.foEik180bUqWRtVAALsKukt_gE7HeCdWk1A3DOwV0u4';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

let supabase = null;

export function getSupabaseClient() {
    if (!supabase) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}

export function isCloudConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'https://xyzcompany.supabase.co');
}

import crypto from 'crypto';

/**
 * Register restaurant in Supabase cloud
 */
export async function registerRestaurantInCloud(restaurantData) {
    if (!isCloudConfigured()) {
        console.log('[Supabase] Cloud not configured or offline mode. Storing locally.');
        return { success: true, cloudSynced: false };
    }

    try {
        const client = getSupabaseClient();
        const rawPassword = restaurantData.password || restaurantData.password_hash || '123456';
        const passwordHash = restaurantData.password_hash || crypto.createHash('sha256').update(String(rawPassword)).digest('hex');

        const { data, error } = await client
            .from('restaurants')
            .upsert({
                restaurant_id: restaurantData.restaurant_id,
                name: restaurantData.restaurant_name || restaurantData.name,
                phone: restaurantData.phone,
                owner_name: restaurantData.owner_name,
                branch: restaurantData.branch || 'Main Branch',
                location: restaurantData.location || 'India',
                password_hash: passwordHash,
                plan_status: 'trial',
                plan_validity_days: 7,
                trial_start_date: new Date().toISOString(),
                trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                plan_expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                hardware_id: restaurantData.hardware_id || null,
                is_active: true
            })
            .select();

        if (error) {
            console.error('[Supabase] Cloud registration error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, cloudSynced: true, data };
    } catch (err) {
        console.error('[Supabase] Cloud registration exception:', err);
        return { success: true, cloudSynced: false, error: err.message };
    }
}

/**
 * Sync Ticket to Supabase Cloud
 */
export async function syncTicketToCloud(restaurantId, orderData, ticketId) {
    if (!isCloudConfigured() || !restaurantId) return;

    try {
        const client = getSupabaseClient();
        const safeData = orderData || {};

        // 1. Insert/Upsert sales ticket
        const { error: ticketError } = await client
            .from('sales_tickets')
            .upsert({
                restaurant_id: restaurantId,
                ticket_id: ticketId,
                order_type: safeData.orderType || safeData.order_type || 'Dine-In',
                table_number: safeData.tableNumber || safeData.table_number || (safeData.selectedTable ? String(safeData.selectedTable) : null),
                subtotal: Number(safeData.subtotal || 0),
                tax: Number(safeData.tax || 0),
                grand_total: Number(safeData.grandTotal || safeData.grand_total || 0),
                payment_method: safeData.paymentMethod || safeData.payment_method || 'Cash',
                status: safeData.status || 'paid',
                total_paid: Number(safeData.totalPaid !== undefined ? safeData.totalPaid : safeData.grandTotal || 0)
            }, { onConflict: 'restaurant_id,ticket_id' });

        if (ticketError) {
            console.error('[Supabase] Failed to sync ticket:', ticketError);
            return;
        }

        // 2. Insert items
        const items = safeData.cartItems || safeData.items || [];
        if (items.length > 0) {
            const ticketItemsRows = items.map(item => ({
                restaurant_id: restaurantId,
                ticket_id: ticketId,
                item_id: item.id || item.item_id || 1,
                item_name: item.name || 'Item',
                quantity: item.qty || item.quantity || 1,
                price_at_time: Number(item.price || item.price_at_time || 0),
                kot_printed: (item.kot_printed === 1 || item.kot_printed === true) ? 1 : 0
            }));

            await client.from('sales_ticket_items').insert(ticketItemsRows);
        }
        console.log(`[Supabase] Ticket #${ticketId} synced to cloud successfully.`);
    } catch (err) {
        console.warn('[Supabase] Background ticket sync skipped (network/offline):', err.message);
    }
}

/**
 * Sync Single Inventory / Menu Item to Supabase Cloud
 */
export async function syncInventoryItemToCloud(restaurantId, item) {
    if (!isCloudConfigured() || !restaurantId || !item) return;

    try {
        const client = getSupabaseClient();
        await client.from('inventory').upsert({
            restaurant_id: restaurantId,
            item_id: item.id || item.item_id,
            name: item.name,
            price: Number(item.price || 0),
            category: item.category || 'General',
            type: (item.type && ['veg', 'non-veg', 'beverage', 'other'].includes(item.type.toLowerCase())) ? item.type.toLowerCase() : 'other',
            stock_qty: Number(item.stock_qty || item.stock || 100),
            is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
            updated_at: new Date().toISOString()
        }, { onConflict: 'restaurant_id,item_id' });
        console.log(`[Supabase] Synced inventory item '${item.name}' for ${restaurantId}`);
    } catch (err) {
        console.warn('[Supabase] Inventory item sync failed:', err.message);
    }
}

/**
 * Bulk Sync All Local Inventory Items to Cloud
 */
export async function syncAllInventoryToCloud(restaurantId, items = []) {
    if (!isCloudConfigured() || !restaurantId || !items.length) return;

    try {
        const client = getSupabaseClient();
        const rows = items.map(item => ({
            restaurant_id: restaurantId,
            item_id: item.id || item.item_id,
            name: item.name,
            price: Number(item.price || 0),
            category: item.category || 'General',
            type: (item.type && ['veg', 'non-veg', 'beverage', 'other'].includes(item.type.toLowerCase())) ? item.type.toLowerCase() : 'other',
            stock_qty: Number(item.stock_qty || item.stock || 100),
            is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
            updated_at: new Date().toISOString()
        }));

        const { error } = await client.from('inventory').upsert(rows, { onConflict: 'restaurant_id,item_id' });
        if (error) {
            console.error('[Supabase] Bulk inventory sync error:', error);
        } else {
            console.log(`[Supabase] Bulk synced ${rows.length} inventory items for ${restaurantId}`);
        }
    } catch (err) {
        console.warn('[Supabase] Bulk inventory sync failed:', err.message);
    }
}
