import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://gdeqycudvaooypkoiqkj.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZXF5Y3VkdmFvb3lwa29pcWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwOTM0MzUsImV4cCI6MjEwMzY2OTQzNX0.foEik180bUqWRtVAALsKukt_gE7HeCdWk1A3DOwV0u4';

// Default Supabase project configuration (can be customized via environment variables or settings)
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || DEFAULT_URL;
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

export const isSupabaseConfigured = () => {
    return (
        SUPABASE_URL && 
        SUPABASE_URL !== 'https://xyzcompany.supabase.co' && 
        SUPABASE_ANON_KEY && 
        SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key'
    );
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});

export default supabase;
