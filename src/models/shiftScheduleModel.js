
const pool = require("../config/db");

async function findAll(storeId, { userId = "" } = {}) {
  const conditions = ["ss.store_id = $1"];
  const values = [storeId];

  if (userId) {
    values.push(userId);
    conditions.push(`ss.user_id = $${values.length}`);
  }

  const query = `
    SELECT
      ss.id,
      ss.store_id,
      ss.user_id,
      ss.shift_name,
      ss.shift_date,
      ss.start_time,
      ss.end_time,
      ss.status,
      ss.notes,
      ss.opening_cash,
      ss.created_at,
      ss.updated_at,
      u.username,
      u.full_name
    FROM shift_schedules ss
    INNER JOIN users u ON u.id = ss.user_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      ss.start_time ASC,
      u.full_name ASC
  `;

  const result = await pool.query(query, values);
  return result.rows;
}

async function findById(id, storeId) {
  const query = `
    SELECT
      ss.id,
      ss.store_id,
      ss.user_id,
      ss.shift_name,
      ss.shift_date,
      ss.start_time,
      ss.end_time,
      ss.status,
      ss.notes,
      ss.opening_cash,
      ss.created_at,
      ss.updated_at,
      u.username,
      u.full_name
    FROM shift_schedules ss
    INNER JOIN users u ON u.id = ss.user_id
    WHERE ss.id = $1
      AND ss.store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [id, storeId]);
  return result.rows[0] || null;
}

async function create({
  storeId,
  userId,
  shiftName,
  startTime,
  endTime,
  notes,
  openingCash = 0,
}) {
  const query = `
    INSERT INTO shift_schedules (
      store_id,
      user_id,
      shift_name,
      shift_date,
      start_time,
      end_time,
      notes,
      opening_cash,
      status
    )
    VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'SCHEDULED')
    RETURNING *
  `;

  const result = await pool.query(query, [
    storeId,
    userId,
    shiftName,
    startTime,
    endTime,
    notes || null,
    openingCash,
  ]);

  return result.rows[0];
}

async function update(
  id,
  storeId,
  {
    userId,
    shiftName,
    startTime,
    endTime,
    notes,
    openingCash = 0,
    status,
  }
) {
  const query = `
    UPDATE shift_schedules
    SET
      user_id = $1,
      shift_name = $2,
      shift_date = NULL,
      start_time = $3,
      end_time = $4,
      notes = $5,
      opening_cash = $6,
      status = $7,
      updated_at = NOW()
    WHERE id = $8
      AND store_id = $9
    RETURNING *
  `;

  const result = await pool.query(query, [
    userId,
    shiftName,
    startTime,
    endTime,
    notes || null,
    openingCash,
    status || "SCHEDULED",
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM shift_schedules
    WHERE id = $1
      AND store_id = $2
    RETURNING id
  `;

  const result = await pool.query(query, [id, storeId]);
  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};
