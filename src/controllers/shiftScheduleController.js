const shiftScheduleModel = require("../models/shiftScheduleModel");

async function getSchedules(req, res) {
  try {
    const storeId = req.storeId;

    const { date = "", user_id: userId = "" } = req.query;

    const data = await shiftScheduleModel.findAll(storeId, {
      date,
      userId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET SHIFT SCHEDULES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil jadwal shift",
    });
  }
}

async function getScheduleById(req, res) {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const data = await shiftScheduleModel.findById(id, storeId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Jadwal shift tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET SHIFT SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil jadwal shift",
    });
  }
}

async function createSchedule(req, res) {
  try {
    const storeId = req.storeId;

    const {
      user_id: userId,
      shift_name: shiftName,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      notes,
    } = req.body;

    if (
      !userId ||
      !shiftName ||
      !shiftDate ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Kasir, nama shift, tanggal, jam mulai, dan jam selesai wajib diisi",
      });
    }

    const data = await shiftScheduleModel.create({
      storeId,
      userId,
      shiftName,
      shiftDate,
      startTime,
      endTime,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: "Jadwal shift berhasil dibuat",
      data,
    });
  } catch (error) {
    console.error("CREATE SHIFT SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal membuat jadwal shift",
    });
  }
}

async function updateSchedule(req, res) {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const {
      user_id: userId,
      shift_name: shiftName,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      notes,
      status,
    } = req.body;

    if (
      !userId ||
      !shiftName ||
      !shiftDate ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Kasir, nama shift, tanggal, jam mulai, dan jam selesai wajib diisi",
      });
    }

    const data = await shiftScheduleModel.update(id, storeId, {
      userId,
      shiftName,
      shiftDate,
      startTime,
      endTime,
      notes,
      status,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Jadwal shift tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Jadwal shift berhasil diperbarui",
      data,
    });
  } catch (error) {
    console.error("UPDATE SHIFT SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui jadwal shift",
    });
  }
}

async function deleteSchedule(req, res) {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const data = await shiftScheduleModel.remove(id, storeId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Jadwal shift tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Jadwal shift berhasil dihapus",
    });
  } catch (error) {
    console.error("DELETE SHIFT SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus jadwal shift",
    });
  }
}

module.exports = {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};
