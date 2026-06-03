// pages/api/sendemail.js
// Sends email via Resend (free, no domain needed)
// Set RESEND_API_KEY in Vercel environment variables

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY not set in Vercel environment variables" });

  const { toEmail, toName, subject, message, fromName } = req.body;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName || "Andrew | Navain AI"} <onboarding@resend.dev>`,
        to: [toEmail],
        subject: subject,
        text: message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || "Resend error" });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
