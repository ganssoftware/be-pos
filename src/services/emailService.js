
const nodemailer = require("nodemailer");

const smtpEmail = process.env.SMTP_EMAIL;
const smtpPassword = process.env.SMTP_APP_PASSWORD;

if (!smtpEmail || !smtpPassword) {
    console.warn(
        "Konfigurasi SMTP_EMAIL atau SMTP_APP_PASSWORD belum tersedia."
    );
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: smtpEmail,
        pass: smtpPassword,
    },
});

async function sendPasswordResetEmail(email, resetUrl) {
    await transporter.sendMail({
        from: {
            name: "Gans Software",
            address: smtpEmail,
        },
        to: email,
        subject: "Reset Password Akun POS",
        text: [
            "Halo,",
            "",
            "Kami menerima permintaan untuk mengatur ulang password akun POS kamu.",
            "",
            `Buka tautan berikut untuk membuat password baru: ${resetUrl}`,
            "",
            "Tautan berlaku selama 30 menit dan hanya dapat digunakan sekali.",
            "Jika kamu tidak meminta reset password, abaikan email ini.",
            "",
            "Salam,",
            "Gans Software",
        ].join("\n"),
        html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">
        <h2>Reset Password</h2>
        <p>Halo,</p>
        <p>Kami menerima permintaan untuk mengatur ulang password akun POS kamu.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;
             background:#2563eb;color:#fff;text-decoration:none;
             border-radius:6px">
            Reset Password
          </a>
        </p>
        <p>Jika tombol tidak berfungsi, buka tautan berikut:</p>
        <p><a href="${resetUrl}">Atur ulang password</a></p>
        <p>Tautan ini berlaku selama 30 menit dan hanya dapat digunakan sekali.</p>
        <p>Jika kamu tidak meminta reset password, abaikan email ini.</p>
        <p>Salam,<br>Gans Software</p>
      </div>
    `,
    });
}

module.exports = {
    sendPasswordResetEmail,
};
