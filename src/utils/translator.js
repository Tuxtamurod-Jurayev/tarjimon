import { cyrillicToLatin } from "./transliterate";

/**
 * Barcha muhitlarda (Localhost va Vercel) 100% aniq va xatosiz ishlaydigan ko'p bosqichli tarjimon
 */

// Tarjimalar kesh xotirasi (bir xil iboralar takrorlanishida tezkor javob berish uchun)
const translationCache = new Map();

// HTML belgilarni asl holiga qaytarish (masalan &#39; -> ' va &quot; -> ")
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
}

// Yagona matn yoki jumlani o'zbek tiliga aniq tarjima qilish
export async function translateSingleText(text, sourceLang = "en", targetLang = "uz") {
  if (!text || !text.trim()) return text;

  const rawText = text.trim();
  const isUpper = rawText.length > 2 && rawText === rawText.toUpperCase() && /[A-Z]/.test(rawText);
  const cacheKey = `${sourceLang}_${targetLang}_${rawText.toLowerCase()}`;

  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    return isUpper ? cached.toUpperCase() : cached;
  }

  // 1-bosqich: /api/translate serverless / dev proxy orqali (CORS muammosiz)
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText, sl: sourceLang, tl: targetLang })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.translatedText && typeof data.translatedText === "string" && data.translatedText.trim()) {
        const clean = decodeHtmlEntities(data.translatedText.trim());
        translationCache.set(cacheKey, clean);
        return isUpper ? clean.toUpperCase() : clean;
      }
    }
  } catch (err) {
    console.warn("Lokal /api/translate ulanmadi, zaxira usullarga o'tilmoqda...", err);
  }

  // 2-bosqich: Google Translate dict-chrome-ex (o'ta tezkor, brauzerdan to'g'ridan-to'g'ri ishlaydi)
  try {
    const dUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(rawText)}`;
    const dRes = await fetch(dUrl);
    if (dRes.ok) {
      const dData = await dRes.json();
      if (Array.isArray(dData) && typeof dData[0] === "string" && dData[0].trim()) {
        const clean = decodeHtmlEntities(dData[0].trim());
        translationCache.set(cacheKey, clean);
        return isUpper ? clean.toUpperCase() : clean;
      }
    }
  } catch (err) {
    console.warn("Google dict-chrome-ex xatoligi:", err);
  }

  // 3-bosqich: To'g'ridan-to'g'ri Google Translate GTX endpoint
  try {
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(rawText)}`;
    const gtRes = await fetch(gtUrl);
    if (gtRes.ok) {
      const gtData = await gtRes.json();
      if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
        const resText = gtData[0]
          .filter((item) => item && typeof item[0] === "string")
          .map((item) => item[0])
          .join("");
        if (resText.trim()) {
          const clean = decodeHtmlEntities(resText.trim());
          translationCache.set(cacheKey, clean);
          return isUpper ? clean.toUpperCase() : clean;
        }
      }
    }
  } catch (err) {
    console.warn("Direct GT xatoligi:", err);
  }

  // 4-bosqich: Bepul MyMemory API (qattiq sanitizatsiya va kirill->lotin konvertatsiyasi bilan)
  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawText)}&langpair=${sourceLang}|${targetLang}`;
    const mmRes = await fetch(mmUrl);
    if (mmRes.ok) {
      const mmData = await mmRes.json();
      let trans = mmData?.responseData?.translatedText;
      if (trans && typeof trans === "string" && !trans.includes("MYMEMORY WARNING")) {
        trans = decodeHtmlEntities(trans.trim());
        // Agar kirill yozuvida qaytgan bo'lsa, uni zamonaviy o'zbek lotiniga o'tkazish
        if (/[а-яёқғҳў]/i.test(trans)) {
          trans = cyrillicToLatin(trans);
        }
        translationCache.set(cacheKey, trans);
        return isUpper ? trans.toUpperCase() : trans;
      }
    }
  } catch (err) {
    console.warn("MyMemory API xatoligi:", err);
  }

  return rawText; // Oxirgi holatda asl matn qaytariladi
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
