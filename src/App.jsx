import React, { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  Image as ImageIcon,
  Upload,
  Download,
  Check,
  RotateCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  FileCheck,
  Moon,
  Sun,
  Trash2
} from "lucide-react";

import {
  loadPdfPages,
  detectMangaText,
  translateMangaBlocks,
  renderMangaPage,
  exportAllPagesToPdf
} from "./utils/mangaTranslator";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("tarjima_theme") || "light");

  // Book / File state
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState([]); // [{ pageNumber, dataUrl, width, height, blocks, translated }]
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Status & Progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSelectingBox, setIsSelectingBox] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  // Refs
  const canvasRef = useRef(null);
  const currentImgRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tarjima_theme", theme);
  }, [theme]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const currentPage = pages[currentPageIndex] || null;

  // 1. Faylni yuklash (PDF yoki Rasm)
  const handleFileUpload = async (file) => {
    if (!file) return;

    setFileName(file.name);
    setPages([]);
    setCurrentPageIndex(0);
    setIsProcessing(true);

    try {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

      if (ext === ".pdf") {
        setStatusMessage("Anime PDF sahifalari yuklanmoqda...");
        const pdfPages = await loadPdfPages(file, (msg) => setStatusMessage(msg));
        const initializedPages = pdfPages.map((p) => ({
          ...p,
          blocks: [],
          isTranslated: false
        }));
        setPages(initializedPages);
        showToast(`Anime kitob yuklandi (${initializedPages.length} sahifa)`);
      } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        setStatusMessage("Manga rasmi yuklanmoqda...");
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            setPages([
              {
                pageNumber: 1,
                dataUrl: e.target.result,
                width: img.naturalWidth,
                height: img.naturalHeight,
                blocks: [],
                isTranslated: false
              }
            ]);
            showToast("Manga rasmi yuklandi");
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        showToast("Iltimos, PDF yoki Rasm fayli yuklang!");
      }
    } catch (err) {
      console.error(err);
      showToast("Faylni ochishda xatolik: " + err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // 2. Joriy sahifa rasmini yuklash va canvasda chizish
  useEffect(() => {
    if (!currentPage) return;

    const img = new Image();
    img.onload = () => {
      currentImgRef.current = img;
      if (canvasRef.current) {
        renderMangaPage({
          canvas: canvasRef.current,
          image: img,
          blocks: currentPage.blocks || [],
          showOriginal
        });
      }
    };
    img.src = currentPage.dataUrl;
  }, [currentPageIndex, pages, showOriginal]);

  // 3. Joriy sahifadagi matnlarni aniqlash va o'zbekchaga tarjima qilish
  const handleTranslateCurrentPage = async () => {
    if (!currentImgRef.current || !currentPage) return;

    setIsProcessing(true);
    try {
      setStatusMessage("1/2: Inglizcha so'zlar va pufakchalar aniqlanmoqda (OCR)...");
      const detected = await detectMangaText(currentImgRef.current, (msg) => setStatusMessage(msg));

      if (detected.length === 0) {
        showToast("Bu sahifada inglizcha matn topilmadi.");
        setIsProcessing(false);
        return;
      }

      setStatusMessage(`2/2: ${detected.length} ta matn o'zbek tiliga tarjima qilinmoqda...`);
      const translated = await translateMangaBlocks(detected, (msg) => setStatusMessage(msg));

      // Sahifa ma'lumotlarini yangilash
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === currentPageIndex
            ? { ...p, blocks: translated, isTranslated: true }
            : p
        )
      );

      setShowOriginal(false);
      showToast(`${translated.length} ta dialog o'zbek tiliga o'tkazildi!`);
    } catch (err) {
      console.error(err);
      showToast("Tarjima xatosi: " + err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // 4. Barcha sahifalarni ketma-ket avtomatik tarjima qilish
  const handleTranslateAllPages = async () => {
    if (pages.length === 0) return;

    setIsProcessing(true);
    try {
      const updatedPages = [...pages];

      for (let i = 0; i < updatedPages.length; i++) {
        const p = updatedPages[i];
        setStatusMessage(`Sahifa ${i + 1}/${updatedPages.length}: Matnlar skanerlanmoqda...`);

        const img = new Image();
        await new Promise((res) => {
          img.onload = res;
          img.src = p.dataUrl;
        });

        const detected = await detectMangaText(img);
        if (detected.length > 0) {
          setStatusMessage(`Sahifa ${i + 1}/${updatedPages.length}: Tarjima qilinmoqda (${detected.length} ta)...`);
          const translated = await translateMangaBlocks(detected);
          updatedPages[i] = {
            ...p,
            blocks: translated,
            isTranslated: true
          };
        }
      }

      setPages(updatedPages);
      showToast("Barcha sahifalar to'liq tarjima qilindi!");
    } catch (err) {
      console.error(err);
      showToast("Xatolik: " + err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // 5. Pufakcha matnini qo'lda o'zgartirish
  const handleUpdateBlockText = (blockId, text) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIndex) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, translatedText: text } : b))
        };
      })
    );
  };

  // Pufakcha rangini (Oq yoki To'q/Quest) almashtirish
  const handleToggleBlockTheme = (blockId) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIndex) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => {
            if (b.id === blockId) {
              const isDark = b.bgColor !== "#FFFFFF";
              return {
                ...b,
                bgColor: isDark ? "#FFFFFF" : "#1e1b18",
                textColor: isDark ? "#000000" : "#FFE082"
              };
            }
            return b;
          })
        };
      })
    );
  };

  // Shrift o'lchamini sozlash
  const handleUpdateFontSize = (blockId, delta) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIndex) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) =>
            b.id === blockId ? { ...b, fontSize: Math.max(8, (b.fontSize || 14) + delta) } : b
          )
        };
      })
    );
  };

  // Pufakchani o'chirish
  const handleDeleteBlock = (blockId) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIndex) return p;
        return {
          ...p,
          blocks: p.blocks.filter((b) => b.id !== blockId)
        };
      })
    );
    showToast("Pufakcha o'chirildi");
  };

  // 6. Canvasda sichqoncha bilan yangi pufakcha chizish (Manual Selection)
  const handleCanvasMouseDown = (e) => {
    if (!isSelectingBox || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    setSelectionStart({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  const handleCanvasMouseUp = async (e) => {
    if (!isSelectingBox || !selectionStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;

    const x0 = Math.round(Math.min(selectionStart.x, endX));
    const y0 = Math.round(Math.min(selectionStart.y, endY));
    const x1 = Math.round(Math.max(selectionStart.x, endX));
    const y1 = Math.round(Math.max(selectionStart.y, endY));
    const width = x1 - x0;
    const height = y1 - y0;

    setSelectionStart(null);
    setIsSelectingBox(false);

    if (width < 15 || height < 10) return;

    const defaultText = prompt("Ushbu pufakcha uchun o'zbekcha tarjimani kiriting:", "");
    if (!defaultText) return;

    const newBlock = {
      id: "manual_" + Date.now(),
      text: defaultText,
      translatedText: defaultText,
      bbox: { x0, y0, x1, y1, width, height },
      fontSize: Math.max(12, Math.round(height * 0.7)),
      bgColor: "#FFFFFF",
      textColor: "#000000"
    };

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIndex ? { ...p, blocks: [...(p.blocks || []), newBlock] } : p
      )
    );
    showToast("Yangi pufakcha qo'shildi!");
  };

  // 7. Eksport qilish (Bitta sahifa yoki to'liq PDF kitob)
  const handleDownloadCurrentPageImage = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Tarjima_Sahifa_${currentPageIndex + 1}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    showToast("Joriy sahifa rasmi yuklab olindi!");
  };

  const handleDownloadFullBookPdf = async () => {
    if (pages.length === 0) return;
    setIsProcessing(true);
    setStatusMessage("To'liq PDF kitob yig'ilmoqda...");

    try {
      const renderedCanvases = [];

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const cvs = document.createElement("canvas");
        const img = new Image();
        await new Promise((res) => {
          img.onload = res;
          img.src = p.dataUrl;
        });

        renderMangaPage({
          canvas: cvs,
          image: img,
          blocks: p.blocks || [],
          showOriginal: false
        });

        renderedCanvases.push(cvs);
      }

      const bookTitle = fileName.replace(/\.[^/.]+$/, "") || "Anime_Tarjima";
      await exportAllPagesToPdf(renderedCanvases, bookTitle);
      showToast("To'liq tarjima qilingan PDF kitob yuklandi!");
    } catch (err) {
      console.error(err);
      showToast("PDF yuklashda xatolik: " + err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  return (
    <div>
      {/* Toast Alert */}
      {toast && (
        <div className="toast-box">
          <div className="toast-msg">✨ {toast}</div>
        </div>
      )}

      {/* Top Header */}
      <nav className="top-nav">
        <div className="container top-nav-inner">
          <div className="logo">
            <BookOpen size={22} />
            <span>Anime & Manga Tarjimoni (PDF / Rasm)</span>
          </div>

          <div className="nav-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
              <span>{theme === "light" ? "Tungi" : "Kunduzgi"}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="container">
        {/* Main Action Bar */}
        <div className="card" style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf, image/png, image/jpeg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
            />

            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              <span>Anime Kitob (PDF) yoki Rasm yuklash</span>
            </button>

            {pages.length > 0 && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={handleTranslateCurrentPage}
                  disabled={isProcessing}
                >
                  <RotateCw size={15} />
                  <span>Ushbu sahifani tarjima qilish</span>
                </button>

                {pages.length > 1 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleTranslateAllPages}
                    disabled={isProcessing}
                  >
                    <span>⚡ Barcha {pages.length} ta sahifani tarjima qilish</span>
                  </button>
                )}

                <button
                  className={`btn ${isSelectingBox ? "btn-primary" : "btn-secondary"} btn-sm`}
                  onClick={() => {
                    setIsSelectingBox(!isSelectingBox);
                    showToast(
                      !isSelectingBox
                        ? "Sichqoncha bilan rasm ustida pufakcha chizing"
                        : "Tanlash rejimi bekor qilindi"
                    );
                  }}
                >
                  <PlusCircle size={14} />
                  <span>{isSelectingBox ? "Tanlash faol..." : "+ Qo'lda pufakcha belgilash"}</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowOriginal(!showOriginal)}
                >
                  <Eye size={14} />
                  <span>{showOriginal ? "Tarjima" : "Asl rasm"}</span>
                </button>
              </>
            )}
          </div>

          {/* Download Buttons */}
          {pages.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadCurrentPageImage}>
                <Download size={14} /> Sahifani (.png)
              </button>

              <button className="btn btn-primary btn-sm" onClick={handleDownloadFullBookPdf}>
                <Download size={14} /> To'liq PDF Kitobni yuklab olish
              </button>
            </div>
          )}
        </div>

        {/* Progress Card */}
        {isProcessing && (
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--primary)" }}>
              {statusMessage || "Bajarilmoqda..."}
            </div>
            <div className="progress-bar-simple">
              <div className="progress-bar-fill" style={{ width: "80%" }}></div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {pages.length === 0 && (
          <div className="simple-dropzone card" onClick={() => fileInputRef.current?.click()}>
            <BookOpen size={48} style={{ margin: "0 auto 0.8rem", color: "var(--text-muted)" }} />
            <h3>Anime Kitob (PDF) yoki Manga Rasmini Yuklang</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.4rem", maxWidth: "600px", margin: "0.4rem auto 0" }}>
              PDF kitoblar yoki rasmlar ichidagi barcha dialog pufakchalari va "Main Quest" tizim oynalaridagi inglizcha so'zlar avtomatik aniqlanadi, asl chizmani o'zgartirmasdan o'zbek tiliga tarjima qilinadi.
            </p>
          </div>
        )}

        {/* Manga Page Viewer & Editor */}
        {pages.length > 0 && currentPage && (
          <div>
            {/* Pagination bar if multi-page PDF */}
            {pages.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}
              >
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPageIndex === 0}
                  onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={16} /> Oldingi sahifa
                </button>

                <strong style={{ fontSize: "0.95rem" }}>
                  Sahifa: {currentPageIndex + 1} / {pages.length}
                </strong>

                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPageIndex === pages.length - 1}
                  onClick={() => setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                >
                  Keyingi sahifa <ChevronRight size={16} />
                </button>
              </div>
            )}

            <div className="manga-grid">
              {/* Canvas Container */}
              <div
                className="canvas-wrapper"
                style={{ cursor: isSelectingBox ? "crosshair" : "default" }}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
              >
                <canvas ref={canvasRef} className="manga-canvas" />
              </div>

              {/* Dialogue Inspector Sidebar */}
              <div className="card" style={{ height: "fit-content" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
                  <h4 style={{ fontSize: "0.95rem" }}>
                    Dialoglar ({currentPage.blocks?.length || 0} ta):
                  </h4>
                  {currentPage.isTranslated && (
                    <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 700 }}>
                      ✓ Tarjima qilingan
                    </span>
                  )}
                </div>

                {(!currentPage.blocks || currentPage.blocks.length === 0) ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0" }}>
                    Ushbu sahifada hali tarjima qilinmadi. <br />
                    <strong>"Ushbu sahifani tarjima qilish"</strong> tugmasini bosing yoki qo'lda pufakcha belgilang.
                  </div>
                ) : (
                  <div className="bubble-list">
                    {currentPage.blocks.map((b, idx) => (
                      <div key={b.id} className="bubble-item">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--primary)" }}>
                            #{idx + 1} Asl matn:
                          </span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {/* Rang mavzusi: Oq / To'q Quest */}
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "1px 6px", fontSize: "0.72rem" }}
                              onClick={() => handleToggleBlockTheme(b.id)}
                              title="Pufakcha fonini oq / to'q (quest) qilish"
                            >
                              {b.bgColor === "#FFFFFF" ? "Oq fon" : "To'q fon"}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "1px 5px", fontSize: "0.75rem" }}
                              onClick={() => handleUpdateFontSize(b.id, -1)}
                              title="Shriftni kichraytirish"
                            >
                              A-
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "1px 5px", fontSize: "0.75rem" }}
                              onClick={() => handleUpdateFontSize(b.id, 1)}
                              title="Shriftni kattalashtirish"
                            >
                              A+
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "1px 5px", fontSize: "0.75rem", color: "var(--danger)" }}
                              onClick={() => handleDeleteBlock(b.id)}
                              title="O'chirish"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "6px" }}>
                          "{b.text}"
                        </div>

                        <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>O'zbekcha tarjimasi:</label>
                        <textarea
                          rows={2}
                          value={b.translatedText || ""}
                          onChange={(e) => handleUpdateBlockText(b.id, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
