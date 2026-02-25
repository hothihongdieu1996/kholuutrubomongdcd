/* =========================================
   SCRIPT.JS - PHIÊN BẢN BẢO MẬT & RIÊNG TƯ
   ========================================= */

// ⚠️ THAY API CỦA BẠN VÀO ĐÂY
const SUPABASE_URL = 'https://mkbykbrwkacwzvmghxem.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_25ed7MoRnrzh4cXhypDtxw_xIrVrY6F'; 

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let currentGrade = 0;
let currentClass = '';
let currentMediaType = '';
let currentUser = null; // Chứa thông tin: id, email, grade, username
let isAdmin = false; 
let selectedFileIds = [];
let galleryData = []; 
let currentImageIndex = 0;

/* --- 1. AUTH & KHỞI TẠO --- */

document.addEventListener("DOMContentLoaded", async () => {
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
    // Tạm thời gán user cơ bản
    currentUser = user; 
    
    // Lấy thông tin chi tiết (Lớp, Tên) từ bảng profiles
    await fetchUserProfile(); 
    
    updateUIForLogin(currentUser.username || currentUser.email);
    
    if(document.getElementById('view-gallery').classList.contains('active-view')){
        renderGallery();
    }
}

function handleUserLogout() {
    currentUser = null; isAdmin = false;
    updateUIForLogout();
    if(document.getElementById('view-gallery').classList.contains('active-view')){
        renderGallery(); 
    }
}

// Hàm lấy thông tin chi tiết user (Grade, Role, Name)
async function fetchUserProfile() {
    isAdmin = false;
    try {
        const { data: profile } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        
        if (profile) {
            // Gộp thông tin profile vào biến currentUser để dùng sau này
            currentUser.grade = profile.grade; 
            currentUser.username = profile.username;
            currentUser.role = profile.role;

            if (profile.role === 'admin') isAdmin = true;
        }

        // CƯỠNG CHẾ ADMIN (DỰ PHÒNG) - THAY EMAIL CỦA BẠN
        if (currentUser.email === 'admin@gmail.com') { 
            isAdmin = true;
            currentUser.role = 'admin';
        }

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

/* --- 2. UPLOAD: CHẶN TRÁI TUYẾN & LƯU TÊN --- */

function triggerUpload() { 
    // KIỂM TRA QUYỀN TRƯỚC KHI MỞ FILE
    if (!currentUser) return alert("Vui lòng đăng nhập!");
    
    // 1. Nếu là Admin -> Cho phép hết
    if (isAdmin) {
        document.getElementById('file-input').click();
        return;
    }

    // 2. Nếu là Học sinh -> Kiểm tra Khối
    // currentGrade: Khối đang xem (VD: 7)
    // currentUser.grade: Khối của học sinh (VD: 6)
    if (currentUser.grade !== currentGrade) {
        return alert(`CẢNH BÁO: Bạn là Học sinh Khối ${currentUser.grade}, bạn KHÔNG ĐƯỢC PHÉP đăng bài vào khu vực Khối ${currentGrade}!`);
    }

    document.getElementById('file-input').click(); 
}

async function handleFileUpload(input) {
    if (!input.files || input.files.length === 0) return;
    
    // Check lại lần nữa cho chắc (Server side logic giả lập)
    if (!isAdmin && currentUser.grade !== currentGrade) {
        alert("Sai khối lớp! Hủy tải lên.");
        input.value = ''; return;
    }
    
    if (currentClass === 'teacher' && !isAdmin) {
        alert("Chỉ Giáo viên (Admin) mới được đăng bài vào mục này!");
        input.value = ''; return;
    }

    const files = Array.from(input.files);
    const btn = document.querySelector('.btn-upload');
    const oldHTML = btn.innerHTML;
    btn.disabled = true;

    let successCount = 0;
    
    // Lấy tên hiển thị: Tên đăng ký hoặc Email
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
                title: file.name, 
                url: data.publicUrl, 
                type: currentMediaType,
                grade: currentGrade, 
                class_name: currentClass, 
                uploader_id: currentUser.id,
                author_name: authorName // LƯU TÊN NGƯỜI ĐĂNG
            });
            successCount++;
        } catch(e) { console.error(e); }
    }

    alert(`Hoàn tất tải lên ${successCount} file!`);
    btn.innerHTML = oldHTML; btn.disabled = false; input.value = '';
    renderGallery();
}

/* --- 3. HIỂN THỊ: Ổ KHÓA & TÊN NGƯỜI ĐĂNG --- */

async function renderGallery() {
    const latestContainer = document.getElementById('latest-container');
    const allContainer = document.getElementById('gallery-container');
    const sortValue = document.getElementById('sort-select').value;
    
    if (!currentUser) {
        const lock = `<div style="text-align:center; padding:50px; grid-column:1/-1;">
            <h2 style="color:#ef4444; font-size:3rem; margin-bottom:10px;"><i class="fa-solid fa-lock"></i></h2>
            <h3>Nội dung bị khóa</h3>
            <p>Vui lòng đăng nhập đúng tài khoản Khối ${currentGrade} để xem.</p>
            <button class="btn-submit" style="width:auto; margin-top:15px; padding:10px 30px;" onclick="openModal('login')">Đăng nhập</button>
        </div>`;
        latestContainer.innerHTML = ''; allContainer.innerHTML = lock; return;
    }

    latestContainer.innerHTML = '<p class="loading-text">Đang tải...</p>';
    allContainer.innerHTML = '<p class="loading-text">Đang tải...</p>';
    
    const toolbar = document.getElementById('admin-toolbar');
    if (toolbar) toolbar.style.display = isAdmin ? 'flex' : 'none';

    // 1. LẤY TẤT CẢ DATA CỦA LỚP ĐÓ (Không lọc theo uploader_id nữa)
    // Để ta có thể hiển thị "Ổ khóa" cho bài của người khác
    let query = db.from('media')
        .select('*')
        .eq('grade', currentGrade)
        .eq('class_name', currentClass)
        .eq('type', currentMediaType);

    try {
        const isAscending = sortValue === 'oldest';
        const { data: allData, error } = await query.order('created_at', { ascending: isAscending });
        
        if (error) throw error;

        // Lọc 24h
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const latestData = allData.filter(item => new Date(item.created_at) >= oneDayAgo);
        
        if (latestData.length === 0) latestContainer.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1;font-style:italic;">Không có bài mới.</p>';
        else renderMediaItems(latestData, latestContainer);

        if (allData.length === 0) allContainer.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1">Lớp này chưa có tài liệu nào.</p>';
        else {
            galleryData = allData;
            renderMediaItems(allData, allContainer, true);
        }

    } catch (e) { allContainer.innerHTML = `<p style="text-align:center;color:red;">Lỗi: ${e.message}</p>`; }
}

function renderMediaItems(data, container, isMain = false) {
    container.innerHTML = '';
    data.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';
        div.setAttribute('data-id', item.id);

        // LOGIC HIỂN THỊ NỘI DUNG (QUAN TRỌNG)
        // 1. Admin thấy hết
        // 2. Mục Teacher -> Ai cũng thấy
        // 3. Mục Lớp -> Chỉ thấy bài của mình (isOwner), bài người khác bị khóa
        
        const isOwner = (item.uploader_id === currentUser.id);
        const isTeacherFolder = (currentClass === 'teacher');
        const canView = isAdmin || isTeacherFolder || isOwner;

        let contentHTML = '';
        let clickEvent = '';

        // Tên người đăng (Lấy từ DB hoặc hiện Ẩn danh)
        const authorDisplay = item.author_name ? item.author_name : 'Học sinh';

        if (canView) {
            // ĐƯỢC XEM -> Hiện ảnh/video
            let lbIndex = isMain ? index : galleryData.findIndex(x => x.id === item.id);
            if(lbIndex === -1) lbIndex = 0;
            
            if (item.type === 'image') {
                contentHTML = `<img src="${item.url}" class="media-content" loading="lazy">`;
                clickEvent = `onclick="openLightbox(${lbIndex})"`;
            } else {
                contentHTML = `<video class="media-content" controls><source src="${item.url}"></video>`;
            }
        } else {
            // KHÔNG ĐƯỢC XEM -> Hiện ổ khóa
            contentHTML = `
                <div class="locked-content">
                    <i class="fa-solid fa-lock"></i>
                    <span>Riêng tư</span>
                </div>
            `;
            // Không có sự kiện click (hoặc click báo lỗi)
            clickEvent = `onclick="alert('Bài đăng này của bạn ${authorDisplay}. Bạn không có quyền xem!')"`;
        }

        // Checkbox Admin
        let checkbox = '';
        if (isAdmin) {
            const checked = selectedFileIds.includes(item.id) ? 'checked' : '';
            if(checked) div.classList.add('selected');
            checkbox = `<input type="checkbox" class="item-checkbox" value="${item.id}" onchange="toggleSelectItem('${item.id}')" ${checked} style="display:block">`;
        }

        const date = new Date(item.created_at).toLocaleDateString('vi-VN');

        div.innerHTML = `
            ${checkbox}
            <div ${clickEvent} style="cursor: ${canView ? 'pointer' : 'not-allowed'}">
                ${contentHTML}
            </div>
            <div class="media-caption">
                <div class="caption-title">${item.title}</div>
                <div class="author-name"><i class="fa-solid fa-user-pen"></i> ${authorDisplay}</div>
                <div class="caption-date">${date}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

/* --- CÁC HÀM CŨ GIỮ NGUYÊN --- */
// (Login, Register, Logout, Navigation, Admin Delete, Lightbox...)
// Bạn copy lại các hàm bên dưới từ phiên bản trước, chúng không thay đổi logic.

/* --- 4. NAVIGATION --- */
function updateURL(grade, className, type) {
    const url = new URL(window.location);
    url.searchParams.delete('grade'); url.searchParams.delete('class'); url.searchParams.delete('type');
    if (grade) url.searchParams.set('grade', grade);
    if (className) url.searchParams.set('class', className);
    if (type) url.searchParams.set('type', type);
    window.history.pushState({}, '', url);
}

function switchView(id) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById(id).classList.add('active-view');
}

function goToHome() {
    currentGrade = 0; currentClass = ''; currentMediaType = '';
    updateURL(); switchView('view-home');
}

function goToClassMenu(g) {
    currentGrade = g;
    updateURL(g);
    document.getElementById('class-menu-title').innerText = `CHỌN LỚP - KHỐI ${g}`;
    const container = document.getElementById('class-list-container');
    container.innerHTML = '';
    const teacherBtn = document.createElement('div');
    teacherBtn.className = 'card-item class-card teacher-card';
    teacherBtn.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i> MỤC GIÁO VIÊN (Chỉ Admin đăng)';
    teacherBtn.onclick = () => goToMediaType('teacher');
    container.appendChild(teacherBtn);
    for (let i = 1; i <= 15; i++) {
        const className = `${g}/${i}`;
        const btn = document.createElement('div');
        btn.className = 'card-item class-card';
        btn.innerText = `Lớp ${className}`;
        btn.onclick = () => goToMediaType(className);
        container.appendChild(btn);
    }
    switchView('view-class-menu');
}

function goToMediaType(className) {
    currentClass = className;
    updateURL(currentGrade, className);
    const title = className === 'teacher' ? 'GIÁO VIÊN' : `LỚP ${className}`;
    document.getElementById('type-menu-title').innerText = `${title} - KHỐI ${currentGrade}`;
    switchView('view-media-type');
}
function backToClassMenu() { goToClassMenu(currentGrade); }

function goToGallery(type) {
    currentMediaType = type;
    updateURL(currentGrade, currentClass, type);
    const title = currentClass === 'teacher' ? 'GIÁO VIÊN' : `LỚP ${currentClass}`;
    const typeTxt = type === 'image' ? 'HÌNH ẢNH' : 'VIDEO';
    document.getElementById('gallery-page-title').innerText = `${typeTxt} | ${title}`;
    
    let hint = "";
    if (currentClass === 'teacher') hint = "Mục công khai. Chỉ Giáo viên đăng.";
    else hint = "Khu vực lớp học. Ảnh của bạn khác sẽ bị khóa.";
    document.getElementById('upload-hint-text').innerText = hint;

    selectedFileIds = [];
    document.getElementById('select-all-checkbox').checked = false;
    document.getElementById('selected-count').innerText = '0';
    renderGallery();
    switchView('view-gallery');
}
function backToMediaType() { goToMediaType(currentClass); }

/* --- LOGIN / LOGOUT --- */
async function performLogin() {
    const email = document.getElementById('login-user').value;
    const pass = document.querySelector('#modal-login input[type="password"]').value;
    if(!email || !pass) return alert("Nhập thiếu!");
    const btn = document.querySelector('#modal-login .btn-submit');
    const old = btn.innerText; btn.innerText="Đang xử lý..."; btn.disabled=true;
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if(error) { alert(error.message); btn.innerText=old; btn.disabled=false; }
    else closeModal('login');
}
async function logout() { if(confirm("Đăng xuất?")) { await db.auth.signOut(); window.location.reload(); } }
async function performRegister() {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;
    const grade = document.getElementById('reg-grade').value;
    if(!email || !pass) return alert("Thiếu thông tin");
    const { error } = await db.auth.signUp({ email, password: pass, options: { data: { username: name, grade: parseInt(grade), role: 'user' } } });
    if(error) alert(error.message); else { alert("Đăng ký thành công!"); switchModal('register','login'); }
}

/* --- ADMIN DELETE --- */
function toggleSelectItem(id) {
    const idx = selectedFileIds.indexOf(id);
    if(idx > -1) selectedFileIds.splice(idx,1); else selectedFileIds.push(id);
    const cbs = document.querySelectorAll(`.item-checkbox[value="${id}"]`);
    cbs.forEach(cb => cb.checked = selectedFileIds.includes(id));
    const divs = document.querySelectorAll(`.media-item[data-id="${id}"]`);
    divs.forEach(d => selectedFileIds.includes(id) ? d.classList.add('selected') : d.classList.remove('selected'));
    document.getElementById('selected-count').innerText = selectedFileIds.length;
}
function toggleSelectAll() {
    const checked = document.getElementById('select-all-checkbox').checked;
    selectedFileIds = [];
    document.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.checked = checked;
        if(checked) selectedFileIds.push(cb.value);
    });
    selectedFileIds = [...new Set(selectedFileIds)]; 
    document.querySelectorAll('.media-item').forEach(d => checked ? d.classList.add('selected') : d.classList.remove('selected'));
    document.getElementById('selected-count').innerText = selectedFileIds.length;
}
async function deleteSelectedItems() {
    if (!selectedFileIds.length) return alert("Chưa chọn mục nào!");
    if (!confirm("Xóa vĩnh viễn các mục đã chọn?")) return;
    
    const btn = document.querySelector('.btn-bulk-delete');
    const oldHTML = btn.innerHTML; // Lưu lại giao diện cũ (gồm cả icon và số lượng)
    
    // Đổi nút thành trạng thái đang chạy
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...'; 
    btn.disabled = true;

    try {
        // 1. Lấy danh sách URL để xóa file trong Storage
        const { data: files } = await db.from('media').select('url').in('id', selectedFileIds);
        const fileNames = files.map(f => f.url.split('/').pop());
        
        if(fileNames.length > 0) {
            await db.storage.from('school_assets').remove(fileNames);
        }
        
        // 2. Xóa dữ liệu trong Database
        const { error } = await db.from('media').delete().in('id', selectedFileIds);
        if(error) throw error;

        // --- KHẮC PHỤC LỖI NULL TẠI ĐÂY ---
        // Phải trả lại giao diện nút cũ TRƯỚC khi gán số 0
        btn.innerHTML = oldHTML; 
        btn.disabled = false;

        // Bây giờ thẻ span id="selected-count" đã xuất hiện lại, ta mới cập nhật nó
        const countSpan = document.getElementById('selected-count');
        if (countSpan) countSpan.innerText = '0';

        // Reset các ô checkbox
        selectedFileIds = [];
        const selectAll = document.getElementById('select-all-checkbox');
        if (selectAll) selectAll.checked = false;

        alert("Đã xóa thành công!");
        renderGallery(); // Tải lại trang

    } catch(e) { 
        alert("Lỗi: " + e.message); 
        // Nếu lỗi cũng phải trả lại nút cũ
        btn.innerHTML = oldHTML; 
        btn.disabled = false;
    }
}

/* --- LIGHTBOX --- */
function openLightbox(i) {
    currentImageIndex = i;
    document.getElementById('lightbox-modal').style.display='block';
    const item = galleryData[i];
    document.getElementById('lightbox-img').src = item.url;
    document.getElementById('lightbox-caption').innerText = item.title;
}
function closeLightbox() { document.getElementById('lightbox-modal').style.display='none'; }
function changeSlide(n) {
    currentImageIndex += n;
    if(currentImageIndex >= galleryData.length) currentImageIndex = 0;
    if(currentImageIndex < 0) currentImageIndex = galleryData.length-1;
    // Bỏ qua item bị khóa (không phải image/video hoặc url rỗng)
    // Nhưng logic render chỉ cho phép mở lightbox nếu canView, nên data trong galleryData là chuẩn
    const item = galleryData[currentImageIndex];
    document.getElementById('lightbox-img').src = item.url;
    document.getElementById('lightbox-caption').innerText = item.title;
}

function openModal(t) { document.getElementById(`modal-${t}`).style.display = 'flex'; }
function closeModal(t) { document.getElementById(`modal-${t}`).style.display = 'none'; }
function switchModal(f, t) { closeModal(f); openModal(t); }
window.onclick = e => { if(e.target.classList.contains('modal-overlay')) e.target.style.display='none'; if(e.target.id==='lightbox-modal') closeLightbox(); }
function loadStateFromURL() {
    const p = new URLSearchParams(window.location.search);
    const g = p.get('grade'); const c = p.get('class'); const t = p.get('type');
    if (g && c && t) { currentGrade = parseInt(g); currentClass = c; goToGallery(t); }
    else if (g && c) { currentGrade = parseInt(g); goToMediaType(c); }
    else if (g) { goToClassMenu(parseInt(g)); }
    else goToHome();
}


