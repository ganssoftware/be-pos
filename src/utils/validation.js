function isValidGmail(email) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email);
}

function isValidPassword(password) {
  if (!password || password.length < 6) {
    return false;
  }

  // Minimal 1 huruf besar
  if (!/[A-Z]/.test(password)) {
    return false;
  }

  // Minimal 1 symbol
  if (!/[^A-Za-z0-9]/.test(password)) {
    return false;
  }

  return true;
}

module.exports = {
  isValidGmail,
  isValidPassword,
};