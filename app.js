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

const $ = id => document.getElementById(id);

const searchInput = $("search");
const grid = $("grid");
const filters = $("filters");
const count = $("count");
const notice = $("notice");

const adminDialog = $("adminDialog");
const loginPanel = $("loginPanel");
const uploadPanel = $("uploadPanel");
const adminStatus = $("adminStatus");

let allApps = [];
let activeCategory = "Semua";
let currentUser = null;
let isUploading = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function setNotice(message) {
  if (notice) notice.textContent = message;
}

function setAdminStatus(message, success = false) {
  if (!adminStatus) return;

  adminStatus.textContent = message;
  adminStatus.style.color = success ? "green" : "crimson";
}

function formatSize(bytes) {
  const size = Number(bytes);

  if (!Number.isFinite(size)) return "Ukuran tidak diketahui";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(fileName) {
  const name = String(fileName || "");
  const dot = name.lastIndexOf(".");

  return dot >= 0
    ? name.slice(dot + 1).toUpperCase()
    : "FILE";
}

function getFileName(app) {
  return app.file_path
    ? app.file_path.split("/").pop()
    : app.name || "File";
}

function renderApps() {
  if (!grid) return;

  const keyword = (searchInput?.value || "").trim().toLowerCase();

  const results = allApps.filter(app => {
    const matchesCategory =
      activeCategory === "Semua" ||
      (app.category || "Lainnya") === activeCategory;

    const text = [
      app.name,
      app.version,
      app.category,
      app.description,
      getFileName(app)
    ].join(" ").toLowerCase();

    return matchesCategory && text.includes(keyword);
  });

  if (count) {
    count.textContent = `${results.length} file ditemukan`;
  }

  if (!results.length) {
    grid.innerHTML = '<div class="empty">Belum ada file yang cocok.</div>';
    return;
  }

  grid.innerHTML = results.map(app => {
    const fileName = getFileName(app);
    const downloadURL = app.file_url || "";

    return `
      <article class="app-card">
        <div class="app-info">
          <span class="file-type">${escapeHTML(getExtension(fileName))}</span>
          <h3>${escapeHTML(app.name || fileName)}</h3>
          <p>Kategori: ${escapeHTML(app.category || "Lainnya")}</p>
          ${app.version
            ? `<p>Versi: ${escapeHTML(app.version)}</p>`
            : ""}
          <p>${escapeHTML(app.description || "Tidak ada deskripsi.")}</p>
          ${app.file_size != null
            ? `<p>Ukuran: ${formatSize(app.file_size)}</p>`
            : ""}
        </div>

        ${
          downloadURL
            ? `<a class="download-button"
                 href="${escapeHTML(downloadURL)}"
                 target="_blank"
                 rel="noopener noreferrer"
                 download>Download</a>`
            : "<p>Link download tidak tersedia.</p>"
        }
      </article>
    `;
  }).join("");
}

async function loadApps() {
  if (grid) {
    grid.innerHTML = '<div class="empty">Memuat koleksi...</div>';
  }

  const { data, error } = await supabaseClient
    .from("apps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat katalog:", error);

    if (grid) {
      grid.innerHTML =
        '<div class="empty">Gagal memuat katalog. Periksa koneksi dan izin Supabase.</div>';
    }

    if (count) count.textContent = "Katalog gagal dimuat";
    return;
  }

  allApps = data || [];
  renderApps();
}

function setCategory(category) {
  activeCategory = category;

  filters?.querySelectorAll(".chip").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.category === category
    );
  });

  renderApps();
}

async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Gagal memeriksa sesi:", error);
  }

  currentUser = data?.session?.user || null;
  updateAdminPanel();
}

function updateAdminPanel() {
  const loggedIn = Boolean(currentUser);

  if (loginPanel) loginPanel.hidden = loggedIn;
  if (uploadPanel) uploadPanel.hidden = !loggedIn;

  if (loggedIn) {
    setAdminStatus(`Login sebagai ${currentUser.email || "admin"}`, true);
  } else {
    setAdminStatus("");
  }
}

async function loginAdmin() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setAdminStatus("Masukkan email dan password.");
    return;
  }

  $("loginBtn").disabled = true;
  setAdminStatus("Sedang masuk...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    updateAdminPanel();
    setAdminStatus("Login berhasil.", true);
  } catch (error) {
    console.error("Login gagal:", error);
    setAdminStatus("Login gagal. Periksa email dan password.");
  } finally {
    $("loginBtn").disabled = false;
  }
}

async function logoutAdmin() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Logout gagal:", error);
    setAdminStatus("Gagal keluar dari akun.");
    return;
  }

  currentUser = null;
  updateAdminPanel();
  setAdminStatus("Berhasil keluar.", true);
}

async function uploadFile() {
  if (isUploading) return;

  if (!currentUser) {
    setAdminStatus("Login admin terlebih dahulu.");
    return;
  }

  const name = $("appName")?.value.trim() || "";
  const version = $("version")?.value.trim() || "";
  const category = $("category")?.value || "";
  const description = $("description")?.value.trim() || "";
  const file = $("apkFile")?.files?.[0];

  if (!name || !category || !file) {
    setAdminStatus("Isi nama, kategori, dan pilih file.");
    return;
  }

  if (file.size === 0) {
    setAdminStatus("File kosong tidak bisa diunggah.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setAdminStatus("Ukuran file maksimal 100 MB.");
    return;
  }

  // Tidak ada validasi ekstensi APK.
  // Semua ekstensi file diizinkan oleh JavaScript ini.

  isUploading = true;
  $("uploadBtn").disabled = true;
  setAdminStatus("Sedang mengunggah file...");

  let uploadedPath = null;

  try {
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

    if (uploadError) throw uploadError;

    uploadedPath = filePath;

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
      // Hapus file yang telanjur diunggah agar tidak menjadi file yatim.
      await supabaseClient.storage
        .from(BUCKET_NAME)
        .remove([uploadedPath]);

      throw insertError;
    }

    $("appName").value = "";
    $("version").value = "";
    $("description").value = "";
    $("apkFile").value = "";

    setAdminStatus("File berhasil diunggah!", true);

    await loadApps();
  } catch (error) {
    console.error("Upload gagal:", error);
    setAdminStatus(
      "Upload gagal. Periksa izin Storage, kebijakan database, dan kolom tabel."
    );
  } finally {
    isUploading = false;
    $("uploadBtn").disabled = false;
  }
}

// Pencarian katalog.
searchInput?.addEventListener("input", renderApps);

// Filter kategori.
filters?.addEventListener("click", event => {
  const button = event.target.closest("[data-category]");

  if (!button) return;

  setCategory(button.dataset.category);
});

// Buka panel admin.
$("adminOpen")?.addEventListener("click", async () => {
  if (typeof adminDialog.showModal === "function") {
    adminDialog.showModal();
  }

  await checkSession();
});

// Login, upload, dan logout.
$("loginBtn")?.addEventListener("click", loginAdmin);
$("uploadBtn")?.addEventListener("click", uploadFile);
$("logoutBtn")?.addEventListener("click", logoutAdmin);

// Enter di kolom password menjalankan login.
$("password")?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    loginAdmin();
  }
});

// Perbarui status sesi ketika autentikasi berubah.
supabaseClient.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  updateAdminPanel();
});

// Jalankan aplikasi.
checkSession();
loadApps();
