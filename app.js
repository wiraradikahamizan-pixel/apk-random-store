/*
  APK Random Store - Supabase setup.
  Keep your project URL and publishable key below.
  Never put a Supabase service_role/secret key in frontend code.
*/
const SUPABASE_URL = "https://jeqdbauakdkvwtuibdgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TenfH1yB2OuqL0OyNWLsAw_D4Z-uj_v";
const configured = !SUPABASE_URL.startsWith("ISI_") && !SUPABASE_ANON_KEY.startsWith("ISI_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const grid = document.getElementById("grid");
const search = document.getElementById("search");
const count = document.getElementById("count");
const notice = document.getElementById("notice");
const dialog = document.getElementById("adminDialog");
const adminStatus = document.getElementById("adminStatus");
let apps = [], category = "Semua", session = null;

function escapeHtml(s="") {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function iconForCategory(cat) {
  const icons = {
    "Game":"🎮", "Aplikasi":"📱", "Tools":"🧰", "Emulator":"🕹️",
    "Plugin / Mod":"🧩", "DLC / Add-on":"➕", "Driver":"⚙️",
    "Software PC":"💻", "Sistem / Firmware":"🖥️", "Arsip":"🗜️"
  };
  return icons[cat] || "📦";
}
function render() {
  const q = search.value.trim().toLowerCase();
  const filtered = apps.filter(a => (category === "Semua" || a.category === category) &&
    [a.name,a.description,a.category,a.version].some(v => String(v||"").toLowerCase().includes(q)));
  count.textContent = `${filtered.length} file`;
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">${apps.length ? "Tidak ada file yang cocok dengan pencarian." : "Belum ada file. Admin bisa menambahkan koleksi lewat tombol Admin."}</div>`;
    return;
  }
  grid.innerHTML = filtered.map(a => `<article class="app-card">
    <div class="app-icon" aria-hidden="true">${iconForCategory(a.category)}</div>
    <div class="app-info"><h3>${escapeHtml(a.name)}</h3>
    <p class="meta">${escapeHtml(a.category || "Lainnya")} · v${escapeHtml(a.version || "1.0")}</p>
    <p class="desc">${escapeHtml(a.description || "Tidak ada deskripsi.")}</p>
    <a class="download" href="${escapeHtml(a.file_url)}" target="_blank" rel="noopener" download>↓ Download file</a></div></article>`).join("");
}
async function loadApps() {
  if (!configured) {
    apps = [];
    grid.innerHTML = `<div class="empty">Koneksi database belum diatur. Periksa URL dan publishable key di app.js.</div>`;
    count.textContent = "Setup diperlukan";
    return;
  }
  const {data,error} = await db.from("apps").select("*").order("created_at",{ascending:false});
  if(error){ grid.innerHTML = `<div class="empty">Gagal memuat katalog. Periksa pengaturan Supabase dan kebijakan akses tabel.</div>`; count.textContent="Katalog belum tersedia"; return; }
  apps = data || []; render();
}
document.getElementById("filters").addEventListener("click", e => {
  const b = e.target.closest("[data-category]"); if(!b) return;
  category=b.dataset.category;
  document.querySelectorAll(".chip").forEach(x=>x.classList.toggle("active",x===b)); render();
});
search.addEventListener("input",render);
document.getElementById("adminOpen").addEventListener("click", async()=>{
  if(!configured){dialog.showModal();adminStatus.textContent="Isi URL dan publishable key Supabase di app.js dulu.";return;}
  dialog.showModal();
  const {data}=await db.auth.getSession(); session=data.session;
  document.getElementById("loginPanel").hidden=!!session;
  document.getElementById("uploadPanel").hidden=!session;
});
document.getElementById("loginBtn").addEventListener("click",async()=>{
  if(!db)return;
  adminStatus.textContent="Sedang masuk…";
  const {data,error}=await db.auth.signInWithPassword({email:document.getElementById("email").value,password:document.getElementById("password").value});
  if(error){adminStatus.textContent="Login gagal: "+error.message;return;}
  session=data.session; document.getElementById("loginPanel").hidden=true;document.getElementById("uploadPanel").hidden=false;adminStatus.textContent="Login berhasil.";
});
document.getElementById("logoutBtn").addEventListener("click",async()=>{
  await db.auth.signOut();session=null;document.getElementById("loginPanel").hidden=false;document.getElementById("uploadPanel").hidden=true;adminStatus.textContent="Kamu sudah keluar.";
});
document.getElementById("uploadBtn").addEventListener("click",async()=>{
  if(!db)return;
  const name=document.getElementById("appName").value.trim(), version=document.getElementById("version").value.trim()||"1.0";
  const cat=document.getElementById("category").value, description=document.getElementById("description").value.trim();
  const file=document.getElementById("apkFile").files[0];
  if(!name||!file){adminStatus.textContent="Isi nama file dan pilih file.";return;}
  if(file.size===0){adminStatus.textContent="File kosong, pilih file lain.";return;}
  if(file.size>100*1024*1024){adminStatus.textContent="File lebih dari 100 MB. Periksa batas storage atau gunakan metode upload yang sesuai.";return;}
  document.getElementById("uploadBtn").disabled=true;adminStatus.textContent="Mengunggah file…";
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${crypto.randomUUID()}-${safeName}`;
  const {error:upError}=await db.storage.from("apks").upload(path,file,{contentType:file.type || "application/octet-stream",upsert:false});
  if(upError){adminStatus.textContent="Upload gagal: "+upError.message;document.getElementById("uploadBtn").disabled=false;return;}
  const {data:urlData}=db.storage.from("apks").getPublicUrl(path);
  const {error:dbError}=await db.from("apps").insert({name,version,category:cat,description,file_path:path,file_url:urlData.publicUrl});
  if(dbError){
    await db.storage.from("apks").remove([path]);
    adminStatus.textContent="File terunggah tetapi metadata gagal disimpan: "+dbError.message;
    document.getElementById("uploadBtn").disabled=false;return;
  }
  adminStatus.textContent="File berhasil ditambahkan ke katalog.";
  document.getElementById("appName").value="";document.getElementById("version").value="";document.getElementById("description").value="";document.getElementById("apkFile").value="";
  document.getElementById("uploadBtn").disabled=false;await loadApps();
});
loadApps();
