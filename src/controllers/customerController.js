const customerModel = require("../models/customerModel");


function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeNik(value) {
  const nik = normalizeString(value);
  return nik ? nik.replace(/\s+/g, "") : null;
}
function normalizePhone(value) {
  const phone = normalizeString(value);
  return phone ? phone.replace(/[\s()-]/g, "") : null;
}
function validateEmail(email) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validateMemberFields({ name, nik, phone }) {
  if (!name) return "Nama customer wajib diisi";
  if (nik && !/^\d{8,16}$/.test(nik)) return "NIK harus terdiri dari 8–16 digit angka";
  if (phone && !/^\+?\d{8,15}$/.test(phone)) return "Format nomor HP tidak valid";
  if (!nik && !phone) return "NIK atau nomor HP wajib diisi";
  return null;
}
function duplicateMessage(duplicate) {
  if (duplicate.nik) return "NIK sudah terdaftar pada toko ini";
  return "Nomor HP sudah terdaftar pada toko ini";
}
async function getCustomers(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = String(req.query.search || req.query.q || "").trim();
    const result = await customerModel.findAll(req.storeId, { page, limit, search });
    res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) { next(error); }
}
async function searchCustomer(req, res, next) {
  try {
    const query = String(req.query.q || req.query.search || "").trim();
    if (!query) return res.status(400).json({ success: false, message: "NIK, nomor HP, atau nama wajib diisi" });
    const result = await customerModel.findAll(req.storeId, { page: 1, limit: 20, search: query });
    const identifierMatch = await customerModel.findByIdentifier(req.storeId, query);
    const activeResults = result.data.filter((row) => row.is_active);
    const data = identifierMatch ? [identifierMatch, ...activeResults.filter((row) => row.id !== identifierMatch.id)] : activeResults;
    res.status(200).json({ success: true, data, pagination: result.pagination });
  } catch (error) { next(error); }
}
async function getCustomerById(req, res, next) {
  try {
    const customer = await customerModel.findById(req.params.id, req.storeId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer tidak ditemukan" });
    res.status(200).json({ success: true, data: customer });
  } catch (error) { next(error); }
}
async function getPoints(req, res, next) {
  try {
    const customer = await customerModel.findById(req.params.id, req.storeId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer tidak ditemukan" });
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const history = await customerModel.findPointsHistory(req.params.id, req.storeId, { page, limit });
    res.status(200).json({ success: true, data: history });
  } catch (error) { next(error); }
}
async function createCustomer(req, res, next) {
  try {
    const name = normalizeString(req.body.name);
    const nik = normalizeNik(req.body.nik);
    const phone = normalizePhone(req.body.phone);
    const email = normalizeString(req.body.email);
    const address = normalizeString(req.body.address);
    const validation = validateMemberFields({ name, nik, phone });
    if (validation) return res.status(400).json({ success: false, message: validation });
    if (!validateEmail(email)) return res.status(400).json({ success: false, message: "Format email tidak valid" });
    const duplicate = await customerModel.existsDuplicate(req.storeId, { nik, phone });
    if (duplicate) return res.status(409).json({ success: false, message: duplicateMessage(duplicate) });
    const customer = await customerModel.create({ storeId: req.storeId, name, nik, phone, email, address });
    res.status(201).json({ success: true, message: "Member berhasil didaftarkan", data: customer });
  } catch (error) { next(error); }
}
async function updateCustomer(req, res, next) {
  try {
    const name = normalizeString(req.body.name);
    const nik = normalizeNik(req.body.nik);
    const phone = normalizePhone(req.body.phone);
    const email = normalizeString(req.body.email);
    const address = normalizeString(req.body.address);
    const validation = validateMemberFields({ name, nik, phone });
    if (validation) return res.status(400).json({ success: false, message: validation });
    if (!validateEmail(email)) return res.status(400).json({ success: false, message: "Format email tidak valid" });
    const duplicate = await customerModel.existsDuplicate(req.storeId, { nik, phone }, req.params.id);
    if (duplicate) return res.status(409).json({ success: false, message: duplicateMessage(duplicate) });
    const customer = await customerModel.update(req.params.id, req.storeId, { name, nik, phone, email, address });
    if (!customer) return res.status(404).json({ success: false, message: "Customer tidak ditemukan" });
    res.status(200).json({ success: true, message: "Member berhasil diperbarui", data: customer });
  } catch (error) { next(error); }
}
async function setCustomerStatus(req, res, next) {
  try {
    const isActive = req.body.is_active;
    if (typeof isActive !== "boolean") return res.status(400).json({ success: false, message: "is_active harus berupa boolean" });
    const customer = await customerModel.setActive(req.params.id, req.storeId, isActive);
    if (!customer) return res.status(404).json({ success: false, message: "Customer tidak ditemukan" });
    res.status(200).json({ success: true, message: `Member berhasil ${isActive ? "diaktifkan" : "dinonaktifkan"}`, data: customer });
  } catch (error) { next(error); }
}
async function deleteCustomer(req, res, next) {
  try {
    const customer = await customerModel.remove(req.params.id, req.storeId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer tidak ditemukan" });
    res.status(200).json({ success: true, message: "Customer berhasil dihapus" });
  } catch (error) {
    if (error.code === "23503") return res.status(409).json({ success: false, message: "Member tidak dapat dihapus karena sudah terkait data transaksi atau poin" });
    next(error);
  }
}
async function getLoyaltySettings(req, res, next) {
  try {
    const settings = await customerModel.getLoyaltySettings(req.storeId);
    res.status(200).json({ success: true, data: settings });
  } catch (error) { next(error); }
}
async function updateLoyaltySettings(req, res, next) {
  try {
    const isActive = req.body.is_active;
    const earnAmount = Number(req.body.earn_amount);
    const earnPoints = Number(req.body.earn_points);
    const pointValue = Number(req.body.point_value);
    const minimumRedeemPoints = Number(req.body.minimum_redeem_points);
    if (typeof isActive !== "boolean" || !Number.isInteger(earnAmount) || earnAmount <= 0 || !Number.isInteger(earnPoints) || earnPoints <= 0 || !Number.isInteger(pointValue) || pointValue <= 0 || !Number.isInteger(minimumRedeemPoints) || minimumRedeemPoints < 0) {
      return res.status(400).json({ success: false, message: "Pengaturan loyalty tidak valid; nominal harus bilangan bulat positif dan minimum redeem tidak boleh negatif" });
    }
    const settings = await customerModel.upsertLoyaltySettings(req.storeId, { isActive, earnAmount, earnPoints, pointValue, minimumRedeemPoints });
    res.status(200).json({ success: true, message: "Pengaturan loyalty berhasil diperbarui", data: settings });
  } catch (error) { next(error); }
}
module.exports = {
  getCustomers, searchCustomer, getCustomerById, getPoints,
  createCustomer, updateCustomer, setCustomerStatus, deleteCustomer,
  getLoyaltySettings, updateLoyaltySettings,
};
