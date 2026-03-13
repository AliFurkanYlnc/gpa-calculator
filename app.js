// ─── Sabitler ──────────────────────────────────────────────────────────────
const API_URL = "https://gpa-calculator-bitj.onrender.com/api/v1/parse";

const GRADE_META = {
  AA: { color: "bg-grade-pass"     },
  BA: { color: "bg-grade-pass"     },
  BB: { color: "bg-grade-pass"     },
  CB: { color: "bg-grade-pass"     },
  CC: { color: "bg-grade-pass"     },
  DC: { color: "bg-grade-marginal" },
  DD: { color: "bg-grade-marginal" },
  F:  { color: "bg-grade-fail"     },
  R:  { color: "bg-grade-pending"  },
  ME: { color: "bg-grade-pending"  },
};

// ─── TASK 1: Kredi Hesaplama ───────────────────────────────────────────────
// Notlar bu kümedeyse tamamlanmış kredi sayılmaz
const INCOMPLETE_GRADES = new Set(["F", "W", "NP", "U", "-", "R"]);

/**
 * calculateCredits(dersler)
 * @param   {Array}  dersler  - Dönem ders dizisi
 * @returns {{ alinan: number, tamamlanan: number }}
 *   alinan       → Tüm derslerin kredi toplamı
 *   tamamlanan   → Yalnızca geçilen derslerin kredi toplamı
 *                  (F, W, NP, U, -, R notlu dersler hariç)
 */
const calculateCredits = (dersler) => {
  let alinan      = 0;
  let tamamlanan  = 0;
  for (const ders of dersler) {
    const kredi = Number(ders.kredi) || 0;
    alinan += kredi;
    if (!INCOMPLETE_GRADES.has(ders.harf_notu)) {
      tamamlanan += kredi;
    }
  }
  return { alinan, tamamlanan };
};

const LOADING_STEPS = [
  "PDF işleniyor...",
  "Sayfalar taranıyor...",
  "Dersler ayrıştırılıyor...",
  "GPA hesaplanıyor...",
  "Sonuçlar hazırlanıyor...",
];

// ─── DOM Referansları ──────────────────────────────────────────────────────
const uploadScreen    = document.getElementById("upload-screen");
const loadingScreen   = document.getElementById("loading-screen");
const resultScreen    = document.getElementById("result-screen");
const errorMsg        = document.getElementById("error-msg");
const errorDetail     = document.getElementById("error-detail");
const dropzone        = document.getElementById("dropzone");
const pdfInput        = document.getElementById("pdf-input");
const fileNameDisplay = document.getElementById("file-name-display");
const btnUpload       = document.getElementById("btn-upload");
const uploadError     = document.getElementById("upload-error");
const loadingStep     = document.getElementById("loading-step");
const btnReset        = document.getElementById("btn-reset");
const headerLabel     = document.getElementById("header-label");
const themeToggle     = document.getElementById("theme-toggle");

// ─── Tema Değiştirici ─────────────────────────────────────────────────────
// 1. Sayfa yüklendiğinde kullanıcının son seçimini kontrol et
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

// 2. Butona tıklandığında temayı değiştir ve hafızaya kaydet
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch (_) {}
  });
}

// ─── Ekran Yönetimi ────────────────────────────────────────────────────────
const showScreen = (name) => {
  uploadScreen.classList.add("hidden");    uploadScreen.classList.remove("flex");
  loadingScreen.classList.add("hidden");   loadingScreen.classList.remove("flex");
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

// ─── Loading Animasyonu ────────────────────────────────────────────────────
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

// ─── Dosya Seçimi ──────────────────────────────────────────────────────────
let selectedFile = null;

const handleFileSelect = (file) => {
  if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
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

pdfInput.addEventListener("change", (e) => handleFileSelect(e.target.files[0] ?? null));

// border-blue-500/50 — resolved token (border-primary/50 was undefined)
dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); dropzone.classList.add("border-blue-500/50", "bg-slate-100"); });
dropzone.addEventListener("dragleave", ()  => { dropzone.classList.remove("border-blue-500/50", "bg-slate-100"); });
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("border-blue-500/50", "bg-slate-100");
  handleFileSelect(e.dataTransfer.files[0] ?? null);
});
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") pdfInput.click(); });

// ─── Reset ─────────────────────────────────────────────────────────────────
btnReset.addEventListener("click", () => {
  selectedFile = null;
  pdfInput.value = "";
  fileNameDisplay.classList.add("hidden");
  fileNameDisplay.textContent = "";
  btnUpload.disabled = true;
  uploadError.classList.add("hidden");
  showScreen("upload");
});

// ─── API Çağrısı ───────────────────────────────────────────────────────────
const uploadAndParse = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(API_URL, { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Sunucu hatası: ${response.status}`);
  return data;
};

// ─── Renk Yardımcıları ─────────────────────────────────────────────────────
const getGradeMeta = (note) => GRADE_META[note] ?? { color: "bg-slate-400" };

// text- sınıfı (GPA sayısı için)
const gpaTextColor = (gpa) => {
  if (gpa === 0) return "text-slate-400 dark:text-slate-600";
  if (gpa < 1.5) return "text-grade-fail";
  if (gpa < 2.0) return "text-grade-marginal";
  return "text-grade-pass";
};

// bg- sınıfı (timeline bar için)
const gpaBarColor = (gpa) => {
  if (gpa === 0) return "bg-slate-200 dark:bg-slate-700";
  if (gpa < 1.5) return "bg-grade-fail";
  if (gpa < 2.0) return "bg-grade-marginal";
  return "bg-grade-pass";
};

// ─── Öğrenci Bilgisi ───────────────────────────────────────────────────────
const renderStudentInfo = (info, genelGpa) => {
  document.getElementById("student-name").textContent = info.ad_soyad;
  document.getElementById("student-no").textContent   = info.ogrenci_no;

  // font-mono + tabular-nums → tüm rakamlar eşit yükseklikte, aynı baseline
  const gpaEl = document.getElementById("genel-gpa");
  gpaEl.textContent = genelGpa.toFixed(2);
  gpaEl.className   = `font-mono tabular-nums text-5xl font-bold leading-none ${gpaTextColor(genelGpa)}`;

  // Dinamik badge — undefined token'lar çözüldü: danger→red-600, secondary→violet-500
  const badgeEl = document.getElementById("danger-badge");
  if (genelGpa > 0 && genelGpa < 2.0) {
    badgeEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 bg-red-600/10 border border-red-600/30 text-red-600
                   text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full">
        <span class="w-1.5 h-1.5 rounded-full bg-red-600 inline-block animate-pulse"></span>
        Akademik Risk
      </span>`;
  } else if (genelGpa >= 3.0) {
    badgeEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/30 text-violet-500
                   text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full">
        <span class="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block"></span>
        Onur Listesi
      </span>`;
  } else {
    badgeEl.innerHTML = "";
  }
};

// ─── GPA Zaman Çizelgesi ──────────────────────────────────────────────────
const renderTimeline = (donemler) => {
  const container = document.getElementById("gpa-timeline");
  const BAR_MAX   = 80; // px — maksimum bar yüksekliği

  container.innerHTML = donemler.map((d) => {
    const gpa    = d.donem_sonu_gpa;
    const height = gpa > 0 ? Math.max(4, Math.round((gpa / 4.0) * BAR_MAX)) : 4;
    const label  = d.donem_adi.replace(/\d{4} - \d{4} /, "").trim();

    return `
      <div
        class="flex flex-col items-center gap-1 cursor-default group"
        title="${d.donem_adi} — GPA: ${gpa.toFixed(2)}"
      >
        <span class="text-xs font-mono tabular-nums ${gpaTextColor(gpa)} font-bold
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200 leading-none">
          ${gpa.toFixed(2)}
        </span>

        <!-- Bar: flex-col + justify-end → bar tabanı sabit, yukarı büyür -->
        <div class="flex flex-col justify-end" style="height:${BAR_MAX}px;">
          <div
            class="w-8 sm:w-10 rounded-t-sm transition-all duration-500 ${gpaBarColor(gpa)}"
            style="height:${height}px;"
            role="presentation"
          ></div>
        </div>

        <!-- Etiket: min-h sabit → tüm bar'lar aynı baseline'da hizalanır -->
        <span class="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500
                     text-center leading-tight w-12 sm:w-14 min-h-[2.5rem]
                     flex items-start justify-center pt-0.5">
          ${label}
        </span>
      </div>`;
  }).join("");
};

// ─── TASK 2: Ders Satırı — table-fixed ile kilitli sütun genişlikleri ─────
// Sütun dağılımı: Kod w-[20%] | Ders Adı w-[50%] | Kredi w-[15%] | Not w-[15%]
const renderCourseRow = (ders) => {
  const meta     = getGradeMeta(ders.harf_notu);
  const isRepeat = ders.durum === "Repeat";
  return `
    <tr class="border-t border-slate-100 dark:border-white/5
               hover:bg-slate-50 dark:hover:bg-white/5
               transition-colors duration-150 ${isRepeat ? "opacity-60" : ""}">

      <!-- Kod — w-[20%] -->
      <td class="w-[20%] px-5 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono
                 overflow-hidden text-ellipsis whitespace-nowrap">
        ${ders.bolum} ${ders.kod}
        ${isRepeat
          ? `<span class="ml-1 text-[9px] text-grade-repeat uppercase tracking-wider
                          border border-grade-repeat/40 px-1 py-0.5 rounded-sm">Tekrar</span>`
          : ""}
      </td>

      <!-- Ders Adı — w-[50%] -->
      <td class="w-[50%] px-5 py-3 text-xs text-slate-700 dark:text-slate-200 leading-snug">
        ${ders.ad}
      </td>

      <!-- Kredi — w-[15%] -->
      <td class="w-[15%] px-5 py-3 text-xs text-slate-500 dark:text-slate-400
                 text-right tabular-nums font-mono">
        ${Number(ders.kredi).toFixed(1)}
      </td>

      <!-- Not — w-[15%] -->
      <td class="w-[15%] px-5 py-3 text-right">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono tabular-nums
                     text-slate-900 ${meta.color}">
          ${ders.harf_notu}
        </span>
      </td>
    </tr>`;
};

// ─── TASK 2 & 3: Dönem Kartı ──────────────────────────────────────────────
const renderSemester = (donem) => {
  const gpa  = donem.donem_sonu_gpa;
  const spa  = donem.donem_spa;

  // TASK 1 + 3: Kredi hesapla, başlığa enjekte et
  const { alinan, tamamlanan } = calculateCredits(donem.dersler);

  const rows = donem.dersler.length
    ? donem.dersler.map(renderCourseRow).join("")
    : `<tr><td colspan="4" class="py-6 text-center text-slate-400 dark:text-slate-600 text-xs italic">
         Bu dönemde kayıtlı ders bulunmamaktadır.
       </td></tr>`;

  // Shared number class for GPA / SPA stats
  const statNumClass = `font-mono tabular-nums font-bold text-lg leading-none`;

  return `
    <article
      class="rounded-xl border border-slate-200 dark:border-white/10
             bg-white dark:bg-surface overflow-hidden"
      aria-label="${donem.donem_adi} dönemi"
    >
      <!-- ── Kart başlığı ── -->
      <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
                     px-5 py-4 bg-slate-50 dark:bg-white/5
                     border-b border-slate-200 dark:border-white/10">

        <!-- Sol: dönem adı + ders sayısı -->
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-1 h-6 rounded-sm bg-blue-500 opacity-70 shrink-0"></div>
          <h3 class="font-display text-sm font-bold text-slate-900 dark:text-slate-100 tracking-wide truncate">
            ${donem.donem_adi}
          </h3>
          <span class="text-xs text-slate-400 dark:text-slate-500 font-mono shrink-0">
            ${donem.dersler.length} ders
          </span>
        </div>

        <!-- Sağ: GPA / SPA / Alınan / Tamamlanan -->
        <div class="flex flex-wrap gap-5 sm:gap-6 text-right pl-4 sm:pl-0 shrink-0">

          <div>
            <p class="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Dönem GPA
            </p>
            <p class="${statNumClass} ${gpaTextColor(gpa)}">${gpa.toFixed(2)}</p>
          </div>

          <div>
            <p class="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Dönem SPA
            </p>
            <p class="${statNumClass} ${gpaTextColor(spa)}">${spa.toFixed(2)}</p>
          </div>

          <!-- TASK 3: Alınan kredi -->
          <div>
            <p class="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Alınan
            </p>
            <p class="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-300 leading-none">
              ${alinan.toFixed(1)}
            </p>
          </div>

          <!-- TASK 3: Tamamlanan kredi -->
          <div>
            <p class="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Tamamlanan
            </p>
            <p class="font-mono text-sm tabular-nums leading-none
                      ${tamamlanan < alinan ? "text-grade-marginal" : "text-grade-pass"}">
              ${tamamlanan.toFixed(1)}
            </p>
          </div>

        </div>
      </header>

      <!-- TASK 2: table-fixed + min-w-[600px] → sütun genişlikleri kilitli -->
      <div class="overflow-x-auto">
        <table class="table-fixed min-w-[600px] w-full text-left"
               aria-label="${donem.donem_adi} ders listesi">
          <colgroup>
            <col class="w-[20%]" />
            <col class="w-[50%]" />
            <col class="w-[15%]" />
            <col class="w-[15%]" />
          </colgroup>
          <thead>
            <tr class="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500
                       border-b border-slate-100 dark:border-white/5">
              <th class="w-[20%] px-5 py-3 font-medium text-left">Kod</th>
              <th class="w-[50%] px-5 py-3 font-medium text-left">Ders Adı</th>
              <th class="w-[15%] px-5 py-3 font-medium text-right">Kredi</th>
              <th class="w-[15%] px-5 py-3 font-medium text-right">Not</th>
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

// ─── Upload Handler ────────────────────────────────────────────────────────
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