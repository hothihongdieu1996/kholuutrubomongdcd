/* =========================================
   FILE SCRIPT.JS - BẢN CÓ LIGHTBOX (ZOOM ẢNH)
   ========================================= */

// ⚠️ THAY API CỦA BẠN VÀO ĐÂY
const SUPABASE_URL = 'https://mkbykbrwkacwzvmghxem.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_25ed7MoRnrzh4cXhypDtxw_xIrVrY6F'; 

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Các biến trạng thái
let currentGrade = 0;
let currentMediaType = ''; 
let currentUser = null;
let isAdmin = false; 

// --- BIẾN MỚI CHO LIGHTBOX ---
let galleryData = []; // Lưu danh sách ảnh hiện tại để chuyển qua lại
let currentImageIndex = 0; // Đang xem ảnh số mấy

/* =========================================
   1. XỬ LÝ ĐĂNG NHẬP
   ========================================= */

db.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        currentUser = session.user;
        updateUIForLogin(currentUser.email);
        checkAdminRole();
    } else {
        currentUser = null;
        isAdmin = false;
        updateUIForLogout();
    }
});

async function checkAdminRole() {
    try {
        const { data: profile } = await db
            .from('profiles')
            .select('role, username, grade')
            .eq('id', currentUser.id)
            .single();
        
        if (profile) {
            isAdmin = (profile.role === 'admin');
            if (profile.username) {
                const suffix = isAdmin ? ' (Admin)' : '';
                document.getElementById('user-name-display').innerText = profile.username + suffix;
            }
            currentUser.user_metadata = { ...currentUser.user_metadata, ...profile };
        }
    } catch (e) { console.warn("Lỗi check admin:", e); }
}

function updateUIForLogin(name) {
    document.getElementById('auth-buttons').style.display = 'none';
    document.getElementById('user-logged-in').style.display = 'flex';
    document.getElementById('user-name-display').innerText = name;
}

function updateUIForLogout() {
    document.getElementById('auth-buttons').style.display = 'flex';
    document.getElementById('user-logged-in').style.display = 'none';
}

async function performLogin() {
    const email = document.getElementById('login-user').value;
    const password = document.querySelector('#modal-login input[type="password"]').value;
    if (!email || !password) return alert("Thiếu thông tin!");
    
    const btn = document.querySelector('#modal-login .btn-submit');
    const oldText = btn.innerText; btn.innerText = "Đang chạy..."; btn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) { alert("Lỗi: " + error.message); btn.innerText = oldText; btn.disabled = false; }
    else { window.location.reload(); }
}

async function logout() {
    currentUser = null; updateUIForLogout();
    await db.auth.signOut(); window.location.reload();
}

async function performRegister() {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;
    const grade = document.getElementById('reg-grade').value;
    if (!email || !password) return alert("Thiếu thông tin!");

    const { error } = await db.auth.signUp({
        email: email, password: password,
        options: { data: { username: name, grade: parseInt(grade), role: 'user' } }
    });

    if (error) alert("Lỗi: " + error.message);
    else { alert("Đăng ký xong! Hãy đăng nhập."); switchModal('register', 'login'); }
}

/* =========================================
   2. XỬ LÝ DỮ LIỆU & LIGHTBOX
   ========================================= */

/* =========================================
   2. XỬ LÝ DỮ LIỆU & LIGHTBOX (NÂNG CẤP)
   ========================================= */

async function renderGallery() {
    const latestContainer = document.getElementById('latest-container');
    const allContainer = document.getElementById('gallery-container');
    const sortValue = document.getElementById('sort-select').value;
    
    latestContainer.innerHTML = '<p class="loading-text">Đang tải tin mới...</p>';
    allContainer.innerHTML = '<p class="loading-text">Đang tải dữ liệu...</p>';

    if (!currentUser) {
        const lockHTML = `<div style="text-align:center; padding: 40px; grid-column: 1/-1;"><h3 style="color:#cc0000;">🔒 Nội dung bị khóa</h3><p>Vui lòng đăng nhập để xem.</p><button onclick="openModal('login')" style="margin-top:10px; padding:10px 20px; cursor:pointer;">Đăng nhập ngay</button></div>`;
        latestContainer.innerHTML = lockHTML;
        allContainer.innerHTML = '';
        return;
    }

    try {
        // --- QUERY 1: LẤY ẢNH VỪA MỚI ĐĂNG (Trong vòng 24h qua) ---
        // Tính thời điểm 24 giờ trước
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: latestData, error: err1 } = await db
            .from('media')
            .select('*')
            .eq('grade', currentGrade)
            .eq('type', currentMediaType)
            .gte('created_at', oneDayAgo) // Lọc: Chỉ lấy file tạo từ 24h trước đến nay
            .order('created_at', { ascending: false }); // Mới nhất lên đầu
            // ⚠️ Đã XÓA dòng .limit(4) để hiện đầy đủ tất cả

        if (err1) throw err1;
        
        // Nếu không có ảnh nào mới trong 24h, hiện thông báo nhỏ
        if (!latestData || latestData.length === 0) {
            latestContainer.innerHTML = '<p style="text-align:center; color:#999; grid-column: 1/-1; font-style:italic;">Không có hoạt động mới trong 24h qua.</p>';
        } else {
            renderMediaItems(latestData, latestContainer);
        }

        // --- QUERY 2: LẤY TẤT CẢ KHO LƯU TRỮ (Giữ nguyên) ---
        const isAscending = sortValue === 'oldest';
        
        const { data: allData, error: err2 } = await db
            .from('media')
            .select('*')
            .eq('grade', currentGrade)
            .eq('type', currentMediaType)
            .order('created_at', { ascending: isAscending });

        if (err2) throw err2;
        
        galleryData = allData; 
        renderMediaItems(allData, allContainer, true);

    } catch (error) {
        alert("Lỗi tải dữ liệu: " + error.message);
    }
}

// Hàm phụ trợ để vẽ HTML (Tránh viết lặp lại code)
// --- BIẾN TOÀN CỤC MỚI ---
let selectedFileIds = []; // Mảng chứa ID các file đang chọn xóa

/* =========================================
   HÀM HIỂN THỊ (SỬA LẠI ĐỂ CÓ CHECKBOX)
   ========================================= */
/* =========================================
   CÁC HÀM HIỂN THỊ VÀ XỬ LÝ CHỌN (ĐÃ SỬA LỖI TRÙNG ID)
   ========================================= */

// 1. HÀM HIỂN THỊ (Sửa lại cách đặt ID để không bị lỗi)
function renderMediaItems(data, container, isMainGallery = false) {
    container.innerHTML = '';
    
    // Ẩn/Hiện thanh công cụ Admin
    if (isAdmin) {
        document.getElementById('admin-toolbar').style.display = 'flex';
    } else {
        document.getElementById('admin-toolbar').style.display = 'none';
    }

    if (!data || !data.length) {
        container.innerHTML = '<p style="text-align:center; color:#999; grid-column: 1/-1;">Chưa có dữ liệu.</p>';
        return;
    }

    data.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';
        // THAY ĐỔI QUAN TRỌNG: Dùng data-id thay vì id để tránh trùng lặp
        div.setAttribute('data-id', item.id); 

        // Checkbox Admin
        let adminCheckbox = '';
        if (isAdmin) {
            // Kiểm tra xem item này đã được chọn trước đó chưa (để giữ trạng thái tích V)
            const isChecked = selectedFileIds.includes(item.id) ? 'checked' : '';
            const isSelectedClass = selectedFileIds.includes(item.id) ? 'selected' : '';
            
            if(isSelectedClass) div.classList.add('selected');

            adminCheckbox = `<input type="checkbox" class="item-checkbox" value="${item.id}" onchange="toggleSelectItem('${item.id}')" ${isChecked} style="display:block">`;
        }

        // Nội dung ảnh/video
        let content = '';
        let lightboxIndex = index;
        if (!isMainGallery) {
            lightboxIndex = galleryData.findIndex(g => g.id === item.id);
            if (lightboxIndex === -1) lightboxIndex = 0;
        }

        if (item.type === 'image') {
            content = `<img src="${item.url}" class="media-content" onclick="openLightbox(${lightboxIndex})">`;
        } else {
            content = `<video class="media-content" controls><source src="${item.url}"></video>`;
        }
        
        const date = new Date(item.created_at).toLocaleDateString('vi-VN');

        div.innerHTML = `${adminCheckbox}${content}<div class="media-caption">
            <div class="caption-title">${item.title}</div>
            <div class="caption-date">${date}</div>
        </div>`;
        container.appendChild(div);
    });
}

// 2. HÀM CHỌN 1 MỤC (ĐỒNG BỘ CẢ 2 DANH SÁCH)
function toggleSelectItem(id) {
    // Kiểm tra xem ID này đang có trong danh sách chọn chưa
    const index = selectedFileIds.indexOf(id);

    if (index > -1) {
        // Nếu có rồi -> Xóa đi (Bỏ chọn)
        selectedFileIds.splice(index, 1);
    } else {
        // Nếu chưa có -> Thêm vào (Chọn)
        selectedFileIds.push(id);
    }

    // --- ĐỒNG BỘ GIAO DIỆN ---
    // Tìm TẤT CẢ các ô checkbox có cùng ID này (cả ở mục Mới và mục Tất cả)
    const allCheckboxesWithThisId = document.querySelectorAll(`.item-checkbox[value="${id}"]`);
    const allDivsWithThisId = document.querySelectorAll(`.media-item[data-id="${id}"]`);

    // Cập nhật trạng thái cho tất cả chúng
    const isSelected = selectedFileIds.includes(id);

    allCheckboxesWithThisId.forEach(cb => {
        cb.checked = isSelected;
    });

    allDivsWithThisId.forEach(div => {
        if (isSelected) div.classList.add('selected');
        else div.classList.remove('selected');
    });

    updateSelectedCount();
}

// 3. HÀM CHỌN TẤT CẢ (Sửa lại để quét đúng)
function toggleSelectAll() {
    const masterCheckbox = document.getElementById('select-all-checkbox');
    const isChecked = masterCheckbox.checked;
    
    selectedFileIds = []; // Reset danh sách

    // Lấy tất cả checkbox đang hiển thị trên màn hình
    const allCheckboxes = document.querySelectorAll('.item-checkbox');
    
    allCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        // Nếu đang tích chọn -> Thêm ID vào mảng
        if (isChecked) {
            selectedFileIds.push(cb.value);
        }
    });

    // Cập nhật giao diện viền đỏ
    const allDivs = document.querySelectorAll('.media-item');
    allDivs.forEach(div => {
        if (isChecked) div.classList.add('selected');
        else div.classList.remove('selected');
    });
    
    // Loại bỏ ID trùng lặp (vì 1 ảnh xuất hiện 2 nơi)
    selectedFileIds = [...new Set(selectedFileIds)];
    
    updateSelectedCount();
}

// 3. Cập nhật số lượng trên nút Xóa
function updateSelectedCount() {
    document.getElementById('selected-count').innerText = selectedFileIds.length;
}

// 4. HÀM XÓA CHÍNH (QUAN TRỌNG)
// 4. HÀM XÓA CHÍNH (ĐÃ SỬA LỖI NÚT BẤM)
async function deleteSelectedItems() {
    if (selectedFileIds.length === 0) return alert("Vui lòng chọn ít nhất 1 mục để xóa!");
    
    if (!confirm(`CẢNH BÁO ADMIN:\nBạn có chắc chắn muốn xóa vĩnh viễn ${selectedFileIds.length} mục đã chọn không?`)) return;

    const btn = document.querySelector('.btn-bulk-delete');
    const oldHTML = btn.innerHTML; // Lưu lại giao diện cũ (gồm cả icon và số lượng)
    
    // Đổi nút thành trạng thái đang chạy
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...'; 
    btn.disabled = true;

    try {
        // --- BƯỚC A: LẤY DANH SÁCH FILE PATH ĐỂ XÓA TRONG STORAGE ---
        const { data: filesToDelete, error: fetchErr } = await db
            .from('media')
            .select('url')
            .in('id', selectedFileIds);

        if (fetchErr) throw fetchErr;

        // Trích xuất tên file
        const fileNames = filesToDelete.map(item => {
            const parts = item.url.split('/');
            return parts[parts.length - 1];
        });

        if (fileNames.length > 0) {
            const { error: storageErr } = await db.storage
                .from('school_assets')
                .remove(fileNames);
            if (storageErr) console.warn("Lỗi xóa Storage:", storageErr);
        }

        // --- BƯỚC B: XÓA DỮ LIỆU TRONG DATABASE ---
        const { error: dbErr } = await db
            .from('media')
            .delete()
            .in('id', selectedFileIds);

        if (dbErr) throw dbErr;

        // --- BƯỚC C: KHÔI PHỤC GIAO DIỆN (QUAN TRỌNG: Làm trước khi update số) ---
        btn.innerHTML = oldHTML; // Trả lại cái khung có chứa id="selected-count"
        btn.disabled = false;

        alert("Đã xóa thành công!");
        
        // Reset trạng thái về 0
        selectedFileIds = [];
        document.getElementById('select-all-checkbox').checked = false;
        updateSelectedCount(); // Lúc này id="selected-count" đã có lại rồi nên không lỗi nữa
        
        renderGallery(); // Tải lại trang

    } catch (e) {
        alert("Có lỗi xảy ra: " + e.message);
        // Nếu lỗi cũng phải trả lại nút cũ
        btn.innerHTML = oldHTML;
        btn.disabled = false;
    } 
}

// --- CÁC HÀM LIGHTBOX (ZOOM ẢNH) ---

function openLightbox(index) {
    currentImageIndex = index;
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    const item = galleryData[index];

    modal.style.display = "block";
    img.src = item.url;
    caption.innerText = `${index + 1}/${galleryData.length} - ${item.title}`;
}

function closeLightbox() {
    document.getElementById('lightbox-modal').style.display = "none";
}

function changeSlide(n) {
    // Cộng trừ chỉ số ảnh
    currentImageIndex += n;

    // Xử lý vòng lặp (Cuối quay về Đầu, Đầu quay về Cuối)
    if (currentImageIndex >= galleryData.length) {
        currentImageIndex = 0;
    }
    if (currentImageIndex < 0) {
        currentImageIndex = galleryData.length - 1;
    }

    // Nếu gặp Video trong danh sách slide thì bỏ qua (hoặc hiển thị poster nếu muốn)
    // Ở đây ta cứ hiển thị, nhưng img tag có thể không chạy video. 
    // Tốt nhất là check loại:
    const item = galleryData[currentImageIndex];
    if (item.type === 'video') {
        // Nếu lướt trúng video, tự động nhảy tiếp cái nữa cho đến khi gặp ảnh
        // (Đây là cách xử lý đơn giản để Lightbox chỉ dành cho ảnh)
        if(galleryData.some(d => d.type === 'image')) { // Chỉ nhảy nếu còn ảnh khác
             changeSlide(n); 
             return;
        }
    }

    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    
    // Hiệu ứng mờ nhẹ khi chuyển
    img.style.opacity = 0;
    setTimeout(() => {
        img.src = item.url;
        caption.innerText = `${currentImageIndex + 1}/${galleryData.length} - ${item.title}`;
        img.style.opacity = 1;
    }, 200);
}

// Đóng lightbox khi bấm ra ngoài ảnh
window.onclick = function(event) {
    const modal = document.getElementById('lightbox-modal');
    if (event.target == modal) {
        closeLightbox();
    }
}

// -----------------------------------

async function deleteMedia(id, title) {
    if (!confirm(`Xóa bài viết: ${title}?`)) return;
    const { error } = await db.from('media').delete().eq('id', id);
    if (error) alert("Lỗi xóa: " + error.message);
    else { renderGallery(); }
}

// --- HÀM UPLOAD NHIỀU FILE (NÂNG CẤP) ---
async function handleFileUpload(input) {
    if (!input.files || input.files.length === 0) return;
    
    const files = Array.from(input.files); // Chuyển danh sách file thành Mảng
    const btn = document.querySelector('.btn-upload');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    // Vòng lặp xử lý từng file
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btn.innerText = `⏳ Đang tải ${i + 1}/${files.length}...`; // Cập nhật trạng thái
        
        try {
            const fileName = `${Date.now()}_${i}_${file.name.replace(/\s/g, '_')}`; // Thêm i để tránh trùng tên nếu up nhanh
            
            // 1. Upload Storage
            const { error: upErr } = await db.storage.from('school_assets').upload(fileName, file);
            if (upErr) throw upErr;
            
            // 2. Get URL
            const { data: urlData } = db.storage.from('school_assets').getPublicUrl(fileName);
            
            // 3. Insert Database
            const { error: dbErr } = await db.from('media').insert({
                title: file.name, 
                url: urlData.publicUrl, 
                type: currentMediaType,
                grade: currentGrade, 
                uploader_id: currentUser.id
            });

            if (dbErr) throw dbErr;
            successCount++;

        } catch (e) {
            console.error(e);
            failCount++;
        }
    }

    // Kết thúc
    alert(`Hoàn tất!\n✅ Thành công: ${successCount}\n❌ Thất bại: ${failCount}`);
    btn.innerHTML = originalText; 
    btn.disabled = false; 
    input.value = ''; // Reset ô input
    
    renderGallery(); // Tải lại giao diện
}

function triggerUpload() {
    if (!currentUser) return openModal('login');
    const userGrade = currentUser.user_metadata?.grade;
    if (!isAdmin && userGrade != currentGrade) {
        return alert(`Bạn là Học sinh Khối ${userGrade || '?'}, không được đăng bài vào Khối ${currentGrade}!`);
    }
    const fileInput = document.getElementById('file-input');
    fileInput.value = ''; fileInput.setAttribute('accept', currentMediaType === 'image' ? 'image/*' : 'video/*');
    fileInput.click();
}

function switchView(id) { document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view')); document.getElementById(id).classList.add('active-view'); }
function goToGradeMenu(g) { currentGrade = g; document.getElementById('grade-title').innerText = `KHO - KHỐI ${g}`; switchView('view-grade-menu'); }
function goToMediaDetail(t) { currentMediaType = t; document.getElementById('media-page-title').innerText = `${t === 'image' ? 'HÌNH ẢNH' : 'VIDEO'} - KHỐI ${currentGrade}`; document.getElementById('upload-type-text').innerText = t === 'image' ? 'Hình ảnh' : 'Video'; renderGallery(); switchView('view-media-detail'); }
function goToHome() { switchView('view-home'); }
function backToGradeMenu() { switchView('view-grade-menu'); }
function openModal(t) { document.getElementById(`modal-${t}`).style.display = 'flex'; }
function closeModal(t) { document.getElementById(`modal-${t}`).style.display = 'none'; }
function switchModal(f, t) { closeModal(f); openModal(t); }