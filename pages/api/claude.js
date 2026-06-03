// pages/api/claude.js
// Vercel serverless function — proxies requests to Groq API (FREE)
// Set GROQ_API_KEY in your Vercel project environment variables
// Get your free key at: https://console.groq.com

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY environment variable is not set. Add it in Vercel → Settings → Environment Variables." });
  }

  try {
    const { system, messages, max_tokens = 1500 } = req.body;

    // Convert Anthropic-style messages to OpenAI-compatible format (Groq uses same format)
    const groqMessages = [];
    if (system) {
      groqMessages.push({ role: "system", content: system });
    }
    groqMessages.push(...messages);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Free, fast, very capable
        max_tokens,
        messages: groqMessages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Groq API error" });
    }

    // Return in Anthropic-compatible format so the frontend works unchanged
    return res.status(200).json({
      content: [{ text: data.choices?.[0]?.message?.content ?? "" }]
    });

  } catch (err) {
    console.error("Groq proxy error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
