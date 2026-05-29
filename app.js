import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ==========================================
// ВСТАВЬ СВОЙ КОНФИГ СЮДА
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

const sortSelect = document.getElementById('sortSelect');
const filterStatus = document.getElementById('filterStatus');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const filterCity = document.getElementById('filterCity');

const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const uploadForm = document.getElementById('uploadForm');

let allCards = [];

// === ФУНКЦИЯ ОБРЕЗКИ СКРИНШОТА ===
// Пропорционально отрезает верх и низ (эквивалент 601px и 826px от 2532px)
async function cropImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Высчитываем пропорции относительно оригинального размера 1170x2532
            const originalHeight = 2532;
            const topCropRatio = 601 / originalHeight;
            const targetHeightRatio = 1105 / originalHeight;

            const topCrop = img.height * topCropRatio;
            const targetHeight = img.height * targetHeightRatio;

            canvas.width = img.width;
            canvas.height = targetHeight;

            // Рисуем обрезанную часть на canvas
            ctx.drawImage(img, 0, topCrop, img.width, targetHeight, 0, 0, canvas.width, canvas.height);

            // Конвертируем обратно в файл
            canvas.toBlob((blob) => {
                resolve(blob);
            }, file.type || 'image/jpeg', 0.9);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}


// Управление модальным окном
btnOpenAddModal.addEventListener('click', () => addModal.classList.remove('hidden'));
btnCloseAddModal.addEventListener('click', () => addModal.classList.add('hidden'));

// === СОХРАНЕНИЕ НОВОЙ ОТКРЫТКИ ===
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const loading = document.getElementById('loadingIndicator');
    
    btn.disabled = true;
    loading.classList.remove('hidden');

    try {
        const file = document.getElementById('imageInput').files[0];
        let imageUrl = null;
        let imagePath = null;

        if (file) {
            // Обрезаем картинку перед загрузкой!
            const croppedBlob = await cropImage(file);
            
            imagePath = 'postcards/' + Date.now() + '_' + file.name;
            const fileRef = ref(storage, imagePath);
            await uploadBytes(fileRef, croppedBlob); // Загружаем обрезанную
            imageUrl = await getDownloadURL(fileRef);
        }

        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            date: document.getElementById('stopDate').value || "",
            country: document.getElementById('stopCountry').value.trim(),
            region: document.getElementById('stopRegion').value.trim(),
            city: document.getElementById('stopCity').value.trim(),
            album: document.getElementById('chkAlbum').checked,
            friend1: document.getElementById('chkFriend1').checked,
            friend2: document.getElementById('chkFriend2').checked,
            imageUrl: imageUrl,
            imagePath: imagePath,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "postcards"), dataObj);
        
        uploadForm.reset();
        addModal.classList.add('hidden');
    } catch (error) {
        console.error("Ошибка сохранения: ", error);
        alert("Произошла ошибка при сохранении.");
    } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
    }
});

// === ПОЛУЧЕНИЕ ДАННЫХ ===
onSnapshot(query(collection(db, "postcards")), (snapshot) => {
    allCards = [];
    snapshot.forEach((doc) => {
        allCards.push({ id: doc.id, ...doc.data() });
    });
    
    updateFilterOptions();
    renderGallery();
});

// === ОБНОВЛЕНИЕ ФИЛЬТРОВ И АВТОЗАПОЛНЕНИЯ (DATALISTS) ===
function updateFilterOptions() {
    const countries = new Set();
    const regions = new Set();
    const cities = new Set();

    allCards.forEach(card => {
        if(card.country) countries.add(card.country);
        if(card.region) regions.add(card.region);
        if(card.city) cities.add(card.city);
    });

    // Обновляем фильтры в верхней панели
    populateSelect(filterCountry, countries, "Все страны");
    populateSelect(filterRegion, regions, "Все регионы");
    populateSelect(filterCity, cities, "Все города");

    // Обновляем списки автозаполнения (Datalists) для форм ввода
    populateDatalist('countriesList', countries);
    populateDatalist('regionsList', regions);
    populateDatalist('citiesList', cities);
}

function populateSelect(selectElement, itemsSet, defaultText) {
    const currentValue = selectElement.value;
    selectElement.innerHTML = `<option value="all">${defaultText}</option>`;
    
    [...itemsSet].sort().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        selectElement.appendChild(option);
    });
    if ([...itemsSet].includes(currentValue)) selectElement.value = currentValue;
}

function populateDatalist(datalistId, itemsSet) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;
    datalist.innerHTML = '';
    [...itemsSet].sort().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        datalist.appendChild(option);
    });
}


// === ЛОГИКА ФИЛЬТРАЦИИ И СОРТИРОВКИ ===
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
    filtered.forEach(data => {
        galleryGrid.appendChild(createCardReadView(data));
    });
}

searchInput.addEventListener('input', renderGallery);
sortSelect.addEventListener('change', renderGallery);
filterStatus.addEventListener('change', renderGallery);
filterCountry.addEventListener('change', renderGallery);
filterRegion.addEventListener('change', renderGallery);
filterCity.addEventListener('change', renderGallery);

function formatDateStr(dateStr) {
    if (!dateStr) return "Дата не указана";
    const parts = dateStr.split('-');
    if(parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dateStr;
}

// === СОЗДАНИЕ КАРТОЧКИ (ЧТЕНИЕ) ===
function createCardReadView(data) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" loading="lazy">` : ``;

    const locArr = [data.country, data.region, data.city].filter(Boolean);
    const locText = locArr.length > 0 ? locArr.join(', ') : "Локация не указана";

    card.innerHTML = `
        <div class="card-img-wrapper">${imgHtml}</div>
        <div class="card-content">
            <div class="card-title">${data.name || "Без названия"}</div>
            <div class="card-location">
                🗓 ${formatDateStr(data.date)}<br>
                📍 ${locText}
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

// === СОЗДАНИЕ КАРТОЧКИ (РЕДАКТИРОВАНИЕ) ===
function createCardEditView(data) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.border = "1px solid var(--btn-primary)";

    card.innerHTML = `
        <div class="card-content" style="padding-top: 10px;">
            <label>Название:</label>
            <input type="text" class="edit-name" value="${data.name || ''}">

            <label>Дата:</label>
            <input type="date" class="edit-date" value="${data.date || ''}">

            <div class="form-row">
                <div><label>Страна:</label><input type="text" class="edit-country" list="countriesList" value="${data.country || ''}"></div>
                <div><label>Регион:</label><input type="text" class="edit-region" list="regionsList" value="${data.region || ''}"></div>
            </div>
            <label>Город:</label><input type="text" class="edit-city" list="citiesList" value="${data.city || ''}" style="margin-bottom:10px;">

            <label>Заменить/Добавить скриншот:</label>
            <input type="file" class="edit-img" accept="image/*">

            <div class="checkbox-group">
                <label><input type="checkbox" class="edit-album" ${data.album ? 'checked' : ''}> Альбом</label>
                <label><input type="checkbox" class="edit-f1" ${data.friend1 ? 'checked' : ''}> Tupra</label>
                <label><input type="checkbox" class="edit-f2" ${data.friend2 ? 'checked' : ''}> CUMKILLER</label>
            </div>

            <button class="btn-submit btn-save">Сохранить</button>
            <button class="btn-delete-small">🗑 Удалить открытку</button>
        </div>
    `;

    card.querySelector('.btn-save').onclick = async () => {
        const btnSave = card.querySelector('.btn-save');
        btnSave.textContent = "Сохранение...";
        btnSave.disabled = true;

        try {
            const newFile = card.querySelector('.edit-img').files[0];
            let newImageUrl = data.imageUrl;
            let newImagePath = data.imagePath;

            if (newFile) {
                // Обрезаем новую картинку перед загрузкой
                const croppedBlob = await cropImage(newFile);

                newImagePath = 'postcards/' + Date.now() + '_' + newFile.name;
                const fileRef = ref(storage, newImagePath);
                await uploadBytes(fileRef, croppedBlob);
                newImageUrl = await getDownloadURL(fileRef);

                if (data.imagePath) {
                    await deleteObject(ref(storage, data.imagePath)).catch(e => console.log("Старое фото не удалено:", e));
                }
            }

            const updatedData = {
                name: card.querySelector('.edit-name').value.trim(),
                date: card.querySelector('.edit-date').value,
                country: card.querySelector('.edit-country').value.trim(),
                region: card.querySelector('.edit-region').value.trim(),
                city: card.querySelector('.edit-city').value.trim(),
                album: card.querySelector('.edit-album').checked,
                friend1: card.querySelector('.edit-f1').checked,
                friend2: card.querySelector('.edit-f2').checked,
                imageUrl: newImageUrl,
                imagePath: newImagePath
            };

            await updateDoc(doc(db, "postcards", data.id), updatedData);
        } catch (error) {
            console.error("Ошибка обновления:", error);
            alert("Не удалось сохранить изменения.");
            btnSave.textContent = "Сохранить";
            btnSave.disabled = false;
        }
    };

    card.querySelector('.btn-delete-small').onclick = async () => {
        if (confirm(`Точно удалить открытку "${data.name}" НАВСЕГДА?`)) {
            try {
                await deleteDoc(doc(db, "postcards", data.id));
                if (data.imagePath) await deleteObject(ref(storage, data.imagePath));
            } catch (error) {
                console.error("Ошибка удаления:", error);
            }
        }
    };

    return card;
}
