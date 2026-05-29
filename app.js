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

// Элементы интерфейса
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

// Глобальный массив всех открыток для локальной фильтрации/сортировки
let allCards = [];

// === УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ ===
btnOpenAddModal.addEventListener('click', () => addModal.classList.remove('hidden'));
btnCloseAddModal.addEventListener('click', () => addModal.classList.add('hidden'));

// === ЗАГРУЗКА НОВОЙ ОТКРЫТКИ ===
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

        // Загружаем картинку только если она выбрана
        if (file) {
            imagePath = 'postcards/' + Date.now() + '_' + file.name;
            const fileRef = ref(storage, imagePath);
            await uploadBytes(fileRef, file);
            imageUrl = await getDownloadURL(fileRef);
        }

        const dataObj = {
            name: document.getElementById('stopName').value.trim(),
            date: document.getElementById('stopDate').value || "", // YYYY-MM-DD
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

// === ПОЛУЧЕНИЕ ДАННЫХ ИЗ БАЗЫ В РЕАЛЬНОМ ВРЕМЕНИ ===
onSnapshot(query(collection(db, "postcards")), (snapshot) => {
    allCards = [];
    snapshot.forEach((doc) => {
        allCards.push({ id: doc.id, ...doc.data() });
    });
    
    updateFilterOptions();
    renderGallery();
});

// === ОБНОВЛЕНИЕ ВЫПАДАЮЩИХ СПИСКОВ (Уникальные значения) ===
function updateFilterOptions() {
    const countries = new Set();
    const regions = new Set();
    const cities = new Set();

    allCards.forEach(card => {
        if(card.country) countries.add(card.country);
        if(card.region) regions.add(card.region);
        if(card.city) cities.add(card.city);
    });

    populateSelect(filterCountry, countries, "Все страны");
    populateSelect(filterRegion, regions, "Все регионы");
    populateSelect(filterCity, cities, "Все города");
}

function populateSelect(selectElement, itemsSet, defaultText) {
    const currentValue = selectElement.value; // Запоминаем выбор пользователя
    selectElement.innerHTML = `<option value="all">${defaultText}</option>`;
    
    [...itemsSet].sort().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        selectElement.appendChild(option);
    });
    // Возвращаем выбор, если он все еще актуален
    if ([...itemsSet].includes(currentValue)) selectElement.value = currentValue;
}

// === ЛОГИКА ФИЛЬТРАЦИИ И СОРТИРОВКИ ===
function renderGallery() {
    let filtered = [...allCards];
    const queryText = searchInput.value.toLowerCase();

    // 1. Поиск по тексту
    if (queryText) {
        filtered = filtered.filter(c => (c.name || "").toLowerCase().includes(queryText));
    }

    // 2. Статус сбора
    const statusVal = filterStatus.value;
    if (statusVal === 'completed') {
        filtered = filtered.filter(c => c.album && c.friend1 && c.friend2);
    } else if (statusVal === 'missing') {
        filtered = filtered.filter(c => !(c.album && c.friend1 && c.friend2));
    }

    // 3. Локация
    if (filterCountry.value !== 'all') filtered = filtered.filter(c => c.country === filterCountry.value);
    if (filterRegion.value !== 'all') filtered = filtered.filter(c => c.region === filterRegion.value);
    if (filterCity.value !== 'all') filtered = filtered.filter(c => c.city === filterCity.value);

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

    // Отрисовка
    galleryGrid.innerHTML = '';
    filtered.forEach(data => {
        const cardNode = createCardReadView(data);
        galleryGrid.appendChild(cardNode);
    });
}

// Слушатели событий для перерисовки галереи
searchInput.addEventListener('input', renderGallery);
sortSelect.addEventListener('change', renderGallery);
filterStatus.addEventListener('change', renderGallery);
filterCountry.addEventListener('change', renderGallery);
filterRegion.addEventListener('change', renderGallery);
filterCity.addEventListener('change', renderGallery);


// === ФОРМАТИРОВАНИЕ ДАТЫ ===
function formatDateStr(dateStr) {
    if (!dateStr) return "Дата не указана";
    const parts = dateStr.split('-'); // YYYY-MM-DD
    if(parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dateStr;
}

// === СОЗДАНИЕ КАРТОЧКИ (РЕЖИМ ЧТЕНИЯ) ===
function createCardReadView(data) {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Блок с картинкой или белым фоном
    const imgHtml = data.imageUrl 
        ? `<img src="${data.imageUrl}" loading="lazy">` 
        : ``; // Оставляем пустой белый div

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

    // Кнопка редактирования переключает карточку в режим формы
    card.querySelector('.btn-edit').onclick = () => {
        card.replaceWith(createCardEditView(data));
    };

    return card;
}

// === СОЗДАНИЕ КАРТОЧКИ (РЕЖИМ РЕДАКТИРОВАНИЯ) ===
function createCardEditView(data) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.border = "1px solid var(--accent)"; // Подсветка режима редактирования

    card.innerHTML = `
        <div class="card-content" style="padding-top: 10px;">
            <label>Название:</label>
            <input type="text" class="edit-name" value="${data.name || ''}">

            <label>Дата:</label>
            <input type="date" class="edit-date" value="${data.date || ''}">

            <div class="form-row">
                <div><label>Страна:</label><input type="text" class="edit-country" value="${data.country || ''}"></div>
                <div><label>Регион:</label><input type="text" class="edit-region" value="${data.region || ''}"></div>
            </div>
            <label>Город:</label><input type="text" class="edit-city" value="${data.city || ''}" style="margin-bottom:10px;">

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

    // Логика Сохранения
    card.querySelector('.btn-save').onclick = async () => {
        const btnSave = card.querySelector('.btn-save');
        btnSave.textContent = "Сохранение...";
        btnSave.disabled = true;

        try {
            const newFile = card.querySelector('.edit-img').files[0];
            let newImageUrl = data.imageUrl;
            let newImagePath = data.imagePath;

            // Если выбрали новую картинку
            if (newFile) {
                // 1. Загружаем новую
                newImagePath = 'postcards/' + Date.now() + '_' + newFile.name;
                const fileRef = ref(storage, newImagePath);
                await uploadBytes(fileRef, newFile);
                newImageUrl = await getDownloadURL(fileRef);

                // 2. Удаляем старую (если была)
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
            // Firebase onSnapshot сам перерисует галерею после обновления!

        } catch (error) {
            console.error("Ошибка обновления:", error);
            alert("Не удалось сохранить изменения.");
            btnSave.textContent = "Сохранить";
            btnSave.disabled = false;
        }
    };

    // Логика Удаления (оставил внутри редактирования на всякий случай)
    card.querySelector('.btn-delete-small').onclick = async () => {
        if (confirm(`Точно удалить открытку "${data.name}" НАВСЕГДА?`)) {
            try {
                await deleteDoc(doc(db, "postcards", data.id));
                if (data.imagePath) {
                    await deleteObject(ref(storage, data.imagePath));
                }
            } catch (error) {
                console.error("Ошибка удаления:", error);
            }
        }
    };

    return card;
}
