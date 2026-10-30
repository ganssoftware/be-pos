
const pool = require('../config/db');

const getSuperAdminDashboard = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)
          FROM stores
        ) AS total_store,

        (
          SELECT COUNT(*)
          FROM users u
          JOIN roles r ON r.id = u.role_id
          WHERE LOWER(REPLACE(TRIM(r.name), '_', '-')) = 'owner'
        ) AS total_owner,

        (
          SELECT COUNT(*)
          FROM users u
          JOIN roles r ON r.id = u.role_id
          WHERE LOWER(REPLACE(TRIM(r.name), '_', '-'))
            IN ('cashier', 'kasir')
        ) AS total_cashier
    `);

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        summary: {
          total_store: Number(row.total_store),
          total_owner: Number(row.total_owner),
          total_cashier: Number(row.total_cashier),

          // Akan diimplementasikan setelah master produk global tersedia.
          total_products: null,
        },
      },
    });
  } catch (error) {
    console.error('getSuperAdminDashboard error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data dashboard Super Admin',
    });
  }
};

module.exports = {
  getSuperAdminDashboard,
};
