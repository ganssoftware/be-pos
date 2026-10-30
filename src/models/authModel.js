const pool = require("../config/db");

async function findUserByUsername(username) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password,
      u.full_name,
      u.is_active,
      u.profile_photo,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.username = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [username]);

  return result.rows[0] || null;
}

async function findUserById(id) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.profile_photo,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0] || null;
}

async function createSession(userId, refreshTokenHash) {
  const query = `
    INSERT INTO auth_sessions (
      user_id,
      refresh_token_hash,
      last_activity_at
    )
    VALUES ($1, $2, NOW())
    RETURNING id, user_id
  `;

  const result = await pool.query(query, [
    userId,
    refreshTokenHash,
  ]);

  return result.rows[0];
}

async function touchSession(sessionId, userId) {
  const query = `
    UPDATE auth_sessions AS s
    SET last_activity_at = NOW()
    FROM users AS u
    WHERE s.id = $1
      AND s.user_id = $2
      AND u.id = s.user_id
      AND u.is_active = TRUE
      AND s.last_activity_at > NOW() - INTERVAL '24 hours'
    RETURNING s.id
  `;

  const result = await pool.query(query, [
    sessionId,
    userId,
  ]);

  return result.rowCount === 1;
}

async function rotateSession(
  oldRefreshTokenHash,
  newRefreshTokenHash
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const query = `
      SELECT
        s.id,
        s.user_id,
        (
          s.last_activity_at > NOW() - INTERVAL '24 hours'
        ) AS session_active,
        u.is_active AS user_active
      FROM auth_sessions AS s
      INNER JOIN users AS u ON u.id = s.user_id
      WHERE s.refresh_token_hash = $1
      FOR UPDATE OF s
    `;

    const result = await client.query(query, [
      oldRefreshTokenHash,
    ]);

    const session = result.rows[0];

    if (!session) {
      await client.query("COMMIT");
      return null;
    }

    if (!session.session_active || !session.user_active) {
      await client.query(
        "DELETE FROM auth_sessions WHERE id = $1",
        [session.id]
      );

      await client.query("COMMIT");
      return null;
    }

    const updateResult = await client.query(
      `
        UPDATE auth_sessions
        SET
          refresh_token_hash = $1,
          last_activity_at = NOW()
        WHERE id = $2
        RETURNING id, user_id
      `,
      [
        newRefreshTokenHash,
        session.id,
      ]
    );

    await client.query("COMMIT");

    return updateResult.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteSessionByRefreshTokenHash(tokenHash) {
  await pool.query(
    "DELETE FROM auth_sessions WHERE refresh_token_hash = $1",
    [tokenHash]
  );
}

module.exports = {
  findUserByUsername,
  findUserById,
  createSession,
  touchSession,
  rotateSession,
  deleteSessionByRefreshTokenHash,
};