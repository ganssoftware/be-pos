
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
    return String(role.name || "").trim().toLowerCase();
  }

  return "";
}

function parseMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return roundMoney(number);
}

function parsePositiveNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
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

function normalizeBarcode(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const barcode = String(value).trim();

  return barcode.length > 0 ? barcode : null;
}

function validateProductPrice(value, productName, label) {
  const price = parseMoney(value);

  if (price === null) {
    throw createError(
      `${label} produk "${productName}" tidak valid.`
    );
  }

  return price;
}

async function resolveCheckoutShift({
  client,
  storeId,
  userId,
  role,
  shiftId,
  outsideShift,
}) {
  const normalizedRole = normalizeRole(role);

  const selectedShiftId =
    typeof shiftId === "string"
      ? shiftId.trim()
      : shiftId;

  const hasShiftId = Boolean(selectedShiftId);

  const isOutsideShift =
    outsideShift === true ||
    String(outsideShift).toLowerCase() === "true";

  if (
    normalizedRole === "cashier" ||
    normalizedRole === "kasir"
  ) {
    if (hasShiftId || isOutsideShift) {
      throw createError(
        "Kasir wajib menggunakan shift aktif miliknya sendiri.",
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
        "Anda belum memiliki shift yang terbuka. Silakan buka shift terlebih dahulu.",
        409
      );
    }

    return shift;
  }

  if (normalizedRole !== "owner") {
    throw createError(
      "Anda tidak memiliki akses untuk melakukan transaksi.",
      403
    );
  }

  if (isOutsideShift) {
    if (hasShiftId) {
      throw createError(
        "Pilih shift atau transaksi di luar shift, bukan keduanya.",
        400
      );
    }

    return null;
  }

  if (!hasShiftId) {
    throw createError(
      "Pilih shift aktif atau pilih transaksi di luar shift.",
      400
    );
  }

  const shift = await shiftModel.findByIdForStoreForUpdate(
    client,
    selectedShiftId,
    storeId
  );

  if (!shift) {
    throw createError(
      "Shift yang dipilih tidak ditemukan pada toko ini.",
      404
    );
  }

  if (shift.status !== "OPEN") {
    throw createError(
      "Transaksi baru hanya dapat dimasukkan ke shift yang masih terbuka.",
      409
    );
  }

  return shift;
}

function resolveProductTier(product, item, primaryQuantityTotal) {
  const productName = product.name;

  const matchedTier = Number(product.matched_tier || 1);

  const baseUnitName = product.base_unit_name;

  if (!baseUnitName) {
    throw createError(
      `Satuan dasar produk "${productName}" tidak ditemukan.`
    );
  }

  const baseUnitConversionFactor = 1;

  const baseBarcode = product.scanned_barcode || product.barcode || null;

  if (matchedTier === 3) {
    if (product.tier_3_active !== true) {
      throw createError(
        `Harga paket produk "${productName}" tidak aktif.`
      );
    }

    const packageQuantity = parsePositiveNumber(
      product.tier_3_unit_quantity
    );

    if (packageQuantity === null) {
      throw createError(
        `Konversi satuan paket produk "${productName}" tidak valid.`
      );
    }

    const packagePrice = validateProductPrice(
      product.tier_3_price,
      productName,
      "Harga paket"
    );

    if (!product.tier_3_unit_name) {
      throw createError(
        `Satuan paket produk "${productName}" tidak ditemukan.`
      );
    }

    const baseQuantity = item.quantity * packageQuantity;

    if (
      !Number.isFinite(baseQuantity) ||
      baseQuantity <= 0
    ) {
      throw createError(
        `Jumlah stok paket produk "${productName}" tidak valid.`
      );
    }

    return {
      priceTier: 3,
      price: packagePrice,
      quantity: item.quantity,
      baseQuantity,
      sellingUnitName: product.tier_3_unit_name,
      unitConversionFactor: packageQuantity,
      barcode: product.scanned_barcode || item.barcode || null,
      costPrice: validateProductPrice(
        product.purchase_price,
        productName,
        "Harga beli"
      ),
    };
  }

  const tier2Active = product.tier_2_active === true;

  if (
    tier2Active &&
    primaryQuantityTotal >= Number(product.tier_2_min_quantity)
  ) {
    const minimumQuantity = parsePositiveNumber(
      product.tier_2_min_quantity
    );

    if (minimumQuantity === null) {
      throw createError(
        `Batas minimum Tier 2 produk "${productName}" tidak valid.`
      );
    }

    const tier2Price = validateProductPrice(
      product.tier_2_price,
      productName,
      "Harga Tier 2"
    );

    return {
      priceTier: 2,
      price: tier2Price,
      quantity: item.quantity,
      baseQuantity: item.quantity,
      sellingUnitName: baseUnitName,
      unitConversionFactor: baseUnitConversionFactor,
      barcode: baseBarcode,
      costPrice: validateProductPrice(
        product.purchase_price,
        productName,
        "Harga beli"
      ),
    };
  }

  return {
    priceTier: 1,
    price: validateProductPrice(
      product.selling_price,
      productName,
      "Harga jual"
    ),
    quantity: item.quantity,
    baseQuantity: item.quantity,
    sellingUnitName: baseUnitName,
    unitConversionFactor: baseUnitConversionFactor,
    barcode: baseBarcode,
    costPrice: validateProductPrice(
      product.purchase_price,
      productName,
      "Harga beli"
    ),
  };
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
        "Anda tidak memiliki akses untuk melakukan transaksi.",
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
        "Minimal terdapat satu produk dalam transaksi."
      );
    }

    const preparedItems = [];

    const productPricingCache = new Map();

    const primaryQuantityTotals = new Map();

    for (const item of items) {
      const productId = item.product_id;

      const quantity = parsePositiveNumber(item.quantity);

      const itemDiscount = parseMoney(item.discount ?? 0);

      const barcode = normalizeBarcode(item.barcode);

      if (!productId) {
        throw createError("Product ID wajib diisi.");
      }

      if (quantity === null) {
        throw createError(
          "Quantity produk tidak valid."
        );
      }

      if (itemDiscount === null) {
        throw createError(
          "Discount item tidak valid."
        );
      }

      const cacheKey = `${productId}:${barcode || "__PRIMARY__"}`;

      let product = productPricingCache.get(cacheKey);

      if (!productPricingCache.has(cacheKey)) {
        product =
          await transactionModel.findProductPricingForCheckout(
            client,
            productId,
            storeId,
            barcode
          );

        productPricingCache.set(cacheKey, product || null);
      }

      if (!product) {
        throw createError(
          barcode
            ? `Produk atau barcode "${barcode}" tidak ditemukan.`
            : "Produk tidak ditemukan.",
          404
        );
      }

      if (!product.is_active) {
        throw createError(
          `Produk "${product.name}" tidak aktif.`
        );
      }

      const matchedTier = Number(product.matched_tier || 1);

      if (matchedTier !== 1 && matchedTier !== 3) {
        throw createError(
          `Konfigurasi barcode produk "${product.name}" tidak valid.`
        );
      }

      if (matchedTier === 1) {
        const currentTotal =
          primaryQuantityTotals.get(String(productId)) || 0;

        primaryQuantityTotals.set(
          String(productId),
          currentTotal + quantity
        );
      }

      preparedItems.push({
        product,
        productId,
        quantity,
        discount: itemDiscount,
        barcode,
        matchedTier,
      });
    }

    const processedItems = [];

    const inventoryGroups = new Map();

    let subtotal = 0;

    for (const item of preparedItems) {
      const product = item.product;

      const primaryQuantityTotal =
        primaryQuantityTotals.get(String(item.productId)) || 0;

      const pricing = resolveProductTier(
        product,
        item,
        primaryQuantityTotal
      );

      const grossSubtotal = roundMoney(
        pricing.price * pricing.quantity
      );

      if (item.discount > grossSubtotal) {
        throw createError(
          `Discount produk "${product.name}" melebihi harga item.`
        );
      }

      const itemSubtotal = roundMoney(
        grossSubtotal - item.discount
      );

      subtotal = roundMoney(subtotal + itemSubtotal);

      const processedItem = {
        product,
        productId: item.productId,
        quantity: pricing.quantity,
        price: pricing.price,
        costPrice: pricing.costPrice,
        discount: item.discount,
        subtotal: itemSubtotal,
        priceTier: pricing.priceTier,
        sellingUnitName: pricing.sellingUnitName,
        unitConversionFactor: pricing.unitConversionFactor,
        baseQuantity: pricing.baseQuantity,
        barcode: pricing.barcode,
      };

      processedItems.push(processedItem);

      const groupKey = String(item.productId);

      if (!inventoryGroups.has(groupKey)) {
        inventoryGroups.set(groupKey, {
          productId: item.productId,
          productName: product.name,
          baseQuantity: 0,
          inventory: null,
        });
      }

      const group = inventoryGroups.get(groupKey);

      group.baseQuantity += pricing.baseQuantity;
    }

    const transactionDiscount = parseMoney(discount ?? 0);

    const transactionTax = parseMoney(tax ?? 0);

    if (transactionDiscount === null) {
      throw createError(
        "Transaction discount tidak valid."
      );
    }

    if (transactionTax === null) {
      throw createError("Tax tidak valid.");
    }

    if (transactionDiscount > subtotal) {
      throw createError(
        "Discount transaksi tidak boleh melebihi subtotal."
      );
    }

    const total = roundMoney(
      subtotal - transactionDiscount + transactionTax
    );

    if (!Number.isFinite(total) || total < 0) {
      throw createError(
        "Total transaksi tidak valid."
      );
    }

    const sortedInventoryGroups = [
      ...inventoryGroups.values(),
    ].sort((a, b) =>
      String(a.productId).localeCompare(String(b.productId))
    );

    for (const group of sortedInventoryGroups) {
      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          group.productId,
          storeId
        );

      if (!inventory) {
        throw createError(
          `Inventory produk "${group.productName}" tidak ditemukan.`
        );
      }

      const stock = Number(inventory.quantity);

      if (!Number.isFinite(stock) || stock < group.baseQuantity) {
        throw createError(
          `Stok "${group.productName}" tidak mencukupi. Stok tersedia: ${Number.isFinite(stock) ? stock : 0}, dibutuhkan: ${group.baseQuantity}.`
        );
      }

      group.inventory = inventory;
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      throw createError(
        "Minimal terdapat satu pembayaran."
      );
    }

    let paymentTotal = 0;
    let cashExpectedCash = 0;

    const processedPayments = [];

    for (const payment of payments) {
      const method = String(payment.method || "")
        .trim()
        .toUpperCase();

      const amount = parseMoney(payment.amount);

      if (!ALLOWED_PAYMENT_METHODS.includes(method)) {
        throw createError(
          `Metode pembayaran "${method}" tidak valid.`
        );
      }

      if (amount === null || amount <= 0) {
        throw createError(
          "Nominal pembayaran tidak valid."
        );
      }

      let amountReceived;

      if (method === "CASH") {
        amountReceived = parseMoney(
          payment.amount_received
        );

        if (
          amountReceived === null ||
          amountReceived < amount
        ) {
          throw createError(
            "Uang CASH yang diterima kurang dari nominal pembayaran."
          );
        }
      } else {
        amountReceived = parseMoney(
          payment.amount_received ?? amount
        );

        if (amountReceived === null) {
          throw createError(
            "Nominal pembayaran tidak valid."
          );
        }

        if (amountReceived !== amount) {
          throw createError(
            `Metode ${method} tidak dapat menerima pembayaran melebihi nominal transaksi.`
          );
        }
      }

      const changeAmount =
        method === "CASH"
          ? roundMoney(amountReceived - amount)
          : 0;

      paymentTotal = roundMoney(paymentTotal + amount);

      if (method === "CASH") {
        cashExpectedCash = roundMoney(
          cashExpectedCash + amount
        );
      }

      processedPayments.push({
        method,
        amount,
        amountReceived,
        changeAmount,
        referenceNumber: payment.reference_number || null,
      });
    }

    if (roundMoney(paymentTotal - total) !== 0) {
      throw createError(
        "Total pembayaran harus sama dengan total transaksi."
      );
    }

    const transaction = await transactionModel.create(
      client,
      {
        storeId,
        shiftId: shift ? shift.id : null,
        userId,
        customerId,
        transactionNumber: generateTransactionNumber(),
        subtotal,
        discount: transactionDiscount,
        tax: transactionTax,
        total,
      }
    );

    const createdItems = [];

    for (const item of processedItems) {
      const transactionItem =
        await transactionModel.createItem(client, {
          transactionId: transaction.id,
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          price: item.price,
          costPrice: item.costPrice,
          discount: item.discount,
          subtotal: item.subtotal,
          priceTier: item.priceTier,
          sellingUnitName: item.sellingUnitName,
          unitConversionFactor: item.unitConversionFactor,
          baseQuantity: item.baseQuantity,
          barcode: item.barcode,
        });

      createdItems.push(transactionItem);
    }

    for (const group of sortedInventoryGroups) {
      const updatedInventory =
        await inventoryModel.decreaseStock(
          client,
          group.inventory.id,
          group.baseQuantity
        );

      if (!updatedInventory) {
        throw createError(
          `Stok "${group.productName}" gagal diperbarui.`
        );
      }

      await inventoryModel.createMovement(client, {
        storeId,
        productId: group.productId,
        type: "OUT",
        quantity: group.baseQuantity,
        referenceType: "TRANSACTION",
        referenceId: transaction.id,
        notes: `Penjualan ${transaction.transaction_number}`,
        createdBy: userId,
      });
    }

    const createdPayments = [];

    for (const payment of processedPayments) {
      const createdPayment = await paymentModel.create(
        client,
        {
          transactionId: transaction.id,
          method: payment.method,
          amount: payment.amount,
          amountReceived: payment.amountReceived,
          changeAmount: payment.changeAmount,
          referenceNumber: payment.referenceNumber,
        }
      );

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

  if (!["VOID", "REFUNDED"].includes(targetStatus)) {
    client.release();

    throw createError(
      "Jenis pembatalan transaksi tidak valid."
    );
  }

  const isVoid = targetStatus === "VOID";
  const actionLabel = isVoid ? "void" : "refund";
  const movementType = isVoid ? "VOID" : "REFUND";

  try {
    await client.query("BEGIN");

    role = normalizeRole(role);

    if (!["owner", "cashier", "kasir"].includes(role)) {
      throw createError(
        `Anda tidak memiliki akses untuk melakukan ${actionLabel} transaksi ini.`,
        403
      );
    }

    const transaction =
      await transactionModel.findByIdForUpdate(
        client,
        transactionId,
        storeId
      );

    if (!transaction) {
      throw createError(
        "Transaksi tidak ditemukan.",
        404
      );
    }

    if (transaction.status !== "COMPLETED") {
      throw createError(
        `Transaksi tidak dapat di-${actionLabel} karena status saat ini ${transaction.status}.`,
        409
      );
    }

    if (
      role !== "owner" &&
      String(transaction.user_id) !== String(userId)
    ) {
      throw createError(
        `Anda tidak memiliki akses untuk melakukan ${actionLabel} transaksi ini.`,
        403
      );
    }

    const transactionAmount = Number(transaction.total);

    if (
      !Number.isFinite(transactionAmount) ||
      transactionAmount < 0
    ) {
      throw createError(
        "Total transaksi tidak valid."
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
          "Shift transaksi tidak ditemukan.",
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
        "Item transaksi tidak ditemukan."
      );
    }

    const payments =
      await paymentModel.findByTransactionIdForUpdate(
        client,
        transaction.id
      );

    if (!payments.length) {
      throw createError(
        "Data pembayaran transaksi tidak ditemukan."
      );
    }

    let cashPayment = 0;

    for (const payment of payments) {
      if (
        String(payment.method || "").toUpperCase() === "CASH"
      ) {
        const amount = Number(payment.amount);

        if (!Number.isFinite(amount) || amount < 0) {
          throw createError(
            "Nominal pembayaran CASH tidak valid."
          );
        }

        cashPayment = roundMoney(cashPayment + amount);
      }
    }

    const restorationGroups = new Map();

    for (const item of items) {
      if (!item.product_id) {
        throw createError(
          `Produk pada item "${item.product_name}" tidak ditemukan.`
        );
      }

      const baseQuantity = Number(item.base_quantity);

      if (
        !Number.isFinite(baseQuantity) ||
        baseQuantity <= 0
      ) {
        throw createError(
          `Base quantity item "${item.product_name}" tidak valid.`
        );
      }

      const groupKey = String(item.product_id);

      if (!restorationGroups.has(groupKey)) {
        restorationGroups.set(groupKey, {
          productId: item.product_id,
          productName: item.product_name,
          baseQuantity: 0,
          inventory: null,
        });
      }

      const group = restorationGroups.get(groupKey);

      group.baseQuantity += baseQuantity;
    }

    const sortedRestorationGroups = [
      ...restorationGroups.values(),
    ].sort((a, b) =>
      String(a.productId).localeCompare(String(b.productId))
    );

    const restoredItems = [];

    for (const group of sortedRestorationGroups) {
      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          group.productId,
          storeId
        );

      if (!inventory) {
        throw createError(
          `Inventory untuk produk "${group.productName}" tidak ditemukan.`
        );
      }

      const updatedInventory =
        await inventoryModel.increaseStock(
          client,
          inventory.id,
          group.baseQuantity
        );

      if (!updatedInventory) {
        throw createError(
          `Gagal mengembalikan stok produk "${group.productName}".`
        );
      }

      const movement =
        await inventoryModel.createMovement(client, {
          storeId,
          productId: group.productId,
          type: "IN",
          quantity: group.baseQuantity,
          referenceType: movementType,
          referenceId: transaction.id,
          notes: `Pengembalian stok karena ${actionLabel} ${transaction.transaction_number}`,
          createdBy: userId,
        });

      restoredItems.push({
        product_id: group.productId,
        product_name: group.productName,
        quantity: group.baseQuantity,
        inventory: updatedInventory,
        movement,
      });
    }

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
          "Expected cash shift tidak mencukupi untuk pengembalian CASH. Transaksi tidak dibatalkan.",
          409
        );
      }

      shiftCashChanged = true;
    }

    const reversalResult = await client.query(
      `
        INSERT INTO transaction_reversals (
          transaction_id,
          store_id,
          shift_id,
          performed_by,
          reversal_type,
          transaction_amount,
          cash_amount,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (transaction_id) DO NOTHING
        RETURNING
          transaction_id,
          store_id,
          shift_id,
          performed_by,
          reversal_type,
          transaction_amount,
          cash_amount,
          notes,
          created_at
      `,
      [
        transaction.id,
        storeId,
        shift ? shift.id : null,
        userId,
        targetStatus,
        transactionAmount,
        cashPayment,
        `${actionLabel.toUpperCase()} transaksi ${transaction.transaction_number}`,
      ]
    );

    if (!reversalResult.rows[0]) {
      throw createError(
        "Transaksi ini sudah memiliki catatan reversal.",
        409
      );
    }

    const updatedTransaction =
      await transactionModel.updateStatus(
        client,
        transaction.id,
        storeId,
        targetStatus
      );

    if (!updatedTransaction) {
      throw createError(
        "Status transaksi gagal diperbarui."
      );
    }

    await client.query("COMMIT");

    const cashAdjustmentRequired =
      cashPayment > 0 && !shiftCashChanged;

    return {
      transaction: updatedTransaction,
      reversal: reversalResult.rows[0],
      restored_items: restoredItems,

      transaction_amount: transactionAmount,
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
      cash_adjustment_required: cashAdjustmentRequired,
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
