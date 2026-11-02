
const pool = require("../config/db");

function productSelect(includeCostPrice = false) {
  return `
    p.id,
    p.store_id,
    p.sku,
    p.barcode,
    p.name,
    p.description,
    ${includeCostPrice ? "p.purchase_price," : ""}
    p.selling_price,
    p.minimum_stock,
    p.image_url,
    p.is_active,

    c.id AS category_id,
    c.name AS category_name,

    u.id AS unit_id,
    u.name AS unit_name,
    u.symbol AS unit_symbol,

    COALESCE(i.quantity, 0) AS stock,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ppt.id,
            'tier', ppt.tier,
            'unit_id', ppt.unit_id,
            'unit_name', pu.name,
            'unit_symbol', pu.symbol,
            'unit_quantity', ppt.unit_quantity,
            'min_quantity', ppt.min_quantity,
            'price', ppt.price,
            'is_active', ppt.is_active
          )
          ORDER BY ppt.tier
        )
        FROM product_price_tiers ppt
        LEFT JOIN units pu
          ON pu.id = ppt.unit_id
        WHERE ppt.product_id = p.id
      ),
      '[]'::jsonb
    ) AS price_tiers,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pb.id,
            'barcode', pb.barcode,
            'price_tier', pb.price_tier,
            'is_active', pb.is_active
          )
          ORDER BY pb.created_at
        )
        FROM product_barcodes pb
        WHERE pb.product_id = p.id
      ),
      '[]'::jsonb
    ) AS additional_barcodes,

    p.created_at,
    p.updated_at
  `;
}

async function findAll(
  storeId,
  {
    page = 1,
    limit = 10,
    search = "",
    categoryId = null,
  },
  {
    includeCostPrice = false,
  } = {}
) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      ${productSelect(includeCostPrice)}

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
        OR EXISTS (
          SELECT 1
          FROM product_barcodes pb
          WHERE pb.product_id = p.id
            AND pb.store_id = p.store_id
            AND pb.barcode ILIKE '%' || $2 || '%'
        )
      )

      AND (
        $3::uuid IS NULL
        OR p.category_id = $3
      )

    ORDER BY p.name ASC

    LIMIT $4
    OFFSET $5
  `;

  const result = await pool.query(query, [
    storeId,
    search,
    categoryId,
    limit,
    offset,
  ]);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM products p
    WHERE p.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
        OR EXISTS (
          SELECT 1
          FROM product_barcodes pb
          WHERE pb.product_id = p.id
            AND pb.store_id = p.store_id
            AND pb.barcode ILIKE '%' || $2 || '%'
        )
      )

      AND (
        $3::uuid IS NULL
        OR p.category_id = $3
      )
  `;

  const countResult = await pool.query(countQuery, [
    storeId,
    search,
    categoryId,
  ]);

  return {
    data: result.rows,
    total: countResult.rows[0].total,
  };
}

async function findById(
  id,
  storeId,
  {
    includeCostPrice = false,
  } = {}
) {
  const query = `
    SELECT
      ${productSelect(includeCostPrice)}

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.id = $1
      AND p.store_id = $2

    LIMIT 1
  `;

  const result = await pool.query(query, [
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function findByBarcode(
  barcode,
  storeId,
  {
    includeCostPrice = false,
  } = {}
) {
  const query = `
    SELECT
      ${productSelect(includeCostPrice)},

      CASE
        WHEN pb.id IS NOT NULL THEN 3
        ELSE 1
      END AS selected_tier,

      CASE
        WHEN pb.id IS NOT NULL THEN pb.barcode
        ELSE p.barcode
      END AS matched_barcode,

      CASE
        WHEN pb.id IS NOT NULL THEN t3.unit_id
        ELSE p.unit_id
      END AS selected_unit_id,

      CASE
        WHEN pb.id IS NOT NULL THEN t3_unit.name
        ELSE u.name
      END AS selected_unit_name,

      CASE
        WHEN pb.id IS NOT NULL THEN t3_unit.symbol
        ELSE u.symbol
      END AS selected_unit_symbol,

      CASE
        WHEN pb.id IS NOT NULL THEN t3.unit_quantity
        ELSE 1
      END AS selected_unit_quantity,

      CASE
        WHEN pb.id IS NOT NULL THEN t3.price
        ELSE p.selling_price
      END AS selected_price

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    LEFT JOIN product_barcodes pb
      ON pb.product_id = p.id
      AND pb.store_id = p.store_id
      AND pb.barcode = $1
      AND pb.is_active = TRUE

    LEFT JOIN product_price_tiers t3
      ON t3.product_id = p.id
      AND t3.tier = 3
      AND t3.is_active = TRUE

    LEFT JOIN units t3_unit
      ON t3_unit.id = t3.unit_id

    WHERE p.store_id = $2
      AND p.is_active = TRUE
      AND (
        p.barcode = $1
        OR pb.id IS NOT NULL
      )

    LIMIT 1
  `;

  const result = await pool.query(query, [
    barcode,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function getNextSku(storeId) {
  const query = `
    SELECT
      COALESCE(
        MAX(
          SUBSTRING(sku FROM '^PRD-([0-9]+)$')::BIGINT
        ),
        0
      ) + 1 AS next_number
    FROM products
    WHERE store_id = $1
      AND sku ~ '^PRD-[0-9]+$'
  `;

  const result = await pool.query(query, [
    storeId,
  ]);

  const nextNumber = Number(
    result.rows[0].next_number
  );

  return `PRD-${String(nextNumber).padStart(3, "0")}`;
}

async function create(data, db = pool) {
  const query = `
    INSERT INTO products (
      store_id,
      category_id,
      unit_id,
      sku,
      barcode,
      name,
      description,
      purchase_price,
      selling_price,
      minimum_stock,
      image_url
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11
    )
    RETURNING *
  `;

  const result = await db.query(query, [
    data.storeId,
    data.categoryId || null,
    data.unitId || null,
    data.sku,
    data.barcode || null,
    data.name,
    data.description || null,
    data.purchasePrice,
    data.sellingPrice,
    data.minimumStock,
    data.imageUrl || null,
  ]);

  return result.rows[0];
}

async function update(id, storeId, data, db = pool) {
  const query = `
    UPDATE products
    SET
      category_id = $1,
      unit_id = $2,
      sku = $3,
      barcode = $4,
      name = $5,
      description = $6,
      purchase_price = $7,
      selling_price = $8,
      minimum_stock = $9,
      image_url = $10,
      is_active = $11,
      updated_at = NOW()
    WHERE id = $12
      AND store_id = $13
    RETURNING *
  `;

  const result = await db.query(query, [
    data.categoryId || null,
    data.unitId || null,
    data.sku,
    data.barcode || null,
    data.name,
    data.description || null,
    data.purchasePrice,
    data.sellingPrice,
    data.minimumStock,
    data.imageUrl || null,
    data.isActive,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function savePriceTiers(
  db,
  {
    productId,
    tier2 = null,
    tier3 = null,
    additionalBarcodes,
  }
) {
  if (tier2) {
    if (tier2.enabled) {
      await db.query(
        `
          INSERT INTO product_price_tiers (
            product_id,
            tier,
            unit_id,
            unit_quantity,
            min_quantity,
            price,
            is_active
          )
          SELECT
            p.id,
            2,
            p.unit_id,
            1,
            $2,
            $3,
            TRUE
          FROM products p
          WHERE p.id = $1

          ON CONFLICT (product_id, tier)
          DO UPDATE SET
            unit_id = EXCLUDED.unit_id,
            unit_quantity = EXCLUDED.unit_quantity,
            min_quantity = EXCLUDED.min_quantity,
            price = EXCLUDED.price,
            is_active = TRUE,
            updated_at = NOW()
        `,
        [
          productId,
          tier2.minQuantity,
          tier2.price,
        ]
      );
    } else {
      await db.query(
        `
          UPDATE product_price_tiers
          SET
            is_active = FALSE,
            updated_at = NOW()
          WHERE product_id = $1
            AND tier = 2
        `,
        [productId]
      );
    }
  }

  if (tier3) {
    if (tier3.enabled) {
      await db.query(
        `
          INSERT INTO product_price_tiers (
            product_id,
            tier,
            unit_id,
            unit_quantity,
            min_quantity,
            price,
            is_active
          )
          VALUES ($1, 3, $2, $3, 1, $4, TRUE)

          ON CONFLICT (product_id, tier)
          DO UPDATE SET
            unit_id = EXCLUDED.unit_id,
            unit_quantity = EXCLUDED.unit_quantity,
            min_quantity = EXCLUDED.min_quantity,
            price = EXCLUDED.price,
            is_active = TRUE,
            updated_at = NOW()
        `,
        [
          productId,
          tier3.unitId,
          tier3.unitQuantity,
          tier3.price,
        ]
      );
    } else {
      await db.query(
        `
          UPDATE product_price_tiers
          SET
            is_active = FALSE,
            updated_at = NOW()
          WHERE product_id = $1
            AND tier = 3
        `,
        [productId]
      );

      await db.query(
        `
          UPDATE product_barcodes
          SET
            is_active = FALSE,
            updated_at = NOW()
          WHERE product_id = $1
        `,
        [productId]
      );
    }
  }

  if (additionalBarcodes !== undefined) {
    const tier3Result = await db.query(
      `
        SELECT id, is_active
        FROM product_price_tiers
        WHERE product_id = $1
          AND tier = 3
        LIMIT 1
      `,
      [productId]
    );

    if (
      additionalBarcodes.length > 0 &&
      (
        !tier3Result.rows[0] ||
        !tier3Result.rows[0].is_active
      )
    ) {
      const error = new Error(
        "Barcode tambahan hanya dapat digunakan jika Tier 3 aktif"
      );

      error.statusCode = 400;
      throw error;
    }

    await db.query(
      `
        UPDATE product_barcodes
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE product_id = $1
      `,
      [productId]
    );

    for (const barcode of additionalBarcodes) {
      const result = await db.query(
        `
          INSERT INTO product_barcodes (
            store_id,
            product_id,
            price_tier,
            barcode,
            is_active
          )
          SELECT
            p.store_id,
            p.id,
            3,
            $2,
            TRUE
          FROM products p
          WHERE p.id = $1

          ON CONFLICT (store_id, barcode)
          DO UPDATE SET
            is_active = TRUE,
            updated_at = NOW()
          WHERE product_barcodes.product_id = EXCLUDED.product_id

          RETURNING id
        `,
        [
          productId,
          barcode,
        ]
      );

      if (!result.rows[0]) {
        const error = new Error(
          `Barcode ${barcode} sudah digunakan oleh produk lain`
        );

        error.statusCode = 409;
        error.code = "23505";
        throw error;
      }
    }
  }
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM products
    WHERE id = $1
      AND store_id = $2
    RETURNING id
  `;

  const result = await pool.query(query, [
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function deactivate(id, storeId) {
  const query = `
    UPDATE products
    SET
      is_active = FALSE,
      updated_at = NOW()
    WHERE id = $1
      AND store_id = $2
      AND is_active = TRUE
    RETURNING
      id,
      store_id,
      sku,
      barcode,
      name,
      is_active,
      updated_at
  `;

  const result = await pool.query(query, [
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function updateImage(id, storeId, imageUrl) {
  const result = await pool.query(
    `
      UPDATE products
      SET
        image_url = $1,
        updated_at = NOW()
      WHERE id = $2
        AND store_id = $3
      RETURNING
        id,
        store_id,
        sku,
        barcode,
        name,
        description,
        selling_price,
        minimum_stock,
        image_url,
        is_active,
        created_at,
        updated_at
    `,
    [
      imageUrl,
      id,
      storeId,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findByBarcode,
  getNextSku,
  create,
  update,
  savePriceTiers,
  remove,
  deactivate,
  updateImage,
};
