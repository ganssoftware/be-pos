
const shiftScheduleModel = require("../models/shiftScheduleModel");


async function getSchedules(req, res) {
    try {
        const storeId = req.storeId;
        const isOwner = req.user.role === "owner";

        // Owner boleh memilih kasir melalui query user_id.
        // Kasir selalu dibatasi ke jadwal miliknya sendiri.
        const requestedUserId =
            typeof req.query.user_id === "string"
                ? req.query.user_id.trim()
                : "";

        const userId = isOwner
            ? requestedUserId
            : req.user.user_id;

        const data = await shiftScheduleModel.findAll(storeId, {
            userId,
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Get schedules error:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal mengambil jadwal shift",
        });
    }
}



async function getScheduleById(req, res) {
    try {
        const data = await shiftScheduleModel.findById(
            req.params.id,
            req.storeId
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Jadwal shift tidak ditemukan",
            });
        }

        // Owner boleh melihat seluruh jadwal di tokonya.
        // Kasir hanya boleh melihat jadwal miliknya.
        if (
            req.user.role !== "owner" &&
            data.user_id !== req.user.user_id
        ) {
            return res.status(404).json({
                success: false,
                message: "Jadwal shift tidak ditemukan",
            });
        }

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Get schedule by ID error:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal mengambil detail jadwal shift",
        });
    }
}

function parseOpeningCash(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        return null;
    }

    return amount;
}

function validateSchedule({
    userId,
    shiftName,
    startTime,
    endTime,
}) {
    return Boolean(
        typeof userId === "string" &&
        userId.trim() &&
        typeof shiftName === "string" &&
        shiftName.trim() &&
        typeof startTime === "string" &&
        /^\d{2}:\d{2}(:\d{2})?$/.test(startTime) &&
        typeof endTime === "string" &&
        /^\d{2}:\d{2}(:\d{2})?$/.test(endTime)
    );
}

async function createSchedule(req, res) {
    try {
        const {
            user_id: userId,
            shift_name: shiftName,
            start_time: startTime,
            end_time: endTime,
            opening_cash: openingCash = 0,
            notes,
        } = req.body;

        if (
            !validateSchedule({
                userId,
                shiftName,
                startTime,
                endTime,
            })
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Kasir, nama shift, jam mulai, dan jam selesai wajib diisi dengan format yang benar",
            });
        }

        const parsedOpeningCash = parseOpeningCash(openingCash);

        if (parsedOpeningCash === null) {
            return res.status(400).json({
                success: false,
                message: "Modal awal harus berupa angka dan tidak boleh negatif",
            });
        }

        const data = await shiftScheduleModel.create({
            storeId: req.storeId,
            userId: userId.trim(),
            shiftName: shiftName.trim(),
            startTime,
            endTime,
            openingCash: parsedOpeningCash,
            notes,
        });

        return res.status(201).json({
            success: true,
            message: "Jadwal shift rutin berhasil dibuat",
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
        const {
            user_id: userId,
            shift_name: shiftName,
            start_time: startTime,
            end_time: endTime,
            opening_cash: openingCash = 0,
            notes,
            status,
        } = req.body;

        if (
            !validateSchedule({
                userId,
                shiftName,
                startTime,
                endTime,
            })
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Kasir, nama shift, jam mulai, dan jam selesai wajib diisi dengan format yang benar",
            });
        }

        if (
            status !== undefined &&
            !["SCHEDULED", "CANCELLED"].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Status jadwal tidak valid",
            });
        }

        const parsedOpeningCash = parseOpeningCash(openingCash);

        if (parsedOpeningCash === null) {
            return res.status(400).json({
                success: false,
                message: "Modal awal harus berupa angka dan tidak boleh negatif",
            });
        }

        const data = await shiftScheduleModel.update(
            req.params.id,
            req.storeId,
            {
                userId: userId.trim(),
                shiftName: shiftName.trim(),
                startTime,
                endTime,
                openingCash: parsedOpeningCash,
                notes,
                status,
            }
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Jadwal shift tidak ditemukan",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Jadwal shift rutin berhasil diperbarui",
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
        const data = await shiftScheduleModel.remove(
            req.params.id,
            req.storeId
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Jadwal shift tidak ditemukan",
            });
        }

        return res.status(200).json({
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
