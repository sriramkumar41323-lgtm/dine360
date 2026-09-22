import { createClient } from '@supabase/supabase-js';

// Nee Supabase Dashboard (Settings -> API) nunchi ivvi copy cheskovali
const supabaseUrl = 'https://dfijxyaapeyphtqzsctu.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmaWp4eWFhcGV5cGh0cXpzY3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NjU0MzQsImV4cCI6MjEwNDM0MTQzNH0.J_gG6FTBZ-wXZb0wpaK0ocJp0V0vLlCg1PxmOUNO3zY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);