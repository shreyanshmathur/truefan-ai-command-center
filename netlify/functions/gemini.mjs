// Serverless proxy for the Gemini API.
// The API key is read from the GEMINI_API_KEY environment variable and never
// leaves the server, so it is not exposed in the browser bundle.

const MODEL = "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY is not configured on the server." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const question = (body.question || "").toString().trim();
  const context = (body.context || "").toString();
  if (!question) {
    return json({ error: "A question is required." }, 400);
  }

  const prompt = [
    "You are the TrueFan AI Command Center assistant. You help staff understand the",
    "current state of their projects, tasks, escalations and finances.",
    "Answer concisely and only from the data provided. If the data does not contain",
    "the answer, say so plainly.",
    "",
    "=== CURRENT DATA (JSON) ===",
    context,
    "=== END DATA ===",
    "",
    `Question: ${question}`
  ].join("\n");

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: `Gemini API error (${response.status}).`, detail }, 502);
    }

    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("").trim();
    return json({ answer: answer || "No answer returned." });
  } catch (error) {
    return json({ error: "Failed to reach the Gemini API.", detail: String(error) }, 502);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
