const { createClient } = require("@supabase/supabase-js");

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak tersedia"
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;