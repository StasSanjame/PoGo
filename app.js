// === ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ (IndexedDB) ===
let db;
const request = indexedDB.open('PostcardsDB', 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadCards();
};

request.onerror = () => console.error('Ошибка подключения к базе данных');

// DOM Элементы панели управления
const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const filterStatus = document.getElementById('filterStatus');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const filterCity = document.getElementById('filterCity');

// Мобильная фильтрация
const btnOpenFilters = document.getElementById('btnOpenFilters');
const btnCloseFilters = document.getElementById('btnCloseFilters');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const controlsRight = document.getElementById('controlsRight');

// Модальное окно создания/редактирования
const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const uploadForm = document.getElementById('uploadForm');
const modalTitle = document.getElementById('modalTitle');
const editCardId = document.getElementById('editCardId');
const btnDeleteCard = document.getElementById('btnDeleteCard');
const loadingIndicator = document.getElementById('loadingIndicator');

// Поля ввода модалки
const stopName = document.getElementById('stopName');
const stopDateText = document.getElementById('stopDateText');
const stopDateNative = document.getElementById('stopDateNative');
const btnCalendarTrigger = document.getElementById('btnCalendarTrigger');
const stopCountry = document.getElementById('stopCountry');
const stopRegion = document.getElementById('stopRegion');
const stopCity = document.getElementById('stopCity');
const imageInput = document.getElementById('imageInput');
const chkAlbum = document.getElementById('chkAlbum');
const chkFriend1 = document.getElementById('chkFriend1');
const chkFriend2 = document.getElementById('chkFriend2');

// Списки автозаполнения
const countriesList = document.getElementById('countriesList');
const regionsList = document.getElementById('regionsList');
const citiesList = document.getElementById('citiesList');

// Кнопка Вверх
const btnScrollTop = document.getElementById('btnScrollTop');

let allCards = [];

// === СВЕРХНАДЕЖНЫЙ МЕХАНИЗМ СИНХРОНИЗАЦИИ И ВЫЗОВА КАЛЕНДАРЯ ===
if (btnCalendarTrigger && stopDateNative) {
    btnCalendarTrigger.addEventListener('click', (e) => {
        // Если кликнули по самой кнопке или по тексту эмодзи, программно вызываем выборщик даты
        if (e.target !== stopDateNative) {
            try {
                stopDateNative.showPicker();
            } catch (err) {
                stopDateNative.click();
            }
        }
    });
}

if (stopDateNative && stopDateText) {
    // Изменение даты в календаре заполняет текстовое поле в ДДММГГГГ
    stopDateNative.addEventListener('change', (e) => {
        if (e.target.value) {
            const parts = e.target.value.split('-'); // ГГГГ-ММ-ДД
            stopDateText.value = `${parts[2]}${parts[1]}${parts[0]}`;
        }
    });

    // Ручной ввод 8 цифр автоматически обновляет календарный input
    stopDateText.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length === 8) {
            const day = val.substring(0, 2);
            const month = val.substring(2, 4);
            const year = val.substring(4, 8);
            stopDateNative.value = `${year}-${month}-${day}`;
        }
    });
}

// === МОБИЛЬНЫЕ СОРТИРОВКИ / ФИЛЬТРЫ ===
btnOpenFilters.addEventListener('click', () => controlsRight.classList.add('open'));
btnCloseFilters.addEventListener('click', () => controlsRight.classList.remove('open'));
btnApplyFilters.addEventListener('click', () => {
    renderGrid();
    controlsRight.classList.remove('open');
});

// Слушатели фильтрации на лету для ПК
[sortSelect, filterStatus, filterCountry, filterRegion, filterCity].forEach(elem => {
    elem.addEventListener('change', () => {
        if (!controlsRight.classList.contains('open')) {
            renderGrid();
        }
    });
});
searchInput.addEventListener('input', renderGrid);

// === МОДАЛЬНОЕ ОКНО ===
btnOpenAddModal.addEventListener('click', () => openModal());
btnCloseAddModal.addEventListener('click', closeModal);

function openModal(card = null) {
    uploadForm.reset();
    stopDateNative.value = '';
    if (card) {
        modalTitle.textContent = 'Редактировать открытку';
        editCardId.value = card.id;
        stopName.value = card.name;
        stopDateText.value = card.date || '';
        if (card.date && card.date.length === 8) {
            stopDateNative.value = `${card.date.substring(4,8)}-${card.date.substring(2,4)}-${card.date.substring(0,2)}`;
        }
        stopCountry.value = card.country || '';
        stopRegion.value = card.region || '';
        stopCity.value = card.city || '';
        chkAlbum.checked = !!card.album;
        chkFriend1.checked = !!card.friend1;
        chkFriend2.checked = !!card.friend2;
        btnDeleteCard.classList.remove('hidden');
    } else {
        modalTitle.textContent = 'Новая открытка';
        editCardId.value = '';
        btnDeleteCard.classList.add('hidden');
    }
    addModal.classList.remove('hidden');
}

function closeModal() {
    addModal.classList.add('hidden');
}

// === КНОПКА СХОД-РАЗВАЛ "ВВЕРХ" ===
window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
        btnScrollTop.classList.remove('hidden');
    } else {
        btnScrollTop.classList.add('hidden');
    }
});
btnScrollTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// === СКАЧИВАНИЕ И ОПТИМИЗАЦИЯ ДАННЫХ ИЗ DB ===
function loadCards() {
    const transaction = db.transaction('cards', 'readonly');
    const store = transaction.objectStoreWithOriginalName ? transaction.objectStoreWithOriginalName('cards') : transaction.objectStore('cards');
    const getAll = store.getAll();

    getAll.onsuccess = () => {
        allCards = getAll.result;
        updateDatalistsAndFilters();
        renderGrid();
    };
}

// Заполнение выпадающих списков автозаполнения
function updateDatalistsAndFilters() {
    const countries = new Set();
    const regions = new Set();
    const cities = new Set();

    allCards.forEach(c => {
        if (c.country) countries.add(c.country.trim());
        if (c.region) regions.add(c.region.trim());
        if (c.city) cities.add(c.city.trim());
    });

    // Сохраняем выбранные значения фильтров перед сбросом
    const prevCountry = filterCountry.value;
    const prevRegion = filterRegion.value;
    const prevCity = filterCity.value;

    // Очистка и наполнение HTML списков
    countriesList.innerHTML = '';
    filterCountry.innerHTML = '<option value="all">Все страны</option>';
    Array.from(countries).sort().forEach(item => {
        countriesList.appendChild(new Option(item, item));
        filterCountry.appendChild(new Option(item, item));
    });

    regionsList.innerHTML = '';
    filterRegion.innerHTML = '<option value="all">Все регионы</option>';
    Array.from(regions).sort().forEach(item => {
        regionsList.appendChild(new Option(item, item));
        filterRegion.appendChild(new Option(item, item));
    });

    citiesList.innerHTML = '';
    filterCity.innerHTML = '<option value="all">Все города</option>';
    Array.from(cities).sort().forEach(item => {
        citiesList.appendChild(new Option(item, item));
        filterCity.appendChild(new Option(item, item));
    });

    // Возвращаем фильтры на место
    if (Array.from(countries).includes(prevCountry)) filterCountry.value = prevCountry;
    if (Array.from(regions).includes(prevRegion)) filterRegion.value = prevRegion;
    if (Array.from(cities).includes(prevCity)) filterCity.value = prevCity;
}

// === ФОРМИРОВАНИЕ ГРИДА КАРТОЧЕК И СОРТИРОВКА ===
function renderGrid() {
    galleryGrid.innerHTML = '';
    let filtered = [...allCards];

    // Поиск
    const searchVal = searchInput.value.toLowerCase().trim();
    if (searchVal) {
        filtered = filtered.filter(c => 
            (c.name && c.name.toLowerCase().includes(searchVal)) ||
            (c.country && c.country.toLowerCase().includes(searchVal)) ||
            (c.region && c.region.toLowerCase().includes(searchVal)) ||
            (c.city && c.city.toLowerCase().includes(searchVal))
        );
    }

    // Сортировка/Группировка по статусу владения
    const statusVal = filterStatus.value;
    if (statusVal === 'completed') {
        filtered = filtered.filter(c => c.album && c.friend1 && c.friend2);
    } else if (statusVal === 'missing') {
        filtered = filtered.filter(c => !(c.album && c.friend1 && c.friend2));
    }

    // Локационные селекты
    if (filterCountry.value !== 'all') filtered = filtered.filter(c => c.country === filterCountry.value);
    if (filterRegion.value !== 'all') filtered = filtered.filter(c => c.region === filterRegion.value);
    if (filterCity.value !== 'all') filtered = filtered.filter(c => c.city === filterCity.value);

    // Правило парсинга инвертированной даты YYYYMMDD для упорядочивания
    const parseDateSort = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return '00000000';
        return dateStr.substring(4,8) + dateStr.substring(2,4) + dateStr.substring(0,2);
    };

    // Основные методы сортировок
    const sortVal = sortSelect.value;
    if (sortVal === 'dateDesc') {
        filtered.sort((a, b) => parseDateSort(b.date).localeCompare(parseDateSort(a.date)));
    } else if (sortVal === 'dateAsc') {
        filtered.sort((a, b) => parseDateSort(a.date).localeCompare(parseDateSort(b.date)));
    } else if (sortVal === 'alphaAsc') {
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortVal === 'alphaDesc') {
        filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (['country', 'region', 'city'].includes(sortVal)) {
        filtered.sort((a, b) => (a[sortVal] || '').localeCompare(b[sortVal] || ''));
    }

    // Генерация карточек в DOM
    filtered.forEach(card => {
        const cardElem = document.createElement('div');
        cardElem.className = 'card';

        const displayDate = card.date ? `${card.date.substring(0,2)}.${card.date.substring(2,4)}.${card.date.substring(4,8)}` : 'Нет даты';
        
        // Создаем массив элементов местоположения
        const locArr = [];
        if (card.country) locArr.push(card.country.trim());
        if (card.region) locArr.push(card.region.trim());
        if (card.city) locArr.push(card.city.trim());
        const locString = locArr.length > 0 ? locArr.join(', ') : 'Местоположение не указано';

        // Вычисление дефицита копий
        let neededCopies = 0;
        if (!card.album) neededCopies++;
        if (!card.friend1) neededCopies++;
        if (!card.friend2) neededCopies++;

        const badgeHtml = neededCopies === 0 
            ? `<div class="btn-edit" style="color:#10b981; border-color:#10b981; text-align:center; font-weight:700; background:rgba(16,185,129,0.05);">Полная коллекция!</div>`
            : `<div class="btn-edit" style="color:#f97316; border-color:#f97316; text-align:center; font-weight:700; background:rgba(249,115,22,0.05);">Осталось собрать копий: ${neededCopies}</div>`;

        // Использование стабильного эмодзи 📅 (с числом 17) для безупречного вида на ПК и телефонах
        cardElem.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${card.image || 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%232a3152%22/%3E%3C/svg%3E'}" alt="Обложка">
            </div>
            <div class="card-content">
                <div class="card-title">${escapeHTML(card.name)}</div>
                <div class="card-location">
                    <span>📅 ${displayDate}</span>
                    <span>📍 ${escapeHTML(locString)}</span>
                </div>
                <ul class="status-list">
                    <li>${card.album ? '✅' : '❌'} Мой альбом</li>
                    <li>${card.friend1 ? '✅' : '❌'} Tupra</li>
                    <li>${card.friend2 ? '✅' : '❌'} CUMKILLER</li>
                </ul>
                ${badgeHtml}
            </div>
        `;

        // Клик по картинке вызывает редактирование открытки
        cardElem.querySelector('img').addEventListener('click', () => openModal(card));
        galleryGrid.appendChild(cardElem);
    });
}

// === СОХРАНЕНИЕ / ОБНОВЛЕНИЕ ДАННЫХ И СЖАТИЕ КАРТИНОК ===
uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = editCardId.value ? Number(editCardId.value) : null;
    const file = imageInput.files[0];

    submitBtn.disabled = true;
    loadingIndicator.classList.remove('hidden');

    const saveData = (base64Img) => {
        const transaction = db.transaction('cards', 'readwrite');
        const store = transaction.objectStore('cards');
        
        const cardData = {
            name: stopName.value.trim(),
            date: stopDateText.value.trim(),
            country: stopCountry.value.trim(),
            region: stopRegion.value.trim(),
            city: stopCity.value.trim(),
            album: chkAlbum.checked,
            friend1: chkFriend1.checked,
            friend2: chkFriend2.checked
        };

        if (base64Img) {
            cardData.image = base64Img;
        } else if (id) {
            // Если картинка не менялась при редактировании, подтягиваем старую
            const originalCard = allCards.find(c => c.id === id);
            if (originalCard && originalCard.image) cardData.image = originalCard.image;
        }

        if (id) {
            cardData.id = id;
            store.put(cardData);
        } else {
            store.add(cardData);
        }

        transaction.oncomplete = () => {
            submitBtn.disabled = false;
            loadingIndicator.classList.add('hidden');
            closeModal();
            loadCards();
        };
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Пропорция подгонки кадра под 1170x1105
                canvas.width = 1170;
                canvas.height = 1105;
                const ctx = canvas.getContext('2d');

                // Умный алгоритм кроппинга по центру (Сover)
                const imgRatio = img.width / img.height;
                const targetRatio = canvas.width / canvas.height;
                let sw, sh, sx, sy;

                if (imgRatio > targetRatio) {
                    sh = img.height;
                    sw = img.height * targetRatio;
                    sx = (img.width - sw) / 2;
                    sy = 0;
                } else {
                    sw = img.width;
                    sh = img.width / targetRatio;
                    sx = 0;
                    sy = (img.height - sh) / 2;
                }

                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                saveData(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        saveData(null);
    }
});

// === УДАЛЕНИЕ КАРТОЧКИ ===
btnDeleteCard.addEventListener('click', () => {
    const id = editCardId.value ? Number(editCardId.value) : null;
    if (id && confirm('Вы уверены, что хотите безвозвратно удалить эту открытку?')) {
        const transaction = db.transaction('cards', 'readwrite');
        const store = transaction.objectStore('cards');
        store.delete(id);

        transaction.oncomplete = () => {
            closeModal();
            loadCards();
        };
    }
});

// Вспомогательная функция санитизации текста от XSS уязвимостей
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
