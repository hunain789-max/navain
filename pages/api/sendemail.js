// pages/api/sendemail.js
// Sends email via Gmail SMTP using Nodemailer
// Set GMAIL_USER and GMAIL_PASS (App Password) in Vercel environment variables

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { toEmail, toName, subject, message, fromName } = req.body;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  if (!gmailUser || !gmailPass) {
    return res.status(500).json({ error: "GMAIL_USER or GMAIL_PASS not set in Vercel environment variables" });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    await transporter.sendMail({
      from: `"${fromName || "Andrew | Navain AI"}" <${gmailUser}>`,
      to: `"${toName}" <${toEmail}>`,
      subject: subject,
      text: message,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Gmail send error:", err);
    return res.status(500).json({ error: err.message });
  }
}
