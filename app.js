const SUPABASE_URL = "https://jeqdbauakdkvwtuibdgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TenfH1yB2OuqL0OyNWLsAw_D4Z-uj_v";

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let allApps = [];
let activeCategory = "Semua";

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

function showNotice(message) {
  const notice = $("notice");
  if (notice) notice.textContent = message;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatSize(bytes) {
  if (!bytes || Number(bytes) <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(bytes);
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function renderFilters() {
  const filters = $("filters");
  if (!filters) return;

  filters.innerHTML = categories.map((category) => `
    <button
      type="button"
      class="filter-chip ${category === activeCategory ? "active" : ""}"
      data-category="${escapeHTML(category)}"
    >${escapeHTML(category)}</button>
  `).join("");

  filters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderApps();
    });
  });
}

function renderApps() {
  const grid = $("grid");
  const count = $("count");

  if (!grid) return;

  const searchTerm = ($("search")?.value || "").trim().toLowerCase();

  const filtered = allApps.filter((app) => {
    const matchesCategory =
      activeCategory === "Semua" ||
      app.category === activeCategory;

    const searchable = [
      app.name,
      app.version,
      app.category,
      app.description
    ].join(" ").toLowerCase();

    return matchesCategory && searchable.includes(searchTerm);
  });

  if (count) {
    count.textContent = `${filtered.length} item`;
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty">
        ${allApps.length
          ? "Tidak ada item yang cocok dengan pencarian."
          : "Katalog masih kosong."}
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((app) => {
    const downloadURL = app.file_url || "";

    return `
      <article class="app-card">
        <div class="app-card-content">
          <span class="app-category">
            ${escapeHTML(app.category || "Lainnya")}
          </span>

          <h3>${escapeHTML(app.name || "Tanpa nama")}</h3>

          <p class="app-version">
            Versi: ${escapeHTML(app.version || "-")}
          </p>

          <p class="app-description">
            ${escapeHTML(app.description || "Tidak ada deskripsi.")}
          </p>

          ${app.file_size ? `
            <p class="app-size">
              Ukuran: ${formatSize(app.file_size)}
            </p>
          ` : ""}

          ${downloadURL ? `
            <a
              class="download-btn"
              href="${escapeHTML(downloadURL)}"
              target="_blank"
              rel="noopener noreferrer"
            >Unduh</a>
          ` : `
            <span class="empty">Link unduhan belum tersedia.</span>
          `}
        </div>
      </article>
    `;
  }).join("");
}

async function loadApps() {
  const grid = $("grid");
  const count = $("count");

  if (!grid || !supabaseClient) return;

  grid.innerHTML = '<div class="empty">Memuat koleksi...</div>';

  try {
    const result = await Promise.race([
      supabaseClient
        .from("apps")
        .select("*")
        .order("created_at", { ascending: false }),

      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Koneksi katalog melewati batas waktu.")),
          10000
        );
      })
    ]);

    if (result.error) throw result.error;

    allApps = result.data || [];
    renderApps();
  } catch (error) {
    console.error("Gagal memuat katalog:", error);

    grid.innerHTML = `
      <div class="empty">
        Katalog gagal dimuat. Periksa koneksi internet,
        tabel apps, dan pengaturan akses Supabase.
      </div>
    `;

    if (count) count.textContent = "Katalog tidak tersedia";
  }
}

function setAdminStatus(message) {
  const status = $("adminStatus");
  if (status) status.textContent = message;
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
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showUploadPanel();
    } else {
      showLoginPanel();
    }
  } catch (error) {
    console.error("Pemeriksaan sesi gagal:", error);
    showLoginPanel();
  }
}

async function loginAdmin() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setAdminStatus("Isi email dan password.");
    return;
  }

  const button = $("loginBtn");
  if (button) button.disabled = true;

  setAdminStatus("Sedang masuk...");

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
  const name = $("appName")?.value.trim();
  const version = $("version")?.value.trim();
  const category = $("category")?.value;
  const description = $("description")?.value.trim();
  const file = $("apkFile")?.files?.[0];

  if (!name || !file) {
    setAdminStatus("Nama item dan file wajib diisi.");
    return;
  }

  const MAX_SIZE = 100 * 1024 * 1024;

  if (file.size > MAX_SIZE) {
    setAdminStatus("Ukuran file maksimal 100 MB.");
    return;
  }

  const button = $("uploadBtn");
  if (button) button.disabled = true;

  setAdminStatus("Mengunggah file...");

  let uploadedPath = null;

  try {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      throw new Error("Login admin diperlukan.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("apks")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    uploadedPath = filePath;

    const { data: publicData } = supabaseClient.storage
      .from("apks")
      .getPublicUrl(filePath);

    const { error: insertError } = await supabaseClient
      .from("apps")
      .insert({
        name,
        version: version || "",
        category: category || "Lainnya",
        description: description || "",
        file_path: filePath,
        file_url: publicData.publicUrl,
        file_size: file.size
      });

    if (insertError) throw insertError;

    $("appName").value = "";
    $("version").value = "";
    $("description").value = "";
    $("apkFile").value = "";

    setAdminStatus("Upload berhasil.");
    await loadApps();
  } catch (error) {
    console.error("Upload gagal:", error);

    if (uploadedPath) {
      console.error(
        "File sudah terunggah, tetapi penyimpanan data mungkin gagal. Path:",
        uploadedPath
      );
    }

    setAdminStatus(
      `Upload gagal: ${error.message || "Periksa pengaturan Supabase."}`
    );
  } finally {
    if (button) button.disabled = false;
  }
}

function connectButtons() {
  $("search")?.addEventListener("input", renderApps);

  $("adminOpen")?.addEventListener("click", async () => {
    const dialog = $("adminDialog");

    if (!dialog) {
      showNotice("Dialog admin tidak ditemukan di HTML.");
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

    // Proses sesi dan katalog berjalan terpisah.
    // Katalog yang lambat tidak seharusnya mematikan tombol.
    checkSession();
    loadApps();
  } catch (error) {
    console.error("Inisialisasi gagal:", error);

    const grid = $("grid");
    if (grid) {
      grid.innerHTML = `
        <div class="empty">
          Supabase gagal diinisialisasi. Periksa koneksi dan konfigurasi.
        </div>
      `;
    }

    showNotice("Koneksi Supabase gagal.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
