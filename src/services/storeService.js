const pool = require("../config/db");

async function createStore(ownerId, data) {
  const { name, code, address, phone } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const storeResult = await client.query(
      `
      INSERT INTO stores (
        name,
        code,
        address,
        phone,
        owner_id,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING
        id,
        name,
        code,
        address,
        phone,
        is_active,
        owner_id,
        created_at,
        updated_at
      `,
      [
        name,
        code,
        address || null,
        phone || null,
        ownerId,
      ]
    );

    const store = storeResult.rows[0];

    await client.query(
      `
      INSERT INTO store_users (
        store_id,
        user_id
      )
      VALUES ($1, $2)
      ON CONFLICT (store_id, user_id) DO NOTHING
      `,
      [store.id, ownerId]
    );

    await client.query("COMMIT");

    return store;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findStoresByOwnerId(ownerId) {
  const query = `
    SELECT
      s.id,
      s.name,
      s.code,
      s.address,
      s.phone,
      s.is_active,
      s.owner_id,
      s.created_at,
      s.updated_at
    FROM stores s
    WHERE s.owner_id = $1
    ORDER BY s.name ASC
  `;

  const result = await pool.query(query, [ownerId]);

  return result.rows;
}

async function findStoreById(storeId) {
  const query = `
    SELECT
      s.id,
      s.name,
      s.code,
      s.address,
      s.phone,
      s.is_active,
      s.owner_id,
      s.created_at,
      s.updated_at
    FROM stores s
    WHERE s.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [storeId]);

  return result.rows[0] || null;
}

async function ownerHasStore(ownerId, storeId) {
  const query = `
    SELECT 1
    FROM stores
    WHERE id = $1
      AND owner_id = $2
      AND is_active = true
    LIMIT 1
  `;

  const result = await pool.query(query, [
    storeId,
    ownerId,
  ]);

  return result.rowCount > 0;
}

module.exports = {
  createStore,
  findStoresByOwnerId,
  findStoreById,
  ownerHasStore,
};