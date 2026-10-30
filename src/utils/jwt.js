const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const {
  jwtSecret,
  jwtExpiresIn,
} = require("../config/env");

function generateToken(payload) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  generateToken,
  verifyToken,
  generateRefreshToken,
  hashRefreshToken,
};