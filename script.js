/* =========================================
   SCRIPT.JS - PHIÊN BẢN CHO PHÉP LƯU TRỐNG ĐIỂM
   ========================================= */

// ⚠️ THAY API CỦA BẠN VÀO ĐÂY
const SUPABASE_URL = 'https://mkbykbrwkacwzvmghxem.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_25ed7MoRnrzh4cXhypDtxw_xIrVrY6F'; 

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let currentGrade = 0;
let currentClass = '';
let currentMediaType = '';
let currentUser = null; 
let isAdmin = false; 
let selectedFileIds = [];
let galleryData = []; 
let currentImageIndex = 0;

/* --- 1. AUTH & KHỞI TẠO --- */
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof supabase === 'undefined') {
        alert("Lỗi: Thư viện Supabase chưa tải được. Vui lòng F5!"); return;
    }
    const { data: { session } } = await db.auth.getSession();
    if (session) handleUserLogin(session.user);
    else handleUserLogout();

    db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handleUserLogin(session.user);
        else if (event === 'SIGNED_OUT') handleUserLogout();
    });
    loadStateFromURL();
});

async function handleUserLogin(user) {
    currentUser = user;
    await fetchUserProfile(); 
    updateUIForLogin(currentUser.username || currentUser.email);
    if(document.getElementById('view-gallery').classList.contains('active-view')) renderGallery();
}

function handleUserLogout() {
    currentUser = null; isAdmin = false;
    updateUIForLogout();
    if(document.getElementById('view-gallery').classList.contains('active-view')) renderGallery();
}

async function fetchUserProfile() {
    isAdmin = false;
    try {
        const { data: profile } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (profile) {
            currentUser.grade = profile.grade; 
            currentUser.username = profile.username;
            currentUser.role = profile.role;
            if (profile.role === 'admin') isAdmin = true;
        }
        // 👇 THAY EMAIL ADMIN CỦA BẠN VÀO ĐÂY 👇
        if (currentUser.email === 'admin@gmail.com') { isAdmin = true; currentUser.role = 'admin'; }
        
        const suffix = isAdmin ? ' (Admin)' : ` (HS Khối ${currentUser.grade || '?'})`;
        document.getElementById('user-name-display').innerText = (currentUser.username || 'User') + suffix;
    } catch (e) { console.error("Lỗi profile:", e); }
}

function updateUIForLogin(name) {
    document.getElementById('auth-buttons').style.display = 'none';
    document.getElementById('user-logged-in').style.display = 'flex';
}
function updateUIForLogout() {
    document.getElementById('auth-buttons').style.display = 'flex';
    document.getElementById('user-logged-in').style.display = 'none';
}

/* --- 2. UPLOAD --- */
function triggerUpload() { 
    if (!currentUser) return alert("Vui lòng đăng nhập!");
    if (isAdmin) { document.getElementById('file-input').click(); return; }
    if (parseInt(currentUser.grade) !== parseInt(currentGrade)) {
        return alert(`CẢNH BÁO: Bạn là HS Khối ${currentUser.grade}, không được đăng vào Khối ${currentGrade}.`);
    }
    document.getElementById('file-input').click(); 
}

async function handleFileUpload(input) {
    if (!input.files || input.files.length === 0) return;
    if (!isAdmin && parseInt(currentUser.grade) !== parseInt(currentGrade)) {
        alert("Sai khối lớp! Hủy tải lên."); input.value = ''; return;
    }
    if (currentClass === 'teacher' && !isAdmin) {
        alert("Chỉ Giáo viên mới được đăng mục này!"); input.value = ''; return;
    }

    const files = Array.from(input.files);
    const btn = document.querySelector('.btn-upload');
    const oldHTML = btn.innerHTML;
    btn.disabled = true;

    let successCount = 0;
    const authorName = currentUser.username || currentUser.email.split('@')[0];

    for (let i = 0; i < files.length; i++) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Tải ${i+1}/${files.length}...`;
        try {
            const file = files[i];
            const name = `${Date.now()}_${i}_${file.name.replace(/\s/g,'_')}`;
            const { error: upErr } = await db.storage.from('school_assets').upload(name, file);
            if(upErr) throw upErr;
            const { data } = db.storage.from('school_assets').getPublicUrl(name);
            await db.from('media').insert({
                title: file.name, url: data.publicUrl, type: currentMediaType,
                grade: currentGrade, class_name: currentClass, 
                uploader_id: currentUser.id, author_name: authorName
            });
            successCount++;
        } catch(e) { console.error(e); }
    }
    alert(`Đã tải lên ${successCount} file!`);
    btn.innerHTML = oldHTML; btn.disabled = false; input.value = '';
    renderGallery();
}

/* --- 3. HIỂN THỊ, SỬA & CHẤM ĐIỂM --- */
async function renderGallery() {
    const latestContainer = document.getElementById('latest-container');
    const allContainer = document.getElementById('gallery-container');
    const sortValue = document.getElementById('sort-select').value;
    
    if (!currentUser) {
        const lock = `<div style="text-align:center; padding:50px; grid-column:1/-1;"><h2 style="color:#ef4444; font-size:3rem;"><i class="fa-solid fa-lock"></i></h2><h3>Nội dung bị khóa</h3><p>Đăng nhập đúng tài khoản Khối ${currentGrade} để xem.</p><button class="btn-submit" style="width:auto; margin-top:15px; padding:10px 30px;" onclick="openModal('login')">Đăng nhập</button></div>`;
        latestContainer.innerHTML = ''; allContainer.innerHTML = lock; return;
    }

    latestContainer.innerHTML = '<p class="loading-text">Đang tải...</p>';
    allContainer.innerHTML = '<p class="loading-text">Đang tải...</p>';
    const toolbar = document.getElementById('admin-toolbar');
    if (toolbar) toolbar.style.display = isAdmin ? 'flex' : 'none';

    let query = db.from('media').select('*').eq('grade', currentGrade).eq('class_name', currentClass).eq('type', currentMediaType);

    try {
        const isAscending = sortValue === 'oldest';
        const { data: allData, error } = await query.order('created_at', { ascending: isAscending });
        if (error) throw error;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const latestData = allData.filter(item => new Date(item.created_at) >= oneDayAgo);
        
        if (latestData.length === 0) latestContainer.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1;font-style:italic;">Không có bài mới.</p>';
        else renderMediaItems(latestData, latestContainer);

        if (allData.length === 0) allContainer.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1">Chưa có tài liệu.</p>';
        else { galleryData = allData; renderMediaItems(allData, allContainer, true); }
    } catch (e) { allContainer.innerHTML = `<p style="text-align:center;color:red;">Lỗi: ${e.message}</p>`; }
}

function renderMediaItems(data, container, isMain = false) {
    container.innerHTML = '';
    data.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';
        div.setAttribute('data-id', item.id);

        const isOwner = (currentUser && item.uploader_id === currentUser.id);
        const isTeacherFolder = (currentClass === 'teacher');
        
        let canView = false;
        if (isAdmin) canView = true;
        else if (isTeacherFolder) {
            if (parseInt(currentUser.grade) === parseInt(item.grade)) canView = true;
        } else {
            if (isOwner) canView = true;
        }

        const authorDisplay = item.author_name ? item.author_name : 'Học sinh';

        let contentHTML = canView 
            ? (item.type === 'image' ? `<img src="${item.url}" class="media-content" loading="lazy">` : `<video class="media-content" controls><source src="${item.url}"></video>`)
            : `<div class="locked-content"><i class="fa-solid fa-lock"></i><span>Riêng tư</span></div>`;
        
        let clickEvent = canView && item.type === 'image' 
            ? `onclick="openLightbox(${isMain ? index : galleryData.findIndex(x => x.id === item.id)})"`
            : `onclick="if(!${canView}) alert('Bạn không có quyền xem bài này!')"`;

        let checkbox = isAdmin ? `<input type="checkbox" class="item-checkbox" value="${item.id}" onchange="toggleSelectItem('${item.id}')" ${selectedFileIds.includes(item.id)?'checked':''} style="display:block">` : '';
        if(isAdmin && selectedFileIds.includes(item.id)) div.classList.add('selected');

        let actionBtns = '';
        if (isAdmin || isOwner) {
            actionBtns = `
                <button class="btn-edit-item" onclick="event.stopPropagation(); renameMediaItem('${item.id}', '${item.title}')" title="Sửa tên"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-delete-item" onclick="event.stopPropagation(); deleteSingleItem('${item.id}', '${item.url}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
            `;
        }

        let gradingHTML = '';
        if (isAdmin) {
            const oldScore = item.score || '';
            const oldComment = item.teacher_comment || '';
            gradingHTML = `
                <div class="grading-area" onclick="event.stopPropagation();">
                    <div class="grading-row">
                        <input type="text" id="score-${item.id}" class="input-score" placeholder="Điểm" value="${oldScore}">
                        <input type="text" id="comment-${item.id}" class="input-comment" placeholder="Lời phê..." value="${oldComment}">
                    </div>
                    <button class="btn-save-grade" onclick="saveGrade('${item.id}')">Lưu đánh giá</button>
                </div>
            `;
        } else if (item.score || item.teacher_comment) {
            gradingHTML = `
                <div class="grade-result">
                    <span class="grade-score">Điểm: ${item.score || '--'}</span>
                    <span class="grade-comment">"${item.teacher_comment || ''}"</span>
                </div>
            `;
        }

        div.innerHTML = `
            ${checkbox} ${actionBtns}
            <div ${clickEvent} style="cursor:${canView?'pointer':'not-allowed'}">${contentHTML}</div>
            <div class="media-caption">
                <div class="caption-title" id="title-${item.id}">${item.title}</div>
                <div class="author-name"><i class="fa-solid fa-user-pen"></i> ${authorDisplay}</div>
                <div class="caption-date">${new Date(item.created_at).toLocaleDateString('vi-VN')}</div>
            </div>
            ${gradingHTML} 
        `;
        container.appendChild(div);
    });
}

// --- HÀM ĐỔI TÊN ---
async function renameMediaItem(id, oldTitle) {
    const newTitle = prompt("Nhập tên mới:", oldTitle);
    if (!newTitle || newTitle === oldTitle) return;
    try {
        const { error } = await db.from('media').update({ title: newTitle }).eq('id', id);
        if (error) throw error;
        const titleEl = document.getElementById(`title-${id}`);
        if (titleEl) titleEl.innerText = newTitle;
        alert("Đã đổi tên!");
    } catch (e) { alert("Lỗi đổi tên: " + e.message); }
}

// --- HÀM LƯU ĐIỂM (ĐÃ BỎ CHECK RỖNG - CHO PHÉP LƯU TRỐNG) ---
async function saveGrade(id) {
    const scoreVal = document.getElementById(`score-${id}`).value;
    const commentVal = document.getElementById(`comment-${id}`).value;
    
    // Đã bỏ dòng kiểm tra !scoreVal && !commentVal để cho phép xóa điểm
    
    const btn = document.querySelector(`.media-item[data-id="${id}"] .btn-save-grade`);
    const oldText = btn.innerText; btn.innerText = "Lưu..."; btn.disabled = true;
    try {
        const { error } = await db.from('media').update({ score: scoreVal, teacher_comment: commentVal }).eq('id', id);
        if (error) throw error;
        alert("Đã lưu đánh giá!");
    } catch (e) { alert("Lỗi: " + e.message); } finally { btn.innerText = oldText; btn.disabled = false; }
}

// --- HÀM XÓA ---
async function deleteSingleItem(id, url) {
    if(!confirm("Xóa vĩnh viễn?")) return;
    const itemDiv = document.querySelector(`.media-item[data-id="${id}"]`);
    if(itemDiv) itemDiv.style.opacity = '0.5';
    try {
        const fileName = url.split('/').pop();
        if (fileName) await db.storage.from('school_assets').remove([fileName]);
        const { error } = await db.from('media').delete().eq('id', id);
        if (error) throw error;
        alert("Đã xóa!"); renderGallery();
    } catch (e) { alert("Lỗi: " + e.message); if(itemDiv) itemDiv.style.opacity = '1'; }
}

/* --- OTHER UTILS --- */
async function performLogin() { const e=document.getElementById('login-user').value; const p=document.querySelector('#modal-login input[type="password"]').value; if(!e||!p)return alert("Thiếu thông tin"); const b=document.querySelector('#modal-login .btn-submit'); const o=b.innerText; b.innerText="Xử lý..."; b.disabled=true; const{error}=await db.auth.signInWithPassword({email:e,password:p}); if(error){alert(error.message);b.innerText=o;b.disabled=false}else closeModal('login'); }
async function logout(){ if(confirm("Đăng xuất?")){await db.auth.signOut();window.location.reload();} }
async function performRegister(){ const e=document.getElementById('reg-email').value; const p=document.getElementById('reg-password').value; const n=document.getElementById('reg-name').value; const g=document.getElementById('reg-grade').value; if(!e||!p)return alert("Thiếu thông tin"); const{error}=await db.auth.signUp({email:e,password:p,options:{data:{username:n,grade:parseInt(g),role:'user'}}}); if(error)alert(error.message);else{alert("Đăng ký thành công");switchModal('register','login');} }
function toggleSelectItem(id){ const i=selectedFileIds.indexOf(id); if(i>-1)selectedFileIds.splice(i,1); else selectedFileIds.push(id); document.querySelectorAll(`.item-checkbox[value="${id}"]`).forEach(c=>c.checked=selectedFileIds.includes(id)); document.querySelectorAll(`.media-item[data-id="${id}"]`).forEach(d=>selectedFileIds.includes(id)?d.classList.add('selected'):d.classList.remove('selected')); document.getElementById('selected-count').innerText=selectedFileIds.length; }
function toggleSelectAll(){ const c=document.getElementById('select-all-checkbox').checked; selectedFileIds=[]; document.querySelectorAll('.item-checkbox').forEach(cb=>{cb.checked=c;if(c)selectedFileIds.push(cb.value)}); selectedFileIds=[...new Set(selectedFileIds)]; document.querySelectorAll('.media-item').forEach(d=>c?d.classList.add('selected'):d.classList.remove('selected')); document.getElementById('selected-count').innerText=selectedFileIds.length; }
async function deleteSelectedItems(){ if(!selectedFileIds.length)return alert("Chưa chọn!"); if(!confirm("Xóa các mục đã chọn?"))return; const b=document.querySelector('.btn-bulk-delete'); const o=b.innerHTML; b.innerHTML='Xóa...'; b.disabled=true; try{ const{data:f}=await db.from('media').select('url').in('id',selectedFileIds); const n=f.map(x=>x.url.split('/').pop()); if(n.length)await db.storage.from('school_assets').remove(n); await db.from('media').delete().in('id',selectedFileIds); b.innerHTML=o; b.disabled=false; selectedFileIds=[]; if(document.getElementById('selected-count')) document.getElementById('selected-count').innerText=0; if(document.getElementById('select-all-checkbox')) document.getElementById('select-all-checkbox').checked=false; alert("Đã xóa"); renderGallery(); } catch(e){ alert(e.message); b.innerHTML=o; b.disabled=false; } }
/* --- NAVIGATION --- */
function goToHome() { currentGrade = 0; currentClass = ''; currentMediaType = ''; updateURL(); switchView('view-home'); }
function goToClassMenu(g) { currentGrade = parseInt(g); updateURL(g); document.getElementById('class-menu-title').innerText = `CHỌN LỚP - KHỐI ${g}`; const container = document.getElementById('class-list-container'); container.innerHTML = ''; const teacherBtn = document.createElement('div'); teacherBtn.className = 'card-item class-card teacher-card'; teacherBtn.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i> MỤC GIÁO VIÊN (Chỉ Admin đăng)'; teacherBtn.onclick = () => goToMediaType('teacher'); container.appendChild(teacherBtn); for (let i = 1; i <= 15; i++) { const c = `${g}/${i}`; const btn = document.createElement('div'); btn.className = 'card-item class-card'; btn.innerText = `Lớp ${c}`; btn.onclick = () => goToMediaType(c); container.appendChild(btn); } switchView('view-class-menu'); }
function goToMediaType(c) { currentClass = c; updateURL(currentGrade, c); document.getElementById('type-menu-title').innerText = `${c==='teacher'?'GIÁO VIÊN':`LỚP ${c}`} - KHỐI ${currentGrade}`; switchView('view-media-type'); }
function backToClassMenu() { goToClassMenu(currentGrade); }
function goToGallery(t) { currentMediaType = t; updateURL(currentGrade, currentClass, t); const title = currentClass === 'teacher' ? 'GIÁO VIÊN' : `LỚP ${currentClass}`; document.getElementById('gallery-page-title').innerText = `${t==='image'?'HÌNH ẢNH':'VIDEO'} | ${title}`; let hint = ""; if (currentClass === 'teacher') hint = "Mục công khai. Chỉ Giáo viên đăng."; else hint = "Khu vực lớp học. Ảnh của bạn khác sẽ bị khóa."; document.getElementById('upload-hint-text').innerText = hint; selectedFileIds = []; if(document.getElementById('select-all-checkbox')) document.getElementById('select-all-checkbox').checked = false; if(document.getElementById('selected-count')) document.getElementById('selected-count').innerText = '0'; renderGallery(); switchView('view-gallery'); }
function backToMediaType() { goToMediaType(currentClass); }
function switchView(id) { document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view')); document.getElementById(id).classList.add('active-view'); }
function updateURL(g, c, t) { const u = new URL(window.location); u.searchParams.delete('grade'); u.searchParams.delete('class'); u.searchParams.delete('type'); if(g) u.searchParams.set('grade', g); if(c) u.searchParams.set('class', c); if(t) u.searchParams.set('type', t); window.history.pushState({}, '', u); }
function loadStateFromURL() { const p = new URLSearchParams(window.location.search); const g = p.get('grade'); const c = p.get('class'); const t = p.get('type'); if (g && c && t) { currentGrade = parseInt(g); currentClass = c; goToGallery(t); } else if (g && c) { currentGrade = parseInt(g); goToMediaType(c); } else if (g) { goToClassMenu(parseInt(g)); } else goToHome(); }
/* --- LIGHTBOX --- */
function openLightbox(i){ currentImageIndex=i; document.getElementById('lightbox-modal').style.display='block'; const t=galleryData[i]; document.getElementById('lightbox-img').src=t.url; document.getElementById('lightbox-caption').innerText=t.title; }
function closeLightbox(){ document.getElementById('lightbox-modal').style.display='none'; }
function changeSlide(n){ currentImageIndex+=n; if(currentImageIndex>=galleryData.length)currentImageIndex=0; if(currentImageIndex<0)currentImageIndex=galleryData.length-1; const t=galleryData[currentImageIndex]; document.getElementById('lightbox-img').src=t.url; document.getElementById('lightbox-caption').innerText=t.title; }
function openModal(t){ document.getElementById(`modal-${t}`).style.display='flex'; }
function closeModal(t){ document.getElementById(`modal-${t}`).style.display='none'; }
function switchModal(f,t){ closeModal(f); openModal(t); }
window.onclick=e=>{ if(e.target.classList.contains('modal-overlay'))e.target.style.display='none'; if(e.target.id==='lightbox-modal')closeLightbox(); }
