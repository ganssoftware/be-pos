const pool = require("../config/db");

async function findCurrentByUserId(userId, storeId) {
    const query = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            CASE
                WHEN st.opening_cash_enabled THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            st.opening_cash_enabled
        FROM shifts s
        INNER JOIN stores st
            ON st.id = s.store_id
        WHERE s.user_id = $1
          AND s.store_id = $2
          AND s.status = 'OPEN'
        ORDER BY s.opened_at DESC
        LIMIT 1
    `;

    const result = await pool.query(query, [userId, storeId]);
    return result.rows[0] || null;
}

async function findById(id, storeId) {
    const query = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            CASE
                WHEN st.opening_cash_enabled THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            st.opening_cash_enabled,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN users u
            ON u.id = s.user_id
        INNER JOIN stores st
            ON st.id = s.store_id
        WHERE s.id = $1
          AND s.store_id = $2
        LIMIT 1
    `;

    const result = await pool.query(query, [id, storeId]);

    return result.rows[0] || null;
}

async function findAll(
    storeId,
    {
        page = 1,
        limit = 20,
        status = "",
        userId = "",
    } = {}
) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    const offset = (safePage - 1) * safeLimit;

    const conditions = ["s.store_id = $1"];
    const values = [storeId];

    if (userId) {
        values.push(userId);
        conditions.push(`s.user_id = $${values.length}`);
    }

    if (status) {
        values.push(status);
        conditions.push(`s.status = $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM shifts s
        WHERE ${whereClause}
        `,
        values
    );

    const total = Number(countResult.rows[0].total);

    const dataValues = [...values, safeLimit, offset];

    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const dataResult = await pool.query(
        `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            CASE
                WHEN st.opening_cash_enabled THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            st.opening_cash_enabled,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN users u
            ON u.id = s.user_id
        INNER JOIN stores st
            ON st.id = s.store_id
        WHERE ${whereClause}
        ORDER BY
            s.opened_at DESC NULLS LAST,
            s.created_at DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
        `,
        dataValues
    );

    return {
        data: dataResult.rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            total_pages: Math.ceil(total / safeLimit),
        },
    };
}

async function create({
    storeId,
    userId,
    openingCash = 0,
}) {
    const result = await pool.query(
        `
        INSERT INTO shifts (
            store_id,
            user_id,
            opening_cash,
            expected_cash,
            status,
            opened_at
        )
        VALUES ($1, $2, $3, $3, 'OPEN', NOW())
        RETURNING
            id,
            store_id,
            user_id,
            opening_cash,
            expected_cash,
            closing_cash,
            difference,
            status,
            opened_at,
            closed_at
        `,
        [storeId, userId, openingCash]
    );

    return result.rows[0];
}

async function close(id, storeId, closingCash) {
    const result = await pool.query(
        `
        UPDATE shifts
        SET
            closing_cash = $1,
            difference = $1 - expected_cash,
            status = 'CLOSED',
            closed_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
          AND store_id = $3
          AND status = 'OPEN'
        RETURNING
            id,
            store_id,
            user_id,
            schedule_id,
            opening_cash,
            expected_cash,
            closing_cash,
            difference,
            status,
            opened_at,
            closed_at
        `,
        [closingCash, id, storeId]
    );

    return result.rows[0] || null;
}

async function findOpenForUpdate(client, userId, storeId) {
    const result = await client.query(
        `
        SELECT
            id,
            store_id,
            user_id,
            schedule_id,
            opening_cash,
            expected_cash,
            closing_cash,
            difference,
            status,
            opened_at,
            closed_at
        FROM shifts
        WHERE user_id = $1
          AND store_id = $2
          AND status = 'OPEN'
        ORDER BY opened_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [userId, storeId]
    );

    return result.rows[0] || null;
}

async function increaseExpectedCash(client, shiftId, amount) {
    const result = await client.query(
        `
        UPDATE shifts
        SET
            expected_cash = expected_cash + $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = 'OPEN'
        RETURNING id, expected_cash, status
        `,
        [amount, shiftId]
    );

    return result.rows[0] || null;
}

async function findByIdForUpdate(client, id, storeId) {
    const result = await client.query(
        `
        SELECT
            id,
            store_id,
            user_id,
            schedule_id,
            opening_cash,
            expected_cash,
            closing_cash,
            difference,
            status,
            opened_at,
            closed_at
        FROM shifts
        WHERE id = $1
          AND store_id = $2
        LIMIT 1
        FOR UPDATE
        `,
        [id, storeId]
    );

    return result.rows[0] || null;
}

async function decreaseExpectedCash(client, shiftId, amount) {
    const result = await client.query(
        `
        UPDATE shifts
        SET
            expected_cash = expected_cash - $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = 'OPEN'
          AND expected_cash >= $1
        RETURNING id, expected_cash, status
        `,
        [amount, shiftId]
    );

    return result.rows[0] || null;
}

async function findAllByStoreForOwner(client, storeId) {
    const result = await client.query(
        `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            CASE
                WHEN st.opening_cash_enabled THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            st.opening_cash_enabled,
            u.username,
            u.full_name,
            ss.shift_name AS schedule_shift_name,
            ss.start_time,
            ss.end_time
        FROM shifts s
        INNER JOIN stores st
            ON st.id = s.store_id
        INNER JOIN users u
            ON u.id = s.user_id
        LEFT JOIN shift_schedules ss
            ON ss.id = s.schedule_id
        WHERE s.store_id = $1
        ORDER BY
            CASE
                WHEN s.status = 'OPEN' THEN 0
                ELSE 1
            END,
            s.opened_at DESC NULLS LAST,
            s.created_at DESC
        FOR UPDATE OF s
        `,
        [storeId]
    );

    return result.rows;
}

async function findByIdForStoreForUpdate(
    client,
    shiftId,
    storeId
) {
    const result = await client.query(
        `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            CASE
                WHEN st.opening_cash_enabled THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            st.opening_cash_enabled,
            u.username,
            u.full_name,
            ss.shift_name AS schedule_shift_name,
            ss.start_time,
            ss.end_time
        FROM shifts s
        INNER JOIN stores st
            ON st.id = s.store_id
        INNER JOIN users u
            ON u.id = s.user_id
        LEFT JOIN shift_schedules ss
            ON ss.id = s.schedule_id
        WHERE s.id = $1
          AND s.store_id = $2
        FOR UPDATE OF s
        `,
        [shiftId, storeId]
    );

    return result.rows[0] || null;
}

async function openFromSchedule({
    scheduleId,
    storeId,
    userId,
}) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const scheduleResult = await client.query(
            `
            SELECT
                ss.id,
                ss.store_id,
                ss.user_id,
                ss.opening_cash,
                ss.status,
                ss.start_time,
                st.opening_cash_enabled,
                (
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time
                    < ss.start_time
                ) AS is_before_start
            FROM shift_schedules ss
            INNER JOIN stores st
                ON st.id = ss.store_id
            WHERE ss.id = $1
              AND ss.store_id = $2
              AND ss.user_id = $3
            FOR UPDATE OF ss
            `,
            [scheduleId, storeId, userId]
        );

        const schedule = scheduleResult.rows[0];

        if (!schedule) {
            const error = new Error(
                "Jadwal shift tidak ditemukan atau bukan milik Anda"
            );
            error.statusCode = 404;
            throw error;
        }

        if (schedule.status !== "SCHEDULED") {
            const error = new Error(
                "Jadwal shift tidak aktif atau sudah dibatalkan"
            );
            error.statusCode = 400;
            throw error;
        }

        if (schedule.is_before_start) {
            const startTime = String(schedule.start_time).slice(0, 5);
            const error = new Error(
                `Shift belum dapat dimulai. Jadwal mulai pukul ${startTime}.`
            );
            error.statusCode = 409;
            throw error;
        }

        const openShiftResult = await client.query(
            `
            SELECT id
            FROM shifts
            WHERE store_id = $1
              AND user_id = $2
              AND status = 'OPEN'
            LIMIT 1
            `,
            [storeId, userId]
        );

        if (openShiftResult.rows.length > 0) {
            const error = new Error(
                "Anda masih memiliki shift yang belum ditutup"
            );
            error.statusCode = 409;
            throw error;
        }

        const openingCashEnabled =
            schedule.opening_cash_enabled === true;

        const openingCash = openingCashEnabled
            ? Number(schedule.opening_cash || 0)
            : 0;

        const shiftResult = await client.query(
            `
            INSERT INTO shifts (
                store_id,
                user_id,
                schedule_id,
                opening_cash,
                expected_cash,
                status,
                opened_at
            )
            VALUES ($1, $2, $3, $4, $4, 'OPEN', NOW())
            RETURNING
                id,
                store_id,
                user_id,
                schedule_id,
                opening_cash,
                expected_cash,
                closing_cash,
                difference,
                status,
                opened_at,
                closed_at
            `,
            [
                storeId,
                userId,
                schedule.id,
                openingCash,
            ]
        );

        await client.query("COMMIT");

        const shift = shiftResult.rows[0];

        return {
            ...shift,
            opening_cash_enabled: openingCashEnabled,
            opening_cash: openingCashEnabled
                ? shift.opening_cash
                : null,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Rollback openFromSchedule gagal:",
                rollbackError
            );
        }

        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    findCurrentByUserId,
    findById,
    findAll,
    create,
    close,
    findOpenForUpdate,
    increaseExpectedCash,
    findByIdForUpdate,
    decreaseExpectedCash,
    findAllByStoreForOwner,
    findByIdForStoreForUpdate,
    openFromSchedule,
};
