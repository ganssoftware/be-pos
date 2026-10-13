function getRoleName(user) {
  const role = user?.role;

  const roleName =
    typeof role === "string"
      ? role
      : role?.name ?? user?.role_name ?? "";

  return String(roleName)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function allowReportRoles(...allowedRoles) {
  const allowed = allowedRoles.map((role) =>
    String(role).trim().toLowerCase().replace(/_/g, "-")
  );

  return function reportAccessMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const roleName = getRoleName(req.user);

    if (!allowed.includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke laporan ini",
      });
    }

    next();
  };
}

module.exports = {
  getRoleName,
  allowReportRoles,
};