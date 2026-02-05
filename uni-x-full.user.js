// ==UserScript==
// @name         Mark Video Watched & Tools
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Отмечает видео, симулирует активную вкладку и копирует блок вопроса/ответов по клику на его "отступы".
// @author       I3eka
// @match        https://uni-x.almv.kz/*
// @icon         https://uni-x.almv.kz/favicon.ico
// @grant        GM_cookie
// @grant        GM_setClipboard
// @connect      uni-x.almv.kz
// @homepageURL  https://github.com/I3eka/uni-x-userscript
// @supportURL   https://github.com/I3eka/uni-x-userscript/issues
// @downloadURL  https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js
// @updateURL    https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log("🚀 [UserScript] Инициализация...");

    /************ Глобальные константы ************/
    const VIDEO_WATCH_TOKEN_KEY = 'uniXVideoWatchToken';
    const SOURCE_VIDEO_STATE_KEY = 'unix-video-state';

    /************ 0. СЕТЕВОЙ ПЕРЕХВАТЧИК (Sniffer) ************/

    // 0.1 Перехват XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('load', function() {
            processNetworkResponse(url, this.responseText);
        });
        originalOpen.apply(this, arguments);
    };

    // 0.2 Перехват Fetch (Важно для быстрой загрузки!)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        const url = response.url;
        
        clone.text().then(text => {
            processNetworkResponse(url, text);
        }).catch(() => {});

        return response;
    };

    console.log("🕵️ [Sniffer] Перехватчики XHR и Fetch активированы.");

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
            } catch (e) {
            }
        }
    }

    /************ 1. Основная логика отметки (Hoisted Functions) ************/
    
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
        const checkHeader = setInterval(() => {
            const title = document.querySelector('h1');
            if (title) {
                title.style.borderBottom = "5px solid #50C878";
                clearInterval(checkHeader);
            }
        }, 200);
        setTimeout(() => clearInterval(checkHeader), 10000);
    }

    /************ 2. UI Tools & Interceptors ************/

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
                                    localStorage.setItem(VIDEO_WATCH_TOKEN_KEY, token);
                                    console.log("🎬 [Video] Новый токен просмотра сохранен.");
                                    alert("Новый токен для просмотра видео успешно сохранен! Можете переходить к следующей лекции.");
                                }
                            }
                        }
                    }
                } catch (e) { }
            }
            originalSetItem.apply(this, arguments);
        };
    }

    function enableTextSelectionAndCopy() {
        const style = document.createElement('style');
        style.textContent = `* {-webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important;}`;
        (document.head || document.documentElement).appendChild(style);
    }

    function simulateActiveTab() {
        try {
            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
            Object.defineProperty(document, 'hidden', { value: false, writable: true });
            window.dispatchEvent(new Event('focus'));
        } catch (e) { }
    }

    function setupClickToCopyBlock() {
        const BLOCK_CONTAINER_SELECTOR = `[class="md:pt-10 p-4 pr-1 bg-white mt-4 dark:bg-[#1a1a1a] rounded-b-xl flex flex-col"]`;
        const EXCLUDED_ZONES = 'p.select-none, div.cursor-pointer[class*="rounded-"], button, [role="button"]';

        const style = document.createElement('style');
        style.textContent = `
            .copy-highlight-clickable {
                outline: 2px solid #50C878 !important;
                outline-offset: 4px;
                border-radius: 16px;
                cursor: copy !important;
                transition: outline 0.15s ease-in-out;
            }
        `;
        (document.head || document.documentElement).appendChild(style);

        let currentHighlightContainer = null;
        function removeHighlight() {
            if (currentHighlightContainer) {
                currentHighlightContainer.classList.remove('copy-highlight-clickable');
                currentHighlightContainer = null;
            }
        }

        document.addEventListener('mouseover', event => {
            const target = event.target;
            const container = target.closest(BLOCK_CONTAINER_SELECTOR);
            if (!container) { removeHighlight(); return; }
            if (target.closest(EXCLUDED_ZONES)) { removeHighlight(); }
            else if (currentHighlightContainer !== container) {
                removeHighlight();
                container.classList.add('copy-highlight-clickable');
                currentHighlightContainer = container;
            }
        });

        document.addEventListener('click', event => {
            if (currentHighlightContainer && !event.target.closest(EXCLUDED_ZONES)) {
                event.preventDefault();
                event.stopPropagation();
                let contentToCopy = '';
                const questionElement = currentHighlightContainer.querySelector('p.select-none');
                const answerElements = currentHighlightContainer.querySelectorAll('div.cursor-pointer[class*="rounded-"]');
                if (questionElement) contentToCopy += questionElement.innerText.trim() + '\n\n';
                answerElements.forEach(answer => contentToCopy += answer.innerText.replace(/\s+/g, ' ').trim() + '\n');
                if (contentToCopy) {
                    GM_setClipboard(contentToCopy.trim());
                    showCopyNotification('✅ Блок скопирован!');
                    removeHighlight();
                }
            }
        }, true);

        function showCopyNotification(message) {
            const n = document.createElement('div');
            n.textContent = message;
            Object.assign(n.style, {
                position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: '#198754', color: 'white', padding: '12px 24px', borderRadius: '8px',
                zIndex: '100000', opacity: '0', transition: 'opacity 0.3s', fontSize: '16px', fontWeight: '500'
            });
            document.body.appendChild(n);
            requestAnimationFrame(() => n.style.opacity = '1');
            setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 1500);
        }
    }

    /************ Инициализация при старте ************/
    
    setupTokenInterceptor();
    simulateActiveTab();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            enableTextSelectionAndCopy();
            setupClickToCopyBlock();
        });
    } else {
        enableTextSelectionAndCopy();
        setupClickToCopyBlock();
    }

})();
