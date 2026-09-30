/**
 * Vercel Serverless Function: /api/translate
 * Google Translate API server-side proxy (CORS muammolarini 100% hal qiladi)
 */

export default async function handler(req, res) {
  // CORS sarlavhalarini ruxsat berish
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    let text = "";
    let sl = "en";
    let tl = "uz";

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      text = body.text || "";
      sl = body.sl || "en";
      tl = body.tl || "uz";
    } else {
      text = req.query.text || "";
      sl = req.query.sl || "en";
      tl = req.query.tl || "uz";
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Matn (text) kiritilmagan" });
    }

    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(
      text
    )}`;

    const gtResponse = await fetch(gtUrl);
    if (!gtResponse.ok) {
      throw new Error(`Google Translate javobi: ${gtResponse.status}`);
    }

    const data = await gtResponse.json();
    let translatedText = "";

    if (Array.isArray(data) && Array.isArray(data[0])) {
      translatedText = data[0].map((item) => item[0]).join("");
    } else {
      throw new Error("Kutilmagan format");
    }

    return res.status(200).json({ translatedText });
  } catch (error) {
    console.error("Tarjima serverless xatosi:", error);
    return res.status(500).json({ error: error.message || "Tarjimada xatolik yuz berdi" });
  }
}
