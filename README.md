# 🌐 TarjimaAI PRO — Ingliz tilidan O'zbek tiliga Hujjatlar Tarjimoni

Zamonaviy, tezkor va professional hujjatlar tarjimoni. Ushbu web-dastur orqali **PDF**, **Word (.docx)** va matnli fayllarni hech qanday cheklovlarsiz to'liq tarjima qilib, tayyor **Word (.docx)**, **PDF** yoki **TXT** fayl ko'rinishida yuklab olishingiz mumkin.

---

## 🚀 Asosiy Imkoniyatlari

1. **Turli formatdagi fayllarni qabul qilish**:
   - 📄 **PDF** (sahifalab matn ajratib olish va tartibni saqlash)
   - 📝 **Word (.docx)** (paragraflar va sarlavhalar bilan)
   - 📑 **Oddiy matn (.txt, .md)**
   - ✍️ Matnni to'g'ridan-to'g'ri qo'lda yozish yoki joylashtirish

2. **To'liq va Cheklovlarsiz Tarjima**:
   - Katta hajmdagi hujjatlarni aqlli bo'laklarga (chunks) ajratib, ketma-ket to'liq tarjima qilish.
   - Real vaqt rejimida jarayon foizini (progress bar) va qaysi bo'lak tarjima qilinayotganini ko'rsatish.
   - Bepul tezkor dvigatel (Google Translate) + xohlovchilar uchun Gemini AI integratsiyasi.

3. **Fayl Ko'rinishida Yuklab Olish (Eksport)**:
   - 📘 **Word Hujjati (.docx)** — Sarlavhalar va 1.5 interval paragraflari bilan.
   - 📕 **PDF Hujjati (.pdf)** — A4 formatida, tartibli qog'oz ko'rinishida.
   - 📄 **Oddiy Matn (.txt)** — Universal UTF-8 matn fayli.
   - 📋 Bir marta bosish orqali nusxa olish (Clipboard).

4. **O'zbekcha Lotin ⇄ Kirill Konvertori**:
   - Tarjima qilingan matnni bir zumda lotin yoki kirill alifbosiga o'girish imkoni.

5. **Aesthetics & UX**:
   - Radiant Dark & Light rejimlar.
   - Glassmorphism va zamonaviy neon gradientlar.
   - Brauzer xotirasida (localStorage) so'nggi tarjimalar tarixi.

---

## 🛠️ O'rnatish va Ishga Tushirish

### 1. Loyihani yuklab olish va paketlarni o'rnatish:
```bash
git clone <sizning-github-repo-linki>
cd tarjima
npm install
```

### 2. Dasturni lokal muhitda ishga tushirish:
```bash
npm run dev
```
Brauzerda `http://localhost:5173` manzilini oching.

### 3. Production build qilish:
```bash
npm run build
```

---

## 📦 GitHub va Vercel'ga Joylash (Deploy)

### 1. GitHub'ga yuklash:
```bash
git add .
git commit -m "feat: TarjimaAI dasturi to'liq tayyorlandi"
git branch -M main
git remote add origin https://github.com/<sizning-profilingiz>/tarjima.git
git push -u origin main
```

### 2. Vercel'ga ulash (1 daqiqada):
1. [Vercel.com](https://vercel.com) saytiga kiring.
2. **"Add New Project"** tugmasini bosing va GitHub profilingizdagi `tarjima` omborini tanlang.
3. Build nastroykalari avtomatik aniqlanadi (`Vite`).
4. **"Deploy"** tugmasini bosing!
5. Loyiha bir zumda butun dunyoga bepul e'lon qilinadi (`https://tarjima-xxx.vercel.app`).

---

## 💻 Texnologiyalar

- **React 19** & **Vite**
- **Vanilla Modern CSS** (Glassmorphism & Radiant design system)
- **Mammoth.js** (Word .docx fayllarni o'qish)
- **PDF.js** (PDF hujjatlardan sahifama-sahifa matn ajratish)
- **Docx** (Word fayllarni generatsiya qilish)
- **jsPDF** (A4 formatdagi PDF fayllarni generatsiya qilish)
- **Lucide Icons**
