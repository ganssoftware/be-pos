const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const pool = require("../config/db");
const { sendPasswordResetEmail } = require("./emailService");

const TOKEN_EXPIRY_MINUTES = 30;
const BCRYPT_ROUNDS = 12;

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function buildResetUrl(token) {
    const baseUrl = process.env.APP_RESET_URL;

    if (!baseUrl) {
        throw new Error("APP_RESET_URL belum dikonfigurasi.");
    }

    const url = new URL(baseUrl);
    url.searchParams.set("token", token);

    return url.toString();
}

async function requestPasswordReset(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
        throw new Error("Email wajib diisi.");
    }

    const result = await pool.query(
        `SELECT id, email, is_active
     FROM users
     WHERE LOWER(email) = $1
     LIMIT 1`,
        [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
        return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000
    );

    await pool.query(
        `DELETE FROM password_reset_tokens
     WHERE user_id = $1`,
        [user.id]
    );

    await pool.query(
        `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
    );

    const resetUrl = buildResetUrl(token);

    try {
        await sendPasswordResetEmail(user.email, resetUrl);
    } catch (error) {
        await pool.query(
            `DELETE FROM password_reset_tokens
       WHERE user_id = $1 AND token_hash = $2`,
            [user.id, tokenHash]
        );

        throw error;
    }
}

async function confirmPasswordReset(token, newPassword) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        throw new Error("Tautan reset password tidak valid atau kedaluwarsa.");
    }

    if (
        typeof newPassword !== "string" ||
        newPassword.length < 8 ||
        newPassword.length > 72
    ) {
        throw new Error("Password harus terdiri dari 8–72 karakter.");
    }

    const tokenHash = hashToken(token);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const tokenResult = await client.query(
            `SELECT id, user_id
            FROM password_reset_tokens
            WHERE token_hash = $1
                AND used_at IS NULL
                AND expires_at > NOW()
            FOR UPDATE`,
            [tokenHash]
        );

        const resetRecord = tokenResult.rows[0];

        if (!resetRecord) {
            const error = new Error(
                "Tautan reset password tidak valid atau kedaluwarsa."
            );
            error.statusCode = 400;
            throw error;
        }

        const updateResult = await client.query(
            `UPDATE users
       SET password = $1,
           updated_at = NOW()
       WHERE id = $2
         AND is_active = TRUE
       RETURNING id`,
            [passwordHash, resetRecord.user_id]
        );

        if (updateResult.rowCount !== 1) {
            const error = new Error(
                "Akun tidak aktif atau tidak dapat diperbarui."
            );
            error.statusCode = 400;
            throw error;
        }

        await client.query(
            `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
            [resetRecord.id]
        );

        await client.query(
            `DELETE FROM password_reset_tokens
       WHERE user_id = $1 AND id <> $2`,
            [resetRecord.user_id, resetRecord.id]
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    requestPasswordReset,
    confirmPasswordReset,
};
