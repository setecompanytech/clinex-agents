import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const db = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
