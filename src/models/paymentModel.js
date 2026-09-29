const pool = require("../config/db");

async function create(
  client,
  {
    transactionId,
    method,
    amount,
    referenceNumber,
  }
) {
  const query = `
    INSERT INTO payments (
      transaction_id,
      method,
      amount,
      reference_number
    )
    VALUES ($1, $2, $3, $4)
    RETURNING
      id,
      transaction_id,
      method,
      amount,
      reference_number,
      paid_at
  `;

  const result = await client.query(query, [
    transactionId,
    method,
    amount,
    referenceNumber || null,
  ]);

  return result.rows[0];
}

async function findByTransactionId(
  transactionId
) {
  const query = `
    SELECT
      id,
      transaction_id,
      method,
      amount,
      reference_number,
      paid_at
    FROM payments
    WHERE transaction_id = $1
    ORDER BY paid_at ASC
  `;

  const result = await pool.query(
    query,
    [transactionId]
  );

  return result.rows;
}

async function findByTransactionIdForUpdate(client, transactionId) {
  const query = `
    SELECT
      id,
      transaction_id,
      method,
      amount,
      reference_number,
      paid_at
    FROM payments
    WHERE transaction_id = $1
    ORDER BY paid_at ASC
    FOR UPDATE
  `;

  const result = await client.query(query, [transactionId]);

  return result.rows;
}

module.exports = {
  create,
  findByTransactionId,
  findByTransactionIdForUpdate,
};