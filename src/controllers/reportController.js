const reportModel = require("../models/reportModel");
const {
  getRoleName,
} = require("../middleware/reportAccessMiddleware");

function getJakartaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function getDateRange(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (!startDate && !endDate) {
    const today = getJakartaToday();

    return {
      startDate: today,
      endDate: today,
    };
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      message:
        "start_date dan end_date harus diisi bersamaan",
    });

    return null;
  }

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    res.status(400).json({
      success: false,
      message:
        "Format tanggal harus YYYY-MM-DD dan tanggal harus valid",
    });

    return null;
  }

  if (startDate > endDate) {
    res.status(400).json({
      success: false,
      message:
        "start_date tidak boleh melebihi end_date",
    });

    return null;
  }

  return {
    startDate,
    endDate,
  };
}

function getPagination(req, res) {
  const page =
    req.query.page === undefined
      ? 1
      : Number(req.query.page);

  const limit =
    req.query.limit === undefined
      ? 20
      : Number(req.query.limit);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    res.status(400).json({
      success: false,
      message:
        "page harus bilangan bulat >= 1 dan limit harus antara 1–100",
    });

    return null;
  }

  return {
    page,
    limit,
  };
}

// Owner mendapatkan seluruh data toko.
// Kasir hanya mendapatkan data miliknya.
function getReportUserId(req) {
  return getRoleName(req.user) === "kasir"
    ? req.user.user_id
    : null;
}

async function getOverview(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const summary = await reportModel.getOverview(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getSales(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const items = await reportModel.getSalesTrend(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getPayments(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const items = await reportModel.getPaymentMethods(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getCashiers(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const items = await reportModel.getCashierAttendance(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    const summary = {
      total_shifts: items.length,

      open_shifts: items.filter(
        (item) => item.shift_status === "OPEN"
      ).length,

      closed_shifts: items.filter(
        (item) => item.shift_status === "CLOSED"
      ).length,

      total_worked_hours: Number(
        items
          .reduce(
            (total, item) =>
              total + (item.duration_hours ?? 0),
            0
          )
          .toFixed(2)
      ),
    };

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        summary,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getInventory(req, res, next) {
  try {
    const pagination = getPagination(req, res);
    if (!pagination) return;

    const search = String(
      req.query.search || ""
    ).trim();

    if (search.length > 100) {
      return res.status(400).json({
        success: false,
        message:
          "Pencarian maksimal 100 karakter",
      });
    }

    const result = await reportModel.getLowStockProducts(
      req.storeId,
      {
        ...pagination,
        search,
      }
    );

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getMovements(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const items = await reportModel.getStockMovements(
      req.storeId,
      range.startDate,
      range.endDate
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getProducts(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const items = await reportModel.getTopProducts(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getShifts(req, res, next) {
  try {
    const range = getDateRange(req, res);
    if (!range) return;

    const summary = await reportModel.getShiftSummary(
      req.storeId,
      range.startDate,
      range.endDate,
      getReportUserId(req)
    );

    return res.status(200).json({
      success: true,
      data: {
        period: range,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
  getSales,
  getPayments,
  getCashiers,
  getInventory,
  getMovements,
  getProducts,
  getShifts,
};