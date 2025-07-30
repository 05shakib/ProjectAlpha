import { createClient } from '@supabase/supabase-js';

// Access environment variables provided by Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log the values to the console for debugging, especially on Vercel
console.log('Supabase URL (from env):', supabaseUrl);
console.log('Supabase Anon Key (from env):', supabaseAnonKey ? 'Loaded' : 'Not Loaded'); // Avoid logging the full key for security

// Initialize the Supabase client
// This will be undefined if supabaseUrl or supabaseAnonKey are not valid
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// You can add an additional check here, though it won't prevent the app from crashing
// if the above `createClient` fails critically.
if (!supabase) {
  console.error('Failed to initialize Supabase client. Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
}
