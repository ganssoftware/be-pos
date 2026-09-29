function errorMiddleware(
  err,
  req,
  res,
  next
) {
  console.error(err);

  const message =
    err?.message ||
    "Internal server error";

  const knownErrors = [
    "Anda belum memiliki shift yang terbuka",
    "Minimal terdapat satu produk dalam transaksi",
    "Minimal terdapat satu pembayaran",
    "Product ID wajib diisi",
    "Quantity produk tidak valid",
    "Discount item tidak valid",
    "Produk tidak ditemukan",
    "Produk tidak aktif",
    "Produk pada item",
    "Inventory untuk produk",
    "Inventory produk",
    "Stok",
    "Discount produk",
    "Transaction discount tidak valid",
    "Tax tidak valid",
    "Discount transaksi tidak boleh",
    "Total transaksi tidak valid",
    "Metode pembayaran",
    "Nominal pembayaran tidak valid",
    "Total pembayaran harus sama",
    "Shift sudah tidak aktif",
    "Transaksi tidak ditemukan",
    "Transaksi tidak dapat di-void",
    "Anda tidak memiliki akses untuk melakukan void",
    "Transaksi tidak memiliki shift",
    "Shift transaksi tidak ditemukan",
    "Transaksi hanya dapat di-void",
    "Item transaksi tidak ditemukan",
    "Expected cash shift tidak mencukupi",
  ];

  const isKnownError =
    knownErrors.some((text) =>
      message.includes(text)
    );

  if (isKnownError) {
    return res.status(400).json({
      success: false,
      message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

module.exports = errorMiddleware;