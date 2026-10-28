const crypto = require("crypto");

const pool = require("../config/db");

const transactionModel = require("../models/transactionModel");
const paymentModel = require("../models/paymentModel");
const inventoryModel = require("../models/inventoryModel");
const shiftModel = require("../models/shiftModel");

const ALLOWED_PAYMENT_METHODS = [
  "CASH",
  "QRIS",
  "DEBIT",
  "CREDIT_CARD",
  "TRANSFER",
  "E_WALLET",
];

function normalizeRole(role) {
  if (typeof role === "string") {
    return role.trim().toLowerCase();
  }

  if (role && typeof role === "object") {
    return String(role.name || "")
      .trim()
      .toLowerCase();
  }

  return "";
}

function parseMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function parsePositiveNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function generateTransactionNumber() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  const random = crypto
    .randomUUID()
    .split("-")[0]
    .toUpperCase();

  return `TRX-${timestamp}-${random}`;
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resolveCheckoutShift({
  client,
  storeId,
  userId,
  role,
  shiftId,
  outsideShift,
}) {
  if (role === "cashier" || role === "kasir") {
    if (shiftId || outsideShift) {
      throw createError(
        "Kasir wajib menggunakan shift aktif miliknya sendiri",
        403
      );
    }

    const shift = await shiftModel.findOpenForUpdate(
      client,
      userId,
      storeId
    );

    if (!shift) {
      throw createError(
        "Anda belum memiliki shift yang terbuka",
        409
      );
    }

    return shift;
  }

  if (role !== "owner") {
    throw createError(
      "Anda tidak memiliki akses untuk melakukan transaksi",
      403
    );
  }

  if (outsideShift === true) {
    if (shiftId) {
      throw createError(
        "Pilih shift atau transaksi di luar shift, bukan keduanya"
      );
    }

    return null;
  }

  if (shiftId) {
    const shift =
      await shiftModel.findByIdForStoreForUpdate(
        client,
        shiftId,
        storeId
      );

    if (!shift) {
      throw createError(
        "Shift yang dipilih tidak ditemukan pada toko ini",
        404
      );
    }

    if (!["OPEN", "CLOSED"].includes(shift.status)) {
      throw createError(
        "Status shift yang dipilih tidak valid"
      );
    }

    return shift;
  }

  const allShifts =
    await shiftModel.findAllByStoreForOwner(
      client,
      storeId
    );

  const openShifts = allShifts.filter(
    (shift) => shift.status === "OPEN"
  );

  if (openShifts.length > 1) {
    throw createError(
      "Terdapat beberapa shift aktif. Pilih shift yang ingin digunakan atau pilih transaksi di luar shift.",
      409
    );
  }

  if (openShifts.length === 1) {
    return openShifts[0];
  }

  return null;
}

async function checkout({
  storeId,
  userId,
  role,
  customerId,
  items,
  discount,
  tax,
  payments,
  shiftId = null,
  outsideShift = false,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    role = normalizeRole(role);

    if (!["owner", "cashier", "kasir"].includes(role)) {
      throw createError(
        "Anda tidak memiliki akses untuk melakukan transaksi",
        403
      );
    }

    const shift = await resolveCheckoutShift({
      client,
      storeId,
      userId,
      role,
      shiftId,
      outsideShift,
    });

    if (!Array.isArray(items) || items.length === 0) {
      throw createError(
        "Minimal terdapat satu produk dalam transaksi"
      );
    }

    const processedItems = [];

    let subtotal = 0;

    for (const item of items) {
      const productId = item.product_id;

      const quantity = parsePositiveNumber(
        item.quantity
      );

      const itemDiscount = parseMoney(
        item.discount ?? 0
      );

      if (!productId) {
        throw createError("Product ID wajib diisi");
      }

      if (quantity === null) {
        throw createError("Quantity produk tidak valid");
      }

      if (itemDiscount === null) {
        throw createError("Discount item tidak valid");
      }

      const product =
        await inventoryModel.findProductForUpdate(
          client,
          productId,
          storeId
        );

      if (!product) {
        throw createError("Produk tidak ditemukan", 404);
      }

      if (!product.is_active) {
        throw createError(
          `Produk "${product.name}" tidak aktif`
        );
      }

      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          productId,
          storeId
        );

      if (!inventory) {
        throw createError(
          `Inventory produk "${product.name}" tidak ditemukan`
        );
      }

      const stock = Number(inventory.quantity);

      if (stock < quantity) {
        throw createError(
          `Stok "${product.name}" tidak mencukupi. Stok tersedia: ${stock}`
        );
      }

      const price = Number(product.selling_price);
      const costPrice = Number(product.purchase_price);

      if (!Number.isFinite(price) || price < 0) {
        throw createError(
          `Harga jual produk "${product.name}" tidak valid`
        );
      }

      if (
        !Number.isFinite(costPrice) ||
        costPrice < 0
      ) {
        throw createError(
          `Harga beli produk "${product.name}" tidak valid`
        );
      }

      const itemSubtotal =
        price * quantity - itemDiscount;

      if (itemSubtotal < 0) {
        throw createError(
          `Discount produk "${product.name}" tidak valid`
        );
      }

      subtotal += itemSubtotal;

      processedItems.push({
        product,
        inventory,
        quantity,
        price,
        costPrice,
        discount: itemDiscount,
        subtotal: itemSubtotal,
      });
    }

    const transactionDiscount = parseMoney(
      discount ?? 0
    );

    const transactionTax = parseMoney(
      tax ?? 0
    );

    if (transactionDiscount === null) {
      throw createError(
        "Transaction discount tidak valid"
      );
    }

    if (transactionTax === null) {
      throw createError("Tax tidak valid");
    }

    if (transactionDiscount > subtotal) {
      throw createError(
        "Discount transaksi tidak boleh melebihi subtotal"
      );
    }

    const total =
      subtotal -
      transactionDiscount +
      transactionTax;

    if (!Number.isFinite(total) || total < 0) {
      throw createError("Total transaksi tidak valid");
    }

    if (
      !Array.isArray(payments) ||
      payments.length === 0
    ) {
      throw createError(
        "Minimal terdapat satu pembayaran"
      );
    }

    let paymentTotal = 0;
    let cashExpectedCash = 0;

    const processedPayments = [];

    for (const payment of payments) {
      const method = String(payment.method || "")
        .trim()
        .toUpperCase();

      const amount = parsePositiveNumber(
        payment.amount
      );

      if (!ALLOWED_PAYMENT_METHODS.includes(method)) {
        throw createError(
          `Metode pembayaran "${method}" tidak valid`
        );
      }

      if (amount === null) {
        throw createError(
          "Nominal pembayaran tidak valid"
        );
      }

      let amountReceived;

      if (method === "CASH") {
        amountReceived = parsePositiveNumber(
          payment.amount_received
        );

        if (amountReceived === null) {
          throw createError(
            "Uang diterima untuk CASH wajib diisi"
          );
        }

        if (amountReceived < amount) {
          throw createError(
            "Uang CASH yang diterima kurang dari nominal pembayaran"
          );
        }
      } else {
        amountReceived = parsePositiveNumber(
          payment.amount_received ?? amount
        );

        if (amountReceived === null) {
          throw createError(
            "Nominal pembayaran tidak valid"
          );
        }

        if (
          Number(
            (amountReceived - amount).toFixed(2)
          ) !== 0
        ) {
          throw createError(
            `Metode ${method} tidak dapat menerima pembayaran melebihi nominal transaksi`
          );
        }
      }

      const changeAmount =
        method === "CASH"
          ? Number(
              (amountReceived - amount).toFixed(2)
            )
          : 0;

      paymentTotal += amount;

      if (method === "CASH") {
        cashExpectedCash += amount;
      }

      processedPayments.push({
        method,
        amount,
        amountReceived,
        changeAmount,
        referenceNumber:
          payment.reference_number || null,
      });
    }

    const paymentDifference = Number(
      (paymentTotal - total).toFixed(2)
    );

    if (paymentDifference !== 0) {
      throw createError(
        "Total pembayaran harus sama dengan total transaksi"
      );
    }

    const transaction =
      await transactionModel.create(client, {
        storeId,
        shiftId: shift ? shift.id : null,
        userId,
        customerId,
        transactionNumber: generateTransactionNumber(),
        subtotal,
        discount: transactionDiscount,
        tax: transactionTax,
        total,
      });

    const createdItems = [];

    for (const item of processedItems) {
      const updatedInventory =
        await inventoryModel.decreaseStock(
          client,
          item.inventory.id,
          item.quantity
        );

      if (!updatedInventory) {
        throw createError(
          `Stok "${item.product.name}" tidak mencukupi`
        );
      }

      const transactionItem =
        await transactionModel.createItem(client, {
          transactionId: transaction.id,
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          price: item.price,
          costPrice: item.costPrice,
          discount: item.discount,
          subtotal: item.subtotal,
        });

      await inventoryModel.createMovement(client, {
        storeId,
        productId: item.product.id,
        type: "OUT",
        quantity: item.quantity,
        referenceType: "TRANSACTION",
        referenceId: transaction.id,
        notes:
          `Penjualan ${transaction.transaction_number}`,
        createdBy: userId,
      });

      createdItems.push(transactionItem);
    }

    const createdPayments = [];

    for (const payment of processedPayments) {
      const createdPayment =
        await paymentModel.create(client, {
          transactionId: transaction.id,
          method: payment.method,
          amount: payment.amount,
          amountReceived: payment.amountReceived,
          changeAmount: payment.changeAmount,
          referenceNumber: payment.referenceNumber,
        });

      createdPayments.push(createdPayment);
    }

    let updatedShift = shift;

    if (
      shift &&
      shift.status === "OPEN" &&
      cashExpectedCash > 0
    ) {
      updatedShift =
        await shiftModel.increaseExpectedCash(
          client,
          shift.id,
          cashExpectedCash
        );

      if (!updatedShift) {
        throw createError(
          "Saldo kas shift gagal diperbarui. Silakan ulangi transaksi."
        );
      }
    }

    await client.query("COMMIT");

    const shiftCashChanged =
      Boolean(shift) &&
      shift.status === "OPEN" &&
      cashExpectedCash > 0;

    return {
      transaction,
      items: createdItems,
      payments: createdPayments,

      shift: shift
        ? {
            id: shift.id,
            status: shift.status,
            cash_payment:
              shift.status === "OPEN"
                ? cashExpectedCash
                : 0,
            expected_cash: Number(
              shiftCashChanged
                ? updatedShift.expected_cash
                : shift.expected_cash
            ),
            cash_updated: shiftCashChanged,
          }
        : null,

      outside_shift: !shift,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Rollback checkout gagal:",
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function reverseTransaction({
  transactionId,
  storeId,
  userId,
  role,
  targetStatus,
}) {
  const client = await pool.connect();

  const isVoid = targetStatus === "VOID";
  const actionLabel = isVoid ? "void" : "refund";
  const movementType = isVoid ? "VOID" : "REFUND";

  try {
    await client.query("BEGIN");

    role = normalizeRole(role);

    const transaction =
      await transactionModel.findByIdForUpdate(
        client,
        transactionId,
        storeId
      );

    if (!transaction) {
      throw createError(
        "Transaksi tidak ditemukan",
        404
      );
    }

    if (transaction.status !== "COMPLETED") {
      throw createError(
        `Transaksi tidak dapat di-${actionLabel} karena status saat ini ${transaction.status}`
      );
    }

    if (
      role !== "owner" &&
      transaction.user_id !== userId
    ) {
      throw createError(
        `Anda tidak memiliki akses untuk melakukan ${actionLabel} transaksi ini`,
        403
      );
    }

    let shift = null;

    if (transaction.shift_id) {
      shift = await shiftModel.findByIdForUpdate(
        client,
        transaction.shift_id,
        storeId
      );

      if (!shift) {
        throw createError(
          "Shift transaksi tidak ditemukan",
          404
        );
      }
    }

    const items =
      await transactionModel.findItemsByTransactionIdForUpdate(
        client,
        transaction.id
      );

    if (!items.length) {
      throw createError(
        "Item transaksi tidak ditemukan"
      );
    }

    const payments =
      await paymentModel.findByTransactionIdForUpdate(
        client,
        transaction.id
      );

    const restoredItems = [];

    for (const item of items) {
      if (!item.product_id) {
        throw createError(
          `Produk pada item "${item.product_name}" tidak ditemukan`
        );
      }

      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          item.product_id,
          storeId
        );

      if (!inventory) {
        throw createError(
          `Inventory untuk produk "${item.product_name}" tidak ditemukan`
        );
      }

      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw createError(
          `Quantity item "${item.product_name}" tidak valid`
        );
      }

      const updatedInventory =
        await inventoryModel.increaseStock(
          client,
          inventory.id,
          quantity
        );

      if (!updatedInventory) {
        throw createError(
          `Gagal mengembalikan stok produk "${item.product_name}"`
        );
      }

      const movement =
        await inventoryModel.createMovement(client, {
          storeId,
          productId: item.product_id,
          type: "IN",
          quantity,
          referenceType: movementType,
          referenceId: transaction.id,
          notes:
            `Pengembalian stok karena ${actionLabel} ${transaction.transaction_number}`,
          createdBy: userId,
        });

      restoredItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity,
        inventory: updatedInventory,
        movement,
      });
    }

    const cashPayment = payments
      .filter(
        (payment) =>
          String(payment.method || "").toUpperCase() ===
          "CASH"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );

    let updatedShift = shift;
    let shiftCashChanged = false;

    if (
      shift &&
      shift.status === "OPEN" &&
      cashPayment > 0
    ) {
      updatedShift =
        await shiftModel.decreaseExpectedCash(
          client,
          shift.id,
          cashPayment
        );

      if (!updatedShift) {
        throw createError(
          "Expected cash shift tidak mencukupi atau shift sudah tidak aktif"
        );
      }

      shiftCashChanged = true;
    }

    const updatedTransaction =
      await transactionModel.updateStatus(
        client,
        transaction.id,
        storeId,
        targetStatus
      );

    await client.query("COMMIT");

    return {
      transaction: updatedTransaction,
      restored_items: restoredItems,

      cash_reversed: cashPayment,

      shift: shift
        ? {
            id: shift.id,
            status: shift.status,
            expected_cash: Number(
              shiftCashChanged
                ? updatedShift.expected_cash
                : shift.expected_cash
            ),
            cash_updated: shiftCashChanged,
          }
        : null,

      outside_shift: !shift,
      shift_cash_changed: shiftCashChanged,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        `Rollback ${actionLabel} gagal:`,
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function voidTransaction({
  transactionId,
  storeId,
  userId,
  role,
}) {
  return reverseTransaction({
    transactionId,
    storeId,
    userId,
    role,
    targetStatus: "VOID",
  });
}

async function refundTransaction({
  transactionId,
  storeId,
  userId,
  role,
}) {
  return reverseTransaction({
    transactionId,
    storeId,
    userId,
    role,
    targetStatus: "REFUNDED",
  });
}

module.exports = {
  checkout,
  voidTransaction,
  refundTransaction,
};
