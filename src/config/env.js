require("dotenv").config();

const requiredEnv = [
  "POSTGRES_URL",
  "JWT_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}`
    );
  }
}

module.exports = {
  port: process.env.PORT || 5000,

  databaseUrl: process.env.POSTGRES_URL,

  jwtSecret: process.env.JWT_SECRET,

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN || "1d",

  supabaseUrl: process.env.SUPABASE_URL,

  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY,

  nodeEnv:
    process.env.NODE_ENV || "production",
};