const express = require("express");

const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner"));
router.use(storeMiddleware);

router.get(
  "/",
  productController.getProducts
);

router.get(
  "/barcode/:barcode",
  productController.getProductByBarcode
);

router.get(
  "/:id",
  productController.getProductById
);

router.post(
  "/",
  productController.createProduct
);

router.put(
  "/:id",
  productController.updateProduct
);

router.delete(
  "/:id",
  productController.deleteProduct
);

module.exports = router;