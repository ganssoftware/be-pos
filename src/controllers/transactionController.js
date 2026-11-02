
const transactionModel = require("../models/transactionModel");
const transactionService = require("../services/transactionService");
const { formatReceipt } = require("../utils/receipt");

const {
  sanitizeTransactionResponse,
} = require("../utils/transactionResponse");

function normalizeRole(role) {
  if (typeof role === "string") {
    return role
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
  }

  if (role && typeof role === "object") {
    return String(role.name || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
  }

  return "";
}

function canAccessTransaction(role) {
  return ["owner", "cashier", "kasir"].includes(
    normalizeRole(role)
  );
}

async function checkout(req, res, next) {
  try {
    const {
      customer_id,
      items,
      discount,
      tax,
      payments,
      shift_id,
      outside_shift,
    } = req.body;

    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melakukan transaksi",
      });
    }

    if (
      outside_shift !== undefined &&
      typeof outside_shift !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "outside_shift harus berupa boolean",
      });
    }

    if (
      shift_id !== undefined &&
      shift_id !== null &&
      (
        typeof shift_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          shift_id
        )
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Format shift_id tidak valid",
      });
    }

    if (role !== "owner" && shift_id) {
      return res.status(403).json({
        success: false,
        message:
          "Kasir tidak dapat memilih shift lain",
      });
    }

    if (role !== "owner" && outside_shift === true) {
      return res.status(403).json({
        success: false,
        message:
          "Kasir wajib melakukan transaksi dalam shift aktif miliknya",
      });
    }

    if (
      role === "owner" &&
      shift_id &&
      outside_shift === true
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Pilih shift atau transaksi di luar shift, bukan keduanya",
      });
    }

    const result = await transactionService.checkout({
      storeId: req.storeId,
      userId: req.user.user_id,
      role: role,

      customerId: customer_id,
      items,
      discount,
      tax,
      payments,

      shiftId: shift_id || null,
      outsideShift: outside_shift === true,
    });

    return res.status(201).json({
      success: true,
      message: "Transaksi berhasil",
      data: sanitizeTransactionResponse(
        result,
        role
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function getTransactions(req, res, next) {
  try {
    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melihat transaksi",
      });
    }

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const search = String(
      req.query.search || ""
    ).trim();

    const status = String(
      req.query.status || ""
    )
      .trim()
      .toUpperCase();

    if (
      status &&
      !["COMPLETED", "VOID", "REFUNDED"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Status transaksi tidak valid",
      });
    }

    const result = await transactionModel.findAll(req.storeId, {
      page,
      limit,
      search,
      status,
      userId: req.user.user_id,
      role: normalizeRole(req.user.role),
    });

    return res.status(200).json({
      success: true,

      data: sanitizeTransactionResponse(
        result.data,
        role
      ),

      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getTransactionById(req, res, next) {
  try {
    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melihat detail transaksi",
      });
    }

    const transaction = await transactionModel.findDetailById(
      req.params.id,
      req.storeId,
      {
        userId: req.user.user_id,
        role: normalizeRole(req.user.role),
        includeCostPrice: normalizeRole(req.user.role) === "owner",
      }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,

      data: sanitizeTransactionResponse(
        transaction,
        role
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function voidTransaction(req, res, next) {
  try {
    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melakukan void transaksi",
      });
    }

    const result =
      await transactionService.voidTransaction({
        transactionId: req.params.id,
        storeId: req.storeId,
        userId: req.user.user_id,
        role,
      });

    return res.status(200).json({
      success: true,
      message: "Transaksi berhasil di-void",

      data: sanitizeTransactionResponse(
        result,
        role
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function refundTransaction(req, res, next) {
  try {
    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melakukan refund transaksi",
      });
    }

    const result =
      await transactionService.refundTransaction({
        transactionId: req.params.id,
        storeId: req.storeId,
        userId: req.user.user_id,
        role,
      });

    return res.status(200).json({
      success: true,
      message: "Transaksi berhasil direfund",

      data: sanitizeTransactionResponse(
        result,
        role
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function getReceipt(req, res, next) {
  try {
    const role = normalizeRole(req.user?.role);

    if (!canAccessTransaction(role)) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak memiliki akses untuk melihat struk transaksi",
      });
    }

    const transaction = await transactionModel.findDetailById(
      req.params.id,
      req.storeId,
      {
        userId: req.user.user_id,
        role: normalizeRole(req.user.role),
        includeCostPrice: false,
      }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan",
      });
    }

    const safeTransaction =
      sanitizeTransactionResponse(
        transaction,
        role
      );

    const receipt = formatReceipt(
      safeTransaction
    );

    return res.status(200).json({
      success: true,

      data: {
        transaction: safeTransaction,
        receipt,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkout,
  getTransactions,
  getTransactionById,
  voidTransaction,
  refundTransaction,
  getReceipt,
};
