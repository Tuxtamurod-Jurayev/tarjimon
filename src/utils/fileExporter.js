import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";

/**
 * Tarjima natijalarini turli fayl formatlarida (DOCX, PDF, TXT) saqlash va yuklab olish
 */

// Fayl nomini chiroyli shakllantirish
function getCleanFileName(originalFileName, ext) {
  const base = originalFileName ? originalFileName.replace(/\.[^/.]+$/, "") : "Hujjat";
  const dateStr = new Date().toISOString().slice(0, 10);
  return `Tarjima_${base}_${dateStr}.${ext}`;
}

/**
 * 1. Microsoft Word (.docx) formatida yuklab olish
 */
export async function exportToDocx(translatedText, originalFileName = "Hujjat", sourceLang = "Inglizcha", targetLang = "O'zbekcha") {
  if (!translatedText) throw new Error("Yuklab olish uchun tarjima matni mavjud emas");

  const paragraphs = translatedText.split(/\r?\n/).filter(p => p.trim().length > 0);

  const docParagraphs = [
    // Sarlavha
    new Paragraph({
      text: "Hujjat Tarjimasi",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    // Ma'lumot
    new Paragraph({
      children: [
        new TextRun({ text: `Asl til: ${sourceLang}  |  Tarjima tili: ${targetLang}  |  Sana: ${new Date().toLocaleDateString("uz-UZ")}`, italics: true, color: "666666", size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  ];

  // Matn paragraflarini qo'shish
  for (const para of paragraphs) {
    // Agar sahifa ajratgich bo'lsa
    if (para.startsWith("--- [") && para.endsWith("] ---")) {
      docParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: para, bold: true, color: "2563eb", size: 22 })
          ],
          spacing: { before: 300, after: 150 }
        })
      );
    } else {
      docParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: para, size: 24, font: "Arial" })
          ],
          spacing: { after: 200, line: 360 } // 1.5 qator oralig'i
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 dyuym (2.54 sm)
          }
        },
        children: docParagraphs
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const fileName = getCleanFileName(originalFileName, "docx");
  saveAs(blob, fileName);
  return fileName;
}

/**
 * 2. PDF (.pdf) formatida yuklab olish
 */
export async function exportToPdf(translatedText, originalFileName = "Hujjat", sourceLang = "Inglizcha", targetLang = "O'zbekcha") {
  if (!translatedText) throw new Error("Yuklab olish uchun tarjima matni mavjud emas");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = 25;

  // Sarlavha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text("HUJJAT TARJIMASI", pageWidth / 2, cursorY, { align: "center" });

  cursorY += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Asl fayl: ${originalFileName} | Yo'nalish: ${sourceLang} -> ${targetLang} | Sana: ${new Date().toLocaleDateString()}`,
    pageWidth / 2,
    cursorY,
    { align: "center" }
  );

  cursorY += 5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 10;

  // Asosiy matn
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);

  const paragraphs = translatedText.split(/\r?\n/);

  for (const para of paragraphs) {
    if (!para.trim()) {
      cursorY += 5;
      continue;
    }

    // Sahifa ajratgich
    if (para.startsWith("--- [") && para.endsWith("] ---")) {
      if (cursorY + 15 > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(para, margin, cursorY);
      cursorY += 8;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      continue;
    }

    const lines = doc.splitTextToSize(para, contentWidth);
    const paraHeight = lines.length * 5.8;

    if (cursorY + paraHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }

    doc.text(lines, margin, cursorY);
    cursorY += paraHeight + 4;
  }

  // Sahifa raqamlarini qo'shish
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Sahifa ${i} / ${pageCount} — TarjimaAI orqali tayyorlandi`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  const fileName = getCleanFileName(originalFileName, "pdf");
  doc.save(fileName);
  return fileName;
}

/**
 * 3. Oddiy matn (.txt) shaklida yuklab olish
 */
export function exportToTxt(translatedText, originalFileName = "Hujjat") {
  if (!translatedText) throw new Error("Yuklab olish uchun tarjima matni mavjud emas");

  const blob = new Blob([translatedText], { type: "text/plain;charset=utf-8" });
  const fileName = getCleanFileName(originalFileName, "txt");
  saveAs(blob, fileName);
  return fileName;
}
