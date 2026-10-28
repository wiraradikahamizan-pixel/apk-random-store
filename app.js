const SUPABASE_URL = "https://jeqdbauakdkvwtuibdgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TenfH1yB2OuqL0OyNWLsAw_D4Z-uj_v";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const BUCKET_NAME = "apks";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const CATEGORIES = [
  "Game",
  "Aplikasi",
  "Tools",
  "Emulator",
  "Plugin / Mod",
  "DLC / Add-on",
  "Driver",
  "Software PC",
  "Sistem / Firmware",
  "Arsip",
  "Lainnya"
];

const appList = document.getElementById("appList");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

const adminStatus = document.getElementById("adminStatus");
const uploadForm = document.getElementById("uploadForm");

let allApps = [];

function showStatus(message, success = false) {
  if (!adminStatus) return;

  adminStatus.textContent = message;
  adminStatus.style.color = success ? "green" : "crimson";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Ukuran tidak diketahui";

  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
}

function populateCategories() {
  if (categoryFilter) {
    const currentValue = categoryFilter.value;

    categoryFilter.innerHTML =
      '<option value="">Semua Kategori</option>' +
      CATEGORIES.map(category =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    categoryFilter.value = currentValue;
  }

  const uploadCategory = document.getElementById("category");

  if (uploadCategory) {
    const currentValue = uploadCategory.value;

    uploadCategory.innerHTML =
      '<option value="">Pilih Kategori</option>' +
      CATEGORIES.map(category =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    uploadCategory.value = currentValue;
  }
}

async function loadApps() {
  if (appList) {
    appList.innerHTML = "<p>Memuat daftar file...</p>";
  }

  const { data, error } = await supabaseClient
    .from("apps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat daftar:", error);

    if (appList) {
      appList.innerHTML =
        "<p>Gagal memuat file. Periksa koneksi atau pengaturan Supabase.</p>";
    }

    return;
  }

  allApps = data || [];
  renderApps();
}

function renderApps() {
  if (!appList) return;

  const keyword = (searchInput?.value || "").trim().toLowerCase();
  const selectedCategory = categoryFilter?.value || "";

  const filteredApps = allApps.filter(app => {
    const searchableText = [
      app.name,
      app.version,
      app.category,
      app.description,
      app.file_path
    ].join(" ").toLowerCase();

    const matchesKeyword = searchableText.includes(keyword);
    const matchesCategory =
      !selectedCategory || app.category === selectedCategory;

    return matchesKeyword && matchesCategory;
  });

  if (filteredApps.length === 0) {
    appList.innerHTML = "<p>Belum ada file yang cocok.</p>";
    return;
  }

  appList.innerHTML = filteredApps.map(app => {
    const fileName = app.file_path
      ? app.file_path.split("/").pop()
      : app.name || "File";

    const downloadURL = app.file_url || "";

    return `
      <article class="app-card">
        <div class="app-info">
          <span class="file-type">
            ${escapeHTML(getFileExtension(fileName))}
          </span>

          <h3>${escapeHTML(app.name || fileName)}</h3>

          <p>Kategori: ${escapeHTML(app.category || "Lainnya")}</p>

          ${app.version
            ? `<p>Versi: ${escapeHTML(app.version)}</p>`
            : ""}

          <p>${escapeHTML(app.description || "Tidak ada deskripsi.")}</p>

          ${app.file_size
            ? `<p>Ukuran: ${formatSize(app.file_size)}</p>`
            : ""}
        </div>

        ${
          downloadURL
            ? `<a class="download-button"
                 href="${escapeHTML(downloadURL)}"
                 target="_blank"
                 rel="noopener noreferrer"
                 download>
                 Download
               </a>`
            : "<p>Link download tidak tersedia.</p>"
        }
      </article>
    `;
  }).join("");
}

async function uploadFile(event) {
  event.preventDefault();

  const nameInput = document.getElementById("appName");
  const versionInput = document.getElementById("appVersion");
  const categoryInput = document.getElementById("category");
  const descriptionInput = document.getElementById("description");
  const fileInput = document.getElementById("apkFile");

  const name = nameInput?.value.trim() || "";
  const version = versionInput?.value.trim() || "";
  const category = categoryInput?.value || "";
  const description = descriptionInput?.value.trim() || "";
  const file = fileInput?.files?.[0];

  if (!name || !file || !category) {
    showStatus("Isi nama, kategori, dan pilih file.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showStatus("Ukuran file maksimal 100 MB.");
    return;
  }

  if (file.size === 0) {
    showStatus("File kosong tidak bisa diunggah.");
    return;
  }

  showStatus("Sedang mengunggah file...");

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${Date.now()}_${safeFileName}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) {
    console.error("Upload gagal:", uploadError);
    showStatus("Upload gagal. Periksa izin Storage Supabase.");
    return;
  }

  const { data: urlData } = supabaseClient
    .storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  const { error: insertError } = await supabaseClient
    .from("apps")
    .insert({
      name,
      version,
      category,
      description,
      file_path: filePath,
      file_url: urlData.publicUrl,
      file_size: file.size
    });

  if (insertError) {
    console.error("Gagal menyimpan data:", insertError);
    showStatus(
      "File berhasil diunggah, tetapi data gagal disimpan. Periksa kolom tabel dan izin database."
    );
    return;
  }

  showStatus("File berhasil diunggah!", true);

  uploadForm?.reset();

  await loadApps();
}

populateCategories();

if (searchInput) {
  searchInput.addEventListener("input", renderApps);
}

if (categoryFilter) {
  categoryFilter.addEventListener("change", renderApps);
}

if (uploadForm) {
  uploadForm.addEventListener("submit", uploadFile);
}

loadApps();
