
const pool = require("../config/db");

async function findByBarcode(barcode) {
    const query = `
    SELECT
      id,
      barcode,
      name,
      description,
      category_name,
      unit_name,
      unit_symbol,
      image_url
    FROM master_products
    WHERE barcode = $1
      AND approval_status = 'APPROVED'
      AND is_active = TRUE
    LIMIT 1
  `;

    const result = await pool.query(query, [barcode]);

    return result.rows[0] || null;
}

async function findAll({
    page = 1,
    limit = 10,
    search = "",
    approvalStatus = null,
    isActive = null,
}) {
    const offset = (page - 1) * limit;

    const query = `
    SELECT
      mp.*,
      submitter.full_name AS submitted_by_name,
      reviewer.full_name AS reviewed_by_name
    FROM master_products mp
    LEFT JOIN users submitter
      ON submitter.id = mp.submitted_by
    LEFT JOIN users reviewer
      ON reviewer.id = mp.reviewed_by
    WHERE
      (
        $1 = ''
        OR mp.name ILIKE '%' || $1 || '%'
        OR mp.barcode ILIKE '%' || $1 || '%'
      )
      AND (
        $2::varchar IS NULL
        OR mp.approval_status = $2
      )
      AND (
        $3::boolean IS NULL
        OR mp.is_active = $3
      )
    ORDER BY mp.created_at DESC
    LIMIT $4 OFFSET $5
  `;

    const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM master_products mp
    WHERE
      (
        $1 = ''
        OR mp.name ILIKE '%' || $1 || '%'
        OR mp.barcode ILIKE '%' || $1 || '%'
      )
      AND (
        $2::varchar IS NULL
        OR mp.approval_status = $2
      )
      AND (
        $3::boolean IS NULL
        OR mp.is_active = $3
      )
  `;

    const params = [
        search,
        approvalStatus,
        isActive,
    ];

    const [result, countResult] = await Promise.all([
        pool.query(query, [...params, limit, offset]),
        pool.query(countQuery, params),
    ]);

    return {
        data: result.rows,
        total: countResult.rows[0].total,
    };
}

async function findPending({ page = 1, limit = 10, search = "" }) {
    return findAll({
        page,
        limit,
        search,
        approvalStatus: "PENDING",
    });
}

async function create(data, db = pool) {
    const query = `
    INSERT INTO master_products (
      barcode,
      name,
      description,
      category_name,
      unit_name,
      unit_symbol,
      image_url,
      approval_status,
      submitted_by,
      reviewed_by,
      reviewed_at,
      review_note
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      'APPROVED', NULL, $8, NOW(), NULL
    )
    RETURNING *
  `;

    const result = await db.query(query, [
        data.barcode,
        data.name,
        data.description,
        data.categoryName,
        data.unitName,
        data.unitSymbol,
        data.imageUrl,
        data.reviewedBy,
    ]);

    return result.rows[0];
}

async function submit(data, db = pool) {
    const query = `
    INSERT INTO master_products (
      barcode,
      name,
      description,
      category_name,
      unit_name,
      unit_symbol,
      image_url,
      approval_status,
      submitted_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      'PENDING', $8
    )
    RETURNING *
  `;

    const result = await db.query(query, [
        data.barcode,
        data.name,
        data.description,
        data.categoryName,
        data.unitName,
        data.unitSymbol,
        data.imageUrl,
        data.submittedBy,
    ]);

    return result.rows[0];
}

async function findById(id) {
    const result = await pool.query(
        `
      SELECT *
      FROM master_products
      WHERE id = $1
      LIMIT 1
    `,
        [id]
    );

    return result.rows[0] || null;
}

async function approve(id, reviewedBy) {
    const query = `
    UPDATE master_products
    SET
      approval_status = 'APPROVED',
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_note = NULL,
      is_active = TRUE,
      updated_at = NOW()
    WHERE id = $1
      AND approval_status = 'PENDING'
    RETURNING *
  `;

    const result = await pool.query(query, [id, reviewedBy]);

    return result.rows[0] || null;
}

async function reject(id, reviewedBy, reviewNote) {
    const query = `
    UPDATE master_products
    SET
      approval_status = 'REJECTED',
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_note = $3,
      updated_at = NOW()
    WHERE id = $1
      AND approval_status = 'PENDING'
    RETURNING *
  `;

    const result = await pool.query(query, [
        id,
        reviewedBy,
        reviewNote,
    ]);

    return result.rows[0] || null;
}

async function updateStatus(id, isActive) {
    const query = `
    UPDATE master_products
    SET
      is_active = $2,
      updated_at = NOW()
    WHERE id = $1
      AND approval_status = 'APPROVED'
    RETURNING *
  `;

    const result = await pool.query(query, [id, isActive]);

    return result.rows[0] || null;
}

module.exports = {
    findByBarcode,
    findAll,
    findPending,
    create,
    submit,
    findById,
    approve,
    reject,
    updateStatus,
};
