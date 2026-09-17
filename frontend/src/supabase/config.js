import { createClient } from '@supabase/supabase-js';

// TODO: Reemplazar con tu configuración de Supabase
// Ir a Supabase Dashboard > Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qmjycvqcwerzbfsbbnla.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtanljdnFjd2VyemJmc2JibmxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODg3MjAsImV4cCI6MjA5Mjc2NDcyMH0.ccVTLjH0-hD5IfoU3HOvjQ0uD3wb4VXBmTcra2vg0GE';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Bucket name para firmas y PDFs
export const STORAGE_BUCKET = 'Cirugias';
