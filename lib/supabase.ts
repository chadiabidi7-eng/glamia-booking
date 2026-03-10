import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gdgfgbxoapgmrbttdyac.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZ2ZnYnhvYXBnbXJidHRkeWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTM4MjEsImV4cCI6MjA4ODY2OTgyMX0.7rykb-QHwBZ3o71YJiguPwPSYLQU1QTHTvx9xunmFlg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
