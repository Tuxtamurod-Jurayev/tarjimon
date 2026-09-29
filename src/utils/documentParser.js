import mammoth from "mammoth";

/**
 * PDF, DOCX, DOC va TXT fayllaridan matnni ajratib olish
 */

// PDF.js tayyorligini tekshirish yoki yuklash
async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("PDF.js kutubxonasini yuklab bo'lmadi"));
      }
    };
    script.onerror = () => reject(new Error("PDF.js CDN ga ulanib bo'lmadi"));
    document.head.appendChild(script);
  });
}

/**
 * PDF fayldan sahifama-sahifa matn ajratib olish
 */
export async function extractTextFromPdf(file, onProgress) {
  const pdfjsLib = await ensurePdfJsLoaded();
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  let fullText = "";

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      onProgress({
        current: i,
        total: numPages,
        status: `PDF sahifalari o'qilmoqda: ${i}/${numPages}...`
      });
    }

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Matn qismlarini birlashtirish
    const pageStrings = textContent.items.map((item) => item.str);
    const pageText = pageStrings.join(" ").replace(/\s+/g, " ").trim();

    if (pageText) {
      if (numPages > 1) {
        fullText += `--- [${i}-sahifa] ---\n` + pageText + "\n\n";
      } else {
        fullText += pageText + "\n\n";
      }
    }
  }

  return {
    text: fullText.trim(),
    pageCount: numPages
  };
}

/**
 * Word DOCX fayldan matn ajratish
 */
export async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    text: result.value.trim(),
    messages: result.messages
  };
}

/**
 * Oddiy matnli fayllardan (TXT, MD, CSV) matn o'qish
 */
export async function extractTextFromTxt(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ text: e.target.result });
    reader.onerror = (e) => reject(new Error("Matn faylini o'qishda xatolik yuz berdi"));
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * Umumiy fayl o'quvchi (File router)
 */
export async function parseDocument(file, onProgress) {
  const fileName = file.name.toLowerCase();
  const extension = fileName.substring(fileName.lastIndexOf("."));

  if (extension === ".pdf") {
    return await extractTextFromPdf(file, onProgress);
  } else if (extension === ".docx") {
    return await extractTextFromDocx(file);
  } else if (extension === ".doc") {
    // Agar eski .doc bo'lsa, avval mammoth orqali urinib ko'ramiz
    try {
      return await extractTextFromDocx(file);
    } catch {
      throw new Error(
        "Eski .DOC formatidagi faylni ochib bo'lmadi. Iltimos, faylni Word dasturida ochib, '.docx' yoki '.pdf' shaklida saqlab qayta yuklang."
      );
    }
  } else if ([".txt", ".md", ".csv", ".json", ".rtf"].includes(extension)) {
    return await extractTextFromTxt(file);
  } else {
    throw new Error(
      `Qo'llab-quvvatlanmaydigan fayl formati (${extension}). Iltimos, PDF, DOCX yoki TXT fayl yuklang.`
    );
  }
}
