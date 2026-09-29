const transactionModel = require("../models/transactionModel");
const transactionService = require("../services/transactionService");
const { formatReceipt } = require("../utils/receipt");

async function checkout(req, res, next) {
  try {
    const {
      customer_id,
      items,
      discount,
      tax,
      payments,
    } = req.body;

    const result =
      await transactionService.checkout({
        storeId: req.storeId,
        userId: req.user.user_id,
        customerId: customer_id,
        items,
        discount,
        tax,
        payments,
      });

    return res.status(201).json({
      success: true,
      message: "Transaksi berhasil",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getTransactions(
  req,
  res,
  next
) {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
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
      ![
        "COMPLETED",
        "VOID",
        "REFUNDED",
      ].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status transaksi tidak valid",
      });
    }

    const result =
      await transactionModel.findAll(
        req.storeId,
        {
          page,
          limit,
          search,
          status,
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

async function getTransactionById(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const transaction =
      await transactionModel.findDetailById(
        id,
        req.storeId
      );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message:
          "Transaksi tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}

async function voidTransaction(req, res, next) {
  try {
    const { id } = req.params;

    const result =
      await transactionService.voidTransaction({
        transactionId: id,
        storeId: req.storeId,
        userId: req.user.user_id,
        role: req.user.role,
      });

    return res.status(200).json({
      success: true,
      message: "Transaksi berhasil di-void",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function refundTransaction(req, res, next) {
  try {
    const { id } = req.params;

    const result =
      await transactionService.refundTransaction({
        transactionId: id,
        storeId: req.storeId,
        userId: req.user.user_id,
        role: req.user.role,
      });

    return res.status(200).json({
      success: true,
      message: "Transaksi berhasil direfund",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getReceipt(req, res, next) {
  try {
    const { id } = req.params;

    const transaction =
      await transactionModel.findDetailById(
        id,
        req.storeId
      );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan",
      });
    }

    const receipt = formatReceipt(transaction);

    return res.status(200).json({
      success: true,
      data: {
        transaction,
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