const pool = require("../config/db");
const supabase = require("../config/supabase");

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

async function updateStore(
  ownerId,
  storeId,
  data
) {
  const {
    name,
    code,
    address,
    phone,
  } = data;

  const access =
    await ownerHasStore(
      ownerId,
      storeId
    );

  if (!access) {
    const error = new Error(
      "Anda tidak memiliki akses ke toko ini"
    );
    error.statusCode = 403;
    throw error;
  }

  const result = await pool.query(
    `
      UPDATE stores
      SET
        name = $1,
        code = $2,
        address = $3,
        phone = $4,
        updated_at = NOW()
      WHERE id = $5
        AND owner_id = $6
      RETURNING
        id,
        name,
        code,
        address,
        phone,
        image_url,
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
      storeId,
      ownerId,
    ]
  );

  return result.rows[0] || null;
}

async function uploadStoreImage(
  ownerId,
  storeId,
  file
) {
  const access =
    await ownerHasStore(
      ownerId,
      storeId
    );

  if (!access) {
    const error = new Error(
      "Anda tidak memiliki akses ke toko ini"
    );
    error.statusCode = 403;
    throw error;
  }

  if (!file) {
    const error = new Error(
      "Foto toko wajib dipilih"
    );
    error.statusCode = 400;
    throw error;
  }

  let extension = "jpg";

  if (file.mimetype === "image/png") {
    extension = "png";
  }

  if (file.mimetype === "image/webp") {
    extension = "webp";
  }

  const filePath =
    `stores/store-${storeId}-${Date.now()}.${extension}`;

  const { error: uploadError } =
    await supabase.storage
      .from("uploads")
      .upload(
        filePath,
        file.buffer,
        {
          contentType: file.mimetype,
          upsert: false,
        }
      );

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } =
    supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

  const imageUrl =
    publicUrlData.publicUrl;

  const result = await pool.query(
    `
      UPDATE stores
      SET
        image_url = $1,
        updated_at = NOW()
      WHERE id = $2
        AND owner_id = $3
      RETURNING
        id,
        name,
        code,
        address,
        phone,
        image_url,
        is_active,
        owner_id,
        created_at,
        updated_at
    `,
    [
      imageUrl,
      storeId,
      ownerId,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  createStore,
  findStoresByOwnerId,
  findStoreById,
  ownerHasStore,
  updateStore,
  uploadStoreImage,
};