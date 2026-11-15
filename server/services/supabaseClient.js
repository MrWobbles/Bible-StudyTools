const { createClient } = require('@supabase/supabase-js');
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SERVICE_ENABLED
} = require('../config/env');

const supabaseServiceClient = SUPABASE_SERVICE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  : null;

function buildSupabaseAdminHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
}

function getMissingSupabaseTableMessage(error, tableName) {
  const message = String(error?.message || '').trim();
  if (!message) {
    return '';
  }

  const normalizedTable = String(tableName || '').trim();
  const isMissingTableError = message.includes('schema cache')
    || message.includes('Could not find the table')
    || message.includes('relation') && message.includes('does not exist');

  if (!isMissingTableError || !normalizedTable) {
    return '';
  }

  return `Missing Supabase table "public.${normalizedTable}". Run scripts/supabase/schema.sql in the Supabase SQL editor, then retry after the schema cache refreshes.`;
}

module.exports = {
  supabaseServiceClient,
  buildSupabaseAdminHeaders,
  getMissingSupabaseTableMessage
};
