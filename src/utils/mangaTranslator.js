import { createWorker } from "tesseract.js";
import { translateSingleText } from "./translator";
import { jsPDF } from "jspdf";

/**
 * zyddnys/manga-image-translator arxitekturasi asosida yaratilgan
 * professional Anime, Manga va Webtoon tarjimoni (Client-side Engine).
 * 
 * Konveyer (Pipeline):
 * 1. OCR & Noise Filtering (shovqinsiz matn ajratish)
 * 2. Textline Merge (graf va oraliq masofalar asosida dialoglarni birlashtirish)
 * 3. Balloon Extraction (pufakcha chegarasi va xavfsiz zonasini aniqlash)
 * 4. Mask Refinement & Inpainting (harf foni va konturlarini saqlab tozalash)
 * 5. Machine Translation to Uzbek (kontekstli tarjima)
 * 6. Typesetting & Adaptive Text Rendering (shriftni pufakchaga moslab chizish)
 */

let ocrWorker = null;

// Tesseract OCR ishchisini tayyorlash
export async function getOcrWorker(onProgress) {
  if (!ocrWorker) {
    if (onProgress) onProgress("OCR dvigateli ishga tushirilmoqda...");
    try {
      ocrWorker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m?.status === "recognizing text" && onProgress) {
            onProgress(`Matn o'qilmoqda: ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      });
    } catch (e) {
      console.warn("Standart worker xatoligi, qayta urinilmoqda:", e);
      ocrWorker = await createWorker("eng");
    }
  }
  return ocrWorker;
}

/**
 * PDF kitobni sahifama-sahifa yuqori sifatli rasmlarga aylantirish
 * va mavjud raqamli matnlarni (embedded text layer) ham aniqlash
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
      onProgress(`PDF sahifalari tayyorlanmoqda: ${i}/${numPages}...`);
    }

    const page = await pdf.getPage(i);
    // 2.0x masshtab - manga chizmalari va dialog matnlari OCR uchun o'ta tiniq bo'lishi uchun
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
 * OCR orqali aniqlangan matn haqiqiy dialog ekanligini tekshirish
 * (Sahifa raqamlari, shovqinlar, panjaralar va fon teksturalarini filtrlaydi)
 */
function isMeaningfulText(text, confidence) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 1) return false;
  if (trimmed.length === 1 && !/^[a-zA-Z]$/.test(trimmed)) return false;

  // Kamida bitta harf bo'lishi shart
  const letterMatches = trimmed.match(/[a-zA-Z]/g);
  if (!letterMatches || letterMatches.length < 1) return false;

  // Faqat raqamlar bo'lsa (masalan sahifa raqamlari "12", "01") dialog emas
  if (/^\d+$/.test(trimmed)) return false;

  // Harflarning umumiy belgilarga nisbati kamida 30% bo'lsin
  const letterRatio = letterMatches.length / trimmed.length;
  if (letterRatio < 0.30) return false;

  // Faqat takroriy belgilar (masalan: "---", "|||", "...")
  if (/^[^a-zA-Z0-9]+$/.test(trimmed)) return false;

  // Agar kamida bitta 2+ harfli haqiqiy so'z bo'lsa
  const hasRealWord = /\b[a-zA-Z]{2,}\b/.test(trimmed);
  if (hasRealWord) {
    return confidence >= 15;
  }

  return confidence >= 40;
}

/**
 * OCR matnini tozalash (chetki chiziqlar, ramka xatolarini olib tashlash)
 */
function cleanOcrLine(raw) {
  if (!raw) return "";
  let s = raw.trim();
  // Chegaradagi xato belgilarni olib tashlash (ikki chetdagi : ; ~ _ — - [] {} () <> / \ = | belgilari)
  s = s.replace(/^[:;~_—\-[\]{}()<>/\\=|\s]+/, "").replace(/[:;~_—\-[\]{}()<>/\\=|\s]+$/, "").trim();
  // OCR ba'zida 'I' ni '|' yoki '1' deb o'qiydi
  s = s.replace(/\b1\s/g, "I ").replace(/\|\s/g, "I ").replace(/\bl\s/g, "I ");
  // Ko'p bo'shliqlarni bitta bo'shliqqa keltirish
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Tesseract satridagi haqiqiy so'zlar orqali aniq bounding box hisoblash.
 * Satr boshidagi/oxiridagi chetki shovqin belgilari (masalan pufakcha devori ':' yoki '|')
 * koordinatalarni chetga surib yubormasligi uchun so'zlardan o'lchanadi.
 */
function getAccurateLineBbox(l) {
  if (l.words && l.words.length > 0) {
    const validWords = l.words.filter(w => {
      const t = (w.text || "").trim();
      if (/^[:;~_—\-[\]{}()<>/\\=|\s]+$/.test(t) && (w.confidence < 60 || t.length <= 1)) return false;
      return t.length > 0;
    });

    if (validWords.length > 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const w of validWords) {
        if (w.bbox.x0 < x0) x0 = w.bbox.x0;
        if (w.bbox.y0 < y0) y0 = w.bbox.y0;
        if (w.bbox.x1 > x1) x1 = w.bbox.x1;
        if (w.bbox.y1 > y1) y1 = w.bbox.y1;
      }
      return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
    }
  }
  return { ...l.bbox, width: l.bbox.x1 - l.bbox.x0, height: l.bbox.y1 - l.bbox.y0 };
}

/**
 * zyddnys textline_merge: Ikki qator bir dialog pufakchasiga tegishli ekanligini aniqlash
 * Masofa, markazlashtirish, qator balandligi va gorizontal ustma-ust tushish (overlap) hisobga olinadi.
 */
function canMergeLines(box, line) {
  const vDist = line.bbox.y0 - box.y1;
  const lineH = Math.max(14, line.bbox.y1 - line.bbox.y0);
  const boxH = Math.max(14, (box.y1 - box.y0) / Math.max(1, box.lines.length));
  const avgFontSize = Math.max(lineH, boxH);

  // Vertikal masofa shart: satrlar bir-biriga yaqin (maksimal 1.6 * font_size yoki 45px)
  const isVerticallyAdjacent = vDist >= -12 && vDist <= Math.max(45, avgFontSize * 1.6);
  if (!isVerticallyAdjacent) return false;

  // Gorizontal moslik:
  // 1. Gorizontal ustma-ust tushish (overlap) - bir pufakchadagi satrlar bir-biriga tushadi
  const overlap = Math.min(box.x1, line.bbox.x1) - Math.max(box.x0, line.bbox.x0);
  if (overlap > 15) return true;

  // 2. Markaz masofasi
  const boxCenterX = (box.x0 + box.x1) / 2;
  const lineCenterX = (line.bbox.x0 + line.bbox.x1) / 2;
  const boxWidth = box.x1 - box.x0;
  const lineWidth = line.bbox.x1 - line.bbox.x0;
  const centerDist = Math.abs(boxCenterX - lineCenterX);

  const maxAllowedCenterOffset = Math.max(boxWidth, lineWidth) * 0.55 + 25;
  return centerDist <= maxAllowedCenterOffset;
}

/**
 * zyddnys ballon_extractor: Matn atrofidagi pufakchaning (Balloon) haqiqiy konturi
 * va xavfsiz ichki maydonini (safe margin) avtomatik aniqlash.
 */
function detectBalloonBoundary(ctx, textBbox, canvasW, canvasH) {
  const { x0, y0, x1, y1 } = textBbox;
  const maxExpandX = Math.min(60, Math.round((x1 - x0) * 0.4) + 16);
  const maxExpandY = Math.min(45, Math.round((y1 - y0) * 0.4) + 12);

  let bX0 = Math.max(0, x0 - maxExpandX);
  let bY0 = Math.max(0, y0 - maxExpandY);
  let bX1 = Math.min(canvasW - 1, x1 + maxExpandX);
  let bY1 = Math.min(canvasH - 1, y1 + maxExpandY);

  try {
    const w = bX1 - bX0;
    const h = bY1 - bY0;
    if (w <= 0 || h <= 0) {
      return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0, isDark: false };
    }

    const imgData = ctx.getImageData(bX0, bY0, w, h);
    const data = imgData.data;

    // Matn yaqinidagi lokal fon yorqinligini aniqlash
    const localX = x0 - bX0;
    const localY = y0 - bY0;
    const localW = x1 - x0;
    const localH = y1 - y0;

    let bgLumSum = 0;
    let bgSamples = 0;

    // Matn atrofidagi perimetrdan 8 ta nuqtadan namuna olish
    const samplePoints = [
      { x: localX - 2, y: localY - 2 },
      { x: localX + localW + 2, y: localY - 2 },
      { x: localX - 2, y: localY + localH + 2 },
      { x: localX + localW + 2, y: localY + localH + 2 },
      { x: localX + Math.round(localW / 2), y: localY - 4 },
      { x: localX + Math.round(localW / 2), y: localY + localH + 4 }
    ];

    for (const pt of samplePoints) {
      const px = Math.max(0, Math.min(w - 1, pt.x));
      const py = Math.max(0, Math.min(h - 1, pt.y));
      const idx = (py * w + px) * 4;
      const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      bgLumSum += lum;
      bgSamples++;
    }

    const avgBgLum = bgSamples > 0 ? bgLumSum / bgSamples : 255;
    const isDark = avgBgLum < 110;

    // Pufakcha chegaralarini qidirish (qora chegarani topguncha kengaytirish)
    return {
      x0: bX0,
      y0: bY0,
      x1: bX1,
      y1: bY1,
      width: bX1 - bX0,
      height: bY1 - bY0,
      isDark,
      avgBgLum
    };
  } catch {
    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0, isDark: false };
  }
}

/**
 * Pufakchaning fon rangi va matn rangini aniq hisoblash
 */
function detectBoxColors(ctx, box) {
  try {
    const margin = 3;
    const x0 = Math.max(0, box.x0 - margin);
    const y0 = Math.max(0, box.y0 - margin);
    const x1 = Math.min(ctx.canvas.width - 1, box.x1 + margin);
    const y1 = Math.min(ctx.canvas.height - 1, box.y1 + margin);
    const w = x1 - x0;
    const h = y1 - y0;

    if (w <= 0 || h <= 0) return { bgColor: "#FFFFFF", textColor: "#000000" };

    const imgData = ctx.getImageData(x0, y0, w, h);
    const data = imgData.data;

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
      const bgColor = brightness > 235 ? "#FFFFFF" : `rgb(${r}, ${g}, ${b})`;
      return { bgColor, textColor: "#000000" };
    } else {
      const bgColor = `rgb(${r}, ${g}, ${b})`;
      const textColor = brightness < 60 ? "#FFFFFF" : "#FFE082";
      return { bgColor, textColor };
    }
  } catch {
    return { bgColor: "#FFFFFF", textColor: "#000000" };
  }
}

/**
 * Katta hajmdagi manga sahifalarini OCR uchun tezkor o'lchamga keltirish
 * (WASM xotira xatolarining oldini oladi va skanerlashni 10 barobar tezlashtiradi)
 */
function getOcrReadyImage(imageElement, maxDim = 1600) {
  const origW = imageElement.naturalWidth || imageElement.width || 1000;
  const origH = imageElement.naturalHeight || imageElement.height || 1400;

  if (origW <= maxDim && origH <= maxDim) {
    return { target: imageElement, scaleFactor: 1.0 };
  }

  const factor = maxDim / Math.max(origW, origH);
  const targetW = Math.round(origW * factor);
  const targetH = Math.round(origH * factor);

  const cvs = document.createElement("canvas");
  cvs.width = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext("2d");
  ctx.drawImage(imageElement, 0, 0, targetW, targetH);

  return { target: cvs, scaleFactor: origW / targetW };
}

/**
 * Manga sahifasidagi inglizcha dialoglarni aniqlash (Tesseract OCR Engine)
 */
export async function detectMangaText(imageElement, onProgress) {
  const extractedLines = [];

  if (onProgress) onProgress("Sahifadagi dialoglar skanerlanmoqda (OCR)...");

  const { target: ocrTarget, scaleFactor } = getOcrReadyImage(imageElement, 1600);
  const worker = await getOcrWorker(onProgress);

  // Tesseract orqali bloklar va qatorlarni aniqlash
  const ret = await worker.recognize(ocrTarget, {}, { blocks: true });

  if (ret.data && ret.data.blocks) {
    for (const block of ret.data.blocks) {
      if (!block.paragraphs) continue;
      for (const p of block.paragraphs) {
        if (!p.lines) continue;
        for (const l of p.lines) {
          const cleanText = cleanOcrLine(l.text || "");
          if (isMeaningfulText(cleanText, l.confidence)) {
            // Pufakcha chetki chiziqlari (masalan ':' yoki '|') xato koordinata bermasligi uchun
            const accBbox = getAccurateLineBbox(l);
            extractedLines.push({
              text: cleanText,
              confidence: l.confidence,
              bbox: {
                x0: Math.round(accBbox.x0 * scaleFactor),
                y0: Math.round(accBbox.y0 * scaleFactor),
                x1: Math.round(accBbox.x1 * scaleFactor),
                y1: Math.round(accBbox.y1 * scaleFactor),
                width: Math.round(accBbox.width * scaleFactor),
                height: Math.round(accBbox.height * scaleFactor)
              }
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

  // zyddnys uslubidagi Textline Merge: Qatorlarni mantiqiy dialog pufakchalariga birlashtirish
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
      // Agar so'z defis bilan bo'lingan bo'lsa (masalan: "trans-" + "lator" = "translator")
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

  // Ranglar, pufakcha chegarasi va Balloon ma'lumotlarini hisoblash
  const tempCanvas = document.createElement("canvas");
  const canvasW = imageElement.naturalWidth || imageElement.width;
  const canvasH = imageElement.naturalHeight || imageElement.height;
  tempCanvas.width = canvasW;
  tempCanvas.height = canvasH;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(imageElement, 0, 0);

  const finalBlocks = mergedBoxes.map((b, idx) => {
    const width = b.x1 - b.x0;
    const height = b.y1 - b.y0;
    const colors = detectBoxColors(tempCtx, b);
    const balloon = detectBalloonBoundary(tempCtx, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, canvasW, canvasH);

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
      balloonBbox: balloon,
      fontSize: Math.max(11, Math.min(26, Math.round(height * 0.45))),
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
 * zyddnys Inpainting + Dilation: Faqat yozuv piksellarini fon rangiga almashtirib tozalash.
 * 1-2px kengaytirish (dilation) orqali harf atrofidagi kulrang soyalarni ham to'liq yo'qotadi!
 */
function cleanTextPixelsFromCanvas(ctx, lines, fallbackBg = "#FFFFFF") {
  if (!lines || lines.length === 0) return;
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  for (const line of lines) {
    const bbox = line.bbox;
    if (!bbox) continue;

    const padX = 4;
    const padY = 3;
    const x = Math.max(0, Math.floor(bbox.x0 - padX));
    const y = Math.max(0, Math.floor(bbox.y0 - padY));
    const w = Math.min(canvasW - x, Math.ceil(bbox.x1 - bbox.x0 + padX * 2));
    const h = Math.min(canvasH - y, Math.ceil(bbox.y1 - bbox.y0 + padY * 2));

    if (w <= 0 || h <= 0) continue;

    try {
      const imgData = ctx.getImageData(x, y, w, h);
      const data = imgData.data;

      // Perimetrdan fon rangini aniqlash
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

      // Dilation maskasi: harf atrofidagi 1px chegarani ham fon rangiga aylantiradi
      const mask = new Uint8Array(w * h);

      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const idx = (py * w + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = (r * 299 + g * 587 + b * 114) / 1000;
          const diff = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

          const isText = isLightBg
            ? (lum < bgLum - 20 || diff > 35)
            : (lum > bgLum + 20 || diff > 35);

          if (isText) {
            mask[py * w + px] = 1;
          }
        }
      }

      // Matn piksellarini va ularga yondosh 1px piksellarni fon rangiga almashtirish
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const mIdx = py * w + px;
          let shouldClean = mask[mIdx] === 1;

          // 1px kengaytirish (Dilation)
          if (!shouldClean) {
            if (
              (px > 0 && mask[mIdx - 1]) ||
              (px < w - 1 && mask[mIdx + 1]) ||
              (py > 0 && mask[mIdx - w]) ||
              (py < h - 1 && mask[mIdx + w])
            ) {
              shouldClean = true;
            }
          }

          if (shouldClean) {
            const idx = mIdx * 4;
            data[idx] = bgR;
            data[idx + 1] = bgG;
            data[idx + 2] = bgB;
            data[idx + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, x, y);
    } catch {
      ctx.fillStyle = fallbackBg;
      ctx.fillRect(x, y, w, h);
    }
  }
}

/**
 * zyddnys 3-bosqich: Professional Manga Typesetting & Adaptive Shape-Aware Auto-Wrap
 * Matnni pufakchaning geometrik shakliga (ellips yoki to'rtburchak) qarab
 * satrlarga taqsimlash, optimal shrift o'lchamini hisoblash va halo effekti bilan chizish.
 */
function renderDialogueText(ctx, text, bbox, balloonBbox, bgColor, textColor, preferredFontSize) {
  const bBox = balloonBbox || bbox;
  const isDark = balloonBbox?.isDark || (textColor === "#FFFFFF" || textColor === "#FFE082");
  const isRectangular = isDark || (bBox.width / bBox.height > 1.85);

  const safeW = Math.max(30, Math.round(bBox.width * 0.88));
  const safeH = Math.max(20, Math.round(bBox.height * 0.88));
  const rx = safeW / 2;
  const ry = safeH / 2;
  const centerX = bBox.x0 + bBox.width / 2;
  const centerY = bBox.y0 + bBox.height / 2;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Boshlang'ich maksimal shrift o'lchami
  const maxFs = Math.min(preferredFontSize || 30, Math.max(12, Math.round(safeH * 0.44)));
  let bestFontSize = 8;
  let bestLines = [text];

  // 1. Shrift o'lchamini optimal tanlash (Binary/Linear auto-fit search)
  for (let fs = maxFs; fs >= 8; fs--) {
    ctx.font = `bold ${fs}px 'Plus Jakarta Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
    const lineHeight = fs * 1.24;

    // Taxminiy qatorlar sonini aniqlash
    const rawTotalWidth = ctx.measureText(text).width;
    const estLineCount = Math.max(1, Math.ceil(rawTotalWidth / safeW));

    const lines = [];
    let currentLine = "";
    let lineIdx = 0;
    let fits = true;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const testLine = currentLine ? currentLine + " " + w : w;

      // Elliptik yoki to'rtburchak pufakcha uchun o'sha satrdagi mavjud kenglik
      let availW = safeW;
      if (!isRectangular && estLineCount > 1) {
        const dy = (lineIdx - (estLineCount - 1) / 2) * lineHeight;
        const normY = Math.min(0.92, Math.abs(dy) / (ry || 1));
        availW = 2 * rx * Math.sqrt(Math.max(0.2, 1 - normY * normY)) * 0.92;
      }

      if (ctx.measureText(testLine).width <= availW) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          lineIdx++;
        }
        currentLine = w;
        if (ctx.measureText(w).width > safeW * 1.05) {
          fits = false;
          break;
        }
      }
    }
    if (currentLine) lines.push(currentLine);

    // Qatorlar balandligi pufakcha ichiga sig'ishini tekshirish
    const totalHeight = lines.length * lineHeight;
    if (fits && totalHeight <= safeH + 4) {
      bestFontSize = fs;
      bestLines = lines;
      break;
    }
    bestLines = lines;
  }

  // 2. Yolg'iz so'z (Orphan/Widow) qolib ketishining oldini olish va balanslash
  if (bestLines.length >= 2) {
    const last = bestLines[bestLines.length - 1];
    const prev = bestLines[bestLines.length - 2];
    const lastWords = last.split(" ");
    const prevWords = prev.split(" ");

    // Agar oxirgi satrda faqat bitta qisqa so'z qolgan bo'lsa
    if (lastWords.length === 1 && prevWords.length >= 2) {
      const moved = prevWords.pop();
      const newPrev = prevWords.join(" ");
      const newLast = moved + " " + last;

      ctx.font = `bold ${bestFontSize}px 'Plus Jakarta Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
      if (ctx.measureText(newLast).width <= safeW) {
        bestLines[bestLines.length - 2] = newPrev;
        bestLines[bestLines.length - 1] = newLast;
      }
    }
  }

  // 3. Canvasga professional manga lettering bilan chizish
  ctx.save();
  ctx.font = `bold ${bestFontSize}px 'Plus Jakarta Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = bestFontSize * 1.24;
  const totalH = bestLines.length * lineHeight;
  const startY = centerY - totalH / 2 + lineHeight / 2;

  // Nozik halo (chegara) kengligi
  const strokeW = Math.max(2.5, Math.round(bestFontSize * 0.22));
  ctx.lineWidth = strokeW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < bestLines.length; i++) {
    const lineStr = bestLines[i];
    const yPos = startY + i * lineHeight;

    // 1-bosqich: Halo kontur (fon rangida)
    ctx.strokeStyle = bgColor || "#FFFFFF";
    ctx.strokeText(lineStr, centerX, yPos);

    // 2-bosqich: Asosiy matn
    ctx.fillStyle = textColor || (isDark ? "#FFFFFF" : "#0F172A");
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

    // 2.1. Inpainting: Faqat yozuv piksellarini tozalash
    const linesToClean = block.lines && block.lines.length > 0
      ? block.lines
      : [{ bbox: block.bbox, text: block.text }];

    cleanTextPixelsFromCanvas(ctx, linesToClean, block.bgColor || "#FFFFFF");

    // 2.2. O'zbekcha tarjimani pufakcha shakliga moslab chizish
    renderDialogueText(
      ctx,
      textToDraw,
      block.bbox,
      block.balloonBbox,
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
