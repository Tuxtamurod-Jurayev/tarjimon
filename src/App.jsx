import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  Upload,
  FileText,
  FileCode,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  RotateCw,
  Sparkles,
  ArrowRightLeft,
  Settings,
  Moon,
  Sun,
  Trash2,
  AlertCircle,
  FileCheck,
  Layers,
  History,
  X,
  ExternalLink,
  BookOpen,
  StopCircle
} from "lucide-react";

import { parseDocument } from "./utils/documentParser";
import { translateFullDocument } from "./utils/translator";
import { exportToDocx, exportToPdf, exportToTxt } from "./utils/fileExporter";
import { latinToCyrillic, cyrillicToLatin } from "./utils/transliterate";

export default function App() {
  // Theme (dark / light)
  const [theme, setTheme] = useState(() => localStorage.getItem("tarjima_theme") || "dark");

  // Translation languages
  const [sourceLang, setSourceLang] = useState("en"); // 'en' | 'uz'
  const [targetLang, setTargetLang] = useState("uz"); // 'uz' | 'en'
  const [scriptMode, setScriptMode] = useState("latin"); // 'latin' | 'cyrillic'

  // Input mode: 'file' | 'text'
  const [inputMode, setInputMode] = useState("file");

  // Files & Text state
  const [currentFile, setCurrentFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");

  // Translation process state
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0, status: "" });
  const [abortController, setAbortController] = useState(null);
  const [parsingFile, setParsingFile] = useState(false);

  // Settings & Engine
  const [engine, setEngine] = useState("google"); // 'google' | 'gemini'
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // History state
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tarjima_history") || "[]");
    } catch {
      return [];
    }
  });

  // UI feedback: Toasts & Copied state
  const [toasts, setToasts] = useState([]);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedTranslated, setCopiedTranslated] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  // Apply theme to HTML
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tarjima_theme", theme);
  }, [theme]);

  // Toast Helper
  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Save to history helper
  const saveToHistory = (item) => {
    const newHistory = [
      {
        id: Date.now(),
        fileName: item.fileName || "Qo'lda kiritilgan matn",
        date: new Date().toLocaleString("uz-UZ"),
        sourcePreview: item.original.slice(0, 100),
        translatedPreview: item.translated.slice(0, 100),
        originalFull: item.original,
        translatedFull: item.translated,
        wordCount: item.original.trim().split(/\s+/).length
      },
      ...history.slice(0, 9)
    ];
    setHistory(newHistory);
    localStorage.setItem("tarjima_history", JSON.stringify(newHistory));
  };

  // Toggle Source / Target Languages
  const handleSwapLanguages = () => {
    const tempSource = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(tempSource);

    // Also swap texts if available
    const tempOriginal = originalText;
    setOriginalText(translatedText);
    setTranslatedText(tempOriginal);
    showToast("Tillar yo'nalishi almashtirildi", "info");
  };

  // Handle File Selection & Extraction
  const handleFileProcess = async (file) => {
    if (!file) return;

    setCurrentFile(file);
    setParsingFile(true);
    setProgress({ percent: 0, current: 0, total: 100, status: "Fayl matni o'qilmoqda..." });

    try {
      const result = await parseDocument(file, (p) => {
        setProgress({ percent: 50, current: p.current, total: p.total, status: p.status });
      });

      setOriginalText(result.text);
      setTranslatedText("");
      setFileMetadata({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        pages: result.pageCount || null,
        extension: file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
      });

      showToast(`"${file.name}" muvaffaqiyatli ochildi!`, "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Faylni o'qishda xatolik yuz berdi", "error");
    } finally {
      setParsingFile(false);
    }
  };

  // Dropzone Events
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Execute Full Translation
  const handleStartTranslation = async () => {
    if (!originalText || originalText.trim().length === 0) {
      showToast("Iltimos, avval matn kiriting yoki fayl yuklang!", "error");
      return;
    }

    if (engine === "gemini" && !geminiApiKey.trim()) {
      showToast("Gemini AI rejimi uchun API kalit kiritishingiz kerak yoki Google Translate rejimiga o'ting", "error");
      setShowSettingsModal(true);
      return;
    }

    setIsTranslating(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const translatedResult = await translateFullDocument({
        text: originalText,
        sourceLang,
        targetLang,
        engine,
        geminiApiKey,
        onProgress: (p) => setProgress(p),
        abortSignal: controller.signal
      });

      // Apply Cyrillic script if requested and target is Uzbek
      let finalResult = translatedResult;
      if (targetLang === "uz" && scriptMode === "cyrillic") {
        finalResult = latinToCyrillic(translatedResult);
      }

      setTranslatedText(finalResult);
      saveToHistory({
        fileName: currentFile?.name,
        original: originalText,
        translated: finalResult
      });

      showToast("Hujjat to'liq tarjima qilindi!", "success");
    } catch (err) {
      if (err.message === "Tarjima bekor qilindi.") {
        showToast("Tarjima foydalanuvchi tomonidan bekor qilindi", "info");
      } else {
        console.error("Tarjima xatosi:", err);
        showToast("Tarjima jarayonida xatolik: " + err.message, "error");
      }
    } finally {
      setIsTranslating(false);
      setAbortController(null);
    }
  };

  // Cancel Translation
  const handleCancelTranslation = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsTranslating(false);
    }
  };

  // Script Mode Converter (Lotin <-> Kirill)
  const handleToggleScript = () => {
    if (scriptMode === "latin") {
      setScriptMode("cyrillic");
      if (translatedText && targetLang === "uz") {
        setTranslatedText(latinToCyrillic(translatedText));
        showToast("Kirill yozuviga o'girildi", "info");
      }
    } else {
      setScriptMode("latin");
      if (translatedText && targetLang === "uz") {
        setTranslatedText(cyrillicToLatin(translatedText));
        showToast("Lotin yozuviga o'girildi", "info");
      }
    }
  };

  // Copy to Clipboard
  const handleCopyText = async (text, isOriginal = false) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (isOriginal) {
        setCopiedOriginal(true);
        setTimeout(() => setCopiedOriginal(false), 2000);
      } else {
        setCopiedTranslated(true);
        setTimeout(() => setCopiedTranslated(false), 2000);
      }
      showToast("Matn buferga nusxalandi!", "success");
    } catch {
      showToast("Nusxa olishda xatolik", "error");
    }
  };

  // File Download Handlers
  const handleDownloadDocx = async () => {
    try {
      const fileName = await exportToDocx(
        translatedText,
        currentFile?.name,
        sourceLang === "en" ? "Inglizcha" : "O'zbekcha",
        targetLang === "uz" ? "O'zbekcha" : "Inglizcha"
      );
      showToast(`Word fayl yuklandi: ${fileName}`, "success");
    } catch (err) {
      showToast("Word faylini yaratishda xatolik: " + err.message, "error");
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const fileName = await exportToPdf(
        translatedText,
        currentFile?.name,
        sourceLang === "en" ? "Inglizcha" : "O'zbekcha",
        targetLang === "uz" ? "O'zbekcha" : "Inglizcha"
      );
      showToast(`PDF fayl yuklandi: ${fileName}`, "success");
    } catch (err) {
      showToast("PDF faylini yaratishda xatolik: " + err.message, "error");
    }
  };

  const handleDownloadTxt = () => {
    try {
      const fileName = exportToTxt(translatedText, currentFile?.name);
      showToast(`TXT matn fayli yuklandi: ${fileName}`, "success");
    } catch (err) {
      showToast("TXT faylini yaratishda xatolik: " + err.message, "error");
    }
  };

  // Clear all
  const handleClearAll = () => {
    setCurrentFile(null);
    setFileMetadata(null);
    setOriginalText("");
    setTranslatedText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Tozalandi", "info");
  };

  // Load Sample Text
  const handleLoadSample = () => {
    const sample = `Artificial Intelligence (AI) is transforming the way we work, communicate, and solve global challenges. Modern neural networks can understand human language, translate documents across hundreds of languages, and automate complex workflows.

When translating large technical documents, ensuring linguistic consistency and preserving contextual terminology is essential. This web application splits extensive documents into logical paragraphs and sentences, allowing seamless translation without character limit restrictions.

Key features include:
1. Support for PDF, Word DOCX, and plain text files.
2. Complete end-to-end translation with progress tracking.
3. Exporting translated content directly into formatted Word (.docx) or PDF files.
4. Seamless transliteration between Latin and Cyrillic scripts.

Try uploading your own files or editing this sample text!`;
    setOriginalText(sample);
    setInputMode("text");
    showToast("Namuna matn yuklandi", "info");
  };

  // Word & Char Counters
  const countStats = (txt) => {
    if (!txt) return { words: 0, chars: 0 };
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    const chars = txt.length;
    return { words, chars };
  };

  const origStats = countStats(originalText);
  const transStats = countStats(translatedText);

  return (
    <div className="app-wrapper">
      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === "success" && <Check size={18} color="var(--accent-emerald)" />}
            {toast.type === "error" && <AlertCircle size={18} color="var(--accent-rose)" />}
            {toast.type === "info" && <Sparkles size={18} color="var(--accent-primary)" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="header">
        <div className="container header-inner">
          <div className="brand">
            <div className="brand-icon">
              <Globe size={24} />
            </div>
            <div className="brand-info">
              <h1>
                TarjimaAI <span className="brand-badge">PRO</span>
              </h1>
              <p className="brand-sub">Inglizcha ⇄ O'zbekcha Hujjatlar Tarjimoni</p>
            </div>
          </div>

          <div className="header-actions">
            {/* Script Selector (Latin vs Cyrillic) */}
            <button
              className={`btn-pill ${scriptMode === "cyrillic" ? "active" : ""}`}
              onClick={handleToggleScript}
              title="Lotin va Kirill alifbosiga o'girish"
            >
              <RotateCw size={14} />
              <span>{scriptMode === "latin" ? "Lotin Alifbosi" : "Кирилл Алифбоси"}</span>
            </button>

            {/* Engine Selector */}
            <button
              className={`btn-pill ${engine === "gemini" ? "active" : ""}`}
              onClick={() => setShowSettingsModal(true)}
              title="Tarjima sozlamalari va AI modeli"
            >
              <Sparkles size={14} />
              <span>{engine === "gemini" ? "Gemini AI" : "Tezkor Tarjima"}</span>
            </button>

            {/* History */}
            <button
              className="btn-icon"
              onClick={() => setShowHistoryModal(true)}
              title="Tarjimalar tarixi"
            >
              <History size={18} />
            </button>

            {/* Theme Toggle */}
            <button
              className="btn-icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Mavzuni almashtirish"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ paddingBottom: "3rem" }}>
        {/* Hero Section */}
        <div className="hero-tagline" style={{ marginTop: "1.8rem" }}>
          <h2>
            Hujjatlarni <span className="gradient-text">To'liq va Sifatli</span> Tarjima Qiling
          </h2>
          <p>
            PDF, Word (DOCX) va matnli fayllarni ingliz tilidan o'zbek tiliga cheklovlarsiz to'liq
            tarjima qiling va tayyor fayl sifatida yuklab oling.
          </p>
        </div>

        {/* Language Selection Bar */}
        <div className="lang-selector-bar">
          <div className="lang-box">
            <span className="lang-flag">{sourceLang === "en" ? "🇬🇧" : "🇺🇿"}</span>
            <span>{sourceLang === "en" ? "Ingliz tili (English)" : "O'zbek tili"}</span>
          </div>

          <button
            className="lang-swap-btn"
            onClick={handleSwapLanguages}
            title="Tillar yo'nalishini almashtirish"
          >
            <ArrowRightLeft size={18} />
          </button>

          <div className="lang-box">
            <span className="lang-flag">{targetLang === "uz" ? "🇺🇿" : "🇬🇧"}</span>
            <span>{targetLang === "uz" ? "O'zbek tili" : "Ingliz tili (English)"}</span>
          </div>
        </div>

        {/* Input Mode Tabs */}
        <div className="tabs-control">
          <button
            className={`tab-btn ${inputMode === "file" ? "active" : ""}`}
            onClick={() => setInputMode("file")}
          >
            <Upload size={16} />
            <span>Fayl yuklash (PDF, DOCX, TXT)</span>
          </button>
          <button
            className={`tab-btn ${inputMode === "text" ? "active" : ""}`}
            onClick={() => setInputMode("text")}
          >
            <FileText size={16} />
            <span>Matn kiritish</span>
          </button>
        </div>

        {/* File Dropzone Section */}
        {inputMode === "file" && !currentFile && (
          <div
            className={`dropzone ${isDragOver ? "drag-active" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileProcess(e.target.files[0]);
                }
              }}
              accept=".pdf,.docx,.doc,.txt,.md"
              style={{ display: "none" }}
            />
            <div className="dropzone-icon-wrap">
              <Upload size={32} />
            </div>
            <h3>Faylni bu yerga tashlang yoki tanlash uchun bosing</h3>
            <p>Hujjat hajmi cheklanmagan. Tizim avtomatik sahifalarni to'liq tarjima qiladi.</p>
            <div className="file-pills">
              <span className="file-pill pdf">📄 PDF Hujjat</span>
              <span className="file-pill docx">📝 Word (DOCX)</span>
              <span className="file-pill txt">📑 Oddiy Matn (TXT)</span>
            </div>
          </div>
        )}

        {/* Uploaded File Status Card */}
        {currentFile && fileMetadata && (
          <div className="active-file-card">
            <div className="file-info-group">
              <div
                className={`file-avatar ${
                  fileMetadata.extension.includes("pdf")
                    ? "pdf"
                    : fileMetadata.extension.includes("doc")
                    ? "docx"
                    : "txt"
                }`}
              >
                {fileMetadata.extension.toUpperCase().replace(".", "")}
              </div>
              <div>
                <div className="file-name" title={fileMetadata.name}>
                  {fileMetadata.name}
                </div>
                <div className="file-meta">
                  <span>Hajmi: {fileMetadata.size}</span>
                  {fileMetadata.pages && <span>• {fileMetadata.pages} sahifa</span>}
                  <span>• {origStats.words} ta so'z</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn-pill"
                onClick={() => fileInputRef.current?.click()}
                title="Boshqa fayl tanlash"
              >
                <Upload size={14} />
                <span>O'zgartirish</span>
              </button>
              <button
                className="btn-icon"
                onClick={handleClearAll}
                title="Faylni o'chirish"
                style={{ color: "var(--accent-rose)" }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileProcess(e.target.files[0]);
                }
              }}
              accept=".pdf,.docx,.doc,.txt,.md"
              style={{ display: "none" }}
            />
          </div>
        )}

        {/* Parsing File Indicator */}
        {parsingFile && (
          <div className="progress-card">
            <div className="progress-header">
              <span>{progress.status || "Fayl o'qilmoqda..."}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: "65%" }}></div>
            </div>
          </div>
        )}

        {/* Translation Progress Indicator */}
        {isTranslating && (
          <div className="progress-card">
            <div className="progress-header">
              <span>{progress.status || "Tarjima qilinmoqda..."}</span>
              <span style={{ color: "var(--accent-primary)" }}>{progress.percent}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <div className="progress-footer">
              <span>
                Bo'laklar: {progress.current} / {progress.total}
              </span>
              <button
                onClick={handleCancelTranslation}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  color: "var(--accent-rose)",
                  fontSize: "0.82rem",
                  fontWeight: 600
                }}
              >
                <StopCircle size={14} />
                <span>To'xtatish</span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Action Button Bar */}
        <div className="action-bar">
          <button
            className="btn-primary"
            onClick={handleStartTranslation}
            disabled={isTranslating || parsingFile || !originalText.trim()}
          >
            <Sparkles size={20} />
            <span>
              {isTranslating ? "Tarjima qilinmoqda..." : "To'liq Tarjima Qilish"}
            </span>
          </button>

          {!currentFile && (
            <button className="btn-secondary" onClick={handleLoadSample}>
              <BookOpen size={16} />
              <span>Namuna matn</span>
            </button>
          )}

          {(originalText || translatedText) && (
            <button className="btn-secondary" onClick={handleClearAll}>
              <Trash2 size={16} />
              <span>Tozalash</span>
            </button>
          )}
        </div>

        {/* Dual Editor Workspace (Side-by-Side) */}
        <div className="workspace-grid">
          {/* Left Panel: Original Text */}
          <div className="editor-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span>{sourceLang === "en" ? "🇬🇧 Inglizcha matn" : "🇺🇿 O'zbekcha matn"}</span>
              </div>
              <div className="panel-actions">
                <button
                  className="btn-icon"
                  onClick={() => handleCopyText(originalText, true)}
                  title="Asl matndan nusxa olish"
                >
                  {copiedOriginal ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <textarea
              className="editor-textarea"
              placeholder={
                inputMode === "file"
                  ? "Yuklangan fayl matni bu yerda ko'rinadi yoki to'g'ridan-to'g'ri yozishingiz mumkin..."
                  : "Tarjima qilmoqchi bo'lgan inglizcha matningizni bu yerga yozing yoki joylashtiring..."
              }
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
            />

            <div className="panel-footer">
              <span>{origStats.words} so'z | {origStats.chars} belgi</span>
              <span>Asl manba</span>
            </div>
          </div>

          {/* Right Panel: Translated Text */}
          <div className="editor-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span>{targetLang === "uz" ? "🇺🇿 O'zbekcha tarjima" : "🇬🇧 Inglizcha tarjima"}</span>
                {targetLang === "uz" && (
                  <span className="brand-badge" style={{ cursor: "pointer" }} onClick={handleToggleScript}>
                    {scriptMode === "latin" ? "Lotin" : "Кирилл"}
                  </span>
                )}
              </div>
              <div className="panel-actions">
                {targetLang === "uz" && (
                  <button
                    className="btn-pill"
                    onClick={handleToggleScript}
                    title="Alifboni o'zgartirish (Lotin ⇄ Kirill)"
                  >
                    <RotateCw size={13} />
                    <span>{scriptMode === "latin" ? "Кириллга" : "Lotinga"}</span>
                  </button>
                )}
                <button
                  className="btn-icon"
                  onClick={() => handleCopyText(translatedText, false)}
                  title="Tarjimadan nusxa olish"
                >
                  {copiedTranslated ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <textarea
              className="editor-textarea"
              placeholder="Tarjima qilingan natija bu yerda to'liq shakllanadi..."
              value={translatedText}
              onChange={(e) => setTranslatedText(e.target.value)}
            />

            <div className="panel-footer">
              <span>{transStats.words} so'z | {transStats.chars} belgi</span>
              <span>{translatedText ? "Tayyor" : "Kutilmoqda"}</span>
            </div>
          </div>
        </div>

        {/* Export / Download Section */}
        {translatedText && (
          <div className="export-section">
            <div className="export-header">
              <div>
                <h3>
                  <Download size={22} color="var(--accent-primary)" />
                  <span>Tarjimani Fayl Sifatida Yuklab Olish</span>
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                  Tayyor tarjimani to'liq formatlangan fayllar ko'rinishida saqlang:
                </p>
              </div>
            </div>

            <div className="export-buttons-grid">
              {/* Word Export */}
              <button className="btn-export docx" onClick={handleDownloadDocx}>
                <div className="export-icon">
                  <FileText size={24} />
                </div>
                <div>
                  <div className="export-title">Word Hujjati (.docx)</div>
                  <div className="export-sub">To'liq paragraflar va sarlavhalar bilan</div>
                </div>
              </button>

              {/* PDF Export */}
              <button className="btn-export pdf" onClick={handleDownloadPdf}>
                <div className="export-icon">
                  <FileCode size={24} />
                </div>
                <div>
                  <div className="export-title">PDF Hujjat (.pdf)</div>
                  <div className="export-sub">A4 formatida, sahifalangan qog'oz ko'rinishi</div>
                </div>
              </button>

              {/* TXT Export */}
              <button className="btn-export txt" onClick={handleDownloadTxt}>
                <div className="export-icon">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <div className="export-title">Oddiy Matn (.txt)</div>
                  <div className="export-sub">Universal UTF-8 matn fayli</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Feature Highlights */}
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-box">
              <Layers size={22} />
            </div>
            <div className="feature-text">
              <h4>Katta Hujjatlar Qamrovi</h4>
              <p>O'nlab sahifali PDF va DOCX fayllar avtomatik bo'laklarga ajratilib to'liq tarjima qilinadi.</p>
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">
              <Download size={22} />
            </div>
            <div className="feature-text">
              <h4>Fayl Ko'rinishida Eksport</h4>
              <p>Tarjima natijasini bir marta bosish orqali Word (.docx) yoki PDF formatida yuklab oling.</p>
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">
              <RotateCw size={22} />
            </div>
            <div className="feature-text">
              <h4>Lotin ⇄ Kirill Konvertori</h4>
              <p>O'zbek tilidagi rasmiy hujjatlar uchun bir zumda lotin yoki kirill yozuviga almashtirish imkoni.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal (Gemini API / Engines) */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Tarjima Dvigateli Sozlamalari</h3>
              <button className="btn-icon" onClick={() => setShowSettingsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                Tarjima Turi:
              </label>
              <div style={{ display: "flex", gap: "0.8rem" }}>
                <button
                  className={`btn-pill ${engine === "google" ? "active" : ""}`}
                  style={{ flex: 1, justifyContent: "center", padding: "0.7rem" }}
                  onClick={() => setEngine("google")}
                >
                  ⚡ Tezkor (Bepul, Google)
                </button>
                <button
                  className={`btn-pill ${engine === "gemini" ? "active" : ""}`}
                  style={{ flex: 1, justifyContent: "center", padding: "0.7rem" }}
                  onClick={() => setEngine("gemini")}
                >
                  ✨ Gemini AI (Yuqori sifat)
                </button>
              </div>
            </div>

            {engine === "gemini" && (
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Google Gemini API Kaliti:
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="AIzaSy..."
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    localStorage.setItem("gemini_api_key", e.target.value);
                  }}
                />
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "-0.6rem", marginBottom: "1.2rem" }}>
                  API kalitingiz faqat brauzeringizda (localStorage) xavfsiz saqlanadi. Kalitni{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent-primary)", textDecoration: "underline" }}
                  >
                    Google AI Studio
                  </a>
                  'dan bepul olishingiz mumkin.
                </p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                className="btn-primary"
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem" }}
                onClick={() => {
                  setShowSettingsModal(false);
                  showToast("Sozlamalar saqlandi", "success");
                }}
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" style={{ maxWidth: "650px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Tarjimalar Tarixi</h3>
              <button className="btn-icon" onClick={() => setShowHistoryModal(false)}>
                <X size={18} />
              </button>
            </div>

            {history.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>
                Hozircha saqlangan tarjimalar yo'q.
              </p>
            ) : (
              <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "var(--bg-primary)",
                      padding: "0.9rem 1.1rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-color)",
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setOriginalText(item.originalFull);
                      setTranslatedText(item.translatedFull);
                      setShowHistoryModal(false);
                      showToast(`"${item.fileName}" yuklandi`, "info");
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <strong style={{ fontSize: "0.92rem" }}>{item.fileName}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.date}</span>
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.translatedPreview}...
                    </p>
                  </div>
                ))}
              </div>
            )}

            {history.length > 0 && (
              <div style={{ marginTop: "1.2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  style={{ color: "var(--accent-rose)", fontSize: "0.85rem", fontWeight: 600 }}
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem("tarjima_history");
                    showToast("Tarix tozalandi", "info");
                  }}
                >
                  Tarixni tozalash
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: "0.5rem 1.2rem", fontSize: "0.85rem" }}
                  onClick={() => setShowHistoryModal(false)}
                >
                  Yopish
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>© {new Date().getFullYear()} TarjimaAI — Ingliz tilidan O'zbek tiliga Hujjatlar Tarjimoni</p>
          <p style={{ fontSize: "0.75rem", marginTop: "0.3rem", color: "var(--text-muted)" }}>
            React • Vite • Vercel Ready • GitHub Repository
          </p>
        </div>
      </footer>
    </div>
  );
}
