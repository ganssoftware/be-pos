const jwt = require("jsonwebtoken");

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

module.exports = {
  generateToken,
  verifyToken,
};