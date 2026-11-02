
const pool = require('../../config/db');

const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const isUniqueViolation = (error) => error?.code === '23505';

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

const normalizeWorkingDays = (days) => {
    if (!Array.isArray(days) || days.length === 0) {
        throw createError('Pilih minimal satu hari kerja.');
    }

    const normalized = [...new Set(days.map(Number))];

    if (
        normalized.some(
            (day) => !Number.isInteger(day) || day < 1 || day > 7
        )
    ) {
        throw createError('Hari kerja harus berupa angka 1 sampai 7.');
    }

    return normalized.sort((a, b) => a - b);
};

const timeToMinutes = (value) => {
    if (!value) {
        throw createError('Waktu shift tidak valid.');
    }

    const parts = String(value).split(':');
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);

    if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        throw createError('Format waktu shift tidak valid.');
    }

    return hour * 60 + minute;
};

const hasScheduleOverlap = (candidate, existing) => {
    const candidateStart = timeToMinutes(candidate.start_time);
    const candidateEnd = timeToMinutes(candidate.end_time);

    const existingStart = timeToMinutes(existing.start_time);
    const existingEnd = timeToMinutes(existing.end_time);

    const candidateDuration =
        candidateEnd > candidateStart
            ? candidateEnd - candidateStart
            : MINUTES_PER_DAY - candidateStart + candidateEnd;

    const existingDuration =
        existingEnd > existingStart
            ? existingEnd - existingStart
            : MINUTES_PER_DAY - existingStart + existingEnd;

    for (const candidateDay of candidate.working_days) {
        const candidateAbsoluteStart =
            (candidateDay - 1) * MINUTES_PER_DAY + candidateStart;

        const candidateAbsoluteEnd =
            candidateAbsoluteStart + candidateDuration;

        for (const existingDay of existing.working_days) {
            const existingAbsoluteStart =
                (existingDay - 1) * MINUTES_PER_DAY + existingStart;

            const existingAbsoluteEnd =
                existingAbsoluteStart + existingDuration;

            for (const weekOffset of [-1, 0, 1]) {
                const shiftedStart =
                    existingAbsoluteStart + weekOffset * MINUTES_PER_WEEK;

                const shiftedEnd =
                    existingAbsoluteEnd + weekOffset * MINUTES_PER_WEEK;

                if (
                    candidateAbsoluteStart < shiftedEnd &&
                    candidateAbsoluteEnd > shiftedStart
                ) {
                    return true;
                }
            }
        }
    }

    return false;
};

const findAll = async (storeId, { userId } = {}) => {
    const values = [storeId];
    let userFilter = '';

    if (userId) {
        values.push(userId);
        userFilter = `AND ss.user_id = $${values.length}`;
    }

    const result = await pool.query(
        `
      SELECT
        ss.id,
        ss.store_id,
        ss.user_id,
        ss.shift_name,
        ss.start_time,
        ss.end_time,
        ss.working_days,
        ss.shift_date,
        ss.notes,
        ss.status,
        CASE
          WHEN COALESCE(s.opening_cash_enabled, FALSE)
            THEN ss.opening_cash
          ELSE NULL
        END AS opening_cash,
        ss.created_at,
        ss.updated_at,
        u.full_name,
        u.username
      FROM shift_schedules ss
      JOIN users u ON u.id = ss.user_id
      JOIN stores s ON s.id = ss.store_id
      WHERE ss.store_id = $1
        ${userFilter}
      ORDER BY
        u.full_name ASC,
        ss.start_time ASC
    `,
        values
    );

    return result.rows;
};

const findById = async (id, storeId) => {
    const result = await pool.query(
        `
      SELECT
        ss.id,
        ss.store_id,
        ss.user_id,
        ss.shift_name,
        ss.start_time,
        ss.end_time,
        ss.working_days,
        ss.shift_date,
        ss.notes,
        ss.status,
        CASE
          WHEN COALESCE(s.opening_cash_enabled, FALSE)
            THEN ss.opening_cash
          ELSE NULL
        END AS opening_cash,
        ss.created_at,
        ss.updated_at,
        u.full_name,
        u.username
      FROM shift_schedules ss
      JOIN users u ON u.id = ss.user_id
      JOIN stores s ON s.id = ss.store_id
      WHERE ss.id = $1
        AND ss.store_id = $2
      LIMIT 1
    `,
        [id, storeId]
    );

    return result.rows[0] || null;
};

const assertUserBelongsToStore = async (client, userId, storeId) => {
    const result = await client.query(
        `
      SELECT 1
      FROM store_users
      WHERE user_id = $1
        AND store_id = $2
      LIMIT 1
    `,
        [userId, storeId]
    );

    if (result.rowCount === 0) {
        throw createError('Kasir tidak terdaftar pada toko ini.', 404);
    }
};

const assertNoScheduleOverlap = async (
    client,
    {
        storeId,
        userId,
        startTime,
        endTime,
        workingDays,
        excludeId = null,
    }
) => {
    await client.query(
        `
      SELECT pg_advisory_xact_lock(
        hashtext($1),
        hashtext($2)
      )
    `,
        [String(storeId), String(userId)]
    );

    const values = [storeId, userId];
    let excludeFilter = '';

    if (excludeId) {
        values.push(excludeId);
        excludeFilter = `AND id <> $${values.length}`;
    }

    const result = await client.query(
        `
      SELECT
        id,
        start_time,
        end_time,
        working_days
      FROM shift_schedules
      WHERE store_id = $1
        AND user_id = $2
        AND status = 'SCHEDULED'
        ${excludeFilter}
    `,
        values
    );

    const candidate = {
        start_time: startTime,
        end_time: endTime,
        working_days: workingDays,
    };

    for (const schedule of result.rows) {
        const existing = {
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            working_days: schedule.working_days || [],
        };

        if (hasScheduleOverlap(candidate, existing)) {
            throw createError(
                'Jadwal shift bertabrakan dengan jadwal kasir lainnya.',
                409
            );
        }
    }
};

const create = async ({
    storeId,
    userId,
    shiftName,
    startTime,
    endTime,
    notes = null,
    openingCash = 0,
    workingDays = DEFAULT_WORKING_DAYS,
}) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await assertUserBelongsToStore(client, userId, storeId);

        const normalizedDays = normalizeWorkingDays(workingDays);

        await assertNoScheduleOverlap(client, {
            storeId,
            userId,
            startTime,
            endTime,
            workingDays: normalizedDays,
        });

        const result = await client.query(
            `
        INSERT INTO shift_schedules (
          store_id,
          user_id,
          shift_name,
          start_time,
          end_time,
          working_days,
          shift_date,
          notes,
          opening_cash,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'SCHEDULED')
        RETURNING id
      `,
            [
                storeId,
                userId,
                shiftName,
                startTime,
                endTime,
                normalizedDays,
                notes,
                openingCash,
            ]
        );

        await client.query('COMMIT');

        return await findById(result.rows[0].id, storeId);
    } catch (error) {
        await client.query('ROLLBACK');

        if (isUniqueViolation(error)) {
            throw createError('Jadwal shift tersebut sudah terdaftar.', 409);
        }

        throw error;
    } finally {
        client.release();
    }
};

const update = async (
    id,
    storeId,
    {
        userId,
        shiftName,
        startTime,
        endTime,
        notes = null,
        openingCash = 0,
        status = 'SCHEDULED',
        workingDays = DEFAULT_WORKING_DAYS,
    }
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentResult = await client.query(
            `
        SELECT *
        FROM shift_schedules
        WHERE id = $1
          AND store_id = $2
        FOR UPDATE
      `,
            [id, storeId]
        );

        const current = currentResult.rows[0];

        if (!current) {
            throw createError('Jadwal shift tidak ditemukan.', 404);
        }

        if (!['SCHEDULED', 'CANCELLED'].includes(status)) {
            throw createError('Status jadwal shift tidak valid.');
        }

        const normalizedDays = normalizeWorkingDays(workingDays);

        await assertUserBelongsToStore(client, userId, storeId);

        if (status === 'SCHEDULED') {
            await assertNoScheduleOverlap(client, {
                storeId,
                userId,
                startTime,
                endTime,
                workingDays: normalizedDays,
                excludeId: id,
            });
        }

        if (status === 'CANCELLED') {
            const openShift = await client.query(
                `
          SELECT 1
          FROM shifts
          WHERE schedule_id = $1
            AND status = 'OPEN'
          LIMIT 1
        `,
                [id]
            );

            if (openShift.rowCount > 0) {
                throw createError(
                    'Jadwal tidak dapat dibatalkan karena masih memiliki shift aktif.',
                    409
                );
            }
        }

        await client.query(
            `
        UPDATE shift_schedules
        SET
          user_id = $1,
          shift_name = $2,
          start_time = $3,
          end_time = $4,
          working_days = $5,
          notes = $6,
          opening_cash = $7,
          status = $8,
          updated_at = NOW()
        WHERE id = $9
          AND store_id = $10
      `,
            [
                userId,
                shiftName,
                startTime,
                endTime,
                normalizedDays,
                notes,
                openingCash,
                status,
                id,
                storeId,
            ]
        );

        await client.query('COMMIT');

        return await findById(id, storeId);
    } catch (error) {
        await client.query('ROLLBACK');

        if (isUniqueViolation(error)) {
            throw createError('Jadwal shift tersebut sudah terdaftar.', 409);
        }

        throw error;
    } finally {
        client.release();
    }
};

const remove = async (id, storeId) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const scheduleResult = await client.query(
            `
        SELECT id
        FROM shift_schedules
        WHERE id = $1
          AND store_id = $2
        FOR UPDATE
      `,
            [id, storeId]
        );

        if (scheduleResult.rowCount === 0) {
            throw createError('Jadwal shift tidak ditemukan.', 404);
        }

        const openShift = await client.query(
            `
        SELECT 1
        FROM shifts
        WHERE schedule_id = $1
          AND status = 'OPEN'
        LIMIT 1
      `,
            [id]
        );

        if (openShift.rowCount > 0) {
            throw createError(
                'Jadwal tidak dapat dihapus karena masih memiliki shift aktif.',
                409
            );
        }

        const usedSchedule = await client.query(
            `
        SELECT 1
        FROM shifts
        WHERE schedule_id = $1
        LIMIT 1
      `,
            [id]
        );

        if (usedSchedule.rowCount > 0) {
            await client.query(
                `
          UPDATE shift_schedules
          SET
            status = 'CANCELLED',
            updated_at = NOW()
          WHERE id = $1
            AND store_id = $2
        `,
                [id, storeId]
            );
        } else {
            await client.query(
                `
          DELETE FROM shift_schedules
          WHERE id = $1
            AND store_id = $2
        `,
                [id, storeId]
            );
        }

        await client.query('COMMIT');

        return {
            id,
            deleted: usedSchedule.rowCount === 0,
            cancelled: usedSchedule.rowCount > 0,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    findAll,
    findById,
    create,
    update,
    remove,
};
