
const pool = require("../config/db");

async function findStoresByUserId(userId) {
    const query = `
        SELECT
            s.id,
            s.name,
            s.code,
            s.address,
            s.phone,
            s.image_url,
            s.is_active,
            s.opening_cash_enabled
        FROM stores s
        INNER JOIN store_users su
            ON su.store_id = s.id
        WHERE su.user_id = $1
          AND s.is_active = TRUE
        ORDER BY s.name ASC
    `;

    const result = await pool.query(query, [userId]);

    return result.rows;
}

async function userHasStoreAccess(userId, storeId) {
    const query = `
        SELECT 1
        FROM store_users su
        INNER JOIN stores s
            ON s.id = su.store_id
        WHERE su.user_id = $1
          AND su.store_id = $2
          AND s.is_active = TRUE
        LIMIT 1
    `;

    const result = await pool.query(query, [userId, storeId]);

    return result.rowCount > 0;
}

async function getOpeningCashSetting(storeId) {
    const result = await pool.query(
        `
        SELECT
            id AS store_id,
            opening_cash_enabled
        FROM stores
        WHERE id = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [storeId]
    );

    return result.rows[0] || null;
}

async function updateOpeningCashSetting(storeId, enabled) {
    const result = await pool.query(
        `
        UPDATE stores
        SET
            opening_cash_enabled = $1,
            updated_at = NOW()
        WHERE id = $2
          AND is_active = TRUE
        RETURNING
            id AS store_id,
            opening_cash_enabled
        `,
        [enabled, storeId]
    );

    return result.rows[0] || null;
}

module.exports = {
    findStoresByUserId,
    userHasStoreAccess,
    getOpeningCashSetting,
    updateOpeningCashSetting,
};
