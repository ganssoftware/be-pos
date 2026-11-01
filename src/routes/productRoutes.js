const express = require("express");

const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");
const uploadProduct = require("../middleware/uploadProduct");

const router = express.Router();

router.use(authMiddleware);
router.use(storeMiddleware);

router.get(
  "/next-sku",
  roleMiddleware("owner"),
  productController.getNextSku
);

router.get(
  "/",
  roleMiddleware("owner", "cashier"),
  productController.getProducts
);

router.get(
  "/barcode/:barcode",
  roleMiddleware("owner", "cashier"),
  productController.getProductByBarcode
);

router.get(
  "/:id",
  roleMiddleware("owner", "cashier"),
  productController.getProductById
);

router.post(
  "/",
  roleMiddleware("owner"),
  productController.createProduct
);

router.post(
  "/:id/image",
  roleMiddleware("owner"),
  uploadProduct.single("image"),
  productController.uploadProductImage
);

router.put(
  "/:id",
  roleMiddleware("owner"),
  productController.updateProduct
);

router.delete(
  "/:id",
  roleMiddleware("owner"),
  productController.deleteProduct
);

module.exports = router;
