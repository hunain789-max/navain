// pages/api/sendemail.js
// Sends email via EmailJS from the server side — bypasses origin restrictions

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { serviceId, templateId, publicKey, templateParams } = req.body;

  if (!serviceId || !templateId || !publicKey) {
    return res.status(400).json({ error: "Missing EmailJS credentials" });
  }

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: text || "EmailJS error" });
    }

    return res.status(200).json({ success: true, message: text });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
