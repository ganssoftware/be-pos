
const pool = require("../config/db");

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

async function findCurrentByUserId(userId, storeId) {
  const query = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            s.business_date,
            s.schedule_name_snapshot,
            s.scheduled_start_time_snapshot,
            s.scheduled_end_time_snapshot,
            CASE
                WHEN st.opening_cash_enabled = TRUE
                THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.status,
            s.opened_at,
            s.closed_at,
            s.created_at,
            s.updated_at
        FROM shifts s
        INNER JOIN stores st ON st.id = s.store_id
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
            s.business_date,
            s.schedule_name_snapshot,
            s.scheduled_start_time_snapshot,
            s.scheduled_end_time_snapshot,
            CASE
                WHEN st.opening_cash_enabled = TRUE
                THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            s.created_at,
            s.updated_at,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN stores st ON st.id = s.store_id
        INNER JOIN users u ON u.id = s.user_id
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
  const offset = (page - 1) * limit;

  const conditions = ["s.store_id = $1"];
  const values = [storeId];

  if (status) {
    values.push(status);
    conditions.push(`s.status = $${values.length}`);
  }

  if (userId) {
    values.push(userId);
    conditions.push(`s.user_id = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const countQuery = `
        SELECT COUNT(*) AS total
        FROM shifts s
        WHERE ${whereClause}
    `;

  const countValues = [...values];

  values.push(limit);
  const limitParam = `$${values.length}`;

  values.push(offset);
  const offsetParam = `$${values.length}`;

  const dataQuery = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            s.business_date,
            s.schedule_name_snapshot,
            s.scheduled_start_time_snapshot,
            s.scheduled_end_time_snapshot,
            CASE
                WHEN st.opening_cash_enabled = TRUE
                THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            s.created_at,
            s.updated_at,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN stores st ON st.id = s.store_id
        INNER JOIN users u ON u.id = s.user_id
        WHERE ${whereClause}
        ORDER BY s.opened_at DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
    `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, countValues),
    pool.query(dataQuery, values),
  ]);

  const total = Number(countResult.rows[0].total);

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function openFromSchedule({
  scheduleId,
  storeId,
  userId,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
                SELECT pg_advisory_xact_lock(
                    hashtext($1),
                    hashtext($2)
                )
            `,
      [String(storeId), String(userId)]
    );

    const scheduleQuery = `
            SELECT
                ss.id,
                ss.store_id,
                ss.user_id,
                ss.shift_name,
                ss.shift_date,
                ss.start_time,
                ss.end_time,
                ss.working_days,
                ss.opening_cash,
                ss.status,
                st.opening_cash_enabled,
                clock.local_now,
                clock.business_date,
                clock.iso_weekday,
                (
                    clock.business_date + ss.start_time
                ) AS scheduled_start,
                (
                    clock.business_date
                    + CASE
                        WHEN ss.end_time <= ss.start_time THEN 1
                        ELSE 0
                    END
                    + ss.end_time
                ) AS scheduled_end,
                (
                    clock.local_now >=
                        (clock.business_date + ss.start_time)
                        - INTERVAL '15 minutes'
                    AND clock.local_now <=
                        (clock.business_date + ss.start_time)
                        + INTERVAL '1 hour'
                ) AS is_within_opening_window,
                (
                    clock.iso_weekday = ANY(ss.working_days)
                ) AS is_working_day
            FROM shift_schedules ss
            INNER JOIN stores st ON st.id = ss.store_id
            CROSS JOIN (
                SELECT
                    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
                        AS local_now,
                    (
                        CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
                    )::DATE AS business_date,
                    EXTRACT(
                        ISODOW FROM
                        CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
                    )::SMALLINT AS iso_weekday
            ) clock
            WHERE ss.id = $1
              AND ss.store_id = $2
              AND ss.user_id = $3
            LIMIT 1
            FOR UPDATE OF ss
        `;

    const scheduleResult = await client.query(
      scheduleQuery,
      [scheduleId, storeId, userId]
    );

    const schedule = scheduleResult.rows[0];

    if (!schedule) {
      throw createError(
        "Jadwal shift tidak ditemukan atau bukan milik Anda",
        404
      );
    }

    if (schedule.status !== "SCHEDULED") {
      throw createError("Jadwal shift tidak aktif", 409);
    }

    if (
      schedule.shift_date &&
      String(schedule.shift_date).slice(0, 10) !==
      String(schedule.business_date).slice(0, 10)
    ) {
      throw createError(
        "Jadwal ini bukan untuk tanggal hari ini",
        403
      );
    }

    if (!schedule.is_working_day) {
      throw createError(
        "Anda tidak memiliki jadwal kerja pada hari ini",
        403
      );
    }

    if (!schedule.is_within_opening_window) {
      throw createError(
        "Shift hanya dapat dibuka mulai 15 menit sebelum hingga 1 jam setelah jadwal dimulai",
        409
      );
    }

    const currentShiftQuery = `
            SELECT id
            FROM shifts
            WHERE user_id = $1
              AND store_id = $2
              AND status = 'OPEN'
            LIMIT 1
            FOR UPDATE
        `;

    const currentShiftResult = await client.query(
      currentShiftQuery,
      [userId, storeId]
    );

    if (currentShiftResult.rowCount > 0) {
      throw createError(
        "Anda masih memiliki shift yang terbuka",
        409
      );
    }

    const openingCash = schedule.opening_cash_enabled
      ? Number(schedule.opening_cash || 0)
      : 0;

    const insertQuery = `
            INSERT INTO shifts (
                store_id,
                user_id,
                schedule_id,
                business_date,
                schedule_name_snapshot,
                scheduled_start_time_snapshot,
                scheduled_end_time_snapshot,
                opening_cash,
                expected_cash,
                status,
                opened_at
            )
            VALUES (
                $1, $2, $3, $4,
                $5, $6, $7,
                $8, $8,
                'OPEN',
                NOW()
            )
            RETURNING
                id,
                store_id,
                user_id,
                schedule_id,
                business_date,
                schedule_name_snapshot,
                scheduled_start_time_snapshot,
                scheduled_end_time_snapshot,
                opening_cash,
                expected_cash,
                status,
                opened_at,
                created_at
        `;

    const insertResult = await client.query(
      insertQuery,
      [
        storeId,
        userId,
        schedule.id,
        schedule.business_date,
        schedule.shift_name,
        schedule.start_time,
        schedule.end_time,
        openingCash,
      ]
    );

    await client.query("COMMIT");

    const shift = insertResult.rows[0];

    return {
      ...shift,
      opening_cash: schedule.opening_cash_enabled
        ? shift.opening_cash
        : null,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Rollback open shift gagal:",
        rollbackError
      );
    }

    if (isUniqueViolation(error)) {
      if (
        error.constraint ===
        "uq_shifts_one_open_per_user_store"
      ) {
        throw createError(
          "Anda masih memiliki shift yang terbuka",
          409
        );
      }

      throw createError(
        "Jadwal shift ini sudah pernah dibuka pada tanggal kerja yang sama",
        409
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function close(id, storeId, closingCash) {
  const client = await pool.connect();

  try {
    const closingCashValue = String(closingCash).trim();
    const closingCashNumber = Number(closingCashValue);

    if (
      closingCashValue === "" ||
      !Number.isFinite(closingCashNumber) ||
      closingCashNumber < 0
    ) {
      throw createError(
        "Jumlah kas penutupan harus berupa angka dan tidak boleh negatif"
      );
    }

    await client.query("BEGIN");

    const shiftQuery = `
            SELECT
                s.id,
                s.store_id,
                s.user_id,
                s.business_date,
                s.schedule_name_snapshot,
                s.scheduled_start_time_snapshot,
                s.scheduled_end_time_snapshot,
                s.expected_cash,
                s.status,
                clock.local_now,
                CASE
                    WHEN s.scheduled_start_time_snapshot IS NOT NULL
                     AND s.scheduled_end_time_snapshot IS NOT NULL
                    THEN (
                        s.business_date
                        + CASE
                            WHEN s.scheduled_end_time_snapshot
                                 <= s.scheduled_start_time_snapshot
                            THEN 1
                            ELSE 0
                        END
                        + s.scheduled_end_time_snapshot
                    )
                    ELSE NULL
                END AS scheduled_end,
                CASE
                    WHEN s.scheduled_start_time_snapshot IS NULL
                      OR s.scheduled_end_time_snapshot IS NULL
                    THEN TRUE
                    ELSE clock.local_now >= (
                        s.business_date
                        + CASE
                            WHEN s.scheduled_end_time_snapshot
                                 <= s.scheduled_start_time_snapshot
                            THEN 1
                            ELSE 0
                        END
                        + s.scheduled_end_time_snapshot
                    )
                END AS is_after_scheduled_end,
                CASE
                    WHEN s.scheduled_start_time_snapshot IS NULL
                      OR s.scheduled_end_time_snapshot IS NULL
                    THEN TRUE
                    ELSE clock.local_now <= (
                        s.business_date
                        + CASE
                            WHEN s.scheduled_end_time_snapshot
                                 <= s.scheduled_start_time_snapshot
                            THEN 1
                            ELSE 0
                        END
                        + s.scheduled_end_time_snapshot
                        + INTERVAL '1 hour'
                    )
                END AS is_within_closing_window
            FROM shifts s
            CROSS JOIN (
                SELECT
                    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'
                        AS local_now
            ) clock
            WHERE s.id = $1
              AND s.store_id = $2
            LIMIT 1
            FOR UPDATE OF s
        `;

    const shiftResult = await client.query(
      shiftQuery,
      [id, storeId]
    );

    const shift = shiftResult.rows[0];

    if (!shift) {
      await client.query("ROLLBACK");
      return null;
    }

    if (shift.status !== "OPEN") {
      throw createError(
        "Shift sudah ditutup atau tidak aktif",
        409
      );
    }

    if (!shift.is_after_scheduled_end) {
      throw createError(
        "Shift belum dapat ditutup sebelum jadwal selesai",
        409
      );
    }

    if (!shift.is_within_closing_window) {
      throw createError(
        "Batas waktu penutupan shift adalah maksimal 1 jam setelah jadwal selesai",
        409
      );
    }

    const updateQuery = `
            UPDATE shifts
            SET
                closing_cash = $1::numeric,
                difference = $1::numeric - expected_cash,
                status = 'CLOSED',
                closed_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
              AND store_id = $3
              AND status = 'OPEN'
            RETURNING id
        `;

    const updateResult = await client.query(
      updateQuery,
      [closingCashValue, id, storeId]
    );

    if (updateResult.rowCount === 0) {
      throw createError(
        "Shift gagal ditutup karena statusnya sudah berubah",
        409
      );
    }

    const resultQuery = `
            SELECT
                s.id,
                s.store_id,
                s.user_id,
                s.schedule_id,
                s.business_date,
                s.schedule_name_snapshot,
                s.scheduled_start_time_snapshot,
                s.scheduled_end_time_snapshot,
                CASE
                    WHEN st.opening_cash_enabled = TRUE
                    THEN s.opening_cash
                    ELSE NULL
                END AS opening_cash,
                s.expected_cash,
                s.closing_cash,
                s.difference,
                s.status,
                s.opened_at,
                s.closed_at,
                s.created_at,
                s.updated_at
            FROM shifts s
            INNER JOIN stores st ON st.id = s.store_id
            WHERE s.id = $1
              AND s.store_id = $2
            LIMIT 1
        `;

    const result = await client.query(
      resultQuery,
      [id, storeId]
    );

    await client.query("COMMIT");

    return result.rows[0] || null;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Rollback close shift gagal:",
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function findOpenForUpdate(
  client,
  userId,
  storeId
) {
  const query = `
        SELECT
            id,
            store_id,
            user_id,
            schedule_id,
            business_date,
            opening_cash,
            expected_cash,
            status,
            opened_at,
            closed_at
        FROM shifts
        WHERE user_id = $1
          AND store_id = $2
          AND status = 'OPEN'
        LIMIT 1
        FOR UPDATE
    `;

  const result = await client.query(
    query,
    [userId, storeId]
  );

  return result.rows[0] || null;
}

async function increaseExpectedCash(
  client,
  shiftId,
  amount
) {
  const query = `
        UPDATE shifts
        SET
            expected_cash = expected_cash + $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = 'OPEN'
        RETURNING
            id,
            expected_cash,
            status
    `;

  const result = await client.query(
    query,
    [amount, shiftId]
  );

  return result.rows[0] || null;
}

async function decreaseExpectedCash(
  client,
  shiftId,
  amount
) {
  const query = `
        UPDATE shifts
        SET
            expected_cash = expected_cash - $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = 'OPEN'
          AND expected_cash >= $1
        RETURNING
            id,
            expected_cash,
            status
    `;

  const result = await client.query(
    query,
    [amount, shiftId]
  );

  return result.rows[0] || null;
}

async function findByIdForUpdate(
  client,
  id,
  storeId
) {
  const query = `
        SELECT
            id,
            store_id,
            user_id,
            schedule_id,
            business_date,
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
    `;

  const result = await client.query(
    query,
    [id, storeId]
  );

  return result.rows[0] || null;
}

async function findAllByStoreForOwner(
  client,
  storeId
) {
  const query = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            s.business_date,
            s.schedule_name_snapshot,
            s.scheduled_start_time_snapshot,
            s.scheduled_end_time_snapshot,
            CASE
                WHEN st.opening_cash_enabled = TRUE
                THEN s.opening_cash
                ELSE NULL
            END AS opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            COALESCE(
                s.schedule_name_snapshot,
                ss.shift_name
            ) AS shift_name,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN stores st ON st.id = s.store_id
        LEFT JOIN shift_schedules ss ON ss.id = s.schedule_id
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.store_id = $1
        ORDER BY s.opened_at DESC
    `;

  const result = await client.query(query, [storeId]);

  return result.rows;
}

async function findByIdForStoreForUpdate(
  client,
  shiftId,
  storeId
) {
  const query = `
        SELECT
            s.id,
            s.store_id,
            s.user_id,
            s.schedule_id,
            s.business_date,
            s.opening_cash,
            s.expected_cash,
            s.closing_cash,
            s.difference,
            s.status,
            s.opened_at,
            s.closed_at,
            s.schedule_name_snapshot,
            s.scheduled_start_time_snapshot,
            s.scheduled_end_time_snapshot,
            u.username,
            u.full_name
        FROM shifts s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.store_id = $2
        LIMIT 1
        FOR UPDATE OF s
    `;

  const result = await client.query(
    query,
    [shiftId, storeId]
  );

  return result.rows[0] || null;
}

module.exports = {
  findCurrentByUserId,
  findById,
  findAll,
  openFromSchedule,
  close,
  findOpenForUpdate,
  increaseExpectedCash,
  decreaseExpectedCash,
  findByIdForUpdate,
  findAllByStoreForOwner,
  findByIdForStoreForUpdate,
};
