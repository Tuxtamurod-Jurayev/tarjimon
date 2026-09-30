import { createWorker } from "tesseract.js";
import { translateSingleText } from "./translator";
import { jsPDF } from "jspdf";

/**
 * Anime, Manga va Webtoon rasmlari va PDF kitoblarini
 * rasmni buzmasdan faqat so'zlarni o'zbekchaga o'tkazish tizimi
 */

let ocrWorker = null;

// Tesseract OCR ishchisini tayyorlash
export async function getOcrWorker(onProgress) {
  if (!ocrWorker) {
    if (onProgress) onProgress("OCR dvigateli yuklanmoqda...");
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

/**
 * PDF kitobni sahifama-sahifa yuqori sifatli rasmlarga aylantirish
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
      onProgress(`Anime kitobi sahifalari tayyorlanmoqda: ${i}/${numPages}...`);
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
 * Pufakchaning fon rangi (oq yoki qora/quest) va matn rangini aniqlash
 */
function detectBoxColors(ctx, box) {
  try {
    const margin = 3;
    const sampleCoords = [
      { x: Math.max(0, box.x0 - margin), y: Math.max(0, box.y0 - margin) },
      { x: Math.min(ctx.canvas.width - 1, box.x1 + margin), y: Math.max(0, box.y0 - margin) },
      { x: Math.max(0, box.x0 - margin), y: Math.min(ctx.canvas.height - 1, box.y1 + margin) },
      { x: Math.round((box.x0 + box.x1) / 2), y: Math.max(0, box.y0 - margin) }
    ];

    let totalR = 0, totalG = 0, totalB = 0, count = 0;

    for (const pt of sampleCoords) {
      const p = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      if (p[3] > 40) {
        totalR += p[0];
        totalG += p[1];
        totalB += p[2];
        count++;
      }
    }

    if (count === 0) return { bgColor: "#FFFFFF", textColor: "#000000" };

    const r = Math.round(totalR / count);
    const g = Math.round(totalG / count);
    const b = Math.round(totalB / count);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness > 140) {
      return { bgColor: "#FFFFFF", textColor: "#000000" };
    } else {
      return {
        bgColor: `rgb(${r}, ${g}, ${b})`,
        textColor: brightness < 60 ? "#FFFFFF" : "#FFE082"
      };
    }
  } catch {
    return { bgColor: "#FFFFFF", textColor: "#000000" };
  }
}

/**
 * Rasmdagi inglizcha matnlarni OCR orqali aniqlash va dialog pufakchalariga birlashtirish
 */
export async function detectMangaText(imageElement, onProgress) {
  if (onProgress) onProgress("Anime sahifasidagi matnlar skanerlanmoqda (OCR)...");

  const worker = await getOcrWorker();

  // Muhim: Tesseract v5 da bboxes chiqishi uchun { blocks: true, text: true } berilishi SHART!
  const ret = await worker.recognize(imageElement, {}, { blocks: true, text: true });

  const extractedLines = [];

  if (ret.data && ret.data.blocks) {
    for (const block of ret.data.blocks) {
      if (!block.paragraphs) continue;
      for (const p of block.paragraphs) {
        if (!p.lines) continue;
        for (const l of p.lines) {
          const cleanText = (l.text || "").trim();
          // Kamida 2 ta harf va fon shovqinlarini chiqarib tashlash
          if (cleanText.length >= 2 && l.confidence >= 50) {
            extractedLines.push({
              text: cleanText,
              confidence: l.confidence,
              bbox: l.bbox
            });
          }
        }
      }
    }
  }

  if (extractedLines.length === 0) {
    return [];
  }

  // Qatorlarni mantiqiy dialog pufakchalariga (speech boxes) birlashtirish
  const mergedBoxes = [];
  let currentBox = null;

  for (let i = 0; i < extractedLines.length; i++) {
    const line = extractedLines[i];
    if (!currentBox) {
      currentBox = {
        text: line.text,
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1
      };
    } else {
      const vDist = line.bbox.y0 - currentBox.y1;
      const hOverlap =
        Math.min(line.bbox.x1, currentBox.x1) - Math.max(line.bbox.x0, currentBox.x0);

      // Agar qatorlar bir-biriga vertikal yaqin (bitta pufakcha ichida) bo'lsa
      if (vDist <= 28 && hOverlap >= -45) {
        currentBox.text += " " + line.text;
        currentBox.x0 = Math.min(currentBox.x0, line.bbox.x0);
        currentBox.y0 = Math.min(currentBox.y0, line.bbox.y0);
        currentBox.x1 = Math.max(currentBox.x1, line.bbox.x1);
        currentBox.y1 = Math.max(currentBox.y1, line.bbox.y1);
      } else {
        mergedBoxes.push(currentBox);
        currentBox = {
          text: line.text,
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1
        };
      }
    }
  }
  if (currentBox) mergedBoxes.push(currentBox);

  // Ranglar va pufakcha ma'lumotlarini to'ldirish
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageElement.naturalWidth || imageElement.width;
  tempCanvas.height = imageElement.naturalHeight || imageElement.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(imageElement, 0, 0);

  const finalBlocks = mergedBoxes.map((b, idx) => {
    const width = b.x1 - b.x0;
    const height = b.y1 - b.y0;
    const colors = detectBoxColors(tempCtx, b);

    return {
      id: "bubble_" + idx + "_" + Date.now(),
      text: b.text,
      translatedText: "",
      bbox: {
        x0: b.x0,
        y0: b.y0,
        x1: b.x1,
        y1: b.y1,
        width,
        height
      },
      fontSize: Math.max(11, Math.min(22, Math.round(height * 0.45))),
      bgColor: colors.bgColor,
      textColor: colors.textColor,
      isUppercase: b.text === b.text.toUpperCase()
    };
  });

  return finalBlocks;
}

/**
 * Aniqlangan pufakcha matnlarini o'zbek tiliga tarjima qilish
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
 * Canvas ustiga tarjima matnini chizish (Asl chizma va san'at 100% buzilmaydi!)
 */
export function renderMangaPage({
  canvas,
  image,
  blocks,
  showOriginal = false,
  padding = 6
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  // 1. Asl rasm/sahifani to'liq chizish (San'at va qahramonlar butun qoladi)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (showOriginal) return;

  // 2. Har bir dialog pufakchasidagi inglizcha so'zlarni tozalab, o'zbekchasini chizish
  for (const block of blocks) {
    const textToDraw = (block.translatedText || block.text || "").trim();
    if (!textToDraw) continue;

    const { x0, y0, x1, y1, width, height } = block.bbox;

    const boxX = Math.max(0, x0 - padding);
    const boxY = Math.max(0, y0 - padding);
    const boxW = Math.min(canvas.width - boxX, width + padding * 2);
    const boxH = Math.min(canvas.height - boxY, height + padding * 2);

    ctx.save();

    // 2.1. Inglizcha so'zni pufakchaning fon rangi bilan qoplash
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

    // So'zlarni pufakcha kengligi bo'yicha qatorlarga ajratish (Word wrap)
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

    // Agar matn bo'yiga sig'may qolsa, shriftni avtomatik kichraytirish
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
 * Barcha tarjima qilingan sahifalarni to'liq PDF kitob shaklida saqlash
 */
export async function exportAllPagesToPdf(renderedCanvases, bookTitle = "Anime_Tarjima") {
  if (!renderedCanvases || renderedCanvases.length === 0) {
    throw new Error("Eksport qilish uchun sahifalar mavjud emas");
  }

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
