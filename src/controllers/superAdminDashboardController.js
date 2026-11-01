const pool = require("../config/db");

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
        ) AS total_cashier,

        (
          SELECT COUNT(*)
          FROM master_products
        ) AS total_products,

        (
          SELECT COUNT(*)
          FROM master_products
          WHERE approval_status = 'APPROVED'
            AND is_active = TRUE
        ) AS total_approved_products,

        (
          SELECT COUNT(*)
          FROM master_products
          WHERE approval_status = 'PENDING'
        ) AS total_pending_products,

        (
          SELECT COUNT(*)
          FROM master_products
          WHERE approval_status = 'REJECTED'
        ) AS total_rejected_products,

        (
          SELECT COUNT(*)
          FROM master_products
          WHERE approval_status = 'APPROVED'
            AND is_active = FALSE
        ) AS total_inactive_products
    `);

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        summary: {
          total_store: Number(row.total_store),
          total_owner: Number(row.total_owner),
          total_cashier: Number(row.total_cashier),

          total_products: Number(row.total_products),
          total_approved_products: Number(
            row.total_approved_products
          ),
          total_pending_products: Number(
            row.total_pending_products
          ),
          total_rejected_products: Number(
            row.total_rejected_products
          ),
          total_inactive_products: Number(
            row.total_inactive_products
          ),
        },
      },
    });
  } catch (error) {
    console.error(
      "getSuperAdminDashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard Super Admin",
    });
  }
};

module.exports = {
  getSuperAdminDashboard,
};
