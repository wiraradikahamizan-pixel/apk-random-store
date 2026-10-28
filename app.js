const SUPABASE_URL = "https://jeqdbauakdkvwtuibdgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TenfH1yB2OuqL0OyNWLsAw_D4Z-uj_v";

const BUCKET_NAME = "apks";
const MAX_FILE_SIZE = 215 * 1000 * 1000 * 1000;

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let allApps = [];
let activeCategory = "Semua";
let isUploading = false;

const categories = [
  "Semua",
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

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function setNotice(message) {
  const element = $("notice");
  if (element) element.textContent = message;
}

function setAdminStatus(message) {
  const element = $("adminStatus");
  if (element) element.textContent = message;
}

function formatSize(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(bytes);
  let index = 0;

  while (size >= 1000 && index < units.length - 1) {
    size /= 1000;
    index++;
  }

  return `${size.toFixed(index ? 2 : 0)} ${units[index]}`;
}

function renderFilters() {
  const filters = $("filters");
  if (!filters) return;

  filters.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.category === activeCategory
    );
  });
}

function renderApps() {
  const grid = $("grid");
  const count = $("count");
  if (!grid) return;

  const query = ($("search")?.value || "").trim().toLowerCase();

  const results = allApps.filter((app) => {
    const categoryMatch =
      activeCategory === "Semua" ||
      app.category === activeCategory;

    const searchable = [
      app.name,
      app.version,
      app.category,
      app.description
    ].join(" ").toLowerCase();

    return categoryMatch && searchable.includes(query);
  });

  if (count) count.textContent = `${results.length} file`;

  if (results.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        ${allApps.length
          ? "Tidak ada file yang cocok dengan pencarian."
          : "Katalog masih kosong."}
      </div>`;
    return;
  }

  grid.innerHTML = results.map((app) => {
    const url = /^https?:\/\//i.test(app.file_url || "")
      ? app.file_url
      : "";

    return `
      <article class="app-card">
        <div class="app-card-content">
          <span class="app-category">
            ${escapeHTML(app.category || "Lainnya")}
          </span>

          <h3>${escapeHTML(app.name || "Tanpa nama")}</h3>

          <p>Versi: ${escapeHTML(app.version || "-")}</p>

          <p class="app-description">
            ${escapeHTML(app.description || "Tidak ada deskripsi.")}
          </p>

          ${app.file_size != null
            ? `<p>Ukuran: ${formatSize(app.file_size)}</p>`
            : ""}

          ${url
            ? `<a class="download-btn"
                  href="${escapeHTML(url)}"
                  target="_blank"
                  rel="noopener noreferrer">Unduh</a>`
            : `<p>Link unduhan belum tersedia.</p>`}
        </div>
      </article>`;
  }).join("");
}

async function loadApps() {
  const grid = $("grid");
  if (!grid || !supabaseClient) return;

  grid.innerHTML = '<div class="empty">Memuat katalog...</div>';

  try {
    const { data, error } = await supabaseClient
      .from("apps")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allApps = data || [];
    renderApps();
  } catch (error) {
    console.error("Gagal memuat katalog:", error);

    grid.innerHTML = `
      <div class="empty">
        Katalog gagal dimuat. Periksa koneksi, tabel apps,
        dan izin akses Supabase.
      </div>`;

    const count = $("count");
    if (count) count.textContent = "Gagal memuat katalog";
  }
}

function showLoginPanel() {
  if ($("loginPanel")) $("loginPanel").hidden = false;
  if ($("uploadPanel")) $("uploadPanel").hidden = true;
}

function showUploadPanel() {
  if ($("loginPanel")) $("loginPanel").hidden = true;
  if ($("uploadPanel")) $("uploadPanel").hidden = false;
}

async function checkSession() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showUploadPanel();
    } else {
      showLoginPanel();
    }
  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    showLoginPanel();
  }
}

async function loginAdmin() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;
  const button = $("loginBtn");

  if (!email || !password) {
    setAdminStatus("Isi email dan password admin.");
    return;
  }

  if (button) button.disabled = true;
  setAdminStatus("Sedang login...");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    showUploadPanel();
    setAdminStatus("Login berhasil.");
  } catch (error) {
    console.error("Login gagal:", error);
    setAdminStatus("Login gagal. Periksa email dan password.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    showLoginPanel();
    setAdminStatus("Berhasil logout.");
  } catch (error) {
    console.error("Logout gagal:", error);
    setAdminStatus("Logout gagal.");
  }
}

async function uploadApp() {
  if (isUploading) return;

  const name = $("appName")?.value.trim();
  const version = $("version")?.value.trim();
  const category = $("category")?.value || "Lainnya";
  const description = $("description")?.value.trim();
  const file = $("apkFile")?.files?.[0];
  const button = $("uploadBtn");

  if (!name || !file) {
    setAdminStatus("Nama file dan file upload wajib diisi.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setAdminStatus("Ukuran file melebihi target batas 215 GB.");
    return;
  }

  isUploading = true;
  if (button) button.disabled = true;

  let uploadedPath = null;

  try {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      throw new Error("Silakan login sebagai admin terlebih dahulu.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${Date.now()}_${safeName}`;

    setAdminStatus(
      `Mengunggah ${file.name} (${formatSize(file.size)})...`
    );

    /*
      Batas 215 GB di sini hanya pemeriksaan browser.
      Supabase dan metode upload yang digunakan harus
      benar-benar mendukung ukuran file tersebut.
      Upload standar ini belum menjamin file 215 GB berhasil.
    */
    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    uploadedPath = filePath;

    const { data: publicData } = supabaseClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const { error: insertError } = await supabaseClient
      .from("apps")
      .insert({
        name,
        version: version || "",
        category,
        description: description || "",
        file_path: filePath,
        file_url: publicData.publicUrl,
        file_size: file.size
      });

    if (insertError) {
      throw new Error(
        `File berhasil diunggah, tetapi data katalog gagal disimpan: ${insertError.message}`
      );
    }

    $("appName").value = "";
    $("version").value = "";
    $("description").value = "";
    $("apkFile").value = "";

    setAdminStatus("Upload berhasil.");
    await loadApps();
  } catch (error) {
    console.error("Upload gagal:", error);

    setAdminStatus(
      `Upload gagal: ${error.message || "Periksa pengaturan Storage."}`
    );

    if (uploadedPath) {
      console.error(
        "Periksa Storage karena file mungkin sudah terunggah:",
        uploadedPath
      );
    }
  } finally {
    isUploading = false;
    if (button) button.disabled = false;
  }
}

function connectButtons() {
  $("search")?.addEventListener("input", renderApps);

  $("filters")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    activeCategory = button.dataset.category || "Semua";
    renderFilters();
    renderApps();
  });

  $("adminOpen")?.addEventListener("click", async () => {
    const dialog = $("adminDialog");

    if (!dialog) {
      setNotice("Panel admin tidak ditemukan.");
      return;
    }

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    await checkSession();
  });

  $("loginBtn")?.addEventListener("click", loginAdmin);
  $("uploadBtn")?.addEventListener("click", uploadApp);
  $("logoutBtn")?.addEventListener("click", logoutAdmin);

  $("password")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginAdmin();
  });
}

async function startApp() {
  connectButtons();
  renderFilters();

  try {
    if (!window.supabase?.createClient) {
      throw new Error("Library Supabase gagal dimuat.");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    supabaseClient.auth.onAuthStateChange(() => {
      checkSession();
    });

    checkSession();
    loadApps();
  } catch (error) {
    console.error("Inisialisasi gagal:", error);

    const grid = $("grid");
    if (grid) {
      grid.innerHTML = `
        <div class="empty">
          Supabase gagal diinisialisasi. Periksa koneksi dan konfigurasi.
        </div>`;
    }

    setNotice("Koneksi Supabase gagal.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
