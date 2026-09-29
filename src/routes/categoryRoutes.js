const express = require("express");

const categoryController = require("../controllers/categoryController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner"));
router.use(storeMiddleware);

router.get("/", categoryController.getCategories);

router.get("/:id", categoryController.getCategoryById);

router.post("/", categoryController.createCategory);

router.put("/:id", categoryController.updateCategory);

router.delete("/:id", categoryController.deleteCategory);

module.exports = router;