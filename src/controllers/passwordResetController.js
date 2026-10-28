
const passwordResetService = require("../services/passwordResetService");

async function requestReset(req, res, next) {
    try {
        const { email } = req.body;

        if (typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email wajib diisi.",
            });
        }

        await passwordResetService.requestPasswordReset(email);

        return res.status(200).json({
            success: true,
            message:
                "Jika email terdaftar dan akun aktif, instruksi reset password akan dikirim ke email tersebut.",
        });
    } catch (error) {
        next(error);
    }
}

async function confirmReset(req, res, next) {
    try {
        const { token, new_password } = req.body;

        if (!token || !new_password) {
            return res.status(400).json({
                success: false,
                message: "Token dan password baru wajib diisi.",
            });
        }

        await passwordResetService.confirmPasswordReset(
            token,
            new_password
        );

        return res.status(200).json({
            success: true,
            message:
                "Password berhasil diubah. Silakan login menggunakan password baru.",
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        next(error);
    }
}

module.exports = {
    requestReset,
    confirmReset,
};
