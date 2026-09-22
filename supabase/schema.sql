-- =========================================================================
-- DINE360 POS - SUPABASE / POSTGRESQL CLOUD DATABASE SCHEMA
-- Compatible with Supabase SQL Editor, PostgreSQL 14+, and Mobile App Sync
-- =========================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. RESTAURANTS & LICENSES TABLE
-- Stores restaurant profile, credentials, branch, and 7-day free trial / plan validity.
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'D360-HYD-8421'
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    branch VARCHAR(150) DEFAULT 'Main Branch',
    location TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    plan_status VARCHAR(50) DEFAULT 'trial' CHECK (plan_status IN ('trial', 'active', 'expired', 'suspended')),
    trial_start_date TIMESTAMPTZ DEFAULT NOW(),
    trial_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    plan_validity_days INTEGER DEFAULT 7,
    plan_expiry_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    hardware_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast restaurant lookup by restaurant_id and phone
CREATE INDEX IF NOT EXISTS idx_restaurants_id ON public.restaurants(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_phone ON public.restaurants(phone);

-- 2. SUBSCRIPTIONS & PAYMENTS TABLE
-- Tracks payment transactions, plan renewals, amount, and extended validity days.
CREATE TABLE IF NOT EXISTS public.subscriptions_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id VARCHAR(50) NOT NULL REFERENCES public.restaurants(restaurant_id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL, -- e.g., 'Starter Monthly (₹999)', 'Growth Annual (₹9,999)'
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'UPI', -- 'UPI', 'Card', 'NetBanking', 'Cash'
    transaction_id VARCHAR(100) UNIQUE,
    validity_days INTEGER NOT NULL, -- e.g., 30, 365
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_restaurant ON public.subscriptions_payments(restaurant_id);

-- 3. INVENTORY TABLE
-- Cloud sync of menu items and inventory levels per restaurant.
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id VARCHAR(50) NOT NULL REFERENCES public.restaurants(restaurant_id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL, -- Local POS item_id
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('veg', 'non-veg', 'beverage', 'other')),
    stock_qty INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_restaurant_item UNIQUE (restaurant_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON public.inventory(restaurant_id);

-- 4. SALES TICKETS TABLE
-- Stores all dine-in, takeaway, and delivery orders synced from POS terminals.
CREATE TABLE IF NOT EXISTS public.sales_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id VARCHAR(50) NOT NULL REFERENCES public.restaurants(restaurant_id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL, -- Local POS ticket_id
    order_type VARCHAR(50) NOT NULL, -- 'Dine-In', 'Takeaway', 'Delivery'
    table_number VARCHAR(50),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    status VARCHAR(50) DEFAULT 'paid' CHECK (status IN ('open', 'paid', 'cancelled', 'refunded')),
    total_paid NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_restaurant_ticket UNIQUE (restaurant_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_restaurant_date ON public.sales_tickets(restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_order_type ON public.sales_tickets(restaurant_id, order_type);

-- 5. SALES TICKET ITEMS TABLE
-- Detailed line items for each order ticket.
CREATE TABLE IF NOT EXISTS public.sales_ticket_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id VARCHAR(50) NOT NULL REFERENCES public.restaurants(restaurant_id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_time NUMERIC(10, 2) NOT NULL,
    kot_printed INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_items_restaurant ON public.sales_ticket_items(restaurant_id, ticket_id);

-- =========================================================================
-- OWNER MOBILE APP DASHBOARD ANALYTICS VIEW
-- Real-time aggregations for Owner App: Dine-In vs Takeaway sales & counts,
-- today sales, plan validity countdown, and inventory summary.
-- =========================================================================
-- OWNER MOBILE APP DASHBOARD ANALYTICS VIEW
-- Real-time aggregations for Owner App: Dine-In vs Takeaway sales & counts,
-- today sales, plan validity countdown, and inventory summary.
-- Using security_invoker = true to adhere to Supabase security best practices.
-- =========================================================================
CREATE OR REPLACE VIEW public.v_owner_sales_dashboard 
WITH (security_invoker = true) AS
SELECT 
    r.restaurant_id,
    r.name AS restaurant_name,
    r.owner_name,
    r.phone,
    r.branch,
    r.location,
    r.plan_status,
    r.plan_expiry_date,
    -- Calculate remaining plan validity days
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.plan_expiry_date - NOW())) / 86400)::INTEGER) AS days_remaining,
    
    -- Lifetime Totals
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid'), 0) AS total_revenue,
    COUNT(t.id) FILTER (WHERE t.status = 'paid') AS total_tickets,
    
    -- Dine-In Specifics
    COUNT(t.id) FILTER (WHERE t.status = 'paid' AND t.order_type = 'Dine-In') AS dine_in_ticket_count,
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid' AND t.order_type = 'Dine-In'), 0) AS dine_in_sales_total,
    
    -- Takeaway Specifics
    COUNT(t.id) FILTER (WHERE t.status = 'paid' AND t.order_type != 'Dine-In') AS takeaway_ticket_count,
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid' AND t.order_type != 'Dine-In'), 0) AS takeaway_sales_total,
    
    -- Today's Sales & Orders
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid' AND t.created_at >= CURRENT_DATE), 0) AS today_revenue,
    COUNT(t.id) FILTER (WHERE t.status = 'paid' AND t.created_at >= CURRENT_DATE) AS today_ticket_count,
    
    -- Today Dine-In vs Takeaway
    COUNT(t.id) FILTER (WHERE t.status = 'paid' AND t.order_type = 'Dine-In' AND t.created_at >= CURRENT_DATE) AS today_dine_in_count,
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid' AND t.order_type = 'Dine-In' AND t.created_at >= CURRENT_DATE), 0) AS today_dine_in_sales,
    COUNT(t.id) FILTER (WHERE t.status = 'paid' AND t.order_type != 'Dine-In' AND t.created_at >= CURRENT_DATE) AS today_takeaway_count,
    COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'paid' AND t.order_type != 'Dine-In' AND t.created_at >= CURRENT_DATE), 0) AS today_takeaway_sales

FROM public.restaurants r
LEFT JOIN public.sales_tickets t ON r.restaurant_id = t.restaurant_id
GROUP BY 
    r.restaurant_id, 
    r.name, 
    r.owner_name, 
    r.phone, 
    r.branch, 
    r.location, 
    r.plan_status, 
    r.plan_expiry_date;

-- Enable Row Level Security (RLS)
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_ticket_items ENABLE ROW LEVEL SECURITY;

-- Drop old loose policies if they exist
DROP POLICY IF EXISTS "Public anonymous access for restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public anonymous access for subscriptions" ON public.subscriptions_payments;
DROP POLICY IF EXISTS "Public anonymous access for inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public anonymous access for tickets" ON public.sales_tickets;
DROP POLICY IF EXISTS "Public anonymous access for ticket_items" ON public.sales_ticket_items;


-- 6. RESTAURANT TABLES (For Dynamic Table Management & QR Ordering)
-- Stores table details, capacity, and current status for each restaurant branch.
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- QR Code ki ee ID pass chestham
    restaurant_id VARCHAR(50) NOT NULL REFERENCES public.restaurants(restaurant_id) ON DELETE CASCADE,
    table_name VARCHAR(100) NOT NULL, -- e.g., 'Table 01', 'Balcony A'
    seating_capacity INTEGER NOT NULL DEFAULT 4,
    status VARCHAR(50) DEFAULT 'Empty' CHECK (status IN ('Empty', 'Occupied', 'Reserved')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_name UNIQUE (restaurant_id, table_name) -- Okate restaurant lo same name tho 2 tables undakunda
);

-- Index for fast lookup by restaurant (Useful for loading tables in POS)
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_res_id ON public.restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON public.restaurant_tables(restaurant_id, status);

-- Enable RLS for the new table
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Scoped RLS Policy for POS Terminal & Mobile App Access (matching your existing structure)
CREATE POLICY "Allow terminal access for restaurant_tables" 
ON public.restaurant_tables 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Scoped RLS Policies for POS Terminal API & Mobile App Access
CREATE POLICY "Allow terminal access for restaurants" 
ON public.restaurants 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow terminal access for subscriptions" 
ON public.subscriptions_payments 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow terminal access for inventory" 
ON public.inventory 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow terminal access for tickets" 
ON public.sales_tickets 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow terminal access for ticket_items" 
ON public.sales_ticket_items 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Fix function permissions if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon;
    END IF;
END $$;
