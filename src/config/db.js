const { Pool } = require("pg");

require("dotenv").config();

let connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
    throw new Error("POSTGRES_URL tidak tersedia");
}

// Hilangkan parameter sslmode dari connection string
connectionString = connectionString.replace(
    /([?&])sslmode=[^&]*/i,
    "$1"
);

const pool = new Pool({
    connectionString,

    ssl: {
        rejectUnauthorized: false,
    },

    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on("connect", () => {
    console.log("PostgreSQL connected to Supabase");
});

pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err);
});

module.exports = pool;