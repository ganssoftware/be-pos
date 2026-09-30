require("./config/env");
const supabase = require("./config/supabase");
const pool = require("./config/db");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const storeRoutes = require("./routes/storeRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const unitRoutes = require("./routes/unitRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const productRoutes = require("./routes/productRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const customerRoutes = require("./routes/customerRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "POS API is running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS server_time"
    );

    return res.status(200).json({
      success: true,
      message: "API healthy",
      database: {
        connected: true,
        server_time: result.rows[0].server_time,
      },
    });
  } catch (error) {
    console.error("Health check database error:", error);

    return res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/transactions", transactionRoutes);

app.use(errorMiddleware);

module.exports = app;