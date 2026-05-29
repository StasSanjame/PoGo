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

const sortSelect = document.getElementById('sortSelect');
const filterStatus = document.getElementById('filterStatus');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const filterCity = document.getElementById('filterCity');

const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const uploadForm = document.getElementById('uploadForm');

const btnOpenFilters = document.getElementById('btnOpenFilters');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnScrollTop = document.getElementById('btnScrollTop');

let allCards = [];

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

// === СТРОГАЯ ВАЛИДАЦИЯ ДАТЫ И ПРЕОБРАЗОВАНИЕ В ГГГГ-ММ-ДД ===
function validateAndParseDate(str) {
    if (!str) return ""; // Пустая дата допускается
    
    // 1. Проверяем, что в строке строго 8 цифр и ничего более
    if (!/^\d{8}$/.test(str)) {
        alert("Ошибка: Дата должна состоять ровно из 8 цифр в формате ДДММГГГГ (например, 19052026) без точек и пробелов.");
        return null;
    }

    const day = parseInt(str.substring(0, 2), 10);
    const month = parseInt(str.substring(2, 4), 10);
    const year = parseInt(str.substring(4, 8), 10);

    // 2. Проверяем валидность календаря (дни, месяцы, високосные года)
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
        const mStr = String(month).padStart(2, '0');
        const dStr = String(day).padStart(2, '0');
        return `${year}-${mStr}-${dStr}`; // Всё ок, возвращаем формат для БД
    } else {
        alert(`Ошибка: Даты ${day}.${month}.${year} не существует в календаре.`);
        return null;
    }
}

// Перевод из формата БД (ГГГГ-ММ-ДД) в текст для пользователя (ДДММГГГГ)
function formatToUserText(dbStr) {
    if (!dbStr) return "";
    const parts = dbStr.split('-');
    if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
    return dbStr;
}

// Показ даты в карточке для чтения (ДД.ММ.ГГГГ)
function formatToDisplay(dbStr) {
    if (!dbStr) return "Дата не указана";
    const parts = dbStr.split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dbStr;
}

// === СИНХРОНИЗАЦИЯ ПОЛЕЙ ДАТЫ И ФИКС КАЛЕНДАРЯ НА ПК ===
function setupDateInputs(textInput, nativeInput, container) {
    // Нажатие на иконку календаря теперь принудительно вызывает окно на ПК
    const calendarBtn = container.querySelector('.calendar-btn');
    calendarBtn.addEventListener('click', (e) => {
        if (e.target !== nativeInput) {
            try { nativeInput.showPicker(); } catch (err) { nativeInput.click(); }
        }
    });

    // Изменение даты через календарь заносит данные в текстовое поле в формате ДДММГГГГ
    nativeInput.addEventListener('change', (e) => {
        if (e.target.value) {
            const parts = e.target.value.split('-'); // ГГГГ-ММ-ДД
            textInput.value = `${parts[2]}${parts[1]}${parts[0]}`;
        }
    });
}

// Настройка для главного окна добавления
setupDateInputs(document.getElementById('stopDateText'), document.getElementById('stopDateNative'), document.getElementById('addModal'));

// === УПРАВЛЕНИЕ МОБИЛЬНЫМИ ФИЛЬТРАМИ ===
btnOpenFilters.addEventListener('click', () => controlsRight.classList.add('open'));
btnApplyFilters.addEventListener('click', () => controlsRight.classList.remove('open'));

// === КНОПКА НАВЕРХ ===
window.addEventListener('scroll', () => {
    if (window.scrollY > 400) btnScrollTop.classList.remove('hidden');
    else btnScrollTop.classList.add('hidden');
});
btnScrollTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Модалка добавления
btnOpenAddModal.addEventListener('click', () => addModal.classList.remove('hidden'));
btnCloseAddModal.addEventListener('click', () => addModal.classList.add('hidden'));

// === СОХРАНЕНИЕ НОВОЙ ОТКРЫТКИ ===
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Проверяем и парсим дату
    const rawDateText = document.getElementById('stopDateText').value.trim();
    const parsedDate = validateAndParseDate(rawDateText);
    if (rawDateText && parsedDate === null) return; // Остановка, если дата введена с ошибкой

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

        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            date: parsedDate,
            country: document.getElementById('stopCountry').value.trim(),
            region: document.getElementById('stopRegion').value.trim(),
            city: document.getElementById('stopCity').value.trim(),
            album: document.getElementById('chkAlbum').checked,
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

// === СЛУШАТЕЛЬ БД (БЕЗ МИГАНИЯ DOM) ===
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
    populateDatalist('countriesList', countries);
    populateDatalist('regionsList', regions);
    populateDatalist('citiesList', cities);
}

function populateSelect(sel, items, defText) {
    const cur = sel.value; sel.innerHTML = `<option value="all">${defText}</option>`;
    [...items].sort().forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; sel.appendChild(o); });
    if ([...items].includes(cur)) sel.value = cur;
}

function populateDatalist(id, items) {
    const dl = document.getElementById(id); if (!dl) return; dl.innerHTML = '';
    [...items].sort().forEach(i => { const o = document.createElement('option'); o.value = i; dl.appendChild(o); });
}

function renderGallery() {
    let filtered = [...allCards];
    const queryText = searchInput.value.toLowerCase();
    if (queryText) filtered = filtered.filter(c => (c.name || "").toLowerCase().includes(queryText));

    const statusVal = filterStatus.value;
    if (statusVal === 'completed') filtered = filtered.filter(c => c.album && c.friend1 && c.friend2);
    else if (statusVal === 'missing') filtered = filtered.filter(c => !(c.album && c.friend1 && c.friend2));

    if (filterCountry.value !== 'all') filtered = filtered.filter(c => c.country === filterCountry.value);
    if (filterRegion.value !== 'all') filtered = filtered.filter(c => c.region === filterRegion.value);
    if (filterCity.value !== 'all') filtered = filtered.filter(c => c.city === filterCity.value);

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

// === ЧТЕНИЕ КАРТОЧКИ ===
function createCardReadView(data) {
    const card = document.createElement('div'); card.className = 'card';
    const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" loading="lazy">` : ``;
    const locArr = [data.country, data.region, data.city].filter(Boolean);
    const locText = locArr.length > 0 ? locArr.join(', ') : "Локация не указана";

    card.innerHTML = `
        <div class="card-img-wrapper">${imgHtml}</div>
        <div class="card-content">
            <div class="card-title">${data.name || "Без названия"}</div>
            <div class="card-location">
                🗓 ${formatToDisplay(data.date)}<br>📍 ${locText}
            </div>
            <ul class="status-list">
                <li>${data.album ? '✅' : '❌'} Альбом</li>
                <li>${data.friend1 ? '✅' : '❌'} Tupra</li>
                <li>${data.friend2 ? '✅' : '❌'} CUMKILLER</li>
            </ul>
            <button class="btn-edit">Редактировать</button>
        </div>
    `;
    card.querySelector('.btn-edit').onclick = () => card.replaceWith(createCardEditView(data));
    return card;
}

// === РЕДАКТИРОВАНИЕ КАРТОЧКИ ===
function createCardEditView(data) {
    const card = document.createElement('div'); card.className = 'card';
    card.style.border = "1px solid var(--btn-primary)";
    const txtId = `editTxt_${data.id}`; const natId = `editNat_${data.id}`;

    card.innerHTML = `
        <div class="card-content" style="padding-top: 10px;">
            <label>Название:</label><input type="text" class="edit-name" value="${data.name || ''}">
            <label>Дата (8 цифр ДДММГГГГ):</label>
            <div class="date-input-group" style="margin-bottom:15px;">
                <input type="text" id="${txtId}" class="edit-date-text" value="${formatToUserText(data.date)}" placeholder="Например: 19052026" maxlength="8">
                <div class="calendar-btn">📅<input type="date" id="${natId}"></div>
            </div>
            <div class="form-row">
                <div><label>Страна:</label><input type="text" class="edit-country" list="countriesList" value="${data.country || ''}"></div>
                <div><label>Регион:</label><input type="text" class="edit-region" list="regionsList" value="${data.region || ''}"></div>
            </div>
            <label>Город:</label><input type="text" class="edit-city" list="citiesList" value="${data.city || ''}" style="margin-bottom:10px;">
            <label>Заменить скриншот:</label><input type="file" class="edit-img" accept="image/*">
            <div class="checkbox-group">
                <label><input type="checkbox" class="edit-album" ${data.album ? 'checked' : ''}> Альбом</label>
                <label><input type="checkbox" class="edit-f1" ${data.friend1 ? 'checked' : ''}> Tupra</label>
                <label><input type="checkbox" class="edit-f2" ${data.friend2 ? 'checked' : ''}> CUMKILLER</label>
            </div>
            <button class="btn-submit btn-save">Сохранить</button>
            <button class="btn-cancel">Отмена</button>
            <button class="btn-delete-small">🗑 Удалить</button>
        </div>
    `;

    setTimeout(() => { setupDateInputs(document.getElementById(txtId), document.getElementById(natId), card); }, 0);

    // Кнопка ОТМЕНА — возвращает оригинальный DOM-элемент без лишних запросов
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
                if (data.imagePath) await deleteObject(ref(storage, data.imagePath)).catch(e => {});
            }

            const updatedData = {
                name: card.querySelector('.edit-name').value.trim(),
                date: parsedDate,
                country: card.querySelector('.edit-country').value.trim(),
                region: card.querySelector('.edit-region').value.trim(),
                city: card.querySelector('.edit-city').value.trim(),
                album: card.querySelector('.edit-album').checked,
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
