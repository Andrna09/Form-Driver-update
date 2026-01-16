import { createClient } from '@supabase/supabase-js';

// Mengambil kunci dari .env (Laptop) atau Vercel Settings (Cloud)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("⚠️ Supabase URL/Key belum disetting! Cek .env atau Vercel.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
