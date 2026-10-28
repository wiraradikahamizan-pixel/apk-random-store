const SUPABASE_URL = "https://jeqdbauakdkvwtuibdgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TenfH1yB2OuqL0OyNWLsAw_D4Z-uj_v";

const BUCKET_NAME = "apks";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const CATEGORIES = [
  "Game", "Aplikasi", "Tools", "Emulator", "Plugin / Mod",
  "DLC / Add-on", "Driver", "Software PC",
  "Sistem / Firmware", "Arsip", "Lainnya"
];

const $ = id => document.getElementById(id);

let supabaseClient = null;
let allApps = [];
let activeCategory = "Semua";
let currentUser = null;
let isUploading = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[char]);
}

function setNotice(message) {
  const element = $("notice");
  if (element) element.textContent = message;
}

function setAdminStatus(message, success = false) {
  const element = $("adminStatus");
  if (!element) return;
  element.textContent = message;
  element.style.color = success ? "green" : "crimson";
}

function formatSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size)) return "Ukuran tidak diketahui";
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

function getFileName(app) {
  return app.file_path
    ? app.file_path.split("/").pop()
    : app.name || "File";
}

function getExtension(fileName) {
  const index = String(fileName).lastIndexOf(".");
  return index >= 0
    ? fileName.slice(index + 1).toUpperCase()
    : "FILE";
}

function renderApps() {
  const grid = $("grid");
  if (!grid) return;

  const keyword = ($("search")?.value || "").trim().toLowerCase();

  const results = allApps.filter(app => {
    const categoryMatch =
      activeCategory === "Semua" ||
      (app.category || "Lainnya") === activeCategory;

    const searchable = [
      app.name, app.version, app.category,
      app.description, getFileName(app)
    ].join(" ").toLowerCase();

    return categoryMatch && searchable.includes(keyword);
  });

  const count = $("count");
  if (count) count.textContent = `${results.length} file ditemukan`;

  if (!results.length) {
    grid.innerHTML = '<div class="empty">Belum ada file yang cocok.</div>';
    return;
  }

  grid.innerHTML = results.map(app => {
    const fileName = getFileName(app);
    const url = app.file_url || "";

    return `
      <article class="app-card">
        <div class="app-info">
          <span class="file-type">${escapeHTML(getExtension(fileName))}</span>
          <h3>${escapeHTML(app.name || fileName)}</h3>
          <p>Kategori: ${escapeHTML(app.category || "Lainnya")}</p>
          ${app.version ? `<p>Versi: ${escapeHTML(app.version)}</p>` : ""}
          <p>${escapeHTML(app.description || "Tidak ada deskripsi.")}</p>
          ${app.file_size != null ? `<p>Ukuran: ${formatSize(app.file_size)}</p>` : ""}
        </div>
        ${url
          ? `<a class="download-button" href="${escapeHTML(url)}"
                target="_blank" rel="noopener noreferrer">Download</a>`
          : "<p>Link download tidak tersedia.</p>"}
      </article>
    `;
  }).join("");
}

async function loadApps() {
  const grid = $("grid");
  if (grid) grid.innerHTML = '<div class="empty">Memuat koleksi...</div>';

  if (!supabaseClient) {
    if (grid) grid.innerHTML = '<div class="empty">Supabase belum berhasil dimuat.</div>';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("apps")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allApps = data || [];
    renderApps();
  } catch (error) {
    console.error("Katalog:", error);
    if (grid) {
      grid.innerHTML = '<div class="empty">Gagal memuat katalog. Periksa koneksi dan izin Supabase.</div>';
    }
    const count = $("count");
    if (count) count.textContent = "Katalog gagal dimuat";
  }
}

function setCategory(category) {
  activeCategory = category;

  $("filters")?.querySelectorAll("[data-category]").forEach(button => {
    button.classList.toggle("active", button.dataset.category === category);
  });

  renderApps();
}

function updateAdminPanel() {
  const loggedIn = Boolean(currentUser);

  if ($("loginPanel")) $("loginPanel").hidden = loggedIn;
  if ($("uploadPanel")) $("uploadPanel").hidden = !loggedIn;

  setAdminStatus(
    loggedIn ? `Login sebagai ${currentUser.email || "admin"}` : "",
    loggedIn
  );
}

async function checkSession() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  currentUser = data.session?.user || null;
  updateAdminPanel();
}

async function loginAdmin() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setAdminStatus("Masukkan email dan password.");
    return;
  }

  const button = $("loginBtn");
  if (button) button.disabled = true;

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
    console.error("Login:", error);
    setAdminStatus("Login gagal. Periksa email, password, dan koneksi.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    updateAdminPanel();
    setAdminStatus("Berhasil keluar.", true);
  } catch (error) {
    console.error("Logout:", error);
    setAdminStatus("Gagal keluar dari akun.");
  }
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

  // Semua ekstensi file diterima, tidak hanya APK.
  isUploading = true;
  const button = $("uploadBtn");
  if (button) button.disabled = true;

  setAdminStatus("Sedang mengunggah file...");

  let uploadedPath = null;

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) throw uploadError;
    uploadedPath = filePath;

    const { data: urlData } = supabaseClient.storage
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

    if (insertError) throw insertError;

    $("appName").value = "";
    $("version").value = "";
    $("description").value = "";
    $("apkFile").value = "";

    setAdminStatus("File berhasil diunggah!", true);
    await loadApps();
  } catch (error) {
    console.error("Upload:", error);

    if (uploadedPath) {
      const { error: cleanupError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .remove([uploadedPath]);

      if (cleanupError) console.error("Pembersihan file:", cleanupError);
    }

    setAdminStatus("Upload gagal. Periksa izin Storage, tabel, dan koneksi.");
  } finally {
    isUploading = false;
    if (button) button.disabled = false;
  }
}

function connectButtons() {
  $("search")?.addEventListener("input", renderApps);

  $("filters")?.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (button) setCategory(button.dataset.category);
  });

  $("adminOpen")?.addEventListener("click", async () => {
    const dialog = $("adminDialog");
    if (dialog && !dialog.open) dialog.showModal();

    try {
      await checkSession();
    } catch (error) {
      console.error("Sesi admin:", error);
      setAdminStatus("Gagal memeriksa sesi admin.");
    }
  });

  $("loginBtn")?.addEventListener("click", loginAdmin);
  $("uploadBtn")?.addEventListener("click", uploadFile);
  $("logoutBtn")?.addEventListener("click", logoutAdmin);

  $("password")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      loginAdmin();
    }
  });
}

async function startApp() {
  try {
    if (!window.supabase?.createClient) {
      throw new Error("Library Supabase tidak tersedia.");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    connectButtons();
    await checkSession();
    await loadApps();
  } catch (error) {
    console.error("Inisialisasi aplikasi:", error);
    setNotice("Aplikasi gagal dimulai. Periksa koneksi atau muat ulang halaman.");

    const grid = $("grid");
    if (grid) {
      grid.innerHTML = '<div class="empty">Aplikasi gagal dimulai. Coba muat ulang halaman.</div>';
    }
  }
}

startApp();
