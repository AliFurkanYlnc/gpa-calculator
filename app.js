// ─── Sabitler ──────────────────────────────────────────────────────────────
const API_URL = "http://127.0.0.1:5000/api/v1/parse";

const GRADE_META = {
  AA: { color: "bg-grade-pass" },
  BA: { color: "bg-grade-pass" },
  BB: { color: "bg-grade-pass" },
  CB: { color: "bg-grade-pass" },
  CC: { color: "bg-grade-pass" },
  DC: { color: "bg-grade-marginal" },
  DD: { color: "bg-grade-marginal" },
  F:  { color: "bg-grade-fail" },
  R:  { color: "bg-grade-pending" },
  ME: { color: "bg-grade-pending" },
};

const LOADING_STEPS = [
  "PDF işleniyor...",
  "Sayfalar taranıyor...",
  "Dersler ayrıştırılıyor...",
  "GPA hesaplanıyor...",
  "Sonuçlar hazırlanıyor...",
];

// ─── DOM Referansları ──────────────────────────────────────────────────────
const uploadScreen  = document.getElementById("upload-screen");
const loadingScreen = document.getElementById("loading-screen");
const resultScreen  = document.getElementById("result-screen");
const errorMsg      = document.getElementById("error-msg");
const errorDetail   = document.getElementById("error-detail");

const dropzone         = document.getElementById("dropzone");
const pdfInput         = document.getElementById("pdf-input");
const fileNameDisplay  = document.getElementById("file-name-display");
const btnUpload        = document.getElementById("btn-upload");
const uploadError      = document.getElementById("upload-error");
const loadingStep      = document.getElementById("loading-step");
const btnReset         = document.getElementById("btn-reset");
const headerLabel      = document.getElementById("header-label");

// ─── Ekran Geçişleri ───────────────────────────────────────────────────────
const showScreen = (name) => {
  uploadScreen.classList.add("hidden");
  uploadScreen.classList.remove("flex");
  loadingScreen.classList.add("hidden");
  loadingScreen.classList.remove("flex");
  resultScreen.classList.add("hidden");
  errorMsg.classList.add("hidden");

  if (name === "upload")  { uploadScreen.classList.remove("hidden");  uploadScreen.classList.add("flex"); }
  if (name === "loading") { loadingScreen.classList.remove("hidden"); loadingScreen.classList.add("flex"); }
  if (name === "result")  { resultScreen.classList.remove("hidden"); }
  if (name === "error")   { errorMsg.classList.remove("hidden"); }

  const showReset = name === "result" || name === "error";
  btnReset.classList.toggle("hidden", !showReset);
  headerLabel.classList.toggle("hidden", showReset);
};

// ─── Loading Adım Animasyonu ───────────────────────────────────────────────
let stepInterval = null;

const startLoadingAnimation = () => {
  let i = 0;
  loadingStep.textContent = LOADING_STEPS[0];
  stepInterval = setInterval(() => {
    i = (i + 1) % LOADING_STEPS.length;
    loadingStep.textContent = LOADING_STEPS[i];
  }, 900);
};

const stopLoadingAnimation = () => {
  clearInterval(stepInterval);
  stepInterval = null;
};

// ─── Dosya Seçimi Yönetimi ─────────────────────────────────────────────────
let selectedFile = null;

const handleFileSelect = (file) => {
  if (!file || !file.name.endsWith(".pdf")) {
    uploadError.textContent = "Lütfen geçerli bir .pdf dosyası seçin.";
    uploadError.classList.remove("hidden");
    btnUpload.disabled = true;
    selectedFile = null;
    return;
  }
  uploadError.classList.add("hidden");
  selectedFile = file;
  fileNameDisplay.textContent = `📄 ${file.name}`;
  fileNameDisplay.classList.remove("hidden");
  btnUpload.disabled = false;
};

pdfInput.addEventListener("change", (e) => {
  handleFileSelect(e.target.files[0] ?? null);
});

// Drag & Drop
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("border-gold/50", "bg-white/5");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("border-gold/50", "bg-white/5");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("border-gold/50", "bg-white/5");
  handleFileSelect(e.dataTransfer.files[0] ?? null);
});

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") pdfInput.click();
});

// ─── Reset ─────────────────────────────────────────────────────────────────
btnReset.addEventListener("click", () => {
  selectedFile = null;
  pdfInput.value = "";
  fileNameDisplay.classList.add("hidden");
  btnUpload.disabled = true;
  uploadError.classList.add("hidden");
  showScreen("upload");
});

// ─── API Çağrısı ───────────────────────────────────────────────────────────
const uploadAndParse = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(API_URL, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `Sunucu hatası: ${response.status}`);
  }

  return data;
};

// ─── Render Yardımcıları ───────────────────────────────────────────────────
const getGradeMeta = (note) => GRADE_META[note] ?? { color: "bg-slate-600" };

const gpaColor = (gpa) => {
  if (gpa === 0)  return "text-slate-600";
  if (gpa < 1.5)  return "text-grade-fail";
  if (gpa < 2.0)  return "text-grade-marginal";
  return "text-grade-pass";
};

const renderStudentInfo = (info, genelGpa) => {
  document.getElementById("student-name").textContent = info.ad_soyad;
  document.getElementById("student-no").textContent   = info.ogrenci_no;
  const gpaEl = document.getElementById("genel-gpa");
  gpaEl.textContent = genelGpa.toFixed(2);
  gpaEl.className   = `font-display text-4xl font-extrabold ${gpaColor(genelGpa)}`;
};

const renderTimeline = (donemler) => {
  const container = document.getElementById("gpa-timeline");
  const BAR_MAX   = 80;
  container.innerHTML = donemler.map((d) => {
    const gpa    = d.donem_sonu_gpa;
    const height = gpa > 0 ? Math.round((gpa / 4.0) * BAR_MAX) : 4;
    const color  = gpaColor(gpa);
    const label  = d.donem_adi.replace(/\d{4} - \d{4} /, "").trim();
    return `
      <div class="flex flex-col items-center gap-1 min-w-fit cursor-default group"
           title="${d.donem_adi} — GPA: ${gpa.toFixed(2)}">
        <span class="text-xs font-mono ${color} font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          ${gpa.toFixed(2)}
        </span>
        <div class="w-8 sm:w-10 rounded-t-sm transition-all duration-500 ${gpa > 0 ? color.replace("text-", "bg-") : "bg-slate-800"}"
             style="height:${height}px;" role="presentation"></div>
        <span class="text-[9px] sm:text-xs text-slate-500 text-center leading-tight max-w-[56px] sm:max-w-[72px]">
          ${label}
        </span>
      </div>`;
  }).join("");
};

const renderCourseRow = (ders) => {
  const meta     = getGradeMeta(ders.harf_notu);
  const isRepeat = ders.durum === "Repeat";
  return `
    <tr class="border-t border-white/5 hover:bg-white/5 transition-colors duration-150 ${isRepeat ? "opacity-60" : ""}">
      <td class="py-3 px-5 text-xs text-slate-400 font-mono whitespace-nowrap">
        ${ders.bolum} ${ders.kod}
        ${isRepeat ? `<span class="ml-1 text-[9px] text-grade-repeat uppercase tracking-wider border border-grade-repeat/40 px-1 py-0.5 rounded-sm">Tekrar</span>` : ""}
      </td>
      <td class="py-3 pr-4 text-xs text-slate-200 leading-snug">${ders.ad}</td>
      <td class="py-3 pr-4 text-xs text-slate-400 text-right tabular-nums">${ders.kredi}</td>
      <td class="py-3 pr-5 text-right">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono text-obsidian ${meta.color}">
          ${ders.harf_notu}
        </span>
      </td>
    </tr>`;
};

const renderSemester = (donem) => {
  const gpa      = donem.donem_sonu_gpa;
  const spa      = donem.donem_spa;
  const rows     = donem.dersler.length
    ? donem.dersler.map(renderCourseRow).join("")
    : `<tr><td colspan="4" class="py-6 text-center text-slate-600 text-xs italic">Bu dönemde kayıtlı ders bulunmamaktadır.</td></tr>`;

  return `
    <article class="rounded-xl border border-white/10 bg-surface overflow-hidden"
             aria-label="${donem.donem_adi} dönemi">
      <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 bg-white/5 border-b border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-1 h-6 rounded-sm bg-gold opacity-60"></div>
          <h3 class="font-display text-sm font-bold text-slate-100 tracking-wide">${donem.donem_adi}</h3>
          <span class="text-xs text-slate-500 font-mono">${donem.dersler.length} ders</span>
        </div>
        <div class="flex gap-6 text-right pl-4 sm:pl-0">
          <div>
            <p class="text-[10px] text-slate-500 uppercase tracking-widest">Dönem GPA</p>
            <p class="font-display font-extrabold text-lg ${gpaColor(gpa)}">${gpa.toFixed(2)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-500 uppercase tracking-widest">Dönem SPA</p>
            <p class="font-display font-extrabold text-lg ${gpaColor(spa)}">${spa.toFixed(2)}</p>
          </div>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-left" aria-label="${donem.donem_adi} ders listesi">
          <thead>
            <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
              <th class="px-5 py-3 font-medium">Kod</th>
              <th class="py-3 font-medium">Ders Adı</th>
              <th class="py-3 pr-4 font-medium text-right">Kredi</th>
              <th class="py-3 pr-5 font-medium text-right">Not</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
};

// ─── Ana Render ────────────────────────────────────────────────────────────
const renderData = (data) => {
  renderStudentInfo(data.ogrenci_bilgileri, data.genel_gpa);
  renderTimeline(data.donemler);
  document.getElementById("semester-list").innerHTML =
    data.donemler.map(renderSemester).join("");
};

// ─── Upload Tetikleyici ────────────────────────────────────────────────────
btnUpload.addEventListener("click", async () => {
  if (!selectedFile) return;

  showScreen("loading");
  startLoadingAnimation();

  try {
    const data = await uploadAndParse(selectedFile);
    stopLoadingAnimation();
    renderData(data);
    showScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    stopLoadingAnimation();
    console.error("API Hatası:", err);
    errorDetail.textContent = err.message;
    showScreen("error");
  }
});

// ─── Başlangıç ─────────────────────────────────────────────────────────────
showScreen("upload");