import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
// Добавлены новые модули для обновления, поиска и удаления: getDocs, where, updateDoc, doc, deleteDoc
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, where, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Добавлен deleteObject для удаления картинок
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// ==========================================
// ВСТАВЬ СВОЙ КОНФИГ СЮДА (С РАЗБИТЫМ КЛЮЧОМ, КАК В ПРОШЛЫЙ РАЗ)
const firebaseConfig = {
  apiKey: "AIzaSyBlFUq_" + "oLSJbPSPi5VcidO_Aat03NrbMl4",
  authDomain: "pogopostcards-bfed2.firebaseapp.com",
  projectId: "pogopostcards-bfed2",
  storageBucket: "pogopostcards-bfed2.firebasestorage.app",
  messagingSenderId: "766118500807",
  appId: "1:766118500807:web:4b0aea05ea88ae8f7061e2",
  measurementId: "G-FDWJC6SYDE"
};
// ==========================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

const uploadForm = document.getElementById('uploadForm');
const imageInput = document.getElementById('imageInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const submitBtn = document.getElementById('submitBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const galleryGrid = document.getElementById('galleryGrid');

imageInput.addEventListener('change', (e) => {
    if(e.target.files.length > 0) {
        fileNameDisplay.textContent = "Выбран файл: " + e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = "Файл не выбран";
    }
});

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = imageInput.files[0];
    const stopName = document.getElementById('stopName').value.trim();
    if (!file || !stopName) return;

    const isAlbum = document.getElementById('chkAlbum').checked;
    const isFriend1 = document.getElementById('chkFriend1').checked;
    const isFriend2 = document.getElementById('chkFriend2').checked;

    submitBtn.disabled = true;
    loadingIndicator.classList.remove('hidden');

    try {
        // Шаг 1: Проверяем, есть ли уже открытка с таким названием
        const qSearch = query(collection(db, "postcards"), where("name", "==", stopName));
        const querySnapshot = await getDocs(qSearch);

        if (!querySnapshot.empty) {
            // ОТКРЫТКА НАЙДЕНА: Склеиваем данные
            const existingDoc = querySnapshot.docs[0];
            const existingData = existingDoc.data();

            await updateDoc(doc(db, "postcards", existingDoc.id), {
                // Если галочка уже стояла (true) ИЛИ мы ставим её сейчас (true) - будет true
                album: existingData.album || isAlbum,
                friend1: existingData.friend1 || isFriend1,
                friend2: existingData.friend2 || isFriend2
            });

            alert(`Открытка "${stopName}" обновлена! Новые галочки добавлены.`);
            // При склейке мы не загружаем картинку повторно, чтобы экономить место
        } else {
            // ОТКРЫТКА НЕ НАЙДЕНА: Создаем новую
            const imagePath = 'postcards/' + Date.now() + '_' + file.name;
            const fileRef = ref(storage, imagePath);
            
            await uploadBytes(fileRef, file);
            const imageUrl = await getDownloadURL(fileRef);

            await addDoc(collection(db, "postcards"), {
                name: stopName,
                imageUrl: imageUrl,
                imagePath: imagePath, // Сохраняем путь, чтобы потом легко удалить картинку
                album: isAlbum,
                friend1: isFriend1,
                friend2: isFriend2,
                createdAt: serverTimestamp()
            });
            alert("Новая открытка успешно сохранена!");
        }

        uploadForm.reset();
        fileNameDisplay.textContent = "Файл не выбран";

    } catch (error) {
        console.error("Ошибка при загрузке: ", error);
        alert("Произошла ошибка при загрузке. Проверьте консоль.");
    } finally {
        submitBtn.disabled = false;
        loadingIndicator.classList.add('hidden');
    }
});

// Элемент поиска (добавляем ссылку на наше новое поле)
const searchInput = document.getElementById('searchInput');

// Функция для живого поиска
function filterCards() {
    const queryText = searchInput.value.toLowerCase(); // Переводим текст поиска в нижний регистр
    const cards = document.querySelectorAll('.card'); // Находим все карточки на странице

    cards.forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        // Если в названии есть то, что мы ввели — показываем, если нет — скрываем
        if (title.includes(queryText)) {
            card.style.display = 'flex'; // Используем flex, т.к. у нас карточки с flexbox
        } else {
            card.style.display = 'none';
        }
    });
}

// Слушаем каждый ввод символа в поле поиска
searchInput.addEventListener('input', filterCards);

// Отображение галереи и удаление
const qDisplay = query(collection(db, "postcards"), orderBy("createdAt", "desc"));

onSnapshot(qDisplay, (snapshot) => {
    galleryGrid.innerHTML = ''; 
    
    snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        const card = document.createElement('div');
        card.className = 'card';

        let copiesNeeded = 0;
        let requiresAction = false;
        
        if(!data.album || !data.friend1 || !data.friend2) {
            requiresAction = true;
            const hasAny = data.album || data.friend1 || data.friend2;
            copiesNeeded = hasAny ? 1 : 2; 
        }

        const statusText = requiresAction 
            ? `Осталось добыть копий: ${copiesNeeded}` 
            : `Собрано полностью!`;
            
        const statusClass = requiresAction ? "need-copies" : "need-copies";

        // ЗДЕСЬ ИЗМЕНЕНЫ НАЗВАНИЯ В HTML-РАЗМЕТКЕ КАРТОЧКИ:
        card.innerHTML = `
            <img src="${data.imageUrl}" alt="Скриншот открытки" loading="lazy">
            <div class="card-content">
                <div class="card-title">${data.name}</div>
                <ul class="status-list">
                    <li>Альбом: <span class="${data.album ? 'status-yes' : 'status-no'}">${data.album ? '✅ Есть' : '❌ Нет'}</span></li>
                    <li>Tupra: <span class="${data.friend1 ? 'status-yes' : 'status-no'}">${data.friend1 ? '✅ Отправлено' : '❌ Ждет'}</span></li>
                    <li>zxcCUMKILLER228Pro: <span class="${data.friend2 ? 'status-yes' : 'status-no'}">${data.friend2 ? '✅ Отправлено' : '❌ Ждет'}</span></li>
                </ul>
                <div class="${statusClass}" style="${!requiresAction ? 'background:#e8f5e9; color:#2e7d32;' : ''}">${statusText}</div>
            </div>
        `;

        // Создаем кнопку удаления
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = '🗑 Удалить';
        
        // Логика удаления
        deleteBtn.onclick = async () => {
            if (confirm(`Точно удалить открытку "${data.name}"?`)) {
                try {
                    await deleteDoc(doc(db, "postcards", docSnapshot.id));
                    
                    if (data.imagePath) {
                        await deleteObject(ref(storage, data.imagePath));
                    } else if (data.imageUrl) {
                        await deleteObject(ref(storage, data.imageUrl));
                    }
                } catch (error) {
                    console.error("Ошибка при удалении: ", error);
                    alert("Не удалось удалить открытку. Возможно, она уже удалена.");
                }
            }
        };

        card.querySelector('.card-content').appendChild(deleteBtn);
        galleryGrid.appendChild(card);
    });

    // Запускаем фильтрацию сразу после отрисовки всех карточек.
    // Это нужно, чтобы при добавлении новой открытки во время активного поиска, 
    // она не ломала текущий фильтр.
    filterCards();
});
