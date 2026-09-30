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

async function checkout({
  storeId,
  userId,
  customerId,
  items,
  discount,
  tax,
  payments,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // --------------------------------------------------
    // 1. Pastikan user memiliki shift OPEN
    // --------------------------------------------------

    const shift = await shiftModel.findOpenForUpdate(
      client,
      userId,
      storeId
    );

    if (!shift) {
      throw new Error(
        "Anda belum memiliki shift yang terbuka"
      );
    }

    // --------------------------------------------------
    // 2. Validasi item
    // --------------------------------------------------

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(
        "Minimal terdapat satu produk dalam transaksi"
      );
    }

    // --------------------------------------------------
    // 3. Hitung item berdasarkan harga DB
    // --------------------------------------------------

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
        throw new Error(
          "Product ID wajib diisi"
        );
      }

      if (quantity === null) {
        throw new Error(
          "Quantity produk tidak valid"
        );
      }

      if (itemDiscount === null) {
        throw new Error(
          "Discount item tidak valid"
        );
      }

      const product =
        await inventoryModel.findProductForUpdate(
          client,
          productId,
          storeId
        );

      if (!product) {
        throw new Error(
          "Produk tidak ditemukan"
        );
      }

      if (!product.is_active) {
        throw new Error(
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
        throw new Error(
          `Inventory produk "${product.name}" tidak ditemukan`
        );
      }

      const stock = Number(inventory.quantity);

      if (stock < quantity) {
        throw new Error(
          `Stok "${product.name}" tidak mencukupi. Stok tersedia: ${stock}`
        );
      }

      const price = Number(
        product.selling_price
      );

      const itemSubtotal =
        price * quantity - itemDiscount;

      if (itemSubtotal < 0) {
        throw new Error(
          `Discount produk "${product.name}" tidak valid`
        );
      }

      subtotal += itemSubtotal;

      processedItems.push({
        product,
        inventory,
        quantity,
        price,
        discount: itemDiscount,
        subtotal: itemSubtotal,
      });
    }

    // --------------------------------------------------
    // 4. Transaction discount + tax
    // --------------------------------------------------

    const transactionDiscount = parseMoney(
      discount ?? 0
    );

    const transactionTax = parseMoney(
      tax ?? 0
    );

    if (transactionDiscount === null) {
      throw new Error(
        "Transaction discount tidak valid"
      );
    }

    if (transactionTax === null) {
      throw new Error(
        "Tax tidak valid"
      );
    }

    if (transactionDiscount > subtotal) {
      throw new Error(
        "Discount transaksi tidak boleh melebihi subtotal"
      );
    }

    const total =
      subtotal -
      transactionDiscount +
      transactionTax;

    if (total < 0) {
      throw new Error(
        "Total transaksi tidak valid"
      );
    }

    // --------------------------------------------------
    // 5. Validasi payment
    // --------------------------------------------------

    if (
      !Array.isArray(payments) ||
      payments.length === 0
    ) {
      throw new Error(
        "Minimal terdapat satu pembayaran"
      );
    }

    let paymentTotal = 0;
    let cashPayment = 0;

    for (const payment of payments) {
      const method = String(
        payment.method || ""
      )
        .trim()
        .toUpperCase();

      const amount = parsePositiveNumber(
        payment.amount
      );

      if (
        !ALLOWED_PAYMENT_METHODS.includes(method)
      ) {
        throw new Error(
          `Metode pembayaran "${method}" tidak valid`
        );
      }

      if (amount === null) {
        throw new Error(
          "Nominal pembayaran tidak valid"
        );
      }

      paymentTotal += amount;

      if (method === "CASH") {
        cashPayment += amount;
      }
    }

    console.log("=== PAYMENT DEBUG ===");
    console.log("subtotal:", subtotal);
    console.log("transactionDiscount:", transactionDiscount);
    console.log("transactionTax:", transactionTax);
    console.log("total:", total);
    console.log("payments:", payments);
    console.log("paymentTotal:", paymentTotal);
    console.log("=====================");

    // Toleransi untuk floating point JS
    const paymentDifference = Number(
      (paymentTotal - total).toFixed(2)
    );

    console.log("paymentDifference:", paymentDifference);
    if (paymentDifference !== 0) {
      throw new Error(
        "Total pembayaran harus sama dengan total transaksi"
      );
    }

    // --------------------------------------------------
    // 6. Buat transaksi
    // --------------------------------------------------

    const transaction =
      await transactionModel.create(
        client,
        {
          storeId,
          shiftId: shift.id,
          userId,
          customerId,
          transactionNumber:
            generateTransactionNumber(),
          subtotal,
          discount: transactionDiscount,
          tax: transactionTax,
          total,
        }
      );

    // --------------------------------------------------
    // 7. Buat transaction items + OUT stock
    // --------------------------------------------------

    const createdItems = [];

    for (const item of processedItems) {
      const updatedInventory =
        await inventoryModel.decreaseStock(
          client,
          item.inventory.id,
          item.quantity
        );

      if (!updatedInventory) {
        throw new Error(
          `Stok "${item.product.name}" tidak mencukupi`
        );
      }

      const transactionItem =
        await transactionModel.createItem(
          client,
          {
            transactionId: transaction.id,
            productId: item.product.id,
            productName: item.product.name,
            sku: item.product.sku,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            subtotal: item.subtotal,
          }
        );

      await inventoryModel.createMovement(
        client,
        {
          storeId,
          productId: item.product.id,
          type: "OUT",
          quantity: item.quantity,
          referenceType: "TRANSACTION",
          referenceId: transaction.id,
          notes:
            `Penjualan ${transaction.transaction_number}`,
          createdBy: userId,
        }
      );

      createdItems.push(
        transactionItem
      );
    }

    // --------------------------------------------------
    // 8. Simpan payment
    // --------------------------------------------------

    const createdPayments = [];

    for (const payment of payments) {
      const method = String(
        payment.method
      )
        .trim()
        .toUpperCase();

      const createdPayment =
        await paymentModel.create(
          client,
          {
            transactionId: transaction.id,
            method,
            amount: Number(
              payment.amount
            ),
            referenceNumber:
              payment.reference_number,
          }
        );

      createdPayments.push(
        createdPayment
      );
    }

    // --------------------------------------------------
    // 9. CASH → tambah expected_cash
    // --------------------------------------------------

    if (cashPayment > 0) {
      const updatedShift =
        await shiftModel.increaseExpectedCash(
          client,
          shift.id,
          cashPayment
        );

      if (!updatedShift) {
        throw new Error(
          "Shift sudah tidak aktif"
        );
      }
    }

    // --------------------------------------------------
    // 10. Commit
    // --------------------------------------------------

    await client.query("COMMIT");

    return {
      transaction,
      items: createdItems,
      payments: createdPayments,
      shift: {
        id: shift.id,
        cash_payment: cashPayment,
        expected_cash:
          Number(shift.expected_cash) +
          cashPayment,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock transaksi
    const transaction =
      await transactionModel.findByIdForUpdate(
        client,
        transactionId,
        storeId
      );

    if (!transaction) {
      throw new Error("Transaksi tidak ditemukan");
    }

    // 2. Hanya transaksi COMPLETED yang boleh di-VOID
    if (transaction.status !== "COMPLETED") {
      throw new Error(
        `Transaksi tidak dapat di-void karena status saat ini ${transaction.status}`
      );
    }

    // 3. Cashier hanya boleh void transaksi miliknya.
    // Owner boleh void transaksi siapa pun.
    if (
      role !== "owner" &&
      transaction.user_id !== userId
    ) {
      throw new Error(
        "Anda tidak memiliki akses untuk melakukan void transaksi ini"
      );
    }

    // 4. Transaksi harus memiliki shift
    if (!transaction.shift_id) {
      throw new Error(
        "Transaksi tidak memiliki shift"
      );
    }

    // 5. Lock shift
    const shift = await shiftModel.findByIdForUpdate(
      client,
      transaction.shift_id,
      storeId
    );

    if (!shift) {
      throw new Error("Shift transaksi tidak ditemukan");
    }

    // Untuk MVP:
    // transaksi hanya bisa di-VOID ketika shift masih OPEN.
    if (shift.status !== "OPEN") {
      throw new Error(
        "Transaksi hanya dapat di-void selama shift terkait masih OPEN"
      );
    }

    // 6. Lock item transaksi
    const items =
      await transactionModel.findItemsByTransactionIdForUpdate(
        client,
        transaction.id
      );

    if (!items.length) {
      throw new Error(
        "Item transaksi tidak ditemukan"
      );
    }

    // 7. Lock payment
    const payments =
      await paymentModel.findByTransactionIdForUpdate(
        client,
        transaction.id
      );

    // 8. Kembalikan stok
    const restoredItems = [];

    for (const item of items) {
      if (!item.product_id) {
        throw new Error(
          `Produk pada item ${item.product_name} tidak ditemukan`
        );
      }

      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          item.product_id,
          storeId
        );

      if (!inventory) {
        throw new Error(
          `Inventory untuk produk ${item.product_name} tidak ditemukan`
        );
      }

      const updatedInventory =
        await inventoryModel.increaseStock(
          client,
          inventory.id,
          Number(item.quantity)
        );

      // Catat pergerakan stok
      const movement =
        await inventoryModel.createMovement(client, {
          storeId,
          productId: item.product_id,
          type: "IN",
          quantity: Number(item.quantity),
          referenceType: "VOID",
          referenceId: transaction.id,
          notes: `Pengembalian stok karena void ${transaction.transaction_number}`,
          createdBy: userId,
        });

      restoredItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        inventory: updatedInventory,
        movement,
      });
    }

    // 9. Hitung uang CASH yang harus dibalik
    const cashPayment = payments
      .filter((payment) => payment.method === "CASH")
      .reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );

    let updatedShift = shift;

    // 10. Kurangi expected_cash
    if (cashPayment > 0) {
      updatedShift =
        await shiftModel.decreaseExpectedCash(
          client,
          shift.id,
          cashPayment
        );

      if (!updatedShift) {
        throw new Error(
          "Expected cash shift tidak mencukupi untuk proses void"
        );
      }
    }

    // 11. Ubah status transaksi
    const updatedTransaction =
      await transactionModel.updateStatus(
        client,
        transaction.id,
        storeId,
        "VOID"
      );

    // 12. Commit
    await client.query("COMMIT");

    return {
      transaction: updatedTransaction,
      restored_items: restoredItems,
      cash_reversed: cashPayment,
      shift: {
        id: shift.id,
        expected_cash: Number(
          updatedShift.expected_cash
        ),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function refundTransaction({
  transactionId,
  storeId,
  userId,
  role,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock transaksi
    const transaction =
      await transactionModel.findByIdForUpdate(
        client,
        transactionId,
        storeId
      );

    if (!transaction) {
      throw new Error("Transaksi tidak ditemukan");
    }

    // 2. Hanya transaksi COMPLETED yang bisa direfund
    if (transaction.status !== "COMPLETED") {
      throw new Error(
        `Transaksi tidak dapat direfund karena status saat ini ${transaction.status}`
      );
    }

    // 3. Cashier hanya boleh refund transaksi miliknya
    // Owner boleh refund transaksi siapa pun
    if (
      role !== "owner" &&
      transaction.user_id !== userId
    ) {
      throw new Error(
        "Anda tidak memiliki akses untuk melakukan refund transaksi ini"
      );
    }

    // 4. Transaksi harus mempunyai shift
    if (!transaction.shift_id) {
      throw new Error(
        "Transaksi tidak memiliki shift"
      );
    }

    // 5. Lock shift
    const shift = await shiftModel.findByIdForUpdate(
      client,
      transaction.shift_id,
      storeId
    );

    if (!shift) {
      throw new Error("Shift transaksi tidak ditemukan");
    }

    // MVP:
    // refund hanya ketika shift masih OPEN
    if (shift.status !== "OPEN") {
      throw new Error(
        "Transaksi hanya dapat direfund selama shift terkait masih OPEN"
      );
    }

    // 6. Lock item transaksi
    const items =
      await transactionModel.findItemsByTransactionIdForUpdate(
        client,
        transaction.id
      );

    if (!items.length) {
      throw new Error(
        "Item transaksi tidak ditemukan"
      );
    }

    // 7. Lock payment
    const payments =
      await paymentModel.findByTransactionIdForUpdate(
        client,
        transaction.id
      );

    // 8. Kembalikan stok
    const restoredItems = [];

    for (const item of items) {
      if (!item.product_id) {
        throw new Error(
          `Produk pada item ${item.product_name} tidak ditemukan`
        );
      }

      const inventory =
        await inventoryModel.getInventoryForUpdate(
          client,
          item.product_id,
          storeId
        );

      if (!inventory) {
        throw new Error(
          `Inventory untuk produk ${item.product_name} tidak ditemukan`
        );
      }

      const updatedInventory =
        await inventoryModel.increaseStock(
          client,
          inventory.id,
          Number(item.quantity)
        );

      const movement =
        await inventoryModel.createMovement(client, {
          storeId,
          productId: item.product_id,
          type: "IN",
          quantity: Number(item.quantity),
          referenceType: "REFUND",
          referenceId: transaction.id,
          notes: `Pengembalian stok karena refund ${transaction.transaction_number}`,
          createdBy: userId,
        });

      restoredItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        inventory: updatedInventory,
        movement,
      });
    }

    // 9. Hitung pembayaran CASH
    const cashPayment = payments
      .filter((payment) => payment.method === "CASH")
      .reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );

    let updatedShift = shift;

    // 10. Kurangi expected cash
    if (cashPayment > 0) {
      updatedShift =
        await shiftModel.decreaseExpectedCash(
          client,
          shift.id,
          cashPayment
        );

      if (!updatedShift) {
        throw new Error(
          "Expected cash shift tidak mencukupi untuk proses refund"
        );
      }
    }

    // 11. Ubah status transaksi
    const updatedTransaction =
      await transactionModel.updateStatus(
        client,
        transaction.id,
        storeId,
        "REFUNDED"
      );

    // 12. Commit
    await client.query("COMMIT");

    return {
      transaction: updatedTransaction,
      refunded_amount: Number(transaction.total),
      restored_items: restoredItems,
      cash_refunded: cashPayment,
      shift: {
        id: shift.id,
        expected_cash: Number(
          updatedShift.expected_cash
        ),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  checkout,
  voidTransaction,
  refundTransaction,
};