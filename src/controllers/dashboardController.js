const pool = require('../config/db');

const getDashboard = async (req, res) => {
  try {
    // Pastikan middleware autentikasi dan akses toko
    // memvalidasi bahwa user berhak mengakses storeId ini.
    const storeId =
      req.storeId || req.headers['x-store-id'];

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'Toko aktif belum dipilih',
      });
    }

    const result = await pool.query(
      `
      SELECT
        (
          SELECT COALESCE(SUM(t.total), 0)
          FROM transactions t
          WHERE t.store_id = $1
            AND t.status = 'COMPLETED'
            AND t.created_at >= CURRENT_DATE
            AND t.created_at < CURRENT_DATE + INTERVAL '1 day'
        ) AS total_sales,

        (
          SELECT COUNT(*)
          FROM transactions t
          WHERE t.store_id = $1
            AND t.status = 'COMPLETED'
            AND t.created_at >= CURRENT_DATE
            AND t.created_at < CURRENT_DATE + INTERVAL '1 day'
        ) AS transaction_count,

        (
          SELECT COUNT(*)
          FROM inventory i
          JOIN products p
            ON p.id = i.product_id
           AND p.store_id = i.store_id
          WHERE i.store_id = $1
            AND p.is_active = TRUE
            AND i.quantity <= p.minimum_stock
        ) AS low_stock_count,

        (
          SELECT COUNT(*)
          FROM shifts s
          WHERE s.store_id = $1
            AND s.status = 'OPEN'
        ) AS active_shifts,

        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'date', TO_CHAR(d.day, 'YYYY-MM-DD'),
                'total_sales', COALESCE(s.total_sales, 0)
              )
              ORDER BY d.day
            ),
            '[]'::json
          )
          FROM generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            INTERVAL '1 day'
          ) AS d(day)
          LEFT JOIN (
            SELECT
              created_at::date AS sales_date,
              SUM(total) AS total_sales
            FROM transactions
            WHERE store_id = $1
              AND status = 'COMPLETED'
              AND created_at >= CURRENT_DATE - INTERVAL '6 days'
              AND created_at < CURRENT_DATE + INTERVAL '1 day'
            GROUP BY created_at::date
          ) s ON s.sales_date = d.day::date
        ) AS sales_trend
      `,
      [storeId]
    );

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        summary: {
          total_sales: Number(row.total_sales),
          transaction_count: Number(row.transaction_count),
          low_stock_count: Number(row.low_stock_count),
          active_shifts: Number(row.active_shifts),
        },
        sales_trend: row.sales_trend,
      },
    });
  } catch (error) {
    console.error('getDashboard error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data dashboard',
    });
  }
};

module.exports = { getDashboard };