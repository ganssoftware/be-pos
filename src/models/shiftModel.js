const pool = require("../config/db");

async function findCurrentByUserId(userId, storeId) {
  const query = `
    SELECT
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
    FROM shifts
    WHERE user_id = $1
      AND store_id = $2
      AND status = 'OPEN'
    ORDER BY opened_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [
    userId,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function findById(id, storeId) {
  const query = `
    SELECT
      s.id,
      s.store_id,
      s.user_id,
      s.opening_cash,
      s.expected_cash,
      s.closing_cash,
      s.difference,
      s.status,
      s.opened_at,
      s.closed_at,
      u.username,
      u.full_name
    FROM shifts s
    INNER JOIN users u
      ON u.id = s.user_id
    WHERE s.id = $1
      AND s.store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function findAll(
  storeId,
  { page = 1, limit = 20, status = "" }
) {
  const offset = (page - 1) * limit;

  const conditions = ["s.store_id = $1"];
  const values = [storeId];

  if (status) {
    values.push(status);
    conditions.push(
      `s.status = $${values.length}`
    );
  }

  const whereClause = conditions.join(" AND ");

  values.push(limit);
  const limitParam = `$${values.length}`;

  values.push(offset);
  const offsetParam = `$${values.length}`;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM shifts s
    WHERE ${whereClause}
  `;

  const dataQuery = `
    SELECT
      s.id,
      s.store_id,
      s.user_id,
      s.opening_cash,
      s.expected_cash,
      s.closing_cash,
      s.difference,
      s.status,
      s.opened_at,
      s.closed_at,
      u.username,
      u.full_name
    FROM shifts s
    INNER JOIN users u
      ON u.id = s.user_id
    WHERE ${whereClause}
    ORDER BY s.opened_at DESC
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
  `;

  const countResult = await pool.query(
    countQuery,
    values.slice(0, values.length - 2)
  );

  const dataResult = await pool.query(
    dataQuery,
    values
  );

  const total = Number(
    countResult.rows[0].total
  );

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

async function create({
  storeId,
  userId,
  openingCash,
}) {
  const query = `
    INSERT INTO shifts (
      store_id,
      user_id,
      opening_cash,
      expected_cash,
      status,
      opened_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $3,
      'OPEN',
      NOW()
    )
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
  `;

  const result = await pool.query(query, [
    storeId,
    userId,
    openingCash,
  ]);

  return result.rows[0];
}

async function close(id, storeId, closingCash) {
  const query = `
    WITH closed AS (
      UPDATE shifts
      SET
        closing_cash = $1,
        difference = $1 - expected_cash,
        status = 'CLOSED',
        closed_at = NOW()
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
    ),
    completed AS (
      UPDATE shift_schedules ss
      SET
        status = 'COMPLETED',
        updated_at = NOW()
      FROM closed c
      WHERE ss.id = c.schedule_id
        AND ss.store_id = c.store_id
      RETURNING ss.id
    )
    SELECT
      c.id,
      c.store_id,
      c.user_id,
      c.schedule_id,
      c.opening_cash,
      c.expected_cash,
      c.closing_cash,
      c.difference,
      c.status,
      c.opened_at,
      c.closed_at
    FROM closed c
  `;

  const result = await pool.query(query, [
    closingCash,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
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
  `;

  const result = await client.query(query, [
    userId,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function increaseExpectedCash(
  client,
  shiftId,
  amount
) {
  const query = `
    UPDATE shifts
    SET expected_cash = expected_cash + $1
    WHERE id = $2
      AND status = 'OPEN'
    RETURNING
      id,
      expected_cash
  `;

  const result = await client.query(query, [
    amount,
    shiftId,
  ]);

  return result.rows[0] || null;
}

async function findByIdForUpdate(client, id, storeId) {
  const query = `
    SELECT
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
    FROM shifts
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
    FOR UPDATE
  `;

  const result = await client.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function decreaseExpectedCash(client, shiftId, amount) {
  const query = `
    UPDATE shifts
    SET
      expected_cash = expected_cash - $1
    WHERE id = $2
      AND status = 'OPEN'
      AND expected_cash >= $1
    RETURNING
      id,
      expected_cash
  `;

  const result = await client.query(query, [
    amount,
    shiftId,
  ]);

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
        SELECT id, opening_cash, status
        FROM shift_schedules
        WHERE id = $1
          AND store_id = $2
          AND user_id = $3
        FOR UPDATE
      `,
      [scheduleId, storeId, userId]
    );

    const schedule = scheduleResult.rows[0];

    if (!schedule) {
      const error = new Error(
        "Jadwal shift tidak ditemukan untuk akun Anda"
      );
      error.code = "SCHEDULE_NOT_FOUND";
      throw error;
    }

    if (schedule.status !== "SCHEDULED") {
      const error = new Error(
        "Jadwal shift sudah digunakan atau tidak aktif"
      );
      error.code = "SCHEDULE_NOT_AVAILABLE";
      throw error;
    }

    const existingResult = await client.query(
      `
        SELECT id
        FROM shifts
        WHERE user_id = $1
          AND store_id = $2
          AND status = 'OPEN'
        LIMIT 1
        FOR UPDATE
      `,
      [userId, storeId]
    );

    if (existingResult.rows.length > 0) {
      const error = new Error(
        "Anda masih memiliki shift yang sedang terbuka"
      );
      error.code = "SHIFT_ALREADY_OPEN";
      throw error;
    }

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
        RETURNING *
      `,
      [
        storeId,
        userId,
        scheduleId,
        schedule.opening_cash,
      ]
    );

    await client.query(
      `
        UPDATE shift_schedules
        SET status = 'IN_PROGRESS',
            updated_at = NOW()
        WHERE id = $1
      `,
      [scheduleId]
    );

    await client.query("COMMIT");

    return shiftResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
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
  openFromSchedule,
};