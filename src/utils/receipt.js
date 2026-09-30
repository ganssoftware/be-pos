function formatReceipt(transaction) {
  const items = transaction.items || [];
  const payments = transaction.payments || [];

  const lines = [];

  lines.push("================================");
  lines.push("           STRUK TRANSAKSI");
  lines.push("================================");

  lines.push(`No      : ${transaction.transaction_number}`);
  lines.push(`Tanggal : ${formatDate(transaction.created_at)}`);
  lines.push(`Kasir   : ${transaction.full_name || transaction.username}`);

  if (transaction.customer_name) {
    lines.push(`Pelanggan: ${transaction.customer_name}`);
  }

  lines.push("--------------------------------");

  for (const item of items) {
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    const discount = Number(item.discount || 0);
    const subtotal = Number(item.subtotal);

    lines.push(item.product_name);
    lines.push(
      `  ${quantity} x ${formatMoney(price)}`
    );

    if (discount > 0) {
      lines.push(
        `  Diskon: ${formatMoney(discount)}`
      );
    }

    lines.push(
      `  = ${formatMoney(subtotal)}`
    );
  }

  lines.push("--------------------------------");

  lines.push(
    `Subtotal : ${formatMoney(transaction.subtotal)}`
  );

  if (Number(transaction.discount) > 0) {
    lines.push(
      `Diskon   : ${formatMoney(transaction.discount)}`
    );
  }

  if (Number(transaction.tax) > 0) {
    lines.push(
      `Pajak    : ${formatMoney(transaction.tax)}`
    );
  }

  lines.push(
    `TOTAL    : ${formatMoney(transaction.total)}`
  );

  lines.push("--------------------------------");

  for (const payment of payments) {
    lines.push(
      `${formatPaymentMethod(payment.method)}: ${formatMoney(payment.amount)}`
    );

    if (
      payment.method === "CASH"
    ) {
      const amountReceived = Number(
        payment.amount_received || payment.amount
      );

      const changeAmount = Number(
        payment.change_amount || 0
      );

      lines.push(
        `Diterima : ${formatMoney(amountReceived)}`
      );

      lines.push(
        `Kembalian: ${formatMoney(changeAmount)}`
      );
    }

    if (payment.reference_number) {
      lines.push(
        `Ref      : ${payment.reference_number}`
      );
    }
  }

  lines.push("--------------------------------");
  lines.push("       Terima kasih");
  lines.push("================================");

  return lines.join("\n");
}

function formatMoney(value) {
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

function formatPaymentMethod(method) {
  const labels = {
    CASH: "Tunai",
    QRIS: "QRIS",
    DEBIT: "Debit",
    CREDIT_CARD: "Kartu Kredit",
    TRANSFER: "Transfer",
    E_WALLET: "E-Wallet",
  };

  return labels[method] || method;
}

function formatDate(value) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

module.exports = {
  formatReceipt,
};