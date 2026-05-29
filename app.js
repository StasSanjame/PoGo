import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBlFUq_" + "oLSJbPSPi5VcidO_Aat03NrbMl4",
    authDomain: "pogopostcards-bfed2.firebaseapp.com",
    projectId: "pogopostcards-bfed2",
    storageBucket: "pogopostcards-bfed2.firebasestorage.app",
    messagingSenderId: "766118500807",
    appId: "1:766118500807:web:4b0aea05ea88ae8f7061e2"
};
// ==========================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');
const controlsRight = document.getElementById('controlsRight');
const filterCounter = document.getElementById('filterCounter');

const sortSelect = document.getElementById('sortSelect');
const filterStatus = document.getElementById('filterStatus');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const filterCity = document.getElementById('filterCity');

const directionSelectPC = document.getElementById('directionSelectPC');
const directionSelectMobile = document.getElementById('directionSelectMobile');

const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const uploadForm = document.getElementById('uploadForm');
const stopDirection = document.getElementById('stopDirection');
const addRecipientsGroup = document.getElementById('addRecipientsGroup');

const btnOpenFilters = document.getElementById('btnOpenFilters');
const btnCloseFilters = document.getElementById('btnCloseFilters');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnScrollTop = document.getElementById('btnScrollTop');

let allCards = [];
let currentDirection = 'from_me'; // Режим просмотра по умолчанию: "Я"

// === КЛАССИФИКАЦИЯ СКЛАНЯЕМЫХ СЛОВ ===
function getPostcardWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 19) return "открыток";
    if (mod10 === 1) return "открытка";
    if (mod10 >= 2 && mod10 <= 4) return "открытки";
    return "открыток";
}

// === УПРАВЛЕНИЕ КАСТОМНЫМИ ВЫПАДАЮЩИМИ СПИСКАМИ (COMBOBOX) ===
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

// Инициализация списков главного окна добавления
bindCombobox(document.getElementById('comboCountryAdd'), () => [...new Set(allCards.map(c => c.country).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboCityAdd'), () => [...new Set(allCards.map(c => c.city).filter(Boolean))].sort());
bindCombobox(document.getElementById('comboRegionAdd'), () => [...new Set(allCards.map(c => c.region).filter(Boolean))].sort());

// Скрытие списка получателей в модалке добавления, если выбрано "Мне"
stopDirection.addEventListener('change', () => {
    if (stopDirection.value === 'to_me') addRecipientsGroup.classList.add('hidden');
    else addRecipientsGroup.classList.remove('hidden');
});

// === ОБРЕЗКА СКРИНШОТА ===
async function cropImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const originalHeight = 2532;
            const topCropRatio = 601 / originalHeight;
            const targetHeightRatio = 1105 / originalHeight;
            const topCrop = img.height * topCropRatio;
            const targetHeight = img.height * targetHeightRatio;

            canvas.width = img.width; canvas.height = targetHeight;
            ctx.drawImage(img, 0, topCrop, img.width, targetHeight, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), file.type || 'image/jpeg', 0.9);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// === ВАЛИДАЦИЯ И ПРЕОБРАЗОВАНИЕ ДАТ ===
function validateAndParseDate(str) {
    if (!str) return ""; 
    if (!/^\d{8}$/.test(str)) {
        alert("Ошибка: Дата должна состоять ровно из 8 цифр в формате ДДММГГГГ (например, 19052026) без точек и пробелов.");
        return null;
    }
    const day = parseInt(str.substring(0, 2), 10);
    const month = parseInt(str.substring(2, 4), 10);
    const year = parseInt(str.substring(4, 8), 10);

    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } else {
        alert(`Ошибка: Даты ${day}.${month}.${year} не существует в календаре.`);
        return null;
    }
}

function formatToUserText(dbStr) {
    if (!dbStr) return "";
    const parts = dbStr.split('-');
    if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
    return dbStr;
}

function formatToDisplay(dbStr) {
    if (!dbStr) return "Дата не указана";
    const parts = dbStr.split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dbStr;
}

// === СИНХРОНИЗАЦИЯ ПОЛЕЙ ДАТЫ ===
function setupDateInputs(textInput, nativeInput, calendarBtn) {
    calendarBtn.addEventListener('click', (e) => {
        if (window.innerWidth > 768) { // На ПК вызываем календарь скриптом
            e.preventDefault();
            try { nativeInput.showPicker(); } catch (err) {}
        }
    });

    nativeInput.addEventListener('change', (e) => {
        if (e.target.value) {
            const parts = e.target.value.split('-'); 
            textInput.value = `${parts[2]}${parts[1]}${parts[0]}`;
        }
    });
}

setupDateInputs(document.getElementById('stopDateText'), document.getElementById('stopDateNative'), document.getElementById('btnDateNative'));

// === СИНХРОНИЗАЦИЯ ТУМБЛЕРОВ НАПРАВЛЕНИЯ (Я/МНЕ) ===
function handleDirectionChange(val) {
    currentDirection = val;
    directionSelectPC.value = val;
    directionSelectMobile.value = val;
    
    // Если переключились на "Мне", прячем статус-фильтр (у получателей нет статусов выполнения)
    if (currentDirection === 'to_me') filterStatus.classList.add('hidden');
    else filterStatus.classList.remove('hidden');

    renderGallery();
}
directionSelectPC.addEventListener('change', (e) => handleDirectionChange(e.target.value));
directionSelectMobile.addEventListener('change', (e) => handleDirectionChange(e.target.value));

// === ФУНКЦИЯ СБРОСА ФИЛЬТРОВ ===
function resetAllFilters() {
    searchInput.value = '';
    sortSelect.value = 'dateDesc';
    filterStatus.value = 'all';
    filterCountry.value = 'all';
    filterRegion.value = 'all';
    filterCity.value = 'all';
    
    // Сброс направления
    currentDirection = 'from_me';
    directionSelectPC.value = 'from_me';
    directionSelectMobile.value = 'from_me';
    filterStatus.classList.remove('hidden'); // Возвращаем фильтр статусов
    
    renderGallery();
}
document.getElementById('btnResetPC').addEventListener('click', resetAllFilters);
document.getElementById('btnResetMobile').addEventListener('click', () => {
    resetAllFilters();
    controlsRight.classList.remove('open');
});

// === УПРАВЛЕНИЕ МОБИЛЬНЫМИ ФИЛЬТРАМИ ===
btnOpenFilters.addEventListener('click', () => controlsRight.classList.add('open'));
btnCloseFilters.addEventListener('click', () => controlsRight.classList.remove('open'));
btnApplyFilters.addEventListener('click', () => controlsRight.classList.remove('open'));

// === КНОПКА НАВЕРХ ===
window.addEventListener('scroll', () => {
    if (window.scrollY > 400) btnScrollTop.classList.remove('hidden');
    else btnScrollTop.classList.add('hidden');
});
btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// === СОХРАНЕНИЕ НОВОЙ ОТКРЫТКИ ===
btnOpenAddModal.addEventListener('click', () => {
    uploadForm.reset();
    addRecipientsGroup.classList.remove('hidden');
    addModal.classList.remove('hidden');
});
btnCloseAddModal.addEventListener('click', () => addModal.classList.add('hidden'));

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const rawDateText = document.getElementById('stopDateText').value.trim();
    const parsedDate = validateAndParseDate(rawDateText);
    if (rawDateText && parsedDate === null) return;

    const btn = document.getElementById('submitBtn');
    const loading = document.getElementById('loadingIndicator');
    btn.disabled = true; loading.classList.remove('hidden');

    try {
        const file = document.getElementById('imageInput').files[0];
        let imageUrl = null; let imagePath = null;
        if (file) {
            const croppedBlob = await cropImage(file);
            imagePath = 'postcards/' + Date.now() + '_' + file.name;
            const fileRef = ref(storage, imagePath);
            await uploadBytes(fileRef, croppedBlob);
            imageUrl = await getDownloadURL(fileRef);
        }

        const isToMe = stopDirection.value === 'to_me';
        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            direction: stopDirection.value,
            date: parsedDate,
            country: document.getElementById('stopCountry').value.trim(),
            region: document.getElementById('stopRegion').value.trim(),
            city: document.getElementById('stopCity').value.trim(),
            album: isToMe ? false : document.getElementById('chkAlbum').checked,
            friend1: isToMe ? false : document.getElementById('chkFriend1').checked,
            friend2: isToMe ? false : document.getElementById('chkFriend2').checked,
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

// === СЛУШАТЕЛЬ БД ===
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

// === РЕНДЕРИНГ ГАЛЕРЕИ И СЧЕТЧИКА ===
function renderGallery() {
    // 1. Фильтруем массив по выбранной вкладке ("Я" или "Мне")
    let categorized = allCards.filter(c => (c.direction || "from_me") === currentDirection);
    const totalInCurrentCategory = categorized.length;

    // 2. Применяем поисковые фильтры к этой категории
    let filtered = [...categorized];
    const queryText = searchInput.value.toLowerCase();
    if (queryText) filtered = filtered.filter(c => (c.name || "").toLowerCase().includes(queryText));

    if (currentDirection === 'from_me') {
        const statusVal = filterStatus.value;
        if (statusVal === 'completed') filtered = filtered.filter(c => c.album && c.friend1 && c.friend2);
        else if (statusVal === 'missing') filtered = filtered.filter(c => !(c.album && c.friend1 && c.friend2));
    }

    if (filterCountry.value !== 'all') filtered = filtered.filter(c => c.country === filterCountry.value);
    if (filterRegion.value !== 'all') filtered = filtered.filter(c => c.region === filterRegion.value);
    if (filterCity.value !== 'all') filtered = filtered.filter(c => c.city === filterCity.value);

    // 3. Вывод счетчика (Только для "Я" и только если количество уменьшилось из-за поисковых фильтров)
    if (currentDirection === 'from_me' && filtered.length < totalInCurrentCategory) {
        filterCounter.textContent = `${filtered.length} ${getPostcardWord(filtered.length)}`;
        filterCounter.classList.remove('hidden');
    } else {
        filterCounter.classList.add('hidden');
    }

    // 4. Сортировка
    const sortVal = sortSelect.value;
    filtered.sort((a, b) => {
        if (sortVal === 'dateDesc') return (b.date || "").localeCompare(a.date || "") || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        if (sortVal === 'dateAsc') return (a.date || "").localeCompare(b.date || "") || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
        if (sortVal === 'alphaAsc') return (a.name || "").localeCompare(b.name || "");
        if (sortVal === 'alphaDesc') return (b.name || "").localeCompare(a.name || "");
        if (sortVal === 'country') return (a.country || "").localeCompare(b.country || "");
        if (sortVal === 'region') return (a.region || "").localeCompare(b.region || "");
        if (sortVal === 'city') return (a.city || "").localeCompare(b.city || "");
        return 0;
    });

    galleryGrid.innerHTML = ''; 
    filtered.forEach(data => galleryGrid.appendChild(data.node));
}

searchInput.addEventListener('input', renderGallery);
sortSelect.addEventListener('change', renderGallery);
filterStatus.addEventListener('change', renderGallery);
filterCountry.addEventListener('change', renderGallery);
filterRegion.addEventListener('change', renderGallery);
filterCity.addEventListener('change', renderGallery);

// === ПРОСМОТР КАРТОЧКИ ===
function createCardReadView(data) {
    const card = document.createElement('div'); card.className = 'card';
    const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" loading="lazy">` : ``;
    const locArr = [data.country, data.region, data.city].filter(Boolean);
    const locText = locArr.length > 0 ? locArr.join(', ') : "Локация не указана";
    
    const isToMe = data.direction === 'to_me';
    const statusBlock = isToMe ? '' : `
        <ul class="status-list">
            <li>${data.album ? '✅' : '❌'} Альбом</li>
            <li>${data.friend1 ? '✅' : '❌'} Tupra</li>
            <li>${data.friend2 ? '✅' : '❌'} zxcCUMKILLER228pro</li>
        </ul>
    `;

    card.innerHTML = `
        <button class="btn-card-edit-pencil" title="Редактировать">✏️</button>
        <div class="card-img-wrapper">${imgHtml}</div>
        <div class="card-content">
            <div class="card-title">${data.name || "Без названия"}</div>
            <div class="card-location">
                📅 ${formatToDisplay(data.date)}<br>📍 ${locText}
            </div>
            ${statusBlock}
        </div>
    `;
    card.querySelector('.btn-card-edit-pencil').onclick = () => card.replaceWith(createCardEditView(data));
    return card;
}

// === РЕДАКТИРОВАНИЕ КАРТОЧКИ ===
function createCardEditView(data) {
    const card = document.createElement('div'); card.className = 'card';
    card.style.border = "1px solid var(--btn-primary)";
    
    const txtId = `editTxt_${data.id}`; const natId = `editNat_${data.id}`; const btnId = `btnEditDate_${data.id}`;
    const dirId = `editDir_${data.id}`; const recGroupId = `editRecGroup_${data.id}`;

    const isToMe = data.direction === 'to_me';

    card.innerHTML = `
        <div class="card-content" style="padding-top: 10px;">
            <label>Название:</label><input type="text" class="edit-name" value="${data.name || ''}">
            
            <label>Тип открытки:</label>
            <select id="${dirId}" style="width:100%; margin-bottom: 5px;">
                <option value="from_me" ${!isToMe ? 'selected' : ''}>Я (Подарил)</option>
                <option value="to_me" ${isToMe ? 'selected' : ''}>Мне (Получил)</option>
            </select>

            <label>Дата (8 цифр ДДММГГГГ):</label>
            <div class="date-input-group" style="margin-bottom:15px;">
                <input type="text" id="${txtId}" class="edit-date-text" value="${formatToUserText(data.date)}" placeholder="Например: 19052026" maxlength="8">
                <div class="calendar-wrapper">
                    <button type="button" class="calendar-btn" id="${btnId}">📅</button>
                    <input type="date" id="${natId}" class="native-date-input">
                </div>
            </div>

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
            
            <label>Заменить скриншот:</label><input type="file" class="edit-img" accept="image/*">
            
            <div id="${recGroupId}" class="checkbox-group ${isToMe ? 'hidden' : ''}">
                <label><input type="checkbox" class="edit-album" ${data.album ? 'checked' : ''}> Альбом</label>
                <label><input type="checkbox" class="edit-f1" ${data.friend1 ? 'checked' : ''}> Tupra</label>
                <label><input type="checkbox" class="edit-f2" ${data.friend2 ? 'checked' : ''}> zxcCUMKILLER228pro</label>
            </div>
            
            <button class="btn-submit btn-save" style="margin-top: 15px;">Сохранить</button>
            <button class="btn-cancel" style="margin-top: 10px;">Отмена</button>
            <button class="btn-delete-small">🗑 Удалить</button>
        </div>
    `;

    // Инициализация календаря и комбобоксов внутри карточки
    setTimeout(() => { 
        setupDateInputs(document.getElementById(txtId), document.getElementById(natId), document.getElementById(btnId)); 
        
        const combos = card.querySelectorAll('.custom-combobox');
        bindCombobox(combos[0], () => [...new Set(allCards.map(c => c.country).filter(Boolean))].sort());
        bindCombobox(combos[1], () => [...new Set(allCards.map(c => c.city).filter(Boolean))].sort());
        bindCombobox(combos[2], () => [...new Set(allCards.map(c => c.region).filter(Boolean))].sort());

        const dirSelect = document.getElementById(dirId);
        const recGroup = document.getElementById(recGroupId);
        dirSelect.addEventListener('change', () => {
            if (dirSelect.value === 'to_me') recGroup.classList.add('hidden');
            else recGroup.classList.remove('hidden');
        });
    }, 0);

    card.querySelector('.btn-cancel').onclick = () => card.replaceWith(data.node);

    card.querySelector('.btn-save').onclick = async () => {
        const rawDateText = document.getElementById(txtId).value.trim();
        const parsedDate = validateAndParseDate(rawDateText);
        if (rawDateText && parsedDate === null) return;

        const btnSave = card.querySelector('.btn-save');
        btnSave.textContent = "Сохранение..."; btnSave.disabled = true;

        try {
            const newFile = card.querySelector('.edit-img').files[0];
            let newImageUrl = data.imageUrl; let newImagePath = data.imagePath;

            if (newFile) {
                const croppedBlob = await cropImage(newFile);
                newImagePath = 'postcards/' + Date.now() + '_' + newFile.name;
                const fileRef = ref(storage, newImagePath);
                await uploadBytes(fileRef, croppedBlob);
                newImageUrl = await getDownloadURL(fileRef);
                if (data.imagePath) await deleteObject(ref(storage, data.imagePath)).catch(() => {});
            }

            const nextDir = document.getElementById(dirId).value;
            const finalToMe = nextDir === 'to_me';

            const updatedData = {
                name: card.querySelector('.edit-name').value.trim(),
                direction: nextDir,
                date: parsedDate,
                country: card.querySelector('.edit-country').value.trim(),
                region: card.querySelector('.edit-region').value.trim(),
                city: card.querySelector('.edit-city').value.trim(),
                album: finalToMe ? false : card.querySelector('.edit-album').checked,
                friend1: finalToMe ? false : card.querySelector('.edit-f1').checked,
                friend2: finalToMe ? false : card.querySelector('.edit-f2').checked,
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
