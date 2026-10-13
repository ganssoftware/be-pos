const pool = require("../config/db");

const JAKARTA_TZ = "Asia/Jakarta";

const DATE_FILTER = `
  AND t.created_at >= (
    $2::date::timestamp AT TIME ZONE '${JAKARTA_TZ}'
  )
  AND t.created_at < (
    ($3::date + INTERVAL '1 day')::timestamp
    AT TIME ZONE '${JAKARTA_TZ}'
  )
`;

async function getOverview(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE t.status = 'COMPLETED'
      )::int AS transaction_count,

      COALESCE(
        SUM(t.total) FILTER (
          WHERE t.status = 'COMPLETED'
        ),
        0
      ) AS total_sales,

      COALESCE(
        AVG(t.total) FILTER (
          WHERE t.status = 'COMPLETED'
        ),
        0
      ) AS average_transaction,

      COUNT(*) FILTER (
        WHERE t.status = 'VOID'
      )::int AS void_count,

      COUNT(*) FILTER (
        WHERE t.status = 'REFUNDED'
      )::int AS refunded_count

    FROM transactions t

    WHERE t.store_id = $1
      ${DATE_FILTER}
      AND ($4::uuid IS NULL OR t.user_id = $4)
    `,
    [storeId, startDate, endDate, userId]
  );

  const row = result.rows[0];

  return {
    transaction_count: Number(row.transaction_count),
    total_sales: Number(row.total_sales),
    average_transaction: Number(row.average_transaction),
    void_count: Number(row.void_count),
    refunded_count: Number(row.refunded_count),
  };
}

async function getSalesTrend(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      (t.created_at AT TIME ZONE '${JAKARTA_TZ}')::date
        AS sales_date,

      COUNT(*)::int AS transaction_count,
      COALESCE(SUM(t.total), 0) AS total_sales

    FROM transactions t

    WHERE t.store_id = $1
      AND t.status = 'COMPLETED'
      ${DATE_FILTER}
      AND ($4::uuid IS NULL OR t.user_id = $4)

    GROUP BY sales_date
    ORDER BY sales_date ASC
    `,
    [storeId, startDate, endDate, userId]
  );

  return result.rows.map((row) => ({
    date: row.sales_date,
    transaction_count: Number(row.transaction_count),
    total_sales: Number(row.total_sales),
  }));
}

async function getPaymentMethods(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      p.method,
      COUNT(*)::int AS payment_count,
      COALESCE(SUM(p.amount), 0) AS total_amount

    FROM payments p

    INNER JOIN transactions t
      ON t.id = p.transaction_id

    WHERE t.store_id = $1
      AND t.status = 'COMPLETED'
      ${DATE_FILTER}
      AND ($4::uuid IS NULL OR t.user_id = $4)

    GROUP BY p.method
    ORDER BY total_amount DESC
    `,
    [storeId, startDate, endDate, userId]
  );

  return result.rows.map((row) => ({
    method: row.method,
    payment_count: Number(row.payment_count),
    total_amount: Number(row.total_amount),
  }));
}

async function getCashierAttendance(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      s.id AS shift_id,
      s.user_id,
      u.username,
      u.full_name,

      s.schedule_id,
      ss.shift_name,

      s.status AS shift_status,
      s.opened_at,
      s.closed_at,

      s.opening_cash,
      s.expected_cash,
      s.closing_cash,
      s.difference,

      CASE
        WHEN s.opened_at IS NOT NULL
         AND s.closed_at IS NOT NULL
        THEN ROUND(
          (
            EXTRACT(
              EPOCH FROM (s.closed_at - s.opened_at)
            ) / 3600
          )::numeric,
          2
        )
        ELSE NULL
      END AS duration_hours

    FROM shifts s

    INNER JOIN users u
      ON u.id = s.user_id

    LEFT JOIN shift_schedules ss
      ON ss.id = s.schedule_id
      AND ss.store_id = s.store_id

    WHERE s.store_id = $1
      AND s.opened_at >= (
        $2::date::timestamp AT TIME ZONE '${JAKARTA_TZ}'
      )
      AND s.opened_at < (
        ($3::date + INTERVAL '1 day')::timestamp
        AT TIME ZONE '${JAKARTA_TZ}'
      )
      AND ($4::uuid IS NULL OR s.user_id = $4)

    ORDER BY s.opened_at DESC
    `,
    [storeId, startDate, endDate, userId]
  );

  return result.rows.map((row) => ({
    ...row,
    opening_cash: Number(row.opening_cash ?? 0),
    expected_cash:
      row.expected_cash == null
        ? null
        : Number(row.expected_cash),
    closing_cash:
      row.closing_cash == null
        ? null
        : Number(row.closing_cash),
    difference:
      row.difference == null
        ? null
        : Number(row.difference),
    duration_hours:
      row.duration_hours == null
        ? null
        : Number(row.duration_hours),
  }));
}

async function getLowStockProducts(
  storeId,
  {
    page = 1,
    limit = 20,
    search = "",
  } = {}
) {
  const offset = (page - 1) * limit;
  const searchTerm = search ? `%${search}%` : "";

  const result = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.sku,
      p.barcode,
      p.name AS product_name,
      p.minimum_stock,

      COALESCE(i.quantity, 0) AS stock_quantity,

      u.name AS unit_name,
      u.symbol AS unit_symbol,

      CASE
        WHEN COALESCE(i.quantity, 0) <= 0
          THEN 'OUT_OF_STOCK'
        ELSE 'LOW_STOCK'
      END AS stock_status

    FROM products p

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    LEFT JOIN units u
      ON u.id = p.unit_id
      AND u.store_id = p.store_id

    WHERE p.store_id = $1
      AND p.is_active = TRUE
      AND COALESCE(i.quantity, 0) <= p.minimum_stock
      AND (
        $2 = ''
        OR p.name ILIKE $2
        OR COALESCE(p.sku, '') ILIKE $2
        OR COALESCE(p.barcode, '') ILIKE $2
      )

    ORDER BY
      CASE
        WHEN COALESCE(i.quantity, 0) <= 0 THEN 0
        ELSE 1
      END,
      p.name ASC

    LIMIT $3 OFFSET $4
    `,
    [storeId, searchTerm, limit, offset]
  );

  const countResult = await pool.query(
    `
    SELECT COUNT(*)::int AS total

    FROM products p

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.store_id = $1
      AND p.is_active = TRUE
      AND COALESCE(i.quantity, 0) <= p.minimum_stock
      AND (
        $2 = ''
        OR p.name ILIKE $2
        OR COALESCE(p.sku, '') ILIKE $2
        OR COALESCE(p.barcode, '') ILIKE $2
      )
    `,
    [storeId, searchTerm]
  );

  const total = Number(countResult.rows[0].total);

  return {
    data: result.rows.map((row) => ({
      ...row,
      minimum_stock: Number(row.minimum_stock),
      stock_quantity: Number(row.stock_quantity),
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function getStockMovements(
  storeId,
  startDate,
  endDate
) {
  const result = await pool.query(
    `
    SELECT
      im.id,
      im.product_id,
      p.name AS product_name,
      p.sku,

      im.type,
      im.quantity,
      im.reference_type,
      im.reference_id,
      im.notes,
      im.created_by,

      u.full_name AS created_by_name,
      im.created_at

    FROM inventory_movements im

    INNER JOIN products p
      ON p.id = im.product_id
      AND p.store_id = im.store_id

    LEFT JOIN users u
      ON u.id = im.created_by

    WHERE im.store_id = $1
      AND im.created_at >= (
        $2::date::timestamp AT TIME ZONE '${JAKARTA_TZ}'
      )
      AND im.created_at < (
        ($3::date + INTERVAL '1 day')::timestamp
        AT TIME ZONE '${JAKARTA_TZ}'
      )

    ORDER BY im.created_at DESC
    `,
    [storeId, startDate, endDate]
  );

  return result.rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
  }));
}

async function getTopProducts(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      ti.product_id,
      ti.product_name,
      ti.sku,

      COALESCE(SUM(ti.quantity), 0) AS quantity_sold,
      COALESCE(SUM(ti.subtotal), 0) AS total_sales,

      COALESCE(
        SUM(
          (
            ti.quantity * (
              ti.price - COALESCE(p.purchase_price, 0)
            )
          ) - ti.discount
        ),
        0
      ) AS estimated_gross_profit

    FROM transaction_items ti

    INNER JOIN transactions t
      ON t.id = ti.transaction_id

    LEFT JOIN products p
      ON p.id = ti.product_id
      AND p.store_id = t.store_id

    WHERE t.store_id = $1
      AND t.status = 'COMPLETED'
      ${DATE_FILTER}
      AND ($4::uuid IS NULL OR t.user_id = $4)

    GROUP BY ti.product_id, ti.product_name, ti.sku

    ORDER BY quantity_sold DESC, total_sales DESC
    LIMIT 10
    `,
    [storeId, startDate, endDate, userId]
  );

  return result.rows.map((row) => ({
    ...row,
    quantity_sold: Number(row.quantity_sold),
    total_sales: Number(row.total_sales),
    estimated_gross_profit: Number(
      row.estimated_gross_profit
    ),
  }));
}

async function getShiftSummary(
  storeId,
  startDate,
  endDate,
  userId = null
) {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_shifts,

      COUNT(*) FILTER (
        WHERE s.status = 'OPEN'
      )::int AS open_shifts,

      COUNT(*) FILTER (
        WHERE s.status = 'CLOSED'
      )::int AS closed_shifts,

      COALESCE(
        SUM(s.opening_cash), 0
      ) AS total_opening_cash,

      COALESCE(
        SUM(s.closing_cash) FILTER (
          WHERE s.status = 'CLOSED'
        ),
        0
      ) AS total_closing_cash,

      COALESCE(
        SUM(s.difference) FILTER (
          WHERE s.status = 'CLOSED'
        ),
        0
      ) AS total_cash_difference

    FROM shifts s

    WHERE s.store_id = $1
      AND s.opened_at >= (
        $2::date::timestamp AT TIME ZONE '${JAKARTA_TZ}'
      )
      AND s.opened_at < (
        ($3::date + INTERVAL '1 day')::timestamp
        AT TIME ZONE '${JAKARTA_TZ}'
      )
      AND ($4::uuid IS NULL OR s.user_id = $4)
    `,
    [storeId, startDate, endDate, userId]
  );

  const row = result.rows[0];

  return {
    total_shifts: Number(row.total_shifts),
    open_shifts: Number(row.open_shifts),
    closed_shifts: Number(row.closed_shifts),
    total_opening_cash: Number(row.total_opening_cash),
    total_closing_cash: Number(row.total_closing_cash),
    total_cash_difference: Number(
      row.total_cash_difference
    ),
  };
}

module.exports = {
  getOverview,
  getSalesTrend,
  getPaymentMethods,
  getCashierAttendance,
  getLowStockProducts,
  getStockMovements,
  getTopProducts,
  getShiftSummary,
};
