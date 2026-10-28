/*
  SETUP:
  1) Buat project di https://supabase.com
  2) Buat bucket Storage bernama "apks" dan aktifkan Public bucket.
  3) Buat tabel "apps" dengan kolom: id (uuid, primary key, default gen_random_uuid()),
     name (text), version (text), category (text), description (text),
     file_path (text), file_url (text), created_at (timestamptz, default now()).
  4) Atur RLS policies sesuai README.md.
  5) Isi SUPABASE_URL dan SUPABASE_ANON_KEY di bawah ini.
  Anon key memang boleh ada di frontend; JANGAN pernah masukkan service_role key.
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
function showNotice(msg){ notice.textContent = msg; }
function render() {
  const q = search.value.trim().toLowerCase();
  const filtered = apps.filter(a => (category === "Semua" || a.category === category) &&
    [a.name,a.description,a.category].some(v => String(v||"").toLowerCase().includes(q)));
  count.textContent = `${filtered.length} aplikasi`;
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">${apps.length ? "Tidak ada APK yang cocok dengan pencarian." : "Belum ada APK. Admin bisa menambahkan koleksi lewat tombol Admin."}</div>`;
    return;
  }
  grid.innerHTML = filtered.map(a => `<article class="app-card">
    <div class="app-icon" aria-hidden="true">${a.category === "Game" ? "🎮" : a.category === "Emulator" ? "🕹️" : a.category === "Tools" ? "🧰" : "📦"}</div>
    <div class="app-info"><h3>${escapeHtml(a.name)}</h3>
    <p class="meta">${escapeHtml(a.category)} · v${escapeHtml(a.version || "1.0")}</p>
    <p class="desc">${escapeHtml(a.description || "Tidak ada deskripsi.")}</p>
    <a class="download" href="${escapeHtml(a.file_url)}" target="_blank" rel="noopener">↓ Download APK</a></div></article>`).join("");
}
async function loadApps() {
  if (!configured) {
    apps = [];
    grid.innerHTML = `<div class="empty">Website siap, tetapi koneksi database belum diatur.<br><br>Buka <b>app.js</b> dan isi URL serta anon key Supabase. Panduan lengkap ada di README.md.</div>`;
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
  if(!configured){dialog.showModal();adminStatus.textContent="Isi URL dan anon key Supabase di app.js dulu.";return;}
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
  if(!name||!file){adminStatus.textContent="Isi nama aplikasi dan pilih file APK.";return;}
  if(!file.name.toLowerCase().endsWith(".apk")){adminStatus.textContent="Pilih file berekstensi .apk.";return;}
  if(file.size>100*1024*1024){adminStatus.textContent="File lebih dari 100 MB. Periksa batas paket hosting/storage atau gunakan metode upload yang sesuai.";return;}
  document.getElementById("uploadBtn").disabled=true;adminStatus.textContent="Mengunggah file…";
  const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const {error:upError}=await db.storage.from("apks").upload(path,file,{contentType:"application/vnd.android.package-archive",upsert:false});
  if(upError){adminStatus.textContent="Upload gagal: "+upError.message;document.getElementById("uploadBtn").disabled=false;return;}
  const {data:urlData}=db.storage.from("apks").getPublicUrl(path);
  const {error:dbError}=await db.from("apps").insert({name,version,category:cat,description,file_path:path,file_url:urlData.publicUrl});
  if(dbError){
    await db.storage.from("apks").remove([path]);
    adminStatus.textContent="File terunggah tetapi metadata gagal disimpan: "+dbError.message;
    document.getElementById("uploadBtn").disabled=false;return;
  }
  adminStatus.textContent="APK berhasil ditambahkan ke katalog.";
  document.getElementById("appName").value="";document.getElementById("version").value="";document.getElementById("description").value="";document.getElementById("apkFile").value="";
  document.getElementById("uploadBtn").disabled=false;await loadApps();
});
loadApps();
