// ==UserScript==
// @name         Mark Video Watched & Tools (with Quiz Helper)
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  Отмечает видео, копирует вопросы, кэширует правильные ответы и подсвечивает их.
// @author       I3eka
// @match        https://uni-x.almv.kz/*
// @icon         https://uni-x.almv.kz/favicon.ico
// @grant        GM_cookie
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      uni-x.almv.kz
// @homepageURL  https://github.com/I3eka/uni-x-userscript
// @supportURL   https://github.com/I3eka/uni-x-userscript/issues
// @downloadURL  https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js
// @updateURL    https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log("🚀 [UserScript v3.6] Инициализация...");

    /************ Глобальные константы ************/
    const VIDEO_WATCH_TOKEN_KEY = 'uniXVideoWatchToken';
    const SOURCE_VIDEO_STATE_KEY = 'unix-video-state';
    const QUIZ_CACHE_KEY = 'uniX_Quiz_Answers_Cache';

    /************ 0. СЕТЕВОЙ ПЕРЕХВАТЧИК (Sniffer) ************/

    // 0.1 Перехват XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('load', function() {
            processNetworkResponse(url, this.responseText);
        });
        originalOpen.apply(this, arguments);
    };

    // 0.2 Перехват Fetch через Proxy
    window.fetch = new Proxy(window.fetch, {
        apply: async function(target, thisArg, argumentsList) {
            const response = await target.apply(thisArg, argumentsList);
            const url = response.url;

            if (url && (url.includes('/api/lessons/') || (url.includes('/api/quizes/') && url.includes('/check')))) {
                const clone = response.clone();
                clone.text().then(text => {
                    processNetworkResponse(url, text);
                }).catch(() => {});
            }
            return response;
        }
    });

    console.log("🕵️ [Sniffer] Перехватчики XHR и Fetch (Proxy) активированы.");

    /************ Логика обработки ответов сервера ************/
    function processNetworkResponse(url, responseText) {
        if (url && url.includes('/api/lessons/') && !url.includes('/watched')) {
            try {
                const data = JSON.parse(responseText);
                const currentUrlId = extractLessonId(window.location.href);

                if (data && String(data.id) === String(currentUrlId)) {
                    console.log(`📡 [API] Ответ сервера для урока ${data.id}. isWatched: ${data.isWatched}`);

                    if (data.isWatched === true) {
                        console.log("✅ Сервер: Урок уже пройден.");
                        showVisualSuccess();
                    } else {
                        console.log("⚡ Сервер: Урок НЕ пройден. Инициализация отметки...");
                        const duration = data.videoDurationEn || data.videoDurationKz || data.videoDurationRu || 100;
                        markVideoAsWatched(data.id, duration);
                    }
                }
            } catch (e) {}
        }

        // 2. ТЕСТЫ (Кэширование)
        if (url && url.includes('/api/quizes/') && url.includes('/check')) {
            try {
                const data = JSON.parse(responseText);
                if (data && data.history) {
                    cacheQuizAnswers(data.history);
                }
            } catch (e) { }
        }
    }

    /************ Функции КЭШИРОВАНИЯ ************/
    function cacheQuizAnswers(history) {
        let questionBank = GM_getValue(QUIZ_CACHE_KEY, {});
        let newCount = 0;

        history.forEach(q => {
            const correctAnswers = q.answers.filter(a => a.isCorrect);
            if (correctAnswers.length > 0) {
                const validAnswerTexts = new Set();
                correctAnswers.forEach(a => {
                    if (a.answerText) validAnswerTexts.add(normalizeText(a.answerText));
                    if (a.answerTextRu) validAnswerTexts.add(normalizeText(a.answerTextRu));
                    if (a.answerTextKz) validAnswerTexts.add(normalizeText(a.answerTextKz));
                });
                const answersArr = Array.from(validAnswerTexts);
                [q.questionText, q.questionTextRu, q.questionTextKz].forEach(qText => {
                    if (qText) {
                        const normQ = normalizeText(qText);
                        if (!questionBank[normQ]) {
                            questionBank[normQ] = answersArr;
                            newCount++;
                        }
                    }
                });
            }
        });

        if (newCount > 0) {
            GM_setValue(QUIZ_CACHE_KEY, questionBank);
            showNotification(`💾 Сохранено ответов: ${newCount}`, '#2563eb');
        }
    }

    function normalizeText(str) {
        if (!str) return '';
        return str.replace(/\s+/g, ' ').trim();
    }

    function cleanQuestionText(str) {
        if (!str) return '';
        let cleaned = str.replace(/^\s*\d+\.\s*/, '');
        return normalizeText(cleaned);
    }

    /************ Функции ПОДСВЕТКИ ************/
    function highlightCorrectAnswers() {
        const questionBank = GM_getValue(QUIZ_CACHE_KEY, {});

        const questionElements = document.querySelectorAll('p.select-none');

        questionElements.forEach(qEl => {
            const rawText = qEl.innerText;
            const cleanQ = cleanQuestionText(rawText);

            const savedAnswers = questionBank[cleanQ];

            if (savedAnswers) {
                const parent = qEl.closest('.flex.flex-col');
                if (!parent) return;

                const answerContainers = parent.querySelectorAll('div.cursor-pointer[class*="rounded-"]');

                answerContainers.forEach(ansContainer => {
                    const pTag = ansContainer.querySelector('p.ml-4');
                    const ansTextRaw = pTag ? pTag.innerText : ansContainer.innerText;
                    const ansText = normalizeText(ansTextRaw);

                    if (savedAnswers.includes(ansText)) {
                        if (!ansContainer.dataset.unixMarked) {
                            ansContainer.dataset.unixMarked = "true";
                            ansContainer.classList.add('unix-correct-highlight');

                            const icon = document.createElement('div');
                            icon.innerHTML = '✅';
                            icon.style.cssText = "margin-left: auto; font-size: 1.2rem;";
                            ansContainer.appendChild(icon);
                        }
                    }
                });
            }
        });
    }

    /************ Логика Observer (для SPA) ************/
    function initQuizObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
                    shouldCheck = true;
                    break;
                }
            }
            if (shouldCheck) {
                highlightCorrectAnswers();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    /************ Стандартные функции видео (без изменений) ************/
    async function markVideoAsWatched(lessonId, videoDuration) {
        const authToken = getSiteAuthToken();
        const xsrfToken = await getXsrfToken();
        const videoWatchToken = localStorage.getItem(VIDEO_WATCH_TOKEN_KEY);

        if (!authToken) { console.warn("❌ Нет Auth токена."); return; }
        if (!xsrfToken) { console.warn("❌ Нет XSRF токена."); return; }

        if (!videoWatchToken) {
            console.warn("⚠️ Нет токена просмотра видео.");
            setTimeout(() => {
                 alert("Скрипт: Пожалуйста, посмотрите это видео до конца вручную один раз, чтобы я мог запомнить ваш 'почерк' просмотра (токен). Следующие будут отмечены автоматически.");
            }, 1000);
            return;
        }

        try {
            console.log(`⏳ Отправка запроса на отметку (ID: ${lessonId}, Длительность: ${videoDuration})...`);

            const response = await fetch(`https://uni-x.almv.kz/api/lessons/${lessonId}/watched`, {
                method: 'POST',
                headers: {
                    'cookie': `XSRF-Token=${xsrfToken}`,
                    "content-type": "application/json",
                    "authorization": `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    token: videoWatchToken,
                    "videoDuration": Math.floor(videoDuration),
                    "videoWatched": Math.floor(videoDuration)
                })
            });

            if (response.ok) {
                console.log("🎉 Видео успешно отмечено! Перезагрузка страницы...");
            showVisualSuccess();
            setTimeout(() => window.location.reload(), 800);
            } else {
                console.error("❌ Ошибка сервера:", response.status);
            }
        } catch (error) { console.error('❌ Ошибка fetch запроса:', error); }
    }

    function extractLessonId(url) {
        const match = url.match(/lessons\/(\d+)/);
        return match ? match[1] : null;
    }

    function getSiteAuthToken() {
        try { return JSON.parse(localStorage.getItem('user-store'))?.token || null; } catch (e) { return null; }
    }

    function getXsrfToken() {
        return new Promise((resolve) => {
            GM_cookie.list({ name: "XSRF-Token" }, (cookies, error) => {
                if (!error && cookies.length > 0) resolve(cookies[0].value);
                else resolve(null);
            });
        });
    }

    function showVisualSuccess() {
        const selector = 'h1';
        const header = document.querySelector(selector);
        if (header) header.style.borderBottom = "5px solid #50C878";
    }

    function setupTokenInterceptor() {
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function (key, value) {
            if (key === SOURCE_VIDEO_STATE_KEY) {
                try {
                    const videoStateObject = JSON.parse(value);
                    const lessonId = Object.keys(videoStateObject)[0];
                    if (lessonId) {
                        const lessonData = videoStateObject[lessonId];
                        if (lessonData && lessonData.token && typeof lessonData.lastWatchedTime === 'number') {
                            const { token, lastWatchedTime } = lessonData;
                            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

                            if (lastWatchedTime >= payload.videoDuration) {
                                if (localStorage.getItem(VIDEO_WATCH_TOKEN_KEY) !== token) {
                                    originalSetItem.call(this, VIDEO_WATCH_TOKEN_KEY, token);
                                    console.log("🎬 [Video] Новый токен просмотра сохранен.");
                                    alert("Новый токен для просмотра видео успешно сохранен! Можете переходить к следующей лекции.");
                                }
                            }
                        }
                    }
                } catch (e) { }
            }
            originalSetItem.call(this, key, value);
        };
    }

    function injectStyles() {
        GM_addStyle(`
            * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; }
            .copy-highlight-clickable {
                outline: 2px solid #50C878 !important;
                outline-offset: 4px;
                border-radius: 16px;
                cursor: copy !important;
                transition: outline 0.1s ease-in-out;
            }
            .unix-correct-highlight {
                border: 2px solid #10b981 !important;
                background-color: rgba(16, 185, 129, 0.15) !important;
                position: relative;
            }
        `);
    }

    function showNotification(message, color = '#198754') {
        const n = document.createElement('div');
        n.textContent = message;
        Object.assign(n.style, {
            position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: color, color: 'white', padding: '12px 24px', borderRadius: '8px',
            zIndex: '100000', opacity: '0', transition: 'opacity 0.3s', fontSize: '16px', fontWeight: '500',
            pointerEvents: 'none'
        });
        document.body.appendChild(n);
        requestAnimationFrame(() => n.style.opacity = '1');
        setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 2000);
    }

    function simulateActiveTab() {
        ['blur', 'visibilitychange', 'webkitvisibilitychange'].forEach(evt => {
            window.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        });
        try { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); } catch (e) { }
        try { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); } catch (e) { }
    }

    function setupClickToCopyBlock() {
        const EXCLUDED_ZONES = 'p.select-none, div.cursor-pointer[class*="rounded-"], button, [role="button"]';
        const HIGHLIGHT_CLASS = 'copy-highlight-clickable';

        function findTargetContainer(target) {
            if (!target || !target.closest) return null;
            const el = target.closest('.rounded-b-xl.flex-col.bg-white, .rounded-b-xl.flex-col.dark\\:bg-\\[\\#1a1a1a\\]');
            return el;
        }

        document.body.addEventListener('mouseover', event => {
            const target = event.target;
            const container = findTargetContainer(target);

            document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
                if (el !== container) el.classList.remove(HIGHLIGHT_CLASS);
            });

            if (container) {
                if (target.closest(EXCLUDED_ZONES)) {
                    container.classList.remove(HIGHLIGHT_CLASS);
                } else {
                    container.classList.add(HIGHLIGHT_CLASS);
                }
            }
        });

        document.body.addEventListener('click', event => {
            const target = event.target;
            const container = findTargetContainer(target);

            if (container && !target.closest(EXCLUDED_ZONES)) {
                event.preventDefault();
                event.stopPropagation();
                let contentToCopy = '';
                const questionElement = container.querySelector('p.select-none');
                const answerElements = container.querySelectorAll('div.cursor-pointer[class*="rounded-"]');
                if (questionElement) contentToCopy += questionElement.innerText.trim() + '\n\n';
                if (answerElements) {
                    answerElements.forEach(answer => {
                        contentToCopy += answer.innerText.replace(/\s+/g, ' ').trim() + '\n';
                    });
                }
                if (contentToCopy) {
                    GM_setClipboard(contentToCopy.trim());
                    showNotification('✅ Блок скопирован!');
                    container.classList.remove(HIGHLIGHT_CLASS);
                    setTimeout(() => container.classList.add(HIGHLIGHT_CLASS), 100);
                }
            }
        }, true);
    }

    /************ Запуск ************/

    setupTokenInterceptor();
    simulateActiveTab();
    injectStyles();
    initQuizObserver();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setupClickToCopyBlock());
    } else {
        setupClickToCopyBlock();
    }

})();
