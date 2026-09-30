import { createWorker } from "tesseract.js";
import { translateSingleText } from "./translator";
import { jsPDF } from "jspdf";

/**
 * Anime, Manga va Webtoon kitoblarini (PDF va Rasmlar)
 * rasmni buzmasdan faqat so'zlarni o'zbekchaga tarjima qilish tizimi
 */

let ocrWorker = null;

// Tesseract OCR ishchisini tayyorlash
export async function getOcrWorker(onProgress) {
  if (!ocrWorker) {
    if (onProgress) onProgress("OCR dvigateli ishga tushirilmoqda...");
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

/**
 * PDF faylni sahifama-sahifa yuqori sifatli (High-Res) rasmlarga aylantirish
 */
export async function loadPdfPages(file, onProgress) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js kutubxonasi yuklanmagan");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pages = [];

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      onProgress(`PDF sahifasi tayyorlanmoqda: ${i}/${numPages}...`);
    }

    const page = await pdf.getPage(i);
    // 2.0x masshtab - matnlar juda aniq ko'rinishi va OCR xatosiz o'qishi uchun
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    pages.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL("image/jpeg", 0.95),
      width: viewport.width,
      height: viewport.height
    });
  }

  return pages;
}

/**
 * Rasmdagi pufakcha fon rangi (Background) va matn rangini avtomatik aniqlash
 */
function sampleColorsAtBox(ctx, box) {
  try {
    // Matn atrofidagi 4 ta nuqtadan rang namunasini olish
    const samplePoints = [
      { x: Math.max(0, box.x0 - 4), y: Math.max(0, box.y0 - 4) },
      { x: Math.min(ctx.canvas.width - 1, box.x1 + 4), y: Math.max(0, box.y0 - 4) },
      { x: Math.max(0, box.x0 - 4), y: Math.min(ctx.canvas.height - 1, box.y1 + 4) },
      { x: Math.round((box.x0 + box.x1) / 2), y: Math.max(0, box.y0 - 3) }
    ];

    let totalR = 0, totalG = 0, totalB = 0;
    let count = 0;

    for (const pt of samplePoints) {
      const pixel = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      // Agar oq yoki shaffof bo'lmasa
      if (pixel[3] > 50) {
        totalR += pixel[0];
        totalG += pixel[1];
        totalB += pixel[2];
        count++;
      }
    }

    if (count === 0) return { bgColor: "#FFFFFF", textColor: "#000000" };

    const r = Math.round(totalR / count);
    const g = Math.round(totalG / count);
    const b = Math.round(totalB / count);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    // Agar fon yorug' bo'lsa (oq manga pufakchasi)
    if (brightness > 160) {
      return {
        bgColor: "#FFFFFF",
        textColor: "#000000"
      };
    } else {
      // Agar fon to'q bo'lsa (Masalan: Main Quest, Qora pufakcha yoki tizim oynasi)
      return {
        bgColor: `rgb(${r}, ${g}, ${b})`,
        textColor: brightness < 80 ? "#FFFFFF" : "#FFF9D2"
      };
    }
  } catch {
    return { bgColor: "#FFFFFF", textColor: "#000000" };
  }
}

/**
 * Rasmdagi inglizcha matnlarni OCR orqali aniqlash
 */
export async function detectMangaText(imageElement, onProgress) {
  if (onProgress) onProgress("Anime/Manga sahifasidagi matnlar skanerlanmoqda...");

  const worker = await getOcrWorker();
  const ret = await worker.recognize(imageElement);

  const lines = ret.data.lines || [];
  const textBlocks = [];

  // Vaqtinchalik canvas ranglarni aniqlash uchun
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageElement.naturalWidth || imageElement.width;
  tempCanvas.height = imageElement.naturalHeight || imageElement.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(imageElement, 0, 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = (line.text || "").trim();

    // Kamida 2 ta belgi va tushunarli aniqlik
    if (text.length >= 2 && line.confidence > 25) {
      const box = {
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0
      };

      const colors = sampleColorsAtBox(tempCtx, box);

      textBlocks.push({
        id: "box_" + i + "_" + Date.now(),
        text: text,
        translatedText: "",
        bbox: box,
        fontSize: Math.max(12, Math.round(box.height * 0.72)),
        bgColor: colors.bgColor,
        textColor: colors.textColor,
        isUppercase: text === text.toUpperCase() // Agar inglizchada bosh harflar bo'lsa
      });
    }
  }

  // Yaqin qatorlarni (bitta pufakchadagi matnlarni) birlashtirish
  return mergeDialogueBlocks(textBlocks);
}

// Bitta pufakchadagi qatorlarni birlashtirish
function mergeDialogueBlocks(blocks) {
  if (blocks.length <= 1) return blocks;

  const merged = [];
  const visited = new Set();

  for (let i = 0; i < blocks.length; i++) {
    if (visited.has(i)) continue;

    let curr = { ...blocks[i] };
    visited.add(i);

    for (let j = i + 1; j < blocks.length; j++) {
      if (visited.has(j)) continue;
      const candidate = blocks[j];

      const vGap = Math.abs(candidate.bbox.y0 - curr.bbox.y1);
      const hOverlap =
        Math.min(curr.bbox.x1, candidate.bbox.x1) - Math.max(curr.bbox.x0, candidate.bbox.x0);

      // Agar qatorlar bitta pufakchaga tegishli bo'lsa (vertikal yaqin va ustma-ust)
      if (vGap <= 22 && hOverlap >= -35) {
        curr.text += " " + candidate.text;
        curr.bbox.x0 = Math.min(curr.bbox.x0, candidate.bbox.x0);
        curr.bbox.y0 = Math.min(curr.bbox.y0, candidate.bbox.y0);
        curr.bbox.x1 = Math.max(curr.bbox.x1, candidate.bbox.x1);
        curr.bbox.y1 = Math.max(curr.bbox.y1, candidate.bbox.y1);
        curr.bbox.width = curr.bbox.x1 - curr.bbox.x0;
        curr.bbox.height = curr.bbox.y1 - curr.bbox.y0;
        visited.add(j);
      }
    }

    merged.push(curr);
  }

  return merged;
}

/**
 * Aniqlangan matnlarni O'zbek tiliga tarjima qilish
 */
export async function translateMangaBlocks(blocks, onProgress) {
  const total = blocks.length;
  const translated = [];

  for (let i = 0; i < total; i++) {
    const block = blocks[i];
    if (onProgress) {
      onProgress(`Dialoglar tarjima qilinmoqda: ${i + 1}/${total}...`);
    }

    try {
      let uzText = await translateSingleText(block.text, "en", "uz");

      // Agar original matn faqat KATTA HARFLARDA (ALL CAPS) bo'lsa (anime manga an'anasi)
      if (block.isUppercase) {
        uzText = uzText.toUpperCase();
      }

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
 * Canvas ustiga tarjima matnini chizish (Asl rasmni o'zgartirmasdan!)
 */
export function renderMangaPage({
  canvas,
  image,
  blocks,
  showOriginal = false,
  padding = 5
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  // 1. Asl rasm/sahifani to'liq 100% chizish (Rasm chizmasi buzilmaydi)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (showOriginal) return;

  // 2. Har bir dialog pufakchasini yangilash
  for (const block of blocks) {
    const textToDraw = (block.translatedText || block.text || "").trim();
    if (!textToDraw) continue;

    const { x0, y0, x1, y1, width, height } = block.bbox;

    const boxX = Math.max(0, x0 - padding);
    const boxY = Math.max(0, y0 - padding);
    const boxW = Math.min(canvas.width - boxX, width + padding * 2);
    const boxH = Math.min(canvas.height - boxY, height + padding * 2);

    ctx.save();

    // 2.1. Inglizcha so'zni o'chirish (Pufakcha fon rangi bilan qoplash)
    ctx.fillStyle = block.bgColor || "#FFFFFF";
    ctx.beginPath();
    const cornerRadius = Math.min(6, boxW / 6, boxH / 6);
    ctx.roundRect(boxX, boxY, boxW, boxH, cornerRadius);
    ctx.fill();

    // 2.2. O'zbekcha tarjimani chizish
    ctx.fillStyle = block.textColor || "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let fontSize = block.fontSize || 14;
    ctx.font = `bold ${fontSize}px sans-serif`;

    // So'zlarni pufakcha kengligiga mos qilib qatorlarga o'rash
    const words = textToDraw.split(/\s+/);
    let lines = [];
    let currentLine = words[0] || "";

    for (let w = 1; w < words.length; w++) {
      const testLine = currentLine + " " + words[w];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > boxW - 8) {
        lines.push(currentLine);
        currentLine = words[w];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Agar matn bo'yiga sig'may qolsa, shriftni avtomatik moslashtirish
    const lineHeight = fontSize * 1.25;
    const totalH = lines.length * lineHeight;
    if (totalH > boxH && fontSize > 9) {
      fontSize = Math.max(9, Math.floor(fontSize * (boxH / totalH)));
      ctx.font = `bold ${fontSize}px sans-serif`;
    }

    const startY = boxY + (boxH - lines.length * (fontSize * 1.25)) / 2 + (fontSize * 1.25) / 2;
    const centerX = boxX + boxW / 2;

    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], centerX, startY + l * (fontSize * 1.25));
    }

    ctx.restore();
  }
}

/**
 * Barcha tarjima qilingan sahifalarni to'liq PDF kitob shaklida eksport qilish
 */
export async function exportAllPagesToPdf(renderedCanvases, bookTitle = "Anime_Tarjima") {
  if (!renderedCanvases || renderedCanvases.length === 0) {
    throw new Error("Eksport qilish uchun sahifalar mavjud emas");
  }

  // Birinchi sahifa o'lchamida PDF boshlash
  const first = renderedCanvases[0];
  const orientation = first.width > first.height ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [first.width, first.height]
  });

  for (let i = 0; i < renderedCanvases.length; i++) {
    const cvs = renderedCanvases[i];
    if (i > 0) {
      pdf.addPage([cvs.width, cvs.height], cvs.width > cvs.height ? "landscape" : "portrait");
    }

    const imgData = cvs.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, 0, cvs.width, cvs.height);
  }

  const fileName = `${bookTitle}_${Date.now()}.pdf`;
  pdf.save(fileName);
  return fileName;
}
