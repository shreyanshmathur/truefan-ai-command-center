// Free AI summariser — runs as a Netlify Function and proxies to Google's
// Gemini API (which has a free tier). The API key stays server-side.
//
// Configure in Netlify → Site settings → Environment:
//   GEMINI_API_KEY   from https://aistudio.google.com/apikey (free tier)
//   GEMINI_MODEL     optional, defaults to gemini-1.5-flash-latest
//   REMINDER_API_KEY optional shared secret; if set, callers send x-api-key

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const key = process.env.GEMINI_API_KEY;

  if (event.httpMethod === "GET") {
    return json(200, { connected: Boolean(key) });
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method not allowed" });
  }
  if (process.env.REMINDER_API_KEY && event.headers["x-api-key"] !== process.env.REMINDER_API_KEY) {
    return json(401, { error: "invalid or missing x-api-key" });
  }
  if (!key) {
    return json(500, { error: "GEMINI_API_KEY not set — add it in Netlify env vars (free at aistudio.google.com/apikey)" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "invalid JSON body" });
  }
  const prompt = String(payload.prompt || "").slice(0, 12000);
  if (!prompt) return json(400, { error: "prompt required" });

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
      })
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, { error: data?.error?.message || "Gemini request failed" });
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text).join("").trim();
    return json(200, { text: text || "No summary returned." });
  } catch (error) {
    return json(500, { error: String(error?.message || error) });
  }
};
