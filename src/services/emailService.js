const nodemailer = require("nodemailer");

const smtpEmail = process.env.SMTP_EMAIL;
const smtpPassword = process.env.SMTP_APP_PASSWORD;

if (!smtpEmail || !smtpPassword) {
    throw new Error("Konfigurasi SMTP belum lengkap.");
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: smtpEmail,
        pass: smtpPassword,
    },
});

// Escape karakter HTML untuk mencegah HTML injection.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };

        return entities[char];
    });
}

async function sendPasswordResetEmail(email, resetUrl) {
    const parsedUrl = new URL(resetUrl);

    // Pastikan hanya domain HTTPS Zuviko yang digunakan.
    if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.hostname !== "v1-be-pos.vercel.app" ||
        parsedUrl.pathname !== "/reset-password"
    ) {
        throw new Error("URL reset password tidak valid.");
    }

    const safeUrl = escapeHtml(parsedUrl.toString());

    await transporter.sendMail({
        from: {
            name: "Zuviko",
            address: smtpEmail,
        },

        to: email,

        subject: "Reset Password Akun Zuviko",

        text: [
            "Halo,",
            "",
            "Kami menerima permintaan reset password akun Zuviko.",
            "",
            "Silakan buka tautan berikut:",
            parsedUrl.toString(),
            "",
            "Tautan berlaku selama 30 menit dan hanya dapat digunakan sekali.",
            "",
            "Jika kamu tidak meminta reset password, abaikan email ini.",
            "",
            "Salam,",
            "Tim Zuviko",
        ].join("\n"),

        html: `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport"
                      content="width=device-width, initial-scale=1.0">
                <title>Reset Password Zuviko</title>
            </head>

            <body style="
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
                font-family: Arial, sans-serif;
                color: #222222;
                line-height: 1.6;
            ">

                <div style="
                    max-width: 560px;
                    margin: 30px auto;
                    padding: 30px 24px;
                    background-color: #ffffff;
                    border-radius: 12px;
                ">

                    <h2 style="margin-top: 0;">
                        Reset Password Zuviko
                    </h2>

                    <p>Halo,</p>

                    <p>
                        Kami menerima permintaan untuk mengatur ulang
                        password akun Zuviko kamu.
                    </p>

                    <p style="margin: 28px 0;">
                        <a
                            href="${safeUrl}"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="
                                display: inline-block;
                                padding: 13px 24px;
                                background-color: #2563eb;
                                color: #ffffff;
                                text-decoration: none;
                                border-radius: 8px;
                                font-weight: bold;
                            "
                        >
                            Reset Password
                        </a>
                    </p>

                    <p>
                        Jika tombol tidak berfungsi, salin tautan
                        berikut dan buka melalui browser:
                    </p>

                    <p style="
                        overflow-wrap: anywhere;
                        word-break: break-word;
                    ">
                        <a href="${safeUrl}">
                            ${safeUrl}
                        </a>
                    </p>

                    <p>
                        Tautan berlaku selama 30 menit dan hanya
                        dapat digunakan sekali.
                    </p>

                    <p>
                        Jika kamu tidak meminta reset password,
                        abaikan email ini.
                    </p>

                    <p>
                        Salam,<br>
                        <strong>Tim Zuviko</strong>
                    </p>

                </div>

            </body>
            </html>
        `,
    });
}

module.exports = {
    sendPasswordResetEmail,
};
