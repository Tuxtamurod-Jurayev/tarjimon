/**
 * Tarjima modullari va matnni bo'laklarga ajratish tizimi
 */

// Matnni xavfsiz o'lchamdagi bo'laklarga (chunks) ajratish (paragraflar va jumlalar buzilmasdan)
export function splitIntoChunks(text, maxChunkSize = 900) {
  if (!text || text.trim().length === 0) return [];

  // Paragraflar bo'yicha ajratish
  const paragraphs = text.split(/\r?\n/);
  const chunks = [];
  let currentChunk = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    
    // Agar bitta paragraf o'zi juda uzun bo'lsa (maxChunkSize dan katta)
    if (para.length > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      
      // Jumlalar bo'yicha ajratish
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

    // Paragrafni mavjud chunkka qo'shish
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

// Bepul Google Translate API orqali tarjima qilish
async function translateChunkGoogle(chunk, sourceLang = "en", targetLang = "uz") {
  if (!chunk.trim()) return chunk;

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Translate xatosi: ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map(item => item[0]).join("");
  }
  
  throw new Error("Kutilmagan Google Translate javob formati");
}

// Zaxira: MyMemory API orqali tarjima qilish
async function translateChunkMyMemory(chunk, sourceLang = "en", targetLang = "uz") {
  if (!chunk.trim()) return chunk;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${sourceLang}|${targetLang}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory xatosi: ${response.status}`);
  }

  const data = await response.json();
  if (data && data.responseData && data.responseData.translatedText) {
    return data.responseData.translatedText;
  }

  throw new Error("MyMemory javob bermadi");
}

// Gemini AI orqali yuqori sifatli tarjima qilish (Foydalanuvchi API kaliti bilan)
async function translateChunkGemini(chunk, apiKey, sourceLang = "en", targetLang = "uz") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const sourceName = sourceLang === "en" ? "English" : "O'zbek";
  const targetName = targetLang === "uz" ? "Uzbek" : "English";

  const prompt = `You are an expert bilingual translator. Translate the following text from ${sourceName} to ${targetName} with the highest linguistic quality and natural grammar. Maintain all paragraph breaks, tone, and formatting. Output ONLY the translated text without explanations, greetings, or commentary:

${chunk}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API xatosi (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) {
    throw new Error("Gemini javobidan matn topilmadi");
  }

  return candidate.trim();
}

/**
 * Hujjatni to'liq tarjima qilish mexanizmi
 */
export async function translateFullDocument({
  text,
  sourceLang = "en",
  targetLang = "uz",
  engine = "google", // 'google' | 'gemini'
  geminiApiKey = "",
  onProgress = () => {},
  abortSignal = null
}) {
  if (!text || text.trim().length === 0) {
    return "";
  }

  const chunks = splitIntoChunks(text, engine === "gemini" ? 2500 : 900);
  const totalChunks = chunks.length;
  const translatedChunks = [];

  onProgress({
    percent: 0,
    current: 0,
    total: totalChunks,
    status: `Tarjimaga tayyorlanmoqda (Jami ${totalChunks} bo'lak)...`
  });

  for (let i = 0; i < totalChunks; i++) {
    if (abortSignal && abortSignal.aborted) {
      throw new Error("Tarjima bekor qilindi.");
    }

    const chunk = chunks[i];
    let translated = "";
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      if (abortSignal && abortSignal.aborted) throw new Error("Tarjima bekor qilindi.");
      
      try {
        if (engine === "gemini" && geminiApiKey) {
          translated = await translateChunkGemini(chunk, geminiApiKey, sourceLang, targetLang);
        } else {
          // Birlamchi Google Translate, xatolik bo'lsa MyMemory
          try {
            translated = await translateChunkGoogle(chunk, sourceLang, targetLang);
          } catch (gtErr) {
            console.warn("Google Translate muammosi, MyMemory ga o'tilmoqda:", gtErr);
            translated = await translateChunkMyMemory(chunk, sourceLang, targetLang);
          }
        }
        break; // Muvaffaqiyatli bo'lsa sikldan chiqish
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error(`Bo'lakni tarjima qilishda xatolik (${i + 1}/${totalChunks}):`, err);
          // Agar hammasi muvaffaqiyatsiz bo'lsa, asl matnni saqlab qolish
          translated = chunk;
        } else {
          // Qayta urinishdan oldin ozgina kutish
          await new Promise((res) => setTimeout(res, 800));
        }
      }
    }

    translatedChunks.push(translated);

    const percent = Math.round(((i + 1) / totalChunks) * 100);
    onProgress({
      percent,
      current: i + 1,
      total: totalChunks,
      status: `Tarjima qilinmoqda: ${percent}% (${i + 1} / ${totalChunks} bo'lak)...`
    });

    // API limitlariga tushmaslik uchun kichik kechikish
    if (i < totalChunks - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
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
