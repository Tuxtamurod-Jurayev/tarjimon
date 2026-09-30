import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  FileText,
  Upload,
  Download,
  Check,
  RotateCw,
  Trash2,
  Moon,
  Sun,
  Copy,
  Eye,
  Settings
} from "lucide-react";

import { detectMangaText, translateMangaBlocks, renderMangaCanvas } from "./utils/mangaTranslator";
import { parseDocument } from "./utils/documentParser";
import { translateFullDocument, translateSingleText } from "./utils/translator";
import { exportToDocx, exportToPdf, exportToTxt } from "./utils/fileExporter";
import { latinToCyrillic, cyrillicToLatin } from "./utils/transliterate";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("tarjima_theme") || "light");
  const [activeTab, setActiveTab] = useState("manga"); // 'manga' | 'document'

  // Manga State
  const [mangaImageFile, setMangaImageFile] = useState(null);
  const [mangaImageSrc, setMangaImageSrc] = useState(null);
  const [mangaBlocks, setMangaBlocks] = useState([]);
  const [isProcessingManga, setIsProcessingManga] = useState(false);
  const [mangaStatus, setMangaStatus] = useState("");
  const [showOriginalManga, setShowOriginalManga] = useState(false);

  // Document State
  const [docFile, setDocFile] = useState(null);
  const [docOriginalText, setDocOriginalText] = useState("");
  const [docTranslatedText, setDocTranslatedText] = useState("");
  const [isTranslatingDoc, setIsTranslatingDoc] = useState(false);
  const [docProgress, setDocProgress] = useState({ percent: 0, status: "" });

  // Notifications
  const [toast, setToast] = useState(null);

  // Refs
  const canvasRef = useRef(null);
  const loadedImageRef = useRef(null);
  const mangaInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tarjima_theme", theme);
  }, [theme]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ---------------- MANGA TRANSLATION ----------------

  const handleMangaFileSelect = (file) => {
    if (!file) return;
    setMangaImageFile(file);
    setMangaBlocks([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      setMangaImageSrc(e.target.result);
      const img = new Image();
      img.onload = () => {
        loadedImageRef.current = img;
        if (canvasRef.current) {
          renderMangaCanvas({
            canvas: canvasRef.current,
            image: img,
            blocks: [],
            showOriginal: true
          });
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    showToast("Manga rasmi yuklandi");
  };

  const handleRunMangaTranslation = async () => {
    if (!loadedImageRef.current) {
      showToast("Iltimos, avval rasm yuklang!");
      return;
    }

    setIsProcessingManga(true);
    try {
      setMangaStatus("1/2: Inglizcha matnlar va pufakchalar aniqlanmoqda (OCR)...");
      const detected = await detectMangaText(loadedImageRef.current, (st) => setMangaStatus(st));

      if (detected.length === 0) {
        showToast("Rasmdan inglizcha matn topilmadi. Boshqa rasm yuklab ko'ring.");
        setIsProcessingManga(false);
        return;
      }

      setMangaStatus(`2/2: ${detected.length} ta matn o'zbek tiliga tarjima qilinmoqda...`);
      const translated = await translateMangaBlocks(detected, (st) => setMangaStatus(st));

      setMangaBlocks(translated);
      setShowOriginalManga(false);

      if (canvasRef.current && loadedImageRef.current) {
        renderMangaCanvas({
          canvas: canvasRef.current,
          image: loadedImageRef.current,
          blocks: translated,
          showOriginal: false
        });
      }

      showToast("Manga muvaffaqiyatli tarjima qilindi!");
    } catch (err) {
      console.error(err);
      showToast("Xatolik: " + err.message);
    } finally {
      setIsProcessingManga(false);
      setMangaStatus("");
    }
  };

  // Re-render when blocks or view toggle changes
  useEffect(() => {
    if (canvasRef.current && loadedImageRef.current) {
      renderMangaCanvas({
        canvas: canvasRef.current,
        image: loadedImageRef.current,
        blocks: mangaBlocks,
        showOriginal: showOriginalManga
      });
    }
  }, [mangaBlocks, showOriginalManga]);

  // Update a single text bubble
  const handleUpdateBlockText = (id, newText) => {
    setMangaBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, translatedText: newText } : b))
    );
  };

  const handleUpdateBlockFontSize = (id, delta) => {
    setMangaBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, fontSize: Math.max(8, (b.fontSize || 14) + delta) } : b
      )
    );
  };

  // Download translated manga as PNG
  const handleDownloadManga = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Tarjima_Manga_${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    showToast("Tarjima qilingan rasm yuklab olindi!");
  };

  // ---------------- DOCUMENT TRANSLATION ----------------

  const handleDocFileSelect = async (file) => {
    if (!file) return;
    setDocFile(file);
    try {
      const res = await parseDocument(file);
      setDocOriginalText(res.text);
      setDocTranslatedText("");
      showToast(`"${file.name}" yuklandi`);
    } catch (err) {
      showToast(err.message || "Faylni ochishda xatolik");
    }
  };

  const handleTranslateDoc = async () => {
    if (!docOriginalText.trim()) {
      showToast("Matn kiritilmagan");
      return;
    }
    setIsTranslatingDoc(true);
    try {
      const result = await translateFullDocument({
        text: docOriginalText,
        sourceLang: "en",
        targetLang: "uz",
        onProgress: (p) => setDocProgress(p)
      });
      setDocTranslatedText(result);
      showToast("Hujjat to'liq tarjima qilindi!");
    } catch (err) {
      showToast("Xatolik: " + err.message);
    } finally {
      setIsTranslatingDoc(false);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="toast-box">
          <div className="toast-msg">{toast}</div>
        </div>
      )}

      {/* Top Navbar */}
      <nav className="top-nav">
        <div className="container top-nav-inner">
          <div className="logo">
            <span>🌐 Tarjimon</span>
            <span style={{ fontSize: "0.75rem", background: "var(--bg-subtle)", padding: "2px 6px", borderRadius: 4, color: "var(--text-muted)" }}>
              Inglizcha ➔ O'zbekcha
            </span>
          </div>

          <div className="nav-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
              <span>{theme === "light" ? "Tungi rejim" : "Kunduzgi rejim"}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="container">
        {/* Main Tabs */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${activeTab === "manga" ? "active" : ""}`}
            onClick={() => setActiveTab("manga")}
          >
            🖼️ Manga va Rasm Tarjimoni
          </button>
          <button
            className={`mode-tab ${activeTab === "document" ? "active" : ""}`}
            onClick={() => setActiveTab("document")}
          >
            📄 Hujjatlar Tarjimoni (PDF, Word, Matn)
          </button>
        </div>

        {/* ================= TAB 1: MANGA / RASM TARJIMONI ================= */}
        {activeTab === "manga" && (
          <div>
            <div className="card" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="file"
                  ref={mangaInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleMangaFileSelect(e.target.files[0]);
                  }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={() => mangaInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>Rasm / Manga yuklash</span>
                </button>

                {mangaImageSrc && (
                  <button
                    className="btn btn-primary"
                    onClick={handleRunMangaTranslation}
                    disabled={isProcessingManga}
                  >
                    <RotateCw size={16} className={isProcessingManga ? "spin" : ""} />
                    <span>
                      {isProcessingManga ? "Tarjima qilinmoqda..." : "Matnlarni aniqlash va Tarjima qilish"}
                    </span>
                  </button>
                )}

                {mangaBlocks.length > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowOriginalManga(!showOriginalManga)}
                  >
                    <Eye size={16} />
                    <span>{showOriginalManga ? "Tarjimani ko'rsatish" : "Asl rasmni ko'rsatish"}</span>
                  </button>
                )}
              </div>

              {mangaBlocks.length > 0 && (
                <button className="btn btn-primary" onClick={handleDownloadManga}>
                  <Download size={16} />
                  <span>Rasmni yuklab olish (.png)</span>
                </button>
              )}
            </div>

            {/* Progress status */}
            {isProcessingManga && (
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--primary)" }}>
                  {mangaStatus || "Jarayon bajarilmoqda..."}
                </div>
                <div className="progress-bar-simple">
                  <div className="progress-bar-fill" style={{ width: "70%" }}></div>
                </div>
              </div>
            )}

            {/* Empty state dropzone */}
            {!mangaImageSrc && (
              <div
                className="simple-dropzone card"
                onClick={() => mangaInputRef.current?.click()}
              >
                <ImageIcon size={44} style={{ margin: "0 auto 0.8rem", color: "var(--text-muted)" }} />
                <h3>Manga yoki Rasm faylini yuklang (PNG, JPG, WEBP)</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.4rem" }}>
                  Tizim rasm ichidagi inglizcha so'zlarni o'chirib, o'rniga o'zbekcha tarjimasini joylashtiradi.
                  Rasm chizmasi o'zgarmasdan saqlanadi.
                </p>
              </div>
            )}

            {/* Manga View & Dialogue editor grid */}
            {mangaImageSrc && (
              <div className="manga-grid">
                {/* Canvas Viewer */}
                <div className="canvas-wrapper">
                  <canvas ref={canvasRef} className="manga-canvas" />
                </div>

                {/* Right Side: Dialogue Bubbles List */}
                <div className="card" style={{ height: "fit-content" }}>
                  <h4 style={{ marginBottom: "0.8rem", fontSize: "0.95rem" }}>
                    Aniqlangan pufakchalar ({mangaBlocks.length} ta):
                  </h4>

                  {mangaBlocks.length === 0 ? (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      "Matnlarni aniqlash va Tarjima qilish" tugmasini bosing.
                    </p>
                  ) : (
                    <div className="bubble-list">
                      {mangaBlocks.map((b, idx) => (
                        <div key={b.id} className="bubble-item">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: "0.8rem", color: "var(--primary)" }}>
                              #{idx + 1} Asl matn:
                            </strong>
                            <div style={{ display: "flex", gap: "0.3rem" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: "1px 5px", fontSize: "0.75rem" }}
                                onClick={() => handleUpdateBlockFontSize(b.id, -1)}
                                title="Shriftni kichraytirish"
                              >
                                A-
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: "1px 5px", fontSize: "0.75rem" }}
                                onClick={() => handleUpdateBlockFontSize(b.id, 1)}
                                title="Shriftni kattalashtirish"
                              >
                                A+
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 6px" }}>
                            "{b.text}"
                          </div>

                          <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>O'zbekcha tarjimasi:</label>
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
            )}
          </div>
        )}

        {/* ================= TAB 2: DOCUMENT TRANSLATION ================= */}
        {activeTab === "document" && (
          <div>
            <div className="card" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="file"
                ref={docInputRef}
                accept=".pdf,.docx,.doc,.txt,.md"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleDocFileSelect(e.target.files[0]);
                }}
              />
              <button className="btn btn-secondary" onClick={() => docInputRef.current?.click()}>
                <Upload size={16} />
                <span>Hujjat yuklash (PDF, DOCX, TXT)</span>
              </button>

              <button
                className="btn btn-primary"
                onClick={handleTranslateDoc}
                disabled={isTranslatingDoc || !docOriginalText.trim()}
              >
                <RotateCw size={16} />
                <span>{isTranslatingDoc ? "Tarjima qilinmoqda..." : "To'liq Tarjima Qilish"}</span>
              </button>

              {docTranslatedText && (
                <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => exportToDocx(docTranslatedText, docFile?.name)}>
                    <Download size={14} /> Word (.docx)
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => exportToPdf(docTranslatedText, docFile?.name)}>
                    <Download size={14} /> PDF (.pdf)
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => exportToTxt(docTranslatedText, docFile?.name)}>
                    <Download size={14} /> TXT
                  </button>
                </div>
              )}
            </div>

            {/* Translation Progress */}
            {isTranslatingDoc && (
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                  {docProgress.status || "Hujjat tarjima qilinmoqda..."}
                </div>
                <div className="progress-bar-simple">
                  <div className="progress-bar-fill" style={{ width: `${docProgress.percent || 30}%` }}></div>
                </div>
              </div>
            )}

            {/* Dual text boxes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong>🇬🇧 Inglizcha matn</strong>
                  {docOriginalText && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(docOriginalText);
                        showToast("Nusxalandi!");
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <textarea
                  style={{
                    width: "100%",
                    height: "380px",
                    padding: "0.8rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--bg-primary)",
                    color: "var(--text-main)",
                    resize: "vertical"
                  }}
                  placeholder="Yuklangan hujjat matni yoki to'g'ridan-to'g'ri inglizcha matn..."
                  value={docOriginalText}
                  onChange={(e) => setDocOriginalText(e.target.value)}
                />
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong>🇺🇿 O'zbekcha tarjima</strong>
                  {docTranslatedText && (
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDocTranslatedText(latinToCyrillic(docTranslatedText));
                          showToast("Kirillga o'girildi");
                        }}
                      >
                        Кирилл
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(docTranslatedText);
                          showToast("Nusxalandi!");
                        }}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  style={{
                    width: "100%",
                    height: "380px",
                    padding: "0.8rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--bg-primary)",
                    color: "var(--text-main)",
                    resize: "vertical"
                  }}
                  placeholder="Tarjima natijasi..."
                  value={docTranslatedText}
                  onChange={(e) => setDocTranslatedText(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
