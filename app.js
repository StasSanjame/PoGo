import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, doc, deleteDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlFUq_" + "oLSJbPSPi5VcidO_Aat03NrbMl4",
    authDomain: "pogopostcards-bfed2.firebaseapp.com",
    projectId: "pogopostcards-bfed2",
    storageBucket: "pogopostcards-bfed2.firebasestorage.app",
    messagingSenderId: "766118500807",
    appId: "1:766118500807:web:4b0aea05ea88ae8f7061e2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const provider = new GoogleAuthProvider();

const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const controlsRight = document.getElementById('controlsRight');
const filterCounter = document.getElementById('filterCounter');

const sortSelect = document.getElementById('sortSelect');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const filterCity = document.getElementById('filterCity');

const postcardModal = document.getElementById('postcardModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnOpenAddModalMobile = document.getElementById('btnOpenAddModalMobile');
const btnCloseModal = document.getElementById('btnCloseModal');
const uploadForm = document.getElementById('uploadForm');
const btnDeleteCardModal = document.getElementById('btnDeleteCardModal');

const btnOpenFilters = document.getElementById('btnOpenFilters');
const btnCloseFilters = document.getElementById('btnCloseFilters');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnScrollTop = document.getElementById('btnScrollTop');
const btnLogin = document.getElementById('btnLogin');

let allCards = [];
let currentEditCard = null; 
let currentCroppedBlob = null;

// === АВТОРИЗАЦИЯ ===
onAuthStateChanged(auth, (user) => {
    if (user) document.body.classList.add('is-admin');
    else document.body.classList.remove('is-admin');
});

btnLogin.addEventListener('click', () => {
    signInWithPopup(auth, provider).then(() => alert("Вход выполнен!")).catch(console.error);
});

document.querySelectorAll('.btn-logout-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
        if (confirm("Вы действительно хотите выйти из аккаунта?")) {
            signOut(auth).then(() => alert("Вы вышли из режима редактирования."));
        }
    });
});

// === ПОЛУЧЕНИЕ ЛИМИТА OCR ИЗ БАЗЫ ===
async function updateOcrLimitDisplay() {
    try {
        const limitRef = doc(db, "system", "ocr_limits");
        const docSnap = await getDoc(limitRef);
        const today = new Date().toISOString().split("T")[0];
        let used = 0;
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.date === today) used = data.count;
        }
        let remaining = Math.max(0, 500 - used);
        document.getElementById('ocrLimitDisplay').textContent = `(Осталось: ${remaining})`;
    } catch (error) {
        // Если правила базы запрещают чтение system/ocr_limits, ставим заглушку
        console.error("Нет доступа к чтению лимита (проверьте Firestore Rules):", error);
        document.getElementById('ocrLimitDisplay').textContent = "(Осталось: ~)";
    }
}

// === УТИЛИТЫ ===
function bindCombobox(containerEl, getItemsList) {
    const input = containerEl.querySelector('input');
    const arrow = containerEl.querySelector('.combobox-arrow');
    const dropdown = containerEl.querySelector('.combobox-dropdown');

    function renderDropdown(filterText = '') {
        const items = getItemsList();
        const normalizedFilter = filterText.toLowerCase();
        const filtered = items.filter(item => item.toLowerCase().includes(normalizedFilter));
        
        dropdown.innerHTML = '';
        if (filtered.length === 0) { dropdown.classList.add('hidden'); return; }
        
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'combobox-item';
            div.textContent = item;
            div.addEventListener('click', () => {
                input.value = item; dropdown.classList.add('hidden');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            dropdown.appendChild(div);
        });
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => renderDropdown(input.value));
    input.addEventListener('input', () => renderDropdown(input.value));
    
    arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('hidden')) { input.focus(); renderDropdown(''); } 
        else dropdown.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!containerEl.contains(e.target)) dropdown.classList.add('hidden');
    });
}

bindCombobox(document.getElementById('comboCountryAdd'), () => [...new Set(allCards.map(c => c.country).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboCityAdd'), () => [...new Set(allCards.map(c => c.city).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboRegionAdd'), () => [...new Set(allCards.map(c => c.region).filter(Boolean))].sort());

function normalizeText(str) {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zа-яё0-9]/gi, "").toLowerCase();
}

async function cropImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const topCropRatio = 0.58547; const targetHeightRatio = 0.66667; 
            const topCrop = img.width * topCropRatio; const targetHeight = img.width * targetHeightRatio;
            canvas.width = img.width; canvas.height = targetHeight;
            ctx.drawImage(img, 0, topCrop, img.width, targetHeight, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
            canvas.toBlob((blob) => resolve({ blob, base64 }), file.type || 'image/jpeg', 0.9);
        };
        img.onerror = reject; img.src = URL.createObjectURL(file);
    });
}

async function cropImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const W = img.width; const H = img.height;
            const cropX = W * 0.48;
            const cropY = (H * 0.35) + 20;     
            const cropWidth = (W * 0.38) + 6;   
            const cropHeight = (H * 0.20) - 24; 
            canvas.width = cropWidth; canvas.height = cropHeight;
            ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            resolve(canvas.toDataURL('image/jpeg').split(',')[1]);
        };
        img.onerror = reject; img.src = URL.createObjectURL(file);
    });
}

// === ИНТЕРФЕЙС ===
function resetAllFilters() {
    searchInput.value = ''; clearSearchBtn.classList.add('hidden');
    sortSelect.value = 'dateDesc'; filterCountry.value = 'all'; filterRegion.value = 'all'; filterCity.value = 'all';
    renderGallery();
}
document.getElementById('btnResetPC').addEventListener('click', resetAllFilters);

// === БЛОКИРОВКА СКРОЛЛА ДЛЯ МЕНЮ ФИЛЬТРОВ ===
btnOpenFilters.addEventListener('click', () => { 
    controlsRight.classList.add('open');
    document.body.style.overflow = 'hidden'; // Блокируем фон
});
btnCloseFilters.addEventListener('click', () => { 
    controlsRight.classList.remove('open');
    document.body.style.overflow = ''; // Возвращаем фон
});
btnApplyFilters.addEventListener('click', () => { 
    controlsRight.classList.remove('open');
    document.body.style.overflow = '';
});
document.getElementById('btnResetMobile').addEventListener('click', () => { 
    resetAllFilters(); 
    controlsRight.classList.remove('open'); 
    document.body.style.overflow = '';
});

window.addEventListener('scroll', () => {
    if (window.scrollY > 400) btnScrollTop.classList.remove('hidden');
    else btnScrollTop.classList.add('hidden');
});
btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

searchInput.addEventListener('input', (e) => {
    if (e.target.value.length > 0) clearSearchBtn.classList.remove('hidden');
    else clearSearchBtn.classList.add('hidden');
    renderGallery();
});
clearSearchBtn.addEventListener('click', () => {
    searchInput.value = ''; clearSearchBtn.classList.add('hidden');
    renderGallery();
});

function closeModal() {
    postcardModal.classList.add('hidden');
    document.body.style.overflow = ''; // Возвращаем скролл сайта
}

// === УНИВЕРСАЛЬНАЯ ЛОГИКА МОДАЛЬНОГО ОКНА ===
function openModal(editData = null) {
    document.body.style.overflow = 'hidden'; // Блокируем скролл сайта
    
    uploadForm.reset();
    document.querySelectorAll('.track-input').forEach(i => i.classList.remove('auto-filled'));
    document.getElementById('duplicateWarning').classList.add('hidden');
    document.getElementById('ocrLimitWarning').classList.add('hidden');
    document.getElementById('ocrStatus').classList.add('hidden');
    document.getElementById('saveStatus').classList.add('hidden');
    currentCroppedBlob = null;
    currentEditCard = editData;
    
    updateOcrLimitDisplay(); // Запрашиваем остаток из базы

    const ocrToggle = document.getElementById('ocrToggle');
    const dropZone = document.getElementById('dropZone');
    const previewContainer = document.getElementById('previewContainer');
    const btnReplaceText = document.getElementById('btnReplaceText');

    if (editData) {
        // Режим Редактирования
        document.getElementById('modalTitle').textContent = "Редактировать открытку";
        ocrToggle.checked = false; // По умолчанию выключен
        
        document.getElementById('stopName').value = editData.name || '';
        document.getElementById('stopCountry').value = editData.country || '';
        document.getElementById('stopRegion').value = editData.region || '';
        document.getElementById('stopCity').value = editData.city || '';
        document.getElementById('chkSanjame').checked = editData.sanjame || editData.album || false;
        document.getElementById('chkFriend1').checked = editData.friend1 || false;
        document.getElementById('chkFriend2').checked = editData.friend2 || false;

        // Показываем кнопку удаления только в режиме редактирования
        btnDeleteCardModal.classList.remove('hidden');

        // ИСПРАВЛЕНИЕ: Если в открытке есть скриншот - показываем его. Если нет - зону Drag&Drop
        if (editData.imageUrl) {
            dropZone.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            document.getElementById('previewImage').src = editData.imageUrl;
            btnReplaceText.classList.remove('hidden');
        } else {
            dropZone.classList.remove('hidden');
            document.getElementById('dropZoneText').textContent = "Нажмите или перетащите скриншот сюда";
            previewContainer.classList.add('hidden');
            btnReplaceText.classList.add('hidden');
        }

    } else {
        // Режим Добавления
        document.getElementById('modalTitle').textContent = "Новая открытка";
        ocrToggle.checked = true; // По умолчанию включен
        
        dropZone.classList.remove('hidden');
        document.getElementById('dropZoneText').textContent = "Нажмите или перетащите скриншот сюда";
        previewContainer.classList.add('hidden');
        btnReplaceText.classList.add('hidden');
        
        // Скрываем кнопку удаления в режиме добавления
        btnDeleteCardModal.classList.add('hidden');
    }

    postcardModal.classList.remove('hidden');
}

btnOpenAddModal.addEventListener('click', () => openModal(null));
btnOpenAddModalMobile.addEventListener('click', () => openModal(null));
// Заменяем старое закрытие на новую функцию
btnCloseModal.addEventListener('click', closeModal);

// Кнопки замены
const imageInput = document.getElementById('imageInput');
document.getElementById('btnReplaceText').addEventListener('click', () => imageInput.click());
document.getElementById('btnReplaceIcon').addEventListener('click', () => imageInput.click());

// === ВИЗУАЛ DRAG & DROP ===
const dropZone = document.getElementById('dropZone');
imageInput.addEventListener('dragenter', () => dropZone.classList.add('dragover'));
imageInput.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
imageInput.addEventListener('drop', () => dropZone.classList.remove('dragover'));

// === ОБРАБОТКА ЗАГРУЗКИ СКРИНШОТА ===
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ocrStatus = document.getElementById('ocrStatus');
    const ocrToggle = document.getElementById('ocrToggle');
    
    document.getElementById('ocrLimitWarning').classList.add('hidden');
    document.getElementById('submitBtn').disabled = true;

    ocrStatus.textContent = ocrToggle.checked ? "⏳ Обработка и распознавание..." : "⏳ Обрезка изображения...";
    ocrStatus.style.color = "#60a5fa";
    ocrStatus.classList.remove('hidden');

    try {
        const { blob, base64 } = await cropImage(file);
        currentCroppedBlob = blob;
        
        document.getElementById('dropZone').classList.add('hidden');
        document.getElementById('previewContainer').classList.remove('hidden');
        document.getElementById('previewImage').src = "data:image/jpeg;base64," + base64;
        document.getElementById('btnReplaceText').classList.remove('hidden');

        if (ocrToggle.checked) {
            const ocrBase64 = await cropImageForOCR(file);
            const recognizeText = httpsCallable(functions, 'recognizePostcardText');
            const response = await recognizeText({ image: ocrBase64 });
            const data = response.data;

            if (data.limitExceeded) {
                document.getElementById('ocrLimitWarning').classList.remove('hidden');
                ocrStatus.classList.add('hidden');
            } else if (data.success) {
                fillInputAndHighlight('stopName', data.title);
                fillInputAndHighlight('stopCountry', data.country);
                fillInputAndHighlight('stopRegion', data.region);
                fillInputAndHighlight('stopCity', data.city);
                checkDuplicate(currentEditCard ? currentEditCard.id : null);
                ocrStatus.textContent = "✅ Текст успешно распознан!";
                ocrStatus.style.color = "#4ade80";
                updateOcrLimitDisplay();
            } else {
                ocrStatus.textContent = "❌ Ошибка распознавания: " + data.error;
                ocrStatus.style.color = "#f87171";
            }
        } else {
            ocrStatus.textContent = "✅ Изображение готово (без OCR)";
            ocrStatus.style.color = "#4ade80";
        }
    } catch (error) {
        console.error("Ошибка обработки:", error);
        ocrStatus.textContent = "❌ Сбой при обработке изображения";
        ocrStatus.style.color = "#f87171";
    } finally {
        document.getElementById('submitBtn').disabled = false;
        setTimeout(() => {
            if (ocrStatus.textContent.includes('✅')) ocrStatus.classList.add('hidden');
        }, 3000);
    }
});

function fillInputAndHighlight(inputId, text) {
    const input = document.getElementById(inputId);
    if (text) { input.value = text; input.classList.add('auto-filled'); }
}

document.querySelectorAll('.track-input').forEach(input => {
    input.addEventListener('input', (e) => {
        e.target.classList.remove('auto-filled');
        checkDuplicate(currentEditCard ? currentEditCard.id : null);
    });
});

function checkDuplicate(ignoreId = null) {
    const normTitle = normalizeText(document.getElementById('stopName').value);
    const normCountry = normalizeText(document.getElementById('stopCountry').value);
    const normRegion = normalizeText(document.getElementById('stopRegion').value);
    const normCity = normalizeText(document.getElementById('stopCity').value);
    const warningBox = document.getElementById('duplicateWarning');

    if (!normTitle) { warningBox.classList.add('hidden'); return; }

    const isDuplicate = allCards.some(card => 
        card.id !== ignoreId &&
        normalizeText(card.name) === normTitle && normalizeText(card.country) === normCountry &&
        normalizeText(card.region) === normRegion && normalizeText(card.city) === normCity
    );

    if (isDuplicate) {
        warningBox.classList.remove('hidden');
        document.getElementById('viewDuplicateLink').onclick = (e) => {
            e.preventDefault();
            closeModal();
            searchInput.value = document.getElementById('stopName').value.trim();
            clearSearchBtn.classList.remove('hidden');
            renderGallery();
        };
    } else {
        warningBox.classList.add('hidden');
    }
}

// === СОХРАНЕНИЕ В FIRESTORE ===
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.textContent = "Сохранение..."; 
    saveStatus.style.color = "#60a5fa"; 
    saveStatus.classList.remove('hidden');

    try {
        let imageUrl = currentEditCard ? currentEditCard.imageUrl : null;
        let imagePath = currentEditCard ? currentEditCard.imagePath : null;

        if (currentCroppedBlob) {
            imagePath = 'postcards/' + Date.now() + '_upload.jpg';
            const fileRef = ref(storage, imagePath);
            await uploadBytes(fileRef, currentCroppedBlob);
            imageUrl = await getDownloadURL(fileRef);
            
            if (currentEditCard && currentEditCard.imagePath) {
                await deleteObject(ref(storage, currentEditCard.imagePath)).catch(() => {});
            }
        }

        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            country: document.getElementById('stopCountry').value.trim(),
            region: document.getElementById('stopRegion').value.trim(),
            city: document.getElementById('stopCity').value.trim(),
            sanjame: document.getElementById('chkSanjame').checked,
            friend1: document.getElementById('chkFriend1').checked,
            friend2: document.getElementById('chkFriend2').checked,
            imageUrl: imageUrl, imagePath: imagePath
        };

        if (currentEditCard) {
            await updateDoc(doc(db, "postcards", currentEditCard.id), dataObj);
        } else {
            dataObj.createdAt = serverTimestamp();
            await addDoc(collection(db, "postcards"), dataObj);
        }
        
        closeModal();
    } catch (error) {
        console.error(error); alert("Ошибка при сохранении.");
        ocrStatus.classList.add('hidden');
    } finally {
        btn.disabled = false;
    }
});

// === УДАЛЕНИЕ ОТКРЫТКИ ===
btnDeleteCardModal.addEventListener('click', async () => {
    if (currentEditCard && confirm(`Удалить открытку "${currentEditCard.name}"?`)) {
        try {
            await deleteDoc(doc(db, "postcards", currentEditCard.id));
            if (currentEditCard.imagePath) await deleteObject(ref(storage, currentEditCard.imagePath)).catch(() => {});
            closeModal();
        } catch (error) {
            console.error("Ошибка при удалении:", error); alert("Не удалось удалить открытку.");
        }
    }
});

// === ПОДГРУЗКА ИЗ FIRESTORE И РЕНДЕР ===
onSnapshot(query(collection(db, "postcards")), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            const data = { id: change.doc.id, ...change.doc.data() };
            data.node = createCardReadView(data);
            allCards.push(data);
        }
        if (change.type === "modified") {
            const index = allCards.findIndex(c => c.id === change.doc.id);
            if (index !== -1) {
                const data = { id: change.doc.id, ...change.doc.data() };
                const oldNode = allCards[index].node;
                data.node = createCardReadView(data);
                if (oldNode.parentNode) oldNode.replaceWith(data.node);
                allCards[index] = data;
            }
        }
        if (change.type === "removed") {
            const index = allCards.findIndex(c => c.id === change.doc.id);
            if (index !== -1) {
                if (allCards[index].node.parentNode) allCards[index].node.remove();
                allCards.splice(index, 1);
            }
        }
    });
    updateFilterOptions(); renderGallery();
});

function updateFilterOptions() {
    const countries = new Set(); const regions = new Set(); const cities = new Set();
    allCards.forEach(card => {
        if(card.country) countries.add(card.country);
        if(card.region) regions.add(card.region);
        if(card.city) cities.add(card.city);
    });
    populateSelect(filterCountry, countries, "Все страны");
    populateSelect(filterRegion, regions, "Все регионы");
    populateSelect(filterCity, cities, "Все города");
}

function populateSelect(sel, items, defText) {
    const cur = sel.value; sel.innerHTML = `<option value="all">${defText}</option>`;
    [...items].sort().forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; sel.appendChild(o); });
    if ([...items].includes(cur)) sel.value = cur;
}

function renderGallery() {
    let filtered = [...allCards];
    const queryText = searchInput.value.toLowerCase();
    if (queryText) filtered = filtered.filter(c => (c.name || "").toLowerCase().includes(queryText));

    if (filterCountry.value !== 'all') filtered = filtered.filter(c => c.country === filterCountry.value);
    if (filterRegion.value !== 'all') filtered = filtered.filter(c => c.region === filterRegion.value);
    if (filterCity.value !== 'all') filtered = filtered.filter(c => c.city === filterCity.value);

    const sortVal = sortSelect.value;
    filtered.sort((a, b) => {
        if (sortVal === 'dateDesc') return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        if (sortVal === 'dateAsc') return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
        if (sortVal === 'alphaAsc') return (a.name || "").localeCompare(b.name || "");
        if (sortVal === 'alphaDesc') return (b.name || "").localeCompare(a.name || "");
        if (sortVal === 'country') return (a.country || "").localeCompare(b.country || "");
        if (sortVal === 'region') return (a.region || "").localeCompare(b.region || "");
        if (sortVal === 'city') return (a.city || "").localeCompare(b.city || "");
        return 0;
    });

    if (filtered.length < allCards.length) {
        filterCounter.textContent = `Показано: ${filtered.length} из ${allCards.length}`;
        filterCounter.classList.remove('hidden');
    } else {
        filterCounter.classList.add('hidden');
    }

    galleryGrid.innerHTML = ''; 
    filtered.forEach(data => galleryGrid.appendChild(data.node));
}

sortSelect.addEventListener('change', renderGallery);
filterCountry.addEventListener('change', renderGallery);
filterRegion.addEventListener('change', renderGallery);
filterCity.addEventListener('change', renderGallery);

// === ВЬЮШКА КАРТОЧКИ В ГАЛЕРЕЕ ===
function createCardReadView(data) {
    const card = document.createElement('div'); card.className = 'card';
    const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" loading="lazy">` : ``;
    const locArr = [data.country, data.region, data.city].filter(Boolean);
    const locText = locArr.length > 0 ? locArr.join(', ') : "Локация не указана";
    
    card.innerHTML = `
        <button class="btn-card-edit-pencil admin-only" title="Редактировать">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                <path d="M15 5l4 4"></path>
            </svg>
        </button>
        <div class="card-img-wrapper">${imgHtml}</div>
        <div class="card-content">
            <div class="card-title">${data.name || "Без названия"}</div>
            <div class="card-location">📍 ${locText}</div>
            <ul class="status-list">
                <li>${data.sanjame || data.album ? '✅' : '❌'} Sanjame</li>
                <li>${data.friend1 ? '✅' : '❌'} Tupra</li>
                <li>${data.friend2 ? '✅' : '❌'} zxcCUMKILLER228pro</li>
            </ul>
        </div>
    `;
    
    // Клик по карандашу открывает модальное окно с загруженными данными
    card.querySelector('.btn-card-edit-pencil').onclick = () => openModal(data);
    
    return card;
}
