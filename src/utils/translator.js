/**
 * Barcha muhitlarda (Localhost va Vercel) 100% ishlaydigan ko'p bosqichli tarjimon
 */

// Yagona matn yoki jumlani tarjima qilish
export async function translateSingleText(text, sourceLang = "en", targetLang = "uz") {
  if (!text || !text.trim()) return text;

  // 1-bosqich: /api/translate serverless / dev proxy orqali (CORS muammosiz)
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sl: sourceLang, tl: targetLang })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.translatedText) return data.translatedText;
    }
  } catch (err) {
    console.warn("Lokal /api/translate ulanmadi, zaxira usullarga o'tilmoqda...", err);
  }

  // 2-bosqich: Bepul MyMemory API (CORS ni qo'llab-quvvatlaydi)
  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const mmRes = await fetch(mmUrl);
    if (mmRes.ok) {
      const mmData = await mmRes.json();
      if (mmData?.responseData?.translatedText) {
        return mmData.responseData.translatedText;
      }
    }
  } catch (err) {
    console.warn("MyMemory API xatoligi:", err);
  }

  // 3-bosqich: To'g'ridan-to'g'ri Google Translate endpoint (ba'zi brauzerlar va muhitlarda)
  try {
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const gtRes = await fetch(gtUrl);
    if (gtRes.ok) {
      const gtData = await gtRes.json();
      if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
        return gtData[0].map((item) => item[0]).join("");
      }
    }
  } catch (err) {
    console.warn("Direct GT xatoligi:", err);
  }

  return text; // Oxirgi holatda asl matn qaytariladi
}

// Matnni xavfsiz o'lchamdagi bo'laklarga ajratish
export function splitIntoChunks(text, maxChunkSize = 900) {
  if (!text || text.trim().length === 0) return [];

  const paragraphs = text.split(/\r?\n/);
  const chunks = [];
  let currentChunk = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    if (para.length > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
      let subChunk = "";
      for (const sentence of sentences) {
        if ((subChunk + " " + sentence).trim().length > maxChunkSize) {
          if (subChunk.trim().length > 0) chunks.push(subChunk.trim());
          subChunk = sentence;
        } else {
          subChunk = (subChunk + " " + sentence).trim();
        }
      }
      if (subChunk.trim().length > 0) {
        chunks.push(subChunk.trim());
      }
      continue;
    }

    const candidate = currentChunk ? currentChunk + "\n" + para : para;
    if (candidate.length > maxChunkSize) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = para;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// To'liq hujjatni tarjima qilish
export async function translateFullDocument({
  text,
  sourceLang = "en",
  targetLang = "uz",
  engine = "google",
  geminiApiKey = "",
  onProgress = () => {},
  abortSignal = null
}) {
  if (!text || text.trim().length === 0) return "";

  const chunks = splitIntoChunks(text, 900);
  const totalChunks = chunks.length;
  const translatedChunks = [];

  onProgress({
    percent: 0,
    current: 0,
    total: totalChunks,
    status: `Tarjima boshlanmoqda (Jami ${totalChunks} bo'lak)...`
  });

  for (let i = 0; i < totalChunks; i++) {
    if (abortSignal && abortSignal.aborted) {
      throw new Error("Tarjima bekor qilindi.");
    }

    const chunk = chunks[i];
    let translated = "";

    try {
      if (engine === "gemini" && geminiApiKey) {
        // Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `Translate this English text to Uzbek accurately with natural flow. Preserve all formatting:\n\n${chunk}`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (res.ok) {
          const d = await res.json();
          translated = d.candidates?.[0]?.content?.parts?.[0]?.text || chunk;
        } else {
          translated = await translateSingleText(chunk, sourceLang, targetLang);
        }
      } else {
        translated = await translateSingleText(chunk, sourceLang, targetLang);
      }
    } catch {
      translated = await translateSingleText(chunk, sourceLang, targetLang);
    }

    translatedChunks.push(translated);

    const percent = Math.round(((i + 1) / totalChunks) * 100);
    onProgress({
      percent,
      current: i + 1,
      total: totalChunks,
      status: `Tarjima qilinmoqda: ${percent}% (${i + 1} / ${totalChunks} bo'lak)...`
    });

    if (i < totalChunks - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  onProgress({
    percent: 100,
    current: totalChunks,
    total: totalChunks,
    status: "Tarjima to'liq yakunlandi!"
  });

  return translatedChunks.join("\n\n");
}
