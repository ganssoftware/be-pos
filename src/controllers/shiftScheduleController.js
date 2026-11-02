
const shiftScheduleModel = require('../models/shiftScheduleModel');

const normalizeRole = (role) => {
    if (typeof role === 'string') {
        return role.toLowerCase().replace(/[\s-]+/g, '_');
    }

    if (role && typeof role === 'object') {
        return String(role.name || role.role_name || '')
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
    }

    return '';
};

const getUserId = (req) =>
    req.user?.user_id || req.user?.id || null;

const getRole = (req) =>
    normalizeRole(req.user?.role || req.user?.role_name);

const isOwner = (req) => getRole(req) === 'owner';

const isCashier = (req) =>
    ['cashier', 'kasir'].includes(getRole(req));

const sendError = (res, error) => {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message:
            statusCode === 500
                ? 'Terjadi kesalahan pada server.'
                : error.message,
    });
};

const parseOpeningCash = (value) => {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount) || amount < 0) {
        throw Object.assign(
            new Error('Modal awal tidak boleh negatif.'),
            { statusCode: 400 }
        );
    }

    return amount;
};

const parseWorkingDays = (value) => {
    if (value === undefined || value === null) {
        return [1, 2, 3, 4, 5, 6];
    }

    if (!Array.isArray(value) || value.length === 0) {
        throw Object.assign(
            new Error('Pilih minimal satu hari kerja.'),
            { statusCode: 400 }
        );
    }

    const days = [...new Set(value.map(Number))];

    if (
        days.some(
            (day) => !Number.isInteger(day) || day < 1 || day > 7
        )
    ) {
        throw Object.assign(
            new Error('Hari kerja harus berupa angka 1 sampai 7.'),
            { statusCode: 400 }
        );
    }

    return days.sort((a, b) => a - b);
};

const validateTime = (value, fieldName) => {
    if (
        typeof value !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
    ) {
        throw Object.assign(
            new Error(`${fieldName} tidak valid. Gunakan format HH:mm.`),
            { statusCode: 400 }
        );
    }

    return value;
};

const validateScheduleBody = (body) => {
    const {
        user_id,
        shift_name,
        start_time,
        end_time,
        notes,
        opening_cash,
        working_days,
        status,
    } = body;

    if (!user_id) {
        throw Object.assign(
            new Error('user_id wajib diisi.'),
            { statusCode: 400 }
        );
    }

    if (!shift_name || !String(shift_name).trim()) {
        throw Object.assign(
            new Error('Nama shift wajib diisi.'),
            { statusCode: 400 }
        );
    }

    const startTime = validateTime(start_time, 'Jam mulai');
    const endTime = validateTime(end_time, 'Jam selesai');

    if (startTime === endTime) {
        throw Object.assign(
            new Error(
                'Jam mulai dan jam selesai tidak boleh sama.'
            ),
            { statusCode: 400 }
        );
    }

    const normalizedStatus = status
        ? String(status).toUpperCase()
        : 'SCHEDULED';

    if (!['SCHEDULED', 'CANCELLED'].includes(normalizedStatus)) {
        throw Object.assign(
            new Error('Status jadwal tidak valid.'),
            { statusCode: 400 }
        );
    }

    return {
        userId: user_id,
        shiftName: String(shift_name).trim(),
        startTime,
        endTime,
        notes: notes ? String(notes).trim() : null,
        openingCash: parseOpeningCash(opening_cash),
        workingDays: parseWorkingDays(working_days),
        status: normalizedStatus,
    };
};

const getSchedules = async (req, res) => {
    try {
        if (!isOwner(req) && !isCashier(req)) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses melihat jadwal shift.',
            });
        }

        const storeId = req.storeId;

        const userId = isOwner(req)
            ? req.query.user_id || null
            : getUserId(req);

        const schedules = await shiftScheduleModel.findAll(storeId, {
            userId,
        });

        return res.status(200).json({
            success: true,
            data: schedules,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const getScheduleById = async (req, res) => {
    try {
        if (!isOwner(req) && !isCashier(req)) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses melihat jadwal shift.',
            });
        }

        const schedule = await shiftScheduleModel.findById(
            req.params.id,
            req.storeId
        );

        if (!schedule) {
            return res.status(404).json({
                success: false,
                message: 'Jadwal shift tidak ditemukan.',
            });
        }

        if (!isOwner(req) && schedule.user_id !== getUserId(req)) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke jadwal ini.',
            });
        }

        return res.status(200).json({
            success: true,
            data: schedule,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const createSchedule = async (req, res) => {
    try {
        if (!isOwner(req)) {
            return res.status(403).json({
                success: false,
                message: 'Hanya owner yang dapat membuat jadwal shift.',
            });
        }

        const payload = validateScheduleBody(req.body);

        const schedule = await shiftScheduleModel.create({
            storeId: req.storeId,
            ...payload,
        });

        return res.status(201).json({
            success: true,
            message: 'Jadwal shift berhasil dibuat.',
            data: schedule,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const updateSchedule = async (req, res) => {
    try {
        if (!isOwner(req)) {
            return res.status(403).json({
                success: false,
                message: 'Hanya owner yang dapat mengubah jadwal shift.',
            });
        }

        const payload = validateScheduleBody(req.body);

        const schedule = await shiftScheduleModel.update(
            req.params.id,
            req.storeId,
            payload
        );

        return res.status(200).json({
            success: true,
            message: 'Jadwal shift berhasil diperbarui.',
            data: schedule,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const deleteSchedule = async (req, res) => {
    try {
        if (!isOwner(req)) {
            return res.status(403).json({
                success: false,
                message: 'Hanya owner yang dapat menghapus jadwal shift.',
            });
        }

        const result = await shiftScheduleModel.remove(
            req.params.id,
            req.storeId
        );

        return res.status(200).json({
            success: true,
            message: result.cancelled
                ? 'Jadwal dibatalkan. Riwayat shift tetap disimpan.'
                : 'Jadwal shift berhasil dihapus.',
            data: result,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = {
    getSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule,
};
