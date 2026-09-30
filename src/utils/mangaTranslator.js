import { createWorker } from "tesseract.js";
import { translateSingleText } from "./translator";

/**
 * Manga va Rasmlar ichidagi matnlarni aniqlash (OCR),
 * inglizcha matnni o'chirib, o'rniga o'zbekcha tarjimasini chizish moduli
 */

let ocrWorker = null;

// Tesseract OCR ishchisini tayyorlash
async function getWorker(onProgress) {
  if (!ocrWorker) {
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

/**
 * Rasmdagi inglizcha matnlarni va ularning koordinatalarini (Bounding Boxes) aniqlash
 */
export async function detectMangaText(imageSource, onProgress) {
  if (onProgress) onProgress("Rasm ichidagi inglizcha matnlar skanerlanmoqda (OCR)...");

  const worker = await getWorker();
  const ret = await worker.recognize(imageSource);

  const lines = ret.data.lines || [];
  const textBlocks = [];

  // Har bir aniqlangan qatorni tahlil qilish
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = (line.text || "").trim();

    // Faqat haqiqiy so'z bo'lgan va aniqlik darajasi yetarli bo'lgan matnlar
    if (text.length >= 2 && line.confidence > 25) {
      textBlocks.push({
        id: "block_" + i + "_" + Date.now(),
        text: text,
        translatedText: "",
        bbox: {
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1,
          width: line.bbox.x1 - line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0
        },
        fontSize: Math.max(12, Math.round((line.bbox.y1 - line.bbox.y0) * 0.75)),
        bgColor: "#FFFFFF",
        textColor: "#000000"
      });
    }
  }

  // Yaqin joylashgan qatorlarni bitta pufakchaga (speech bubble) birlashtirish
  const mergedBlocks = mergeNearbyBlocks(textBlocks);

  return mergedBlocks;
}

// Yaqin turgan matn bloklarini birlashtiruvchi yordamchi funksiya
function mergeNearbyBlocks(blocks, verticalThreshold = 18, horizontalThreshold = 35) {
  if (blocks.length <= 1) return blocks;

  const merged = [];
  const used = new Set();

  for (let i = 0; i < blocks.length; i++) {
    if (used.has(i)) continue;

    let current = { ...blocks[i] };
    used.add(i);

    for (let j = i + 1; j < blocks.length; j++) {
      if (used.has(j)) continue;
      const candidate = blocks[j];

      const vDist = Math.abs(candidate.bbox.y0 - current.bbox.y1);
      const hOverlap =
        Math.min(current.bbox.x1, candidate.bbox.x1) -
        Math.max(current.bbox.x0, candidate.bbox.x0);

      // Agar qatorlar bir-biriga vertikal yaqin va gorizontal mos tushsa
      if (vDist <= verticalThreshold && hOverlap >= -horizontalThreshold) {
        current.text += " " + candidate.text;
        current.bbox.x0 = Math.min(current.bbox.x0, candidate.bbox.x0);
        current.bbox.y0 = Math.min(current.bbox.y0, candidate.bbox.y0);
        current.bbox.x1 = Math.max(current.bbox.x1, candidate.bbox.x1);
        current.bbox.y1 = Math.max(current.bbox.y1, candidate.bbox.y1);
        current.bbox.width = current.bbox.x1 - current.bbox.x0;
        current.bbox.height = current.bbox.y1 - current.bbox.y0;
        used.add(j);
      }
    }

    merged.push(current);
  }

  return merged;
}

/**
 * Aniqlangan matn bloklarini ingliz tilidan o'zbek tiliga tarjima qilish
 */
export async function translateMangaBlocks(blocks, onProgress) {
  const total = blocks.length;
  const translated = [];

  for (let i = 0; i < total; i++) {
    const block = blocks[i];
    if (onProgress) {
      onProgress(`Matnlar tarjima qilinmoqda: ${i + 1}/${total}...`);
    }

    try {
      const uzText = await translateSingleText(block.text, "en", "uz");
      translated.push({
        ...block,
        translatedText: uzText
      });
    } catch {
      translated.push({
        ...block,
        translatedText: block.text
      });
    }
  }

  return translated;
}

/**
 * Canvas orqali rasmdagi inglizcha matnni o'chirib, o'rniga o'zbekcha tarjimani chizish
 */
export function renderMangaCanvas({
  canvas,
  image,
  blocks,
  showOriginal = false,
  padding = 4
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  // 1. Asl manga rasmini to'liq chizish (Rasm sifati buzilmaydi!)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (showOriginal) return;

  // 2. Har bir tarjima qilingan pufakchani chizish
  for (const block of blocks) {
    const textToDraw = (block.translatedText || block.text || "").trim();
    if (!textToDraw) continue;

    const { x0, y0, x1, y1, width, height } = block.bbox;

    // Matn turgan joyni oq (yoki mos) rang bilan qoplash (English matnni tozalash)
    ctx.save();
    ctx.fillStyle = block.bgColor || "#FFFFFF";
    
    // Manga pufakchasi chegaralarini biroz kengaytirish
    const boxX = Math.max(0, x0 - padding);
    const boxY = Math.max(0, y0 - padding);
    const boxW = Math.min(canvas.width - boxX, width + padding * 2);
    const boxH = Math.min(canvas.height - boxY, height + padding * 2);

    // Yumaloq to'g'ri to'rtburchak (rounded bubble box) chizish
    ctx.beginPath();
    const radius = Math.min(6, boxW / 4, boxH / 4);
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();

    // 3. O'zbekcha tarjima matnini chizish
    ctx.fillStyle = block.textColor || "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Dinamik shrift o'lchamini hisoblash
    let fontSize = block.fontSize || 14;
    ctx.font = `bold ${fontSize}px sans-serif`;

    // So'zlarni pufakcha kengligi bo'yicha qatorlarga ajratish (Word wrap)
    const words = textToDraw.split(/\s+/);
    let lines = [];
    let currentLine = words[0] || "";

    for (let w = 1; w < words.length; w++) {
      const testLine = currentLine + " " + words[w];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > boxW - 6) {
        lines.push(currentLine);
        currentLine = words[w];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Agar matn bo'yiga sig'masa, shriftni biroz kichraytirish
    const lineHeight = fontSize * 1.25;
    const totalTextHeight = lines.length * lineHeight;
    if (totalTextHeight > boxH && fontSize > 10) {
      fontSize = Math.max(10, Math.floor(fontSize * (boxH / totalTextHeight)));
      ctx.font = `bold ${fontSize}px sans-serif`;
    }

    // Matnni pufakchaning qoq markaziga joylashtirish
    const startY = boxY + (boxH - lines.length * (fontSize * 1.25)) / 2 + (fontSize * 1.25) / 2;
    const centerX = boxX + boxW / 2;

    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], centerX, startY + l * (fontSize * 1.25));
    }

    ctx.restore();
  }
}
