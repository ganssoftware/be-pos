const nodemailer = require("nodemailer");

const smtpEmail = process.env.SMTP_EMAIL;
const smtpPassword = process.env.SMTP_APP_PASSWORD;

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: smtpEmail,
        pass: smtpPassword,
    },
});

async function sendPasswordResetEmail(email, resetUrl) {
    const safeUrl = resetUrl.replace(/&/g, "&amp;");

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
            "Buka tautan berikut di perangkat yang memiliki aplikasi Zuviko:",
            resetUrl,
            "",
            "Tautan berlaku selama 30 menit dan hanya bisa digunakan sekali.",
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
            </head>
            <body style="font-family:Arial,sans-serif;
                         color:#222;line-height:1.6">
                <div style="max-width:560px;margin:auto;padding:24px">
                    <h2>Reset Password Zuviko</h2>
                    <p>Halo,</p>
                    <p>
                        Kami menerima permintaan untuk mengatur ulang
                        password akun Zuviko kamu.
                    </p>
                    <p>
                        <a href="${safeUrl}"
                           style="display:inline-block;
                                  padding:12px 22px;
                                  background-color:#2563eb;
                                  color:#ffffff;
                                  text-decoration:none;
                                  border-radius:8px;
                                  font-weight:bold">
                            Reset Password
                        </a>
                    </p>
                    <p>
                        Jika tombol tidak berfungsi, salin tautan
                        berikut dan buka di perangkat yang memiliki
                        aplikasi Zuviko:
                    </p>
                    <p style="overflow-wrap:anywhere">
                        <a href="${safeUrl}">${safeUrl}</a>
                    </p>
                    <p>
                        Tautan berlaku selama 30 menit dan hanya
                        dapat digunakan sekali.
                    </p>
                    <p>
                        Jika kamu tidak meminta reset password,
                        abaikan email ini.
                    </p>
                    <p>Salam,<br>Tim Zuviko</p>
                </div>
            </body>
            </html>
        `,
    });
}

module.exports = {
    sendPasswordResetEmail,
};
