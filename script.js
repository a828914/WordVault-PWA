// 1. 初始化單字列表 (從瀏覽器本地儲存中讀取)
let words = [];
try {
    words = JSON.parse(localStorage.getItem('japaneseWords')) || [];
    if (!Array.isArray(words)) {
        words = [];
        console.warn("本地儲存的資料格式錯誤，已重置單字列表。");
    }
} catch (e) {
    words = [];
    console.error("讀取本地儲存資料失敗:", e);
}

// ----------------------------------------------------
// 【發音與分頁設定變數】
// ----------------------------------------------------\
let selectedVoice = null;
let currentPage = 1;
let wordsPerPage = 20; // 預設每頁顯示 20 個單字
let draggedWordId = null; // 用於拖曳排序

// ⭐ 新增：單字列表的排序模式
let sortMode = 'default'; // 預設為 'default' (手動順序/到期日混合)

// 全域變數用於追蹤測驗狀態
let quizWords = []; 
let currentWordIndex = 0;
let isFlipped = false;
let quizMode = 'jp_to_cn'; // 預設為日文到中文


// ----------------------------------------------------
// 【數據初始化與相容性檢查函式】
// ----------------------------------------------------\
function initializeWordsData() {
    let dataUpdated = false;
    words = words.map((word, index) => {
        // 檢查並補齊可能缺少的新屬性
        if (word.accent === undefined) {
            word.accent = '';
            dataUpdated = true;
        }
        if (word.reading === undefined) {
            word.reading = '';
            dataUpdated = true;
        }
        // 由於移除了例句功能，這裡將例句設置為空字串並標記更新
        if (word.example !== undefined) { 
             word.example = '';
             dataUpdated = true;
        }
        // 確保 nextReviewDate 存在且為數字
        if (typeof word.nextReviewDate !== 'number' || isNaN(word.nextReviewDate)) {
            word.nextReviewDate = new Date().setHours(0, 0, 0, 0); 
            dataUpdated = true;
        }
        
        // 確保 sortOrder 存在，用於手動拖曳排序
        if (word.sortOrder === undefined) {
            word.sortOrder = index; 
            dataUpdated = true;
        }
        
        // 確保 masteryDays 存在
        if (word.masteryDays === undefined) {
            word.masteryDays = 1;
            dataUpdated = true;
        }
        
        return word;
    });

    // 第一次初始化後，確保單字是根據 sortOrder 排序的
    if (words.length > 0) {
        words.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    if (dataUpdated) {
        saveWords();
        console.log("單字資料已成功升級/修復並新增 sortOrder。");
    }
}

// ----------------------------------------------------\
// 【發音引擎選擇邏輯】
// ----------------------------------------------------\

/**
 * 填充語音選擇下拉選單，並設定上次選定的語音。
 */
function populateVoiceList() {
    const select = document.getElementById('speech-voice-select');
    if (!select || !('speechSynthesis' in window)) return;
    
    const voices = window.speechSynthesis.getVoices().filter(voice => voice.lang.includes('ja'));
    
    select.innerHTML = ''; 
    
    const defaultOption = document.createElement('option');
    defaultOption.textContent = '自動選擇 (ja-JP)';
    defaultOption.value = '';
    select.appendChild(defaultOption);

    const storedVoiceName = localStorage.getItem('selectedVoiceName');
    let foundStoredVoice = false;

    voices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        
        if (storedVoiceName && voice.name === storedVoiceName) {
            option.selected = true;
            selectedVoice = voice; 
            foundStoredVoice = true;
        }
        select.appendChild(option);
    });

    if (!foundStoredVoice && storedVoiceName) {
        localStorage.removeItem('selectedVoiceName');
        selectedVoice = null;
    }
}

/**
 * 儲存選擇的語音名稱，並更新全域語音物件。
 * @param {string} voiceName - 選擇的語音名稱
 */
function selectVoiceAndSave(voiceName) {
    localStorage.setItem('selectedVoiceName', voiceName);
    
    if (!voiceName) {
        selectedVoice = null;
        return;
    }

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    
    if (voice) {
        selectedVoice = voice;
    } else {
        console.warn(`找不到語音引擎: ${voiceName}`);
        selectedVoice = null;
    }
}
// ----------------------------------------------------\

// 2. 儲存單字到本地儲存
function saveWords() {
    localStorage.setItem('japaneseWords', JSON.stringify(words));
}

// 3. 更新統計報告和複習按鈕的數字
function updateStats() {
    const currentTodayStart = new Date().setHours(0, 0, 0, 0);
    
    document.getElementById('total-words').textContent = words.length;

    const dueWordsCount = words.filter(wordObj => wordObj.nextReviewDate <= currentTodayStart).length;
    document.getElementById('due-words').textContent = dueWordsCount;
    
    // 更新按鈕上的計數
    document.getElementById('due-count-button').textContent = dueWordsCount;
    document.getElementById('all-count-button').textContent = words.length;

    const masteredCount = words.filter(wordObj => wordObj.mastery === 3).length;
    const masteredRatio = words.length > 0 ? ((masteredCount / words.length) * 100).toFixed(1) : 0;
    document.getElementById('mastered-ratio').textContent = `${masteredRatio}%`;
}

// 4. 新增單字的函式
function addWord() {
    const word = document.getElementById('word').value.trim();
    const reading = document.getElementById('reading').value.trim();
    const meaning = document.getElementById('meaning').value.trim();
    const accent = document.getElementById('accent').value.trim(); 

    if (!word || !meaning) {
        alert("請輸入日文單字和中文解釋！");
        return;
    }

    // 檢查是否有重複單字
    const existingWord = words.find(w => w.word.toLowerCase() === word.toLowerCase());

    if (existingWord) {
        const confirmation = confirm(
            `單字「${word}」已經存在於單字本中 (解釋: ${existingWord.meaning})。\n\n您確定還要新增一次嗎？`
        );
        
        if (!confirmation) {
            return;
        }
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);

    // 新增單字時，將 sortOrder 設為目前單字總數+1，確保它排在列表末尾
    const newWord = {
        id: Date.now(), 
        word: word,
        reading: reading,
        meaning: meaning,
        accent: accent, 
        example: '', 
        mastery: 1, 
        masteryDays: 1, 
        nextReviewDate: nextReview.getTime(), 
        addedDate: new Date().toLocaleDateString(),
        // 賦予新的排序位置，通常是目前最大的 sortOrder + 1
        sortOrder: words.length > 0 ? words.reduce((max, w) => Math.max(max, w.sortOrder), -1) + 1 : 0
    };

    words.push(newWord);
    saveWords();
    renderWordList();
    
    // 清空輸入欄位
    document.getElementById('word').value = '';
    document.getElementById('reading').value = '';
    document.getElementById('meaning').value = '';
    document.getElementById('accent').value = ''; 
}

// 5. 更新熟練度的函式 (實現 SRS 核心邏輯)
function updateMastery(id, level) {
    const wordIndex = words.findIndex(w => w.id === id);
    if (wordIndex === -1) return;

    const word = words[wordIndex];
    
    if (word.accent === undefined) word.accent = ''; 

    word.mastery = level;

    let daysToAdd; 
    
    if (level === 1) { 
        daysToAdd = 1; 
    } else if (level === 2) { 
        // 略熟：至少 3 天，之後 x2 增長
        daysToAdd = Math.max(3, word.masteryDays * 2); 
    } else if (level === 3) { 
        // 掌握：至少 7 天，之後 x3 增長
        daysToAdd = Math.max(7, word.masteryDays * 3); 
    }
    
    word.masteryDays = daysToAdd; 
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    // 設置為當天凌晨的時間戳
    word.nextReviewDate = nextDate.setHours(0, 0, 0, 0); 
    
    saveWords();
    updateStats();
}

// 輔助函式：更新熟練度並重新渲染列表 (供列表按鈕使用)
function updateMasteryAndRender(id, level) {
    updateMastery(id, level); // 呼叫核心邏輯
    renderWordList();        // 重新繪製列表
}

// 6. 刪除單字的函式
function deleteWord(id) {
    if (confirm("確定要刪除這個單字嗎？")) {
        words = words.filter(w => w.id !== id);
        saveWords();
        renderWordList();
    }
}

// ------------------------------------------
// 【排序控制函式】
// ------------------------------------------

/**
 * 改變單字列表的排序模式
 * @param {string} mode - 選擇的排序模式 (e.g., 'default', 'mastery_asc', 'mastery_desc')
 */
function changeSortOrder(mode) {
    // ⭐ 將排序模式儲存在全域變數中
    sortMode = mode; 
    // ⭐ 將當前排序模式儲存到 localStorage，以便下次載入時使用
    localStorage.setItem('sortMode', mode);
    currentPage = 1; // 改變排序後回到第一頁
    renderWordList();
}


// ------------------------------------------
// 【分頁控制函式】
// ------------------------------------------

/**
 * 改變每頁顯示的單字數量
 * @param {string} value - 選擇的值 (e.g., '10', '20', 'all')
 */
function changeWordsPerPage(value) {
    if (value === 'all') {
        wordsPerPage = Infinity; 
    } else {
        wordsPerPage = parseInt(value);
    }
    currentPage = 1; 
    // 修正: 統一使用 'words-per-page-select' 作為儲存鍵
    localStorage.setItem('words-per-page-select', value); 
    renderWordList();
}

/**
 * 跳轉到指定的頁面
 * @param {number} pageNum - 要跳轉的頁碼
 */
function goToPage(pageNum) {
    if (pageNum < 1) pageNum = 1;
    currentPage = pageNum;
    renderWordList();
    
    document.getElementById('list-title').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 渲染分頁按鈕
 * @param {number} totalPages - 總頁數
 */
function renderPaginationButtons(totalPages) {
    const container = document.getElementById('pagination-controls');
    container.innerHTML = '';
    
    const maxPagesToShow = 7;
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);

    if (totalPages > maxPagesToShow) {
        if (currentPage <= 4) {
            endPage = maxPagesToShow - 1; 
        } else if (currentPage >= totalPages - 3) {
            startPage = totalPages - maxPagesToShow + 2; 
        }
    }
    
    if (currentPage > 1) {
        container.innerHTML += `<button onclick="goToPage(${currentPage - 1})" class="page-button">&laquo; 上一頁</button>`;
    } else {
        container.innerHTML += `<button disabled class="page-button disabled-button">&laquo; 上一頁</button>`;
    }
    
    if (totalPages > maxPagesToShow && startPage > 1) {
        container.innerHTML += `<button onclick="goToPage(1)" class="page-button">1</button>`;
        container.innerHTML += `<span style="padding: 0 5px;">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active-page-button' : '';
        container.innerHTML += `<button onclick="goToPage(${i})" class="page-button ${activeClass}">${i}</button>`;
    }

    if (totalPages > maxPagesToShow && endPage < totalPages) {
        container.innerHTML += `<span style="padding: 0 5px;">...</span>`;
        container.innerHTML += `<button onclick="goToPage(${totalPages})" class="page-button">${totalPages}</button>`;
    }

    if (currentPage < totalPages) {
        container.innerHTML += `<button onclick="goToPage(${currentPage + 1})" class="page-button">下一頁 &raquo;</button>`;
    } else {
        container.innerHTML += `<button disabled class="page-button disabled-button">下一頁 &raquo;</button>`;
    }
}
// ------------------------------------------

// ------------------------------------------
// 【拖曳排序邏輯 (Drag and Drop)】
// ------------------------------------------

/**
 * 拖曳開始時儲存被拖曳單字的 ID
 * @param {Event} event 拖曳事件
 */
function dragStart(event) {
    // 只有在 'default' 排序模式下才允許拖曳
    if (sortMode !== 'default') {
        event.preventDefault(); // 阻止拖曳
        alert("請切換到「預設排序」才能使用拖曳功能。");
        return;
    }

    draggedWordId = event.target.dataset.id;
    event.dataTransfer.setData('text/plain', draggedWordId);
    event.target.classList.add('dragging');
}

/**
 * 拖曳進入目標元素時，顯示視覺回饋
 * @param {Event} event 拖曳事件
 */
function dragEnter(event) {
    if (sortMode !== 'default') return; // 只有預設排序下啟用
    
    // 檢查目標是否為單字卡本身
    let targetCard = event.target.closest('.word-card');

    // 清除所有卡片的 drop-target 類別
    document.querySelectorAll('.word-card').forEach(card => {
        card.classList.remove('drop-target-before', 'drop-target-after');
    });

    if (targetCard && targetCard.dataset.id !== draggedWordId) {
        // 判斷拖曳是發生在卡片前半部分還是後半部分
        const rect = targetCard.getBoundingClientRect();
        const y = event.clientY;
        const targetMidpoint = rect.top + rect.height / 2;

        if (y < targetMidpoint) {
            targetCard.classList.add('drop-target-before');
        } else {
            targetCard.classList.add('drop-target-after');
        }
    }
}

/**
 * 拖曳離開目標元素時，移除視覺回饋
 * @param {Event} event 拖曳事件
 */
function dragLeave(event) {
    if (sortMode !== 'default') return; // 只有預設排序下啟用
    
    let targetCard = event.target.closest('.word-card');
    if (targetCard) {
        targetCard.classList.remove('drop-target-before', 'drop-target-after');
    }
}

/**
 * 拖曳目標上方，允許放置
 * @param {Event} event 拖曳事件
 */
function allowDrop(event) {
    if (sortMode !== 'default') return; // 只有預設排序下啟用
    event.preventDefault(); 
}

/**
 * 放置發生時，更新單字陣列中的 sortOrder
 * @param {Event} event 拖曳事件
 */
function drop(event) {
    if (sortMode !== 'default') return; // 只有預設排序下啟用
    
    event.preventDefault();
    
    document.querySelectorAll('.word-card').forEach(card => {
        card.classList.remove('dragging', 'drop-target-before', 'drop-target-after');
    });

    const dropTargetCard = event.target.closest('.word-card');
    if (!dropTargetCard || !draggedWordId) return;

    const sourceId = parseInt(draggedWordId);
    const targetId = parseInt(dropTargetCard.dataset.id);

    if (sourceId === targetId) return; 

    // 1. 找到單字物件和索引
    const sourceWord = words.find(w => w.id === sourceId);
    const targetWord = words.find(w => w.id === targetId);
    if (!sourceWord || !targetWord) return;

    // 2. 判斷放置位置
    const isBefore = dropTargetCard.classList.contains('drop-target-before');
    
    // 3. 取得所有單字的 ID 陣列 (依照當前 sortOrder)
    const sortedWords = [...words].sort((a, b) => a.sortOrder - b.sortOrder);
    let wordIds = sortedWords.map(w => w.id);

    // 4. 在 ID 陣列中移除源 ID
    wordIds = wordIds.filter(id => id !== sourceId);
    
    // 5. 在目標位置插入源 ID
    const targetIndex = wordIds.indexOf(targetId);
    const insertIndex = isBefore ? targetIndex : targetIndex + 1;
    
    // 檢查 insertIndex 是否有效
    if (targetIndex !== -1) {
        wordIds.splice(insertIndex, 0, sourceId);
    } else {
        // 如果 targetId 找不到 (不應該發生)，則不做任何事
        return;
    }

    // 6. 更新所有單字的 sortOrder
    const wordIdMap = {};
    words.forEach(w => wordIdMap[w.id] = w);

    wordIds.forEach((id, index) => {
        if (wordIdMap[id]) {
            wordIdMap[id].sortOrder = index;
        }
    });

    // 7. 儲存並重新渲染
    saveWords();
    renderWordList();
    
    draggedWordId = null; 
}
// ------------------------------------------


// 7. 渲染單字列表 (結合搜索、篩選、分頁與排序)
function renderWordList() {
    const listContainer = document.getElementById('word-list');
    const paginationControls = document.getElementById('pagination-controls');
    listContainer.innerHTML = ''; 
    paginationControls.innerHTML = '';
    
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const filterValue = document.getElementById('filter-mastery').value;

    const currentTodayStart = new Date().setHours(0, 0, 0, 0);

    let filteredWords = words;
    
    // 1. 執行篩選邏輯
    if (filterValue === 'review') {
        filteredWords = filteredWords.filter(wordObj => 
            wordObj.nextReviewDate <= currentTodayStart
        );
    } else if (filterValue !== 'all') {
        const level = parseInt(filterValue);
        filteredWords = filteredWords.filter(wordObj => wordObj.mastery === level);
    }
    
    // 2. 執行文字搜索
    if (searchText) {
        filteredWords = filteredWords.filter(wordObj => 
            wordObj.word.toLowerCase().includes(searchText) ||
            wordObj.reading.toLowerCase().includes(searchText) ||
            wordObj.meaning.toLowerCase().includes(searchText)
        );
    }

    // 3. ⭐ 排序邏輯：根據 sortMode 進行排序 ⭐
    filteredWords.sort((a, b) => {
        if (sortMode === 'mastery_asc') {
            // 熟練度由低到高 (1 -> 2 -> 3)，不熟優先
            return a.mastery - b.mastery; 
        } else if (sortMode === 'mastery_desc') {
            // 熟練度由高到低 (3 -> 2 -> 1)，已掌握優先
            return b.mastery - a.mastery;
        } else { // 'default' 預設排序 (手動順序/到期日混合)
            const aIsDue = a.nextReviewDate <= currentTodayStart;
            const bIsDue = b.nextReviewDate <= currentTodayStart;

            // 優先將 DUE 的單字排在最前面
            if (aIsDue && !bIsDue) {
                return -1; 
            }
            if (!aIsDue && bIsDue) {
                return 1;
            }

            // 如果兩者都是 Due 或兩者都不是 Due，則使用手動設定的順序
            return a.sortOrder - b.sortOrder; 
        }
    });


    // 4. 核心分頁邏輯
    const totalWords = filteredWords.length;
    let wordsToDisplay = filteredWords;
    
    if (wordsPerPage !== Infinity && totalWords > wordsPerPage) {
        
        paginationControls.style.display = 'flex'; 
        
        const totalPages = Math.ceil(totalWords / wordsPerPage);
        
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }
        
        const startIndex = (currentPage - 1) * wordsPerPage;
        const endIndex = Math.min(startIndex + wordsPerPage, totalWords);
        
        wordsToDisplay = filteredWords.slice(startIndex, endIndex);

        renderPaginationButtons(totalPages);
        
    } else {
        // 如果單字數量不夠一頁，或者選擇了「全部」，則隱藏分頁控制項
        paginationControls.style.display = 'none';
    }

    // 5. 渲染單字卡片
    wordsToDisplay.forEach(wordObj => {
        const card = document.createElement('div');
        
        // 只有在 'default' 模式下才允許拖曳
        if (sortMode === 'default') {
            card.setAttribute('draggable', 'true');
            card.setAttribute('ondragstart', 'dragStart(event)');
            card.setAttribute('ondragenter', 'dragEnter(event)');
            card.setAttribute('ondragleave', 'dragLeave(event)');
            card.setAttribute('ondragover', 'allowDrop(event)');
            card.setAttribute('ondrop', 'drop(event)');
        }

        card.className = `word-card mastery-${wordObj.mastery}`; 
        card.dataset.id = wordObj.id; 

        const nextReviewDate = new Date(wordObj.nextReviewDate);
        const nextReviewDateStr = nextReviewDate.toLocaleDateString();
        
        const isDue = wordObj.nextReviewDate <= currentTodayStart;
        const reviewStatus = isDue 
            ? '<span class="is-due">🚨 立即複習</span>' 
            : `📅 ${nextReviewDateStr} (${wordObj.masteryDays}天)`;
        
        const accentDisplay = wordObj.accent 
            ? `<span class="accent-pitch">${wordObj.accent}</span>` 
            : '';

        card.innerHTML = `
            <div class="word-main">
                <span class="japanese" onclick="speakWord('${wordObj.word}')">${wordObj.word} 🔊</span>
                <span class="reading">(${wordObj.reading || 'N/A'})</span>
                ${accentDisplay} 
            </div>
            <p class="meaning">**解釋:** ${wordObj.meaning}</p>
            <div class="actions">
                <span class="review-info">${reviewStatus}</span>
                <button class="btn-edit" onclick="promptEditWord(${wordObj.id})">📝 編輯</button>
                <div class="btn-mastery-group">
                    <button class="btn-mastery-1" onclick="updateMasteryAndRender(${wordObj.id}, 1)">不熟</button>
                    <button class="btn-mastery-2" onclick="updateMasteryAndRender(${wordObj.id}, 2)">略熟</button>
                    <button class="btn-mastery-3" onclick="updateMasteryAndRender(${wordObj.id}, 3)">掌握</button>
                </div>
                <button class="btn-delete" onclick="deleteWord(${wordObj.id})">🗑️</button>
            </div>
        `;
        listContainer.appendChild(card);
    });

    if (filteredWords.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">沒有找到符合條件的單字。</p>';
    }

    updateStats(); 
}


// 8. 發音函式 (Web Speech API) - 使用選擇的語音和語速
function speakWord(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        
        const storedRate = localStorage.getItem('speechRate') || '1.0';
        utterance.rate = parseFloat(storedRate); 
        
        if (selectedVoice) {
            utterance.voice = selectedVoice; 
            utterance.lang = selectedVoice.lang;
        } else {
            utterance.lang = 'ja-JP'; 
        }
        
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("您的瀏覽器不支持語音發音功能。");
    }
}

// 9. 測驗模式下點擊單字發音 (總是發音日文單字)
function speakCurrentQuizWord() {
    if (currentWordIndex < quizWords.length) {
        const currentWord = quizWords[currentWordIndex];
        speakWord(currentWord.word);
    }
}

// 10. 資料備份/匯出功能
function exportData() {
    if (words.length === 0) {
        alert("單字本為空，無需備份。");
        return;
    }
    // 匯出時過濾掉 example 欄位 (如果存在的話)
    const exportWords = words.map(({ example, ...rest }) => rest);

    const dataStr = JSON.stringify(exportWords, null, 2); 
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = 'japanese_words_backup_' + new Date().toISOString().slice(0, 10) + '.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click(); 
    
    alert("單字資料已備份為 " + exportFileDefaultName);
}

// 11. ⭐ 資料匯入/恢復功能 ⭐
function importData(event) {
    const file = event.target.files[0];
    if (!file) return; // 沒有選擇檔案

    if (!file.name.endsWith('.json')) {
        alert("無效的檔案格式，請選擇 JSON 檔案。");
        return;
    }

    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedWords = JSON.parse(e.target.result);

            if (!Array.isArray(importedWords)) {
                alert("JSON 檔案格式錯誤，根元素不是陣列。");
                return;
            }

            // 確保匯入的單字具備必要的屬性，並賦予新的 ID 和 sortOrder
            let currentMaxSortOrder = words.length > 0 ? words.reduce((max, w) => Math.max(max, w.sortOrder), -1) : -1;

            const cleanImportedWords = importedWords.map((word, index) => {
                // 創建一個新的 ID 以避免與現有單字衝突
                const newId = Date.now() + index; 
                currentMaxSortOrder++;

                return {
                    id: newId,
                    word: String(word.word || '').trim(),
                    reading: String(word.reading || '').trim(),
                    meaning: String(word.meaning || '').trim(),
                    accent: String(word.accent || '').trim(),
                    example: '', 
                    mastery: parseInt(word.mastery) || 1,
                    masteryDays: parseInt(word.masteryDays) || 1,
                    // 確保 nextReviewDate 是數字，如果不是，則設為今天
                    nextReviewDate: (typeof word.nextReviewDate === 'number' && !isNaN(word.nextReviewDate)) ? word.nextReviewDate : new Date().setHours(0, 0, 0, 0),
                    addedDate: String(word.addedDate || new Date().toLocaleDateString()),
                    sortOrder: currentMaxSortOrder 
                };
            }).filter(w => w.word && w.meaning); // 過濾掉無效單字

            if (cleanImportedWords.length === 0) {
                 alert("匯入檔案中沒有發現有效的單字數據。");
                 return;
            }

            // 合併單字
            const initialCount = words.length;
            words = words.concat(cleanImportedWords);
            
            saveWords();
            renderWordList();
            
            alert(`成功匯入 ${cleanImportedWords.length} 個單字！單字總數從 ${initialCount} 變為 ${words.length}。`);

        } catch (error) {
            console.error("處理匯入檔案失敗:", error);
            alert("匯入失敗：檔案內容無效或已損壞。請檢查 JSON 格式。");
        } finally {
            // 清空檔案輸入框，以便可以再次匯入同一個檔案
            document.getElementById('import-file').value = ''; 
        }
    };

    reader.onerror = function() {
        alert("無法讀取檔案。");
    };

    reader.readAsText(file);
}

// 12. 編輯單字內容函式 (彈出選擇菜單)
function promptEditWord(id) {
    const wordIndex = words.findIndex(w => w.id === id);
    if (wordIndex === -1) return;

    const word = words[wordIndex];
    
    const fieldOptions = `
        選擇要編輯的欄位：
        1. 日文單字 (${word.word})
        2. 假名讀音 (${word.reading || 'N/A'})
        3. 中文解釋 (${word.meaning})
        4. 聲調 (${word.accent || 'N/A'})
    `;

    const choice = prompt(fieldOptions, '請輸入數字 (1-4)'); 

    if (!choice) return;

    const fieldMap = {
        '1': 'word',
        '2': 'reading',
        '3': 'meaning',
        '4': 'accent',
    };
    
    const fieldKey = fieldMap[choice.trim()];

    if (fieldKey) {
        const oldValue = word[fieldKey] || '';
        const promptText = `請輸入「${word.word}」的新${fieldKey}：`;
        const newValue = prompt(promptText, oldValue);

        if (newValue !== null) {
            updateWordContent(id, fieldKey, newValue.trim());
        }
    } else {
        alert("無效的選擇。請輸入 1 到 4 的數字。"); 
    }
}

/**
 * 根據欄位和 ID 更新單字內容
 * @param {number} id - 單字的 ID
 * @param {string} field - 要更新的欄位 (e.g., 'word', 'meaning')
 * @param {string} newValue - 新值
 */
function updateWordContent(id, field, newValue) {
    const wordIndex = words.findIndex(w => w.id === id);
    if (wordIndex === -1) return;
    
    if ((field === 'word' || field === 'meaning') && newValue.length === 0) {
        alert("日文單字和中文解釋不能為空！");
        return;
    }

    words[wordIndex][field] = newValue;

    if (field === 'word' || field === 'reading') {
        const confirmReset = confirm(`您修改了單字/讀音。是否重置熟練度為「不熟 (1天後複習)」？`);
        if (confirmReset) {
            updateMastery(id, 1);
        }
    }

    saveWords();
    renderWordList();
}


// --- 抽認卡測驗邏輯 ---

/**
 * 啟動測驗模式
 * @param {string} mode - 'due' (今日複習) 或 'all' (所有單字)
 */
function startQuiz(mode) {
    if (words.length === 0) {
        alert("單字本是空的，請先新增單字！");
        return;
    }
    
    // 獲取測驗方向
    quizMode = document.getElementById('quiz-direction').value;
    
    const currentTodayStart = new Date().setHours(0, 0, 0, 0); 
    
    if (mode === 'due') {
        quizWords = words.filter(wordObj => wordObj.nextReviewDate <= currentTodayStart);
        if (quizWords.length === 0) {
            alert("🎉 太棒了！今天沒有需要複習的單字。試試練習所有單字吧！");
            return;
        }
    } else if (mode === 'all') {
        quizWords = [...words]; // 複製所有單字
    } else {
        return; 
    }
    
    // 測驗單字隨機排序
    quizWords = quizWords.sort(() => Math.random() - 0.5);

    currentWordIndex = 0;
    
    // 隱藏列表相關控制項
    document.getElementById('list-controls').style.display = 'none';
    document.getElementById('word-list').style.display = 'none';
    document.getElementById('list-title').style.display = 'none';
    document.getElementById('quiz-buttons-group').style.display = 'none';
    document.getElementById('stats-summary').style.display = 'none';
    document.getElementById('pagination-controls').style.display = 'none'; 

    // 顯示測驗容器
    document.getElementById('quiz-container').style.display = 'flex'; // 使用 flex 確保內容置中

    showNextCard();
}

/**
 * 13. 退出測驗 (修正版本：確保所有元件恢復正確的 display 屬性)
 */
function exitQuiz() {
    document.getElementById('quiz-container').style.display = 'none';
    
    // 顯示列表相關控制項
    document.getElementById('list-controls').style.display = 'flex';     // 恢復 flex 佈局
    document.getElementById('word-list').style.display = 'flex';         // 恢復 flex 佈局
    document.getElementById('list-title').style.display = 'block';       // 恢復 block 佈局
    
    // 恢復測驗按鈕群組
    document.getElementById('quiz-buttons-group').style.display = 'flex'; 
    
    // 恢復統計概覽
    document.getElementById('stats-summary').style.display = 'block';
    
    // 恢復分頁控制項 (雖然 renderWordList 會處理，但保險起見將容器顯示)
    document.getElementById('pagination-controls').style.display = 'flex'; 

    renderWordList(); // 重新渲染列表，並再次判斷是否需要顯示分頁按鈕
}


// ------------------------------------------
// 【動態調整卡片高度函式】
// ------------------------------------------

/**
 * 根據當前顯示的面 (正面或背面) 來動態調整 .flashcard 的高度。
 * @param {boolean} isFlipped - 當前是否為翻面狀態
 */
function adjustCardHeight(isFlipped) {
    const flashcard = document.getElementById('flashcard');
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');

    if (!flashcard || !front || !back) return;
    
    // 1. 暫時將兩面的 position 改為 relative，以便測量其真實高度
    // 確保它們在測量時不會被 absolute 屬性影響
    front.style.position = 'relative';
    back.style.position = 'relative';
    
    // 2. 測量兩面的高度（scrollHeight 包含內容和 padding）
    const frontHeight = front.scrollHeight + 1; 
    const backHeight = back.scrollHeight + 1;   
    
    // 3. 找出當前應顯示的高度
    const targetHeight = isFlipped ? backHeight : frontHeight;
    
    // 4. 將兩個面恢復為 absolute position (恢復 3D 疊放狀態)
    front.style.position = 'absolute';
    back.style.position = 'absolute';

    // 5. 設置 flashcard 的高度，並確保不小於 CSS min-height: 150px
    flashcard.style.height = `${Math.max(150, targetHeight)}px`; 
}


// 14. 顯示下一張抽認卡 (根據測驗方向調整內容)
function showNextCard() {
    if (currentWordIndex >= quizWords.length) {
        alert(`測驗完成！您已經複習了 ${quizWords.length} 個單字。`);
        exitQuiz(); 
        return;
    }

    const currentWord = quizWords[currentWordIndex];
    
    let frontContent, frontReading, backContent;
    const cardFront = document.getElementById('card-front');
    const cardBack = document.getElementById('card-back');
    
    // 根據測驗方向設定正面和背面內容
    if (quizMode === 'jp_to_cn') {
        frontContent = currentWord.word;
        frontReading = currentWord.reading ? `[${currentWord.reading}]` : '';
        backContent = currentWord.meaning;
        cardFront.classList.remove('cn-font'); // 正面日文
        cardBack.classList.add('cn-font');    // 背面中文
    } else { // cn_to_jp
        frontContent = currentWord.meaning;
        frontReading = '';
        backContent = currentWord.word;
        cardFront.classList.add('cn-font');     // 正面中文
        cardBack.classList.remove('cn-font');   // 背面日文
    }
    
    // 填充卡片內容
    document.getElementById('quiz-word').textContent = frontContent;
    document.getElementById('quiz-reading').textContent = frontReading;
    document.getElementById('quiz-meaning').textContent = backContent;
    
    // 重設卡片狀態
    isFlipped = false;
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped'); 

    // 顯示正面，隱藏背面
    cardBack.style.display = 'none';
    cardFront.style.display = 'flex'; 
    
    document.getElementById('quiz-actions').style.display = 'none';
    document.getElementById('flip-button').textContent = quizMode === 'jp_to_cn' ? '翻面看答案 (中文)' : '翻面看答案 (日文)';

    // 更新進度顯示
    document.getElementById('quiz-count').textContent = `第 ${currentWordIndex + 1} / ${quizWords.length} 個單字`;

    // 只有在正面是日文時才自動發音
    if (quizMode === 'jp_to_cn') {
         speakCurrentQuizWord(); 
    }
    
    // 調整高度
    setTimeout(() => {
        adjustCardHeight(isFlipped);
    }, 50); 
}

// 15. 翻轉卡片 (只透過按鈕觸發)
function flipCard() {
    if (currentWordIndex >= quizWords.length) return; 
    
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.toggle('flipped'); 
    
    isFlipped = !isFlipped;
    const flipButton = document.getElementById('flip-button'); 
    
    // 1. 調整高度
    adjustCardHeight(isFlipped);
    
    // 2. 控制按鈕和內容顯示
    if (isFlipped) {
        document.getElementById('quiz-actions').style.display = 'flex';
        flipButton.textContent = quizMode === 'jp_to_cn' ? '已看答案 (中文)' : '已看答案 (日文)';
        // 翻面時發音 (如果正面不是日文)
        if (quizMode === 'cn_to_jp') {
            speakCurrentQuizWord();
        }
    } else {
        document.getElementById('quiz-actions').style.display = 'none';
        flipButton.textContent = quizMode === 'jp_to_cn' ? '翻面看答案 (中文)' : '翻面看答案 (日文)';
    }
    
    // 3. 延遲切換 display 屬性，確保 3D 轉場動畫的平滑性
    setTimeout(() => {
        const cardFront = document.getElementById('card-front');
        const cardBack = document.getElementById('card-back');
        
        if (isFlipped) {
             cardFront.style.display = 'none'; 
             cardBack.style.display = 'flex'; // 使用 flex 保持居中
        } else {
             cardFront.style.display = 'flex';
             cardBack.style.display = 'none'; 
        }
    }, 250); // 延遲 250ms，與 CSS 轉場時間 (0.5s) 協同作用
}

// 16. 提交測驗結果並跳到下一題
function submitQuizResult(level) {
    if (!isFlipped) {
        alert("請先翻面確認答案再選擇熟練度！");
        return;
    }
    
    const currentWord = quizWords[currentWordIndex];
    
    updateMastery(currentWord.id, level); 
    
    currentWordIndex++;
    showNextCard();
}

// 網頁載入完成後，執行一次渲染
window.onload = function() {
    initializeWordsData(); 
    
    // 1. 初始化發音速度選單
    const storedRate = localStorage.getItem('speechRate') || '1.0';
    const rateSelect = document.getElementById('speech-rate-select');
    if (rateSelect) {
        rateSelect.value = storedRate;
    }
    
    // 2. 初始化每頁顯示數量
    // ⭐ 注意：這裡使用 'words-per-page-select' 作為鍵，與 changeWordsPerPage 函式保持一致
    const storedWordsPerPage = localStorage.getItem('words-per-page-select') || '20'; 
    const perPageSelect = document.getElementById('words-per-page');
    if (perPageSelect) {
        perPageSelect.value = storedWordsPerPage;
        // 這裡需要手動設定 wordsPerPage，因為 changeWordsPerPage 會觸發 renderWordList
        if (storedWordsPerPage === 'all') {
            wordsPerPage = Infinity;
        } else {
            wordsPerPage = parseInt(storedWordsPerPage);
        }
    }
    
    // 3. ⭐ 初始化排序模式 ⭐
    const storedSortMode = localStorage.getItem('sortMode') || 'default';
    const sortSelect = document.getElementById('sort-by');
    if (sortSelect) {
        sortSelect.value = storedSortMode;
        sortMode = storedSortMode;
    }

    // 4. 初始化語音引擎選擇
    if ('speechSynthesis' in window) {
        if (window.speechSynthesis.getVoices().length > 0) {
            populateVoiceList();
        } else {
            window.speechSynthesis.onvoiceschanged = populateVoiceList;
        }
    }
    
    // 5. 為拖曳事件註冊全域事件處理程序
    document.getElementById('word-list').addEventListener('dragover', allowDrop);
    document.getElementById('word-list').addEventListener('drop', drop);

    renderWordList(); 
}