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
    try {
      // Avval lokal serverdan (public/eng.traineddata) tezkor yuklash
      ocrWorker = await createWorker("eng", 1, {
        langPath: window.location.origin
      });
    } catch (e) {
      console.warn("Lokal traineddata yuklanmadi, standart CDN ga o'tilmoqda:", e);
      ocrWorker = await createWorker("eng");
    }
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
 * OCR orqali aniqlangan matn haqiqiy muloqot ekanligini tekshirish
 * (Rasmdagi shovqinlar, chiziqlar va fon teksturalarini filtrlaydi)
 */
function isMeaningfulText(text, confidence) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;

  // Kamida bitta harf bo'lishi shart
  const letterMatches = trimmed.match(/[a-zA-Z]/g);
  if (!letterMatches || letterMatches.length < 2) return false;

  // Harflarning umumiy belgilarga nisbati kamida 40% bo'lsin (chiziq va nuqtalarni filtrlaydi)
  const letterRatio = letterMatches.length / trimmed.length;
  if (letterRatio < 0.4) return false;

  // Faqat takroriy belgilar (masalan: "---", "|||", "...")
  if (/^[^a-zA-Z0-9]+$/.test(trimmed)) return false;

  // Agar kamida bitta 2+ harfli haqiqiy so'z bo'lsa (masalan: "no", "yes", "stop", "go")
  const hasRealWord = /\b[a-zA-Z]{2,}\b/.test(trimmed);
  if (hasRealWord) {
    return confidence >= 25;
  }

  return confidence >= 50;
}

/**
 * OCR matnini tozalash (chetki chiziqlar, ramka xatolarini olib tashlash)
 */
function cleanOcrLine(raw) {
  if (!raw) return "";
  let s = raw.trim();
  // Chegaradagi xato belgilarni olib tashlash: masalan "[ TEXT ]", "| TEXT |", "_TEXT_"
  s = s.replace(/^[|~_—\-[\]{}()<>/\\=]+|[|~_—\-[\]{}()<>/\\=]+$/g, "").trim();
  // OCR ba'zida 'I' ni '|' yoki '1' deb o'qiydi
  s = s.replace(/\b1\s/g, "I ").replace(/\|\s/g, "I ").replace(/\bl\s/g, "I ");
  // Ko'p bo'shliqlarni bitta bo'shliqqa keltirish
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Ikki qator bir dialog pufakchasiga tegishli ekanligini aniqlash
 */
function canMergeLines(box, line) {
  const vDist = line.bbox.y0 - box.y1;
  const hOverlap = Math.min(line.bbox.x1, box.x1) - Math.max(line.bbox.x0, box.x0);

  // Qatorlar vertikal jihatdan bir-biriga yaqin (0 dan 25px gacha)
  const isVerticallyAdjacent = vDist >= -6 && vDist <= 25;

  // Gorizontal jihatdan ular ustun shaklida mos kelishi kerak
  const isHorizontallyAligned = hOverlap > 10 || (hOverlap >= -15 && (line.bbox.x1 - line.bbox.x0) > 25);

  return isVerticallyAdjacent && isHorizontallyAligned;
}

/**
 * Pufakchaning fon rangi (oq yoki to'q/quest) va matn rangini aniq hisoblash
 */
function detectBoxColors(ctx, box) {
  try {
    const margin = 2;
    const x0 = Math.max(0, box.x0 - margin);
    const y0 = Math.max(0, box.y0 - margin);
    const x1 = Math.min(ctx.canvas.width - 1, box.x1 + margin);
    const y1 = Math.min(ctx.canvas.height - 1, box.y1 + margin);
    const w = x1 - x0;
    const h = y1 - y0;

    if (w <= 0 || h <= 0) return { bgColor: "#FFFFFF", textColor: "#000000" };

    const imgData = ctx.getImageData(x0, y0, w, h);
    const data = imgData.data;

    // Perimetrdan fon rangini hisoblash (chunki harflar o'rtada joylashgan)
    let bgR = 0, bgG = 0, bgB = 0, count = 0;
    for (let px = 0; px < w; px++) {
      const idxT = px * 4;
      bgR += data[idxT]; bgG += data[idxT + 1]; bgB += data[idxT + 2]; count++;
      const idxB = ((h - 1) * w + px) * 4;
      bgR += data[idxB]; bgG += data[idxB + 1]; bgB += data[idxB + 2]; count++;
    }

    for (let py = 1; py < h - 1; py++) {
      const idxL = (py * w) * 4;
      bgR += data[idxL]; bgG += data[idxL + 1]; bgB += data[idxL + 2]; count++;
      const idxR = (py * w + (w - 1)) * 4;
      bgR += data[idxR]; bgG += data[idxR + 1]; bgB += data[idxR + 2]; count++;
    }

    if (count === 0) return { bgColor: "#FFFFFF", textColor: "#000000" };

    const r = Math.round(bgR / count);
    const g = Math.round(bgG / count);
    const b = Math.round(bgB / count);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness > 130) {
      // Yorug' fon (manga sahifasi toniga mos rang)
      const bgColor = brightness > 235 ? "#FFFFFF" : `rgb(${r}, ${g}, ${b})`;
      return { bgColor, textColor: "#000000" };
    } else {
      // To'q fon (quest box yoki tizim oynasi)
      const bgColor = `rgb(${r}, ${g}, ${b})`;
      const textColor = brightness < 60 ? "#FFFFFF" : "#FFE082";
      return { bgColor, textColor };
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

  // Tesseract bboxes olish
  const ret = await worker.recognize(imageElement, {}, { blocks: true, text: true });

  const extractedLines = [];

  if (ret.data && ret.data.blocks) {
    for (const block of ret.data.blocks) {
      if (!block.paragraphs) continue;
      for (const p of block.paragraphs) {
        if (!p.lines) continue;
        for (const l of p.lines) {
          const cleanText = cleanOcrLine(l.text || "");
          if (isMeaningfulText(cleanText, l.confidence)) {
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

  // Qatorlarni o'qish tartibida saralash (yuqoridan pastga, chapdan o'ngga)
  extractedLines.sort((a, b) => {
    if (Math.abs(a.bbox.y0 - b.bbox.y0) < 16) {
      return a.bbox.x0 - b.bbox.x0;
    }
    return a.bbox.y0 - b.bbox.y0;
  });

  // Qatorlarni mantiqiy dialog pufakchalariga birlashtirish
  const mergedBoxes = [];
  let currentBox = null;

  for (let i = 0; i < extractedLines.length; i++) {
    const line = extractedLines[i];
    if (!currentBox) {
      currentBox = {
        lines: [line],
        text: line.text,
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1
      };
    } else if (canMergeLines(currentBox, line)) {
      currentBox.lines.push(line);
      // Agar so'z defis bilan bo'lingan bo'lsa
      if (currentBox.text.endsWith("-")) {
        currentBox.text = currentBox.text.slice(0, -1) + line.text;
      } else {
        currentBox.text += " " + line.text;
      }
      currentBox.x0 = Math.min(currentBox.x0, line.bbox.x0);
      currentBox.y0 = Math.min(currentBox.y0, line.bbox.y0);
      currentBox.x1 = Math.max(currentBox.x1, line.bbox.x1);
      currentBox.y1 = Math.max(currentBox.y1, line.bbox.y1);
    } else {
      mergedBoxes.push(currentBox);
      currentBox = {
        lines: [line],
        text: line.text,
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1
      };
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
      lines: b.lines || [{ bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, text: b.text }],
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
      fontSize: Math.max(11, Math.min(24, Math.round(height * 0.45))),
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
 * Faqat yozuv piksellarini fon rangiga almashtirib tozalash (Inpainting).
 * Bu usul rasmning chizmalari, pufakcha chegaralari va san'atini 100% buzmasdan saqlaydi!
 */
function cleanTextPixelsFromCanvas(ctx, lines, fallbackBg = "#FFFFFF") {
  if (!lines || lines.length === 0) return;
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  for (const line of lines) {
    const bbox = line.bbox;
    if (!bbox) continue;

    // Har bir qatorning aniq koordinatalarini olish (kichik bufer bilan)
    const padX = 3;
    const padY = 2;
    const x = Math.max(0, Math.floor(bbox.x0 - padX));
    const y = Math.max(0, Math.floor(bbox.y0 - padY));
    const w = Math.min(canvasW - x, Math.ceil(bbox.x1 - bbox.x0 + padX * 2));
    const h = Math.min(canvasH - y, Math.ceil(bbox.y1 - bbox.y0 + padY * 2));

    if (w <= 0 || h <= 0) continue;

    try {
      const imgData = ctx.getImageData(x, y, w, h);
      const data = imgData.data;

      // Perimetrdan lokal fon rangini aniqlash
      let bgRSum = 0, bgGSum = 0, bgBSum = 0, bgCount = 0;

      for (let px = 0; px < w; px++) {
        const tIdx = px * 4;
        bgRSum += data[tIdx]; bgGSum += data[tIdx + 1]; bgBSum += data[tIdx + 2]; bgCount++;
        const bIdx = ((h - 1) * w + px) * 4;
        bgRSum += data[bIdx]; bgGSum += data[bIdx + 1]; bgBSum += data[bIdx + 2]; bgCount++;
      }
      for (let py = 1; py < h - 1; py++) {
        const lIdx = (py * w) * 4;
        bgRSum += data[lIdx]; bgGSum += data[lIdx + 1]; bgBSum += data[lIdx + 2]; bgCount++;
        const rIdx = (py * w + (w - 1)) * 4;
        bgRSum += data[rIdx]; bgGSum += data[rIdx + 1]; bgBSum += data[rIdx + 2]; bgCount++;
      }

      const bgR = bgCount > 0 ? Math.round(bgRSum / bgCount) : 255;
      const bgG = bgCount > 0 ? Math.round(bgGSum / bgCount) : 255;
      const bgB = bgCount > 0 ? Math.round(bgBSum / bgCount) : 255;
      const bgLum = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
      const isLightBg = bgLum > 128;

      // Faqat matn harfi bo'lgan piksellarni fon rangiga almashtirish
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const idx = (py * w + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = (r * 299 + g * 587 + b * 114) / 1000;

          // Rang farqi
          const diff = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

          // Harf siyohi aniqlanadi
          const isText = isLightBg
            ? (lum < bgLum - 25 || diff > 40)
            : (lum > bgLum + 25 || diff > 40);

          if (isText) {
            data[idx] = bgR;
            data[idx + 1] = bgG;
            data[idx + 2] = bgB;
            data[idx + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, x, y);
    } catch {
      // Xavfsiz zaxira
      ctx.fillStyle = fallbackBg;
      ctx.fillRect(x, y, w, h);
    }
  }
}

/**
 * Tarjima qilingan matnni pufakcha ichiga estetik va qulay joylashtirish
 */
function renderDialogueText(ctx, text, bbox, bgColor, textColor, preferredFontSize) {
  const { x0, y0, x1, y1, width, height } = bbox;
  const boxW = Math.max(24, width);
  const boxH = Math.max(16, height);
  const centerX = x0 + boxW / 2;
  const centerY = y0 + boxH / 2;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Shrift o'lchamini va qatorlarni hisoblash
  let bestFontSize = Math.min(preferredFontSize || 15, Math.max(10, Math.round(boxH * 0.45)));
  let bestLines = [];

  for (let fs = bestFontSize; fs >= 8; fs--) {
    ctx.font = `bold ${fs}px 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
    const lines = [];
    let currentLine = words[0];
    let fits = true;

    for (let i = 1; i < words.length; i++) {
      const test = currentLine + " " + words[i];
      if (ctx.measureText(test).width <= boxW + 2) {
        currentLine = test;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
        if (ctx.measureText(currentLine).width > boxW + 6) {
          fits = false;
        }
      }
    }
    if (currentLine) lines.push(currentLine);

    const totalHeight = lines.length * (fs * 1.25);
    if (fits && totalHeight <= boxH + 6) {
      bestFontSize = fs;
      bestLines = lines;
      break;
    }
    bestLines = lines;
  }

  ctx.save();
  ctx.font = `bold ${bestFontSize}px 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = bestFontSize * 1.25;
  const totalH = bestLines.length * lineHeight;
  const startY = centerY - totalH / 2 + lineHeight / 2;

  // Har bir qatorni chizish
  for (let i = 0; i < bestLines.length; i++) {
    const lineStr = bestLines[i];
    const yPos = startY + i * lineHeight;

    // Matn atrofiga nozik chegara (halo) chizish - rasmdagi san'atni yopmasdan o'qilishini ta'minlaydi
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = bgColor || "#FFFFFF";
    ctx.strokeText(lineStr, centerX, yPos);

    // Asosiy matn
    ctx.fillStyle = textColor || "#000000";
    ctx.fillText(lineStr, centerX, yPos);
  }

  ctx.restore();
}

/**
 * Canvas ustiga tarjima matnini chizish
 * Faqat yozuv bor joy tozalanadi, umumiy rasm dizayni 100% buzilmaydi!
 */
export function renderMangaPage({
  canvas,
  image,
  blocks,
  showOriginal = false
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext("2d");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  // 1. Asl rasm/sahifani to'liq chizish (San'at va dizayn butun holatda qoladi)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (showOriginal) return;

  // 2. Har bir dialog uchun: faqat inglizcha harflar o'chiriladi va o'zbekchasi chiziladi
  for (const block of blocks) {
    const textToDraw = (block.translatedText || block.text || "").trim();
    if (!textToDraw) continue;

    // 2.1. Faqat yozuv piksellarini tozalash (katta to'rtburchak chizilmaydi, dizayn saqlanadi)
    const linesToClean = block.lines && block.lines.length > 0
      ? block.lines
      : [{ bbox: block.bbox, text: block.text }];

    cleanTextPixelsFromCanvas(ctx, linesToClean, block.bgColor || "#FFFFFF");

    // 2.2. O'zbekcha tarjimani chizish
    renderDialogueText(
      ctx,
      textToDraw,
      block.bbox,
      block.bgColor,
      block.textColor,
      block.fontSize
    );
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
