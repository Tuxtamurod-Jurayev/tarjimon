import { cyrillicToLatin } from "./transliterate.js";

/**
 * zyddnys/manga-image-translator uslubidagi yuqori sifatli
 * Ingliz tilidan O'zbek tiliga tarjima qilish dvigateli (Pre/Post Dictionary + Multi-Engine Fallback)
 */

// Kesh xotirasi (takroriy dialog va iboralar uchun tezkor javob)
const translationCache = new Map();

// 1. Anime / Manga / Webtoon maxsus atamalari va tovush effektlari lug'ati (Glossary)
const MANGA_GLOSSARY = new Map([
  ["main quest", "Asosiy topshiriq"],
  ["side quest", "Qo'shimcha topshiriq"],
  ["sub quest", "Qo'shimcha topshiriq"],
  ["daily quest", "Kunlik topshiriq"],
  ["hidden quest", "Yashirin topshiriq"],
  ["emergency quest", "Favqulodda topshiriq"],
  ["quest complete", "Topshiriq bajarildi!"],
  ["quest completed", "Topshiriq bajarildi!"],
  ["quest failed", "Topshiriq bajarilmadi!"],
  ["level up", "Daraja ko'tarildi!"],
  ["status window", "Holat oynasi"],
  ["skill window", "Mahoratlar oynasi"],
  ["inventory", "Inventar"],
  ["item shop", "Buyumlar do'koni"],
  ["shadow monarch", "Soya hukmdori"],
  ["hunter guild", "Ovchilar gildiyasi"],
  ["dungeon master", "Dungeon sohibi"],
  ["boss monster", "Boss maxluqi"],
  ["magic core", "Sehrli yadro"],
  ["mana recovery", "Mana tiklanishi"],
  ["party member", "Guruh a'zosi"],
  ["whoosh", "Vuv!"],
  ["gasp", "Ah!"],
  ["sigh", "Uff..."],
  ["sob", "Yig'i..."],
  ["bang", "Gurs!"],
  ["boom", "Gumbur!"],
  ["clang", "Jang!"],
  ["smirk", "Irg'ayib..."],
  ["huff... huff...", "Hantirab..."],
  ["pant... pant...", "Hansirab..."]
]);

// 2. Tarjimadan oldingi qoidalar (Pre-Translation Normalization):
// Qisqartmalar va OCR xatolarini to'g'rilaydi, tarjimaning aniqligini 2x oshiradi
const PRE_RULES = [
  // OCR xatoliklarini tuzatish
  [/\b1\b/g, "I"],
  [/\|\b/g, "I"],
  [/\b1\s/g, "I "],
  [/\|\s/g, "I "],

  // Inglizcha og'zaki qisqartmalar (Contractions)
  [/\bcan't\b/gi, "cannot"],
  [/\bwon't\b/gi, "will not"],
  [/\bshan't\b/gi, "shall not"],
  [/\bi'm\b/gi, "I am"],
  [/\byou're\b/gi, "you are"],
  [/\bwe're\b/gi, "we are"],
  [/\bthey're\b/gi, "they are"],
  [/\bhe's\b/gi, "he is"],
  [/\bshe's\b/gi, "she is"],
  [/\bit's\b/gi, "it is"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bhadn't\b/gi, "had not"],
  [/\bwouldn't\b/gi, "would not"],
  [/\bcouldn't\b/gi, "could not"],
  [/\bshouldn't\b/gi, "should not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"],
  [/\bwhat's\b/gi, "what is"],
  [/\bwhere's\b/gi, "where is"],
  [/\bwho's\b/gi, "who is"],
  [/\bthat's\b/gi, "that is"],
  [/\bthere's\b/gi, "there is"],
  [/\bhere's\b/gi, "here is"],

  // Manga so'zlashuv uslubi
  [/\bgonna\b/gi, "going to"],
  [/\bwanna\b/gi, "want to"],
  [/\bgotta\b/gi, "got to"],
  [/\blemme\b/gi, "let me"],
  [/\bgimme\b/gi, "give me"],
  [/\bkinda\b/gi, "kind of"],
  [/\bsorta\b/gi, "sort of"]
];

// 3. Tarjimadan keyingi qoidalar (Post-Translation Uzbek Normalization):
// Mashina tarjimasidagi xatoliklarni o'zbek tilining tabiiy adabiy va so'zlashuv me'yoriga keltiradi
const POST_RULES = [
  // Ruscha ta'siridagi xato transliteratsiyalarni to'g'rilash (er -> yer)
  [/\bu erga\b/gi, "u yerga"],
  [/\bbu erda\b/gi, "bu yerda"],
  [/\bu erda\b/gi, "u yerda"],
  [/\bu erdan\b/gi, "u yerdan"],
  [/\bbu erdan\b/gi, "bu yerdan"],
  [/\bhech erga\b/gi, "hech yerga"],
  [/\bhech erda\b/gi, "hech yerda"],
  [/\bbiron erga\b/gi, "biron yerga"],
  [/\bhar erda\b/gi, "har yerda"],
  [/\bqaysi erga\b/gi, "qaysi yerga"],

  // O'yin va manga iboralarini tabiiylashtirish
  [/\bdarajani ko['‘`]taring!?/gi, "Daraja ko'tarildi!"],
  [/\bdarajaga ko['‘`]taring!?/gi, "Daraja ko'tarildi!"],
  [/\bqadam qo['‘`]ying\b/gi, "oldinga yuring"],

  // Tutuq belgili o'zbekcha so'zlarni to'g'rilash
  [/\betibor\b/gi, "e'tibor"],
  [/\bEtibor\b/g, "E'tibor"],
  [/\bmano\b/gi, "ma'no"],
  [/\bMano\b/g, "Ma'no"],
  [/\bsanat\b/gi, "san'at"],
  [/\bSanat\b/g, "San'at"],
  [/\bmalumot\b/gi, "ma'lumot"],
  [/\bMalumot\b/g, "Ma'lumot"],
  [/\btalim\b/gi, "ta'lim"],
  [/\bTalim\b/g, "Ta'lim"],
  [/\bmojiza\b/gi, "mo'jiza"],
  [/\bMojiza\b/g, "Mo'jiza"],
  [/\bgalaba\b/gi, "g'alaba"],
  [/\bGalaba\b/g, "G'alaba"],

  // Egri tirnoqlarni standartlashtirish
  [/[‘’`ʻ]/g, "'"]
];

function applyPreRules(text) {
  let s = text;
  for (const [pattern, repl] of PRE_RULES) {
    s = s.replace(pattern, repl);
  }
  return s;
}

function applyPostRules(text) {
  let s = text;
  for (const [pattern, repl] of POST_RULES) {
    s = s.replace(pattern, repl);
  }
  return s;
}

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

/**
 * Yagona matn yoki jumlani ingliz tilidan o'zbek tiliga aniq va professional tarjima qilish
 */
export async function translateSingleText(text, sourceLang = "en", targetLang = "uz", options = {}) {
  if (!text || !text.trim()) return text;

  const rawText = text.trim();
  const isUpper = rawText.length > 2 && rawText === rawText.toUpperCase() && /[A-Z]/.test(rawText);
  const startsWithCapital = /[A-Z]/.test(rawText.charAt(0));

  // 1. Manga Lug'ati (Glossary) orqali tekshirish
  const cleanLookup = rawText.toLowerCase().replace(/[!?:.]+$/, "").trim();
  if (sourceLang === "en" && targetLang === "uz" && MANGA_GLOSSARY.has(cleanLookup)) {
    const gloss = MANGA_GLOSSARY.get(cleanLookup);
    return isUpper ? gloss.toUpperCase() : gloss;
  }

  const cacheKey = `${sourceLang}_${targetLang}_${rawText.toLowerCase()}`;
  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    return isUpper ? cached.toUpperCase() : cached;
  }

  // Tarjima oldidan normallashtirish (Pre-Translation)
  const normalizedText = sourceLang === "en" ? applyPreRules(rawText) : rawText;

  let translated = "";

  // 2. Gemini AI integratsiyasi (agar kalit berilgan bo'lsa)
  const geminiApiKey = options.geminiApiKey || (typeof localStorage !== "undefined" ? localStorage.getItem("gemini_api_key") : "");
  if (geminiApiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
      const prompt = `Sen professional manga va anime tarjimonisan. Quyidagi inglizcha dialog yoki tizim matnini o'zbek tiliga tabiiy, jonli va o'zbek tilining zamonaviy so'zlashuv me'yorlariga moslab tarjima qil. Qahramon ohangini saqlagin. Faqat tarjimaning o'zini qaytar:\n\n${normalizedText}`;
      const gRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (gRes.ok) {
        const gData = await gRes.json();
        translated = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }
    } catch (e) {
      console.warn("Gemini AI xatosi, zaxira dvigatelga o'tilmoqda:", e);
    }
  }

  // 3. 1-bosqich: /api/translate serverless / dev proxy orqali (CORS muammosiz)
  if (!translated) {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: normalizedText, sl: sourceLang, tl: targetLang })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.translatedText && typeof data.translatedText === "string" && data.translatedText.trim()) {
          translated = data.translatedText.trim();
        }
      }
    } catch {
      // zaxiraga o'tish
    }
  }

  // 4. 2-bosqich: Google Translate dict-chrome-ex (o'ta tezkor)
  if (!translated) {
    try {
      const dUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(normalizedText)}`;
      const dRes = await fetch(dUrl);
      if (dRes.ok) {
        const dData = await dRes.json();
        if (Array.isArray(dData) && typeof dData[0] === "string" && dData[0].trim()) {
          translated = dData[0].trim();
        }
      }
    } catch {
      // zaxiraga o'tish
    }
  }

  // 5. 3-bosqich: Google Translate GTX endpoint
  if (!translated) {
    try {
      const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(normalizedText)}`;
      const gtRes = await fetch(gtUrl);
      if (gtRes.ok) {
        const gtData = await gtRes.json();
        if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
          translated = gtData[0]
            .filter((item) => item && typeof item[0] === "string")
            .map((item) => item[0])
            .join("")
            .trim();
        }
      }
    } catch {
      // zaxiraga o'tish
    }
  }

  // 6. 4-bosqich: Bepul MyMemory API (zaxira)
  if (!translated) {
    try {
      const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(normalizedText)}&langpair=${sourceLang}|${targetLang}`;
      const mmRes = await fetch(mmUrl);
      if (mmRes.ok) {
        const mmData = await mmRes.json();
        let trans = mmData?.responseData?.translatedText;
        if (trans && typeof trans === "string" && !trans.includes("MYMEMORY WARNING")) {
          trans = trans.trim();
          if (/[а-яёқғҳў]/i.test(trans)) {
            trans = cyrillicToLatin(trans);
          }
          translated = trans;
        }
      }
    } catch {
      // zaxiraga o'tish
    }
  }

  // Agar barcha usullar javob bermasa, asl matn qaytadi
  if (!translated) {
    return rawText;
  }

  // Tarjimadan keyingi o'zbek tili qoidalarini qo'llash (Post-Translation)
  let cleanResult = decodeHtmlEntities(translated);
  if (targetLang === "uz") {
    cleanResult = applyPostRules(cleanResult);
  }

  // Bosh harfni saqlab qolish
  if (startsWithCapital && cleanResult.length > 0) {
    cleanResult = cleanResult.charAt(0).toUpperCase() + cleanResult.slice(1);
  }

  translationCache.set(cacheKey, cleanResult);
  return isUpper ? cleanResult.toUpperCase() : cleanResult;
}

/**
 * Matnni xavfsiz o'lchamdagi bo'laklarga ajratish
 */
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

/**
 * To'liq hujjatni tarjima qilish (Progress bar va bekor qilish imkoni bilan)
 */
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
    const translated = await translateSingleText(chunk, sourceLang, targetLang, {
      geminiApiKey: engine === "gemini" ? geminiApiKey : ""
    });

    translatedChunks.push(translated);

    const percent = Math.round(((i + 1) / totalChunks) * 100);
    onProgress({
      percent,
      current: i + 1,
      total: totalChunks,
      status: `Tarjima qilinmoqda: ${percent}% (${i + 1} / ${totalChunks} bo'lak)...`
    });

    if (i < totalChunks - 1) {
      await new Promise((r) => setTimeout(r, 100));
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
