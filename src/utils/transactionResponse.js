function normalizeRole(role) {
    if (typeof role === "string") {
        return role.trim().toLowerCase().replace(/_/g, "-");
    }

    if (role && typeof role === "object") {
        return String(role.name || "")
            .trim()
            .toLowerCase()
            .replace(/_/g, "-");
    }

    return "";
}

const SENSITIVE_COST_FIELDS = new Set([
    "cost_price",
    "purchase_price",
    "unit_cost",
    "total_cost",
    "gross_profit",
    "net_profit",
    "profit",
    "margin",
]);

function sanitizeForCashier(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeForCashier);
    }

    if (value === null || typeof value !== "object") {
        return value;
    }

    const sanitized = {};

    for (const [key, item] of Object.entries(value)) {
        if (SENSITIVE_COST_FIELDS.has(key.toLowerCase())) {
            continue;
        }

        sanitized[key] = sanitizeForCashier(item);
    }

    return sanitized;
}

function sanitizeTransactionResponse(data, role) {
    const normalizedRole = normalizeRole(role);

    if (normalizedRole === "owner") {
        return data;
    }

    return sanitizeForCashier(data);
}

module.exports = {
    normalizeRole,
    sanitizeTransactionResponse,
};