import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnOpenAddModalMobile = document.getElementById('btnOpenAddModalMobile');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const uploadForm = document.getElementById('uploadForm');

const btnOpenFilters = document.getElementById('btnOpenFilters');
const btnCloseFilters = document.getElementById('btnCloseFilters');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnScrollTop = document.getElementById('btnScrollTop');
const btnLogin = document.getElementById('btnLogin');

let allCards = [];

// === АВТОРИЗАЦИЯ ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }
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
        if (filtered.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'combobox-item';
            div.textContent = item;
            div.addEventListener('click', () => {
                input.value = item;
                dropdown.classList.add('hidden');
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
        if (dropdown.classList.contains('hidden')) {
            input.focus();
            renderDropdown('');
        } else {
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!containerEl.contains(e.target)) dropdown.classList.add('hidden');
    });
}

bindCombobox(document.getElementById('comboCountryAdd'), () => [...new Set(allCards.map(c => c.country).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboCityAdd'), () => [...new Set(allCards.map(c => c.city).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboRegionAdd'), () => [...new Set(allCards.map(c => c.region).filter(Boolean))].sort());

async function cropImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const topCropRatio = 0.58547;
            const targetHeightRatio = 0.66667; 
            
            const topCrop = img.width * topCropRatio;
            const targetHeight = img.width * targetHeightRatio;

            canvas.width = img.width; 
            canvas.height = targetHeight;
            
            ctx.drawImage(img, 0, topCrop, img.width, targetHeight, 0, 0, canvas.width, canvas.height);
            
            const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
            canvas.toBlob((blob) => resolve({ blob, base64 }), file.type || 'image/jpeg', 0.9);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

async function cropImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const W = img.width;
            const H = img.height;
            // Точные координаты горизонтальной текстовой плашки (на основе IMG_5890.jpg)
            const cropX = img.width * 0.48;        // Пропускаем левую половину с фото открытки
            const cropY = (H * 0.35) + 20;         // Верхняя граница белого прямоугольника
            const cropWidth = (W * 0.38) + 6;      // Текстовая зона до правого края открытки
            const cropHeight = (H * 0.20) - 24;    // Высота текстового блока карточки
            
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            
            ctx.drawImage(
                img, 
                cropX, cropY, cropWidth, cropHeight, // Откуда вырезаем
                0, 0, cropWidth, cropHeight          // Куда вставляем
            );
            
            const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
            
            // =========================================================
            // ВРЕМЕННЫЙ ВИЗУАЛЬНЫЙ ДЕБАГГЕР (Потом можно будет удалить)
            // =========================================================
            let debugImg = document.getElementById('ocrDebugPreview');
            if (!debugImg) {
                debugImg = document.createElement('img');
                debugImg.id = 'ocrDebugPreview';
                debugImg.style = "display:block; margin:15px auto; border:3px dashed #fde047; max-width:100%; padding:5px; background:#000;";
                // Вставляем превью сразу под индикатор загрузки текста в модалке
                document.getElementById('loadingIndicator').after(debugImg);
            }
            debugImg.src = "data:image/jpeg;base64," + base64;
            // =========================================================
            
            resolve(base64);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// === ИНТЕРФЕЙС ===
function resetAllFilters() {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    sortSelect.value = 'dateDesc';
    filterCountry.value = 'all';
    filterRegion.value = 'all';
    filterCity.value = 'all';
    renderGallery();
}
document.getElementById('btnResetPC').addEventListener('click', resetAllFilters);
document.getElementById('btnResetMobile').addEventListener('click', () => { resetAllFilters(); controlsRight.classList.remove('open'); });

btnOpenFilters.addEventListener('click', () => controlsRight.classList.add('open'));
btnCloseFilters.addEventListener('click', () => controlsRight.classList.remove('open'));
btnApplyFilters.addEventListener('click', () => controlsRight.classList.remove('open'));

window.addEventListener('scroll', () => {
    if (window.scrollY > 400) btnScrollTop.classList.remove('hidden');
    else btnScrollTop.classList.add('hidden');
});
btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

searchInput.addEventListener('input', (e) => {
    if (e.target.value.length > 0) {
        clearSearchBtn.classList.remove('hidden');
    } else {
        clearSearchBtn.classList.add('hidden');
    }
    renderGallery();
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderGallery();
});

function openAddModal() {
    uploadForm.reset();
    document.querySelectorAll('.track-input').forEach(input => input.classList.remove('auto-filled'));
    document.getElementById('duplicateWarning').classList.add('hidden');
    document.getElementById('ocrLimitWarning').classList.add('hidden');
    
    // Сбрасываем текст Drag&Drop и статус OCR
    document.getElementById('dropZoneText').textContent = "Нажмите или перетащите скриншот сюда";
    document.getElementById('ocrStatus').classList.add('hidden');
    
    // Удаляем картинку дебаггера, если она осталась от прошлой открытки
    const debugImg = document.getElementById('ocrDebugPreview');
    if (debugImg) debugImg.remove();
    
    currentCroppedBlob = null;
    addModal.classList.remove('hidden');
}
btnOpenAddModal.addEventListener('click', openAddModal);
btnOpenAddModalMobile.addEventListener('click', openAddModal);
btnCloseAddModal.addEventListener('click', () => addModal.classList.add('hidden'));

// === ВИЗУАЛ DRAG & DROP ===
const dropZone = document.getElementById('dropZone');
const dropZoneText = document.getElementById('dropZoneText');
const imageInput = document.getElementById('imageInput');
const ocrStatus = document.getElementById('ocrStatus');

imageInput.addEventListener('dragenter', () => dropZone.classList.add('dragover'));
imageInput.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
imageInput.addEventListener('drop', () => dropZone.classList.remove('dragover'));

// === ОБРАБОТКА ЗАГРУЗКИ И OCR ===
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
        dropZoneText.textContent = "Нажмите или перетащите скриншот сюда";
        return;
    }

    // Показываем имя файла и запускаем индикатор прямо под ним
    dropZoneText.textContent = `Выбран файл: ${file.name}`;
    document.getElementById('ocrLimitWarning').classList.add('hidden');
    
    ocrStatus.textContent = "⏳ Идет распознавание текста...";
    ocrStatus.style.color = "#60a5fa"; // Голубой цвет загрузки
    ocrStatus.classList.remove('hidden');
    
    document.getElementById('submitBtn').disabled = true;

    try {
        const { blob } = await cropImage(file);
        currentCroppedBlob = blob;

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
            checkDuplicate();
            
            ocrStatus.textContent = "✅ Текст успешно распознан!";
            ocrStatus.style.color = "#4ade80"; // Зеленый цвет успеха
        } else {
            ocrStatus.textContent = "❌ Ошибка распознавания: " + data.error;
            ocrStatus.style.color = "#f87171"; // Красный цвет ошибки
        }
    } catch (error) {
        console.error("Критическая ошибка вызова функции OCR:", error);
        ocrStatus.textContent = "❌ Сбой подключения к ИИ";
        ocrStatus.style.color = "#f87171";
    } finally {
        // Убираем старый текстовый индикатор с кнопки Submit, если он был
        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('submitBtn').disabled = false;
    }
});

// === ЛОГИКА OCR И ДУБЛИКАТОВ ===
let currentCroppedBlob = null;

function fillInputAndHighlight(inputId, text) {
    const input = document.getElementById(inputId);
    if (text) {
        input.value = text;
        input.classList.add('auto-filled');
    }
}

document.querySelectorAll('.track-input').forEach(input => {
    input.addEventListener('input', (e) => {
        e.target.classList.remove('auto-filled');
        checkDuplicate();
    });
});

document.getElementById('imageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('ocrLimitWarning').classList.add('hidden');
    document.getElementById('loadingIndicator').textContent = "Распознавание текста...";
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('submitBtn').disabled = true;

    try {
        // 1. Делаем кроп для сохранения в галерею базы данных
        const { blob } = await cropImage(file);
        currentCroppedBlob = blob;

        // 2. Делаем специальный "нижний" кроп для отправки в Google Vision
        const ocrBase64 = await cropImageForOCR(file);

        // 3. Отправляем обрезок в облако
        const recognizeText = httpsCallable(functions, 'recognizePostcardText');
        const response = await recognizeText({ image: ocrBase64 });
        const data = response.data;

        if (data.limitExceeded) {
            document.getElementById('ocrLimitWarning').classList.remove('hidden');
        } else if (data.success) {
            fillInputAndHighlight('stopName', data.title);
            fillInputAndHighlight('stopCountry', data.country);
            fillInputAndHighlight('stopRegion', data.region);
            fillInputAndHighlight('stopCity', data.city);
            checkDuplicate();
        } else {
            alert("Ошибка распознавания: " + data.error);
        }
    } catch (error) {
        console.error("Критическая ошибка вызова функции OCR:", error);
        alert("Сбой подключения к функции OCR. Проверь консоль разработчика (F12) для деталей: " + error.message);
    } finally {
        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('loadingIndicator').textContent = "Обработка и сохранение...";
        document.getElementById('submitBtn').disabled = false;
    }
});

// Функция нормализации текста (убирает пробелы, тире, спецсимволы и акценты)
function normalizeText(str) {
    if (!str) return "";
    return str
        .normalize("NFD")                 // Разбивает спецсимволы (напр. 'à' -> 'a' + '`')
        .replace(/[\u0300-\u036f]/g, "")  // Удаляет "хвостики" и акценты
        .replace(/[^a-zа-яё0-9]/gi, "")   // Удаляет ВСЁ, кроме английских/русских букв и цифр
        .toLowerCase();                   // Переводит в нижний регистр
}

function checkDuplicate(ignoreId = null) {
    const rawTitle = document.getElementById('stopName').value;
    const normTitle = normalizeText(rawTitle);
    const normCountry = normalizeText(document.getElementById('stopCountry').value);
    const normRegion = normalizeText(document.getElementById('stopRegion').value);
    const normCity = normalizeText(document.getElementById('stopCity').value);
    const warningBox = document.getElementById('duplicateWarning');

    // Если поле названия пустое, скрываем предупреждение
    if (!normTitle) {
        warningBox.classList.add('hidden');
        return;
    }

    // Сравниваем только нормализованные строки
    const isDuplicate = allCards.some(card => 
        card.id !== ignoreId &&
        normalizeText(card.name) === normTitle &&
        normalizeText(card.country) === normCountry &&
        normalizeText(card.region) === normRegion &&
        normalizeText(card.city) === normCity
    );

    if (isDuplicate) {
        warningBox.classList.remove('hidden');
        document.getElementById('viewDuplicateLink').onclick = (e) => {
            e.preventDefault();
            addModal.classList.add('hidden');
            searchInput.value = rawTitle.trim(); // Вставляем оригинальное название в поиск
            clearSearchBtn.classList.remove('hidden'); // Показываем крестик
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
    const loading = document.getElementById('loadingIndicator');
    btn.disabled = true; loading.classList.remove('hidden');

    try {
        let imageUrl = null; let imagePath = null;
        if (currentCroppedBlob) {
            imagePath = 'postcards/' + Date.now() + '_upload.jpg';
            const fileRef = ref(storage, imagePath);
            await uploadBytes(fileRef, currentCroppedBlob);
            imageUrl = await getDownloadURL(fileRef);
        }

        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            country: document.getElementById('stopCountry').value.trim(),
            region: document.getElementById('stopRegion').value.trim(),
            city: document.getElementById('stopCity').value.trim(),
            sanjame: document.getElementById('chkSanjame').checked,
            friend1: document.getElementById('chkFriend1').checked,
            friend2: document.getElementById('chkFriend2').checked,
            imageUrl: imageUrl, imagePath: imagePath,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "postcards"), dataObj);
        uploadForm.reset();
        addModal.classList.add('hidden');
    } catch (error) {
        console.error(error); alert("Ошибка при сохранении.");
    } finally {
        btn.disabled = false; loading.classList.add('hidden');
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

    // Изменение логики счетчика открыток
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

function createCardReadView(data) {
    const card = document.createElement('div'); card.className = 'card';
    const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" loading="lazy">` : ``;
    const locArr = [data.country, data.region, data.city].filter(Boolean);
    const locText = locArr.length > 0 ? locArr.join(', ') : "Локация не указана";
    
    card.innerHTML = `
        <button class="btn-card-edit-pencil admin-only" title="Редактировать">✏️</button>
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
    card.querySelector('.btn-card-edit-pencil').onclick = () => card.replaceWith(createCardEditView(data));
    return card;
}

function createCardEditView(data) {
    const card = document.createElement('div'); card.className = 'card';
    card.style.border = "1px solid var(--btn-primary)";
    
    card.innerHTML = `
        <div class="card-content" style="padding-top: 10px;">
            <label>Заменить скриншот:</label>
            <input type="file" class="edit-img" accept="image/*" style="margin-bottom: 10px;">
            
            <label>Название:</label><input type="text" class="edit-name" value="${data.name || ''}">

            <div class="form-row">
                <div>
                    <label>Страна:</label>
                    <div class="custom-combobox">
                        <input type="text" class="edit-country" value="${data.country || ''}" autocomplete="off">
                        <span class="combobox-arrow">▼</span>
                        <div class="combobox-dropdown hidden"></div>
                    </div>
                </div>
                <div>
                    <label>Город:</label>
                    <div class="custom-combobox">
                        <input type="text" class="edit-city" value="${data.city || ''}" autocomplete="off">
                        <span class="combobox-arrow">▼</span>
                        <div class="combobox-dropdown hidden"></div>
                    </div>
                </div>
            </div>
            
            <label>Регион:</label>
            <div class="custom-combobox" style="margin-bottom:10px;">
                <input type="text" class="edit-region" value="${data.region || ''}" autocomplete="off">
                <span class="combobox-arrow">▼</span>
                <div class="combobox-dropdown hidden"></div>
            </div>
            
            <label>Наличие у пользователей:</label>
            <div class="checkbox-group">
                <label><input type="checkbox" class="edit-sanjame" ${data.sanjame || data.album ? 'checked' : ''}> Sanjame</label>
                <label><input type="checkbox" class="edit-f1" ${data.friend1 ? 'checked' : ''}> Tupra</label>
                <label><input type="checkbox" class="edit-f2" ${data.friend2 ? 'checked' : ''}> zxcCUMKILLER228pro</label>
            </div>
            
            <button class="btn-submit btn-save" style="margin-top: 15px;">Сохранить</button>
            <button class="btn-cancel" style="margin-top: 10px;">Отмена</button>
            <button class="btn-delete-small">🗑 Удалить</button>
        </div>
    `;

    setTimeout(() => { 
        const combos = card.querySelectorAll('.custom-combobox');
        bindCombobox(combos[0], () => [...new Set(allCards.map(c => c.country).filter(Boolean))].sort());
        bindCombobox(combos[1], () => [...new Set(allCards.map(c => c.city).filter(Boolean))].sort());
        bindCombobox(combos[2], () => [...new Set(allCards.map(c => c.region).filter(Boolean))].sort());
    }, 0);

    card.querySelector('.btn-cancel').onclick = () => card.replaceWith(data.node);

    card.querySelector('.btn-save').onclick = async () => {
        const btnSave = card.querySelector('.btn-save');
        btnSave.textContent = "Сохранение..."; btnSave.disabled = true;

        try {
            const newFile = card.querySelector('.edit-img').files[0];
            let newImageUrl = data.imageUrl; let newImagePath = data.imagePath;

            if (newFile) {
                const { blob } = await cropImage(newFile);
                newImagePath = 'postcards/' + Date.now() + '_' + newFile.name;
                const fileRef = ref(storage, newImagePath);
                await uploadBytes(fileRef, blob);
                newImageUrl = await getDownloadURL(fileRef);
                if (data.imagePath) await deleteObject(ref(storage, data.imagePath)).catch(() => {});
            }

            const updatedData = {
                name: card.querySelector('.edit-name').value.trim(),
                country: card.querySelector('.edit-country').value.trim(),
                region: card.querySelector('.edit-region').value.trim(),
                city: card.querySelector('.edit-city').value.trim(),
                sanjame: card.querySelector('.edit-sanjame').checked,
                friend1: card.querySelector('.edit-f1').checked,
                friend2: card.querySelector('.edit-f2').checked,
                imageUrl: newImageUrl, imagePath: newImagePath
            };
            await updateDoc(doc(db, "postcards", data.id), updatedData);
        } catch (error) {
            console.error(error); alert("Не удалось сохранить.");
            btnSave.textContent = "Сохранить"; btnSave.disabled = false;
        }
    };

    card.querySelector('.btn-delete-small').onclick = async () => {
        if (confirm(`Удалить открытку "${data.name}"?`)) {
            try {
                await deleteDoc(doc(db, "postcards", data.id));
                if (data.imagePath) await deleteObject(ref(storage, data.imagePath));
            } catch (error) { console.error(error); }
        }
    };
    return card;
}
