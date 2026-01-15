// ==UserScript==
// @name         Mark Video Watched & Tools
// @namespace    http://tampermonkey.net/
// @version      2.1
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
// ==/UserScript==
(function () {
    'use strict';
    /************ Глобальные переменные и настройки ************/
    const AUTH_TOKEN_KEY = 'uniXAuthToken';
    const AUTH_TOKEN_TIMESTAMP_KEY = 'uniXTokenTimestamp';
    const AUTH_TOKEN_EXPIRY_DAYS = 7;
    const XSRF_TOKEN_KEY = 'uniXXsrfToken';
    const VIDEO_WATCH_TOKEN_KEY = 'uniXVideoWatchToken';
    const SOURCE_VIDEO_STATE_KEY = 'unix-video-state';
    /************ Функция "Копирование по клику" ************/
    function setupClickToCopyBlock() {
        console.log("Активация функции 'Копирование по клику'. Кликните на пустое место в блоке.");
        const BLOCK_CONTAINER_SELECTOR = `[class="md:pt-10 p-4 pr-1 bg-white mt-4 dark:bg-[#1a1a1a] rounded-b-xl flex flex-col"]`;
        const EXCLUDED_ZONES = 'p.select-none, div.cursor-pointer[class*="rounded-"], button, [role="button"]';
        const style = document.createElement('style');
        style.textContent = `
            .copy-highlight-clickable {
                outline: 2px solid #50C878 !important;
                outline-offset: 4px;
                border-radius: 16px;
                cursor: copy !important; /* Курсор-подсказка */
                transition: outline 0.15s ease-in-out;
            }
        `;
        document.head.appendChild(style);
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
            if (!container) {
                removeHighlight();
                return;
            }
            if (target.closest(EXCLUDED_ZONES)) {
                removeHighlight();
            } else {
                if (currentHighlightContainer !== container) {
                    removeHighlight();
                    container.classList.add('copy-highlight-clickable');
                    currentHighlightContainer = container;
                }
            }
        });
        document.addEventListener('click', event => {
            if (currentHighlightContainer) {
                if (!event.target.closest(EXCLUDED_ZONES)) {
                    event.preventDefault();
                    event.stopPropagation();
                    let contentToCopy = '';
                    const questionElement = currentHighlightContainer.querySelector('p.select-none');
                    const answerElements = currentHighlightContainer.querySelectorAll('div.cursor-pointer[class*="rounded-"]');
                    if (questionElement) {
                        contentToCopy += questionElement.innerText.trim() + '\n\n';
                    }
                    answerElements.forEach(answer => {
                        contentToCopy += answer.innerText.replace(/\s+/g, ' ').trim() + '\n';
                    });
                    if (contentToCopy) {
                        GM_setClipboard(contentToCopy.trim());
                        showCopyNotification('Блок скопирован по клику!');
                        removeHighlight();
                    }
                }
            }
        }, true);
        function showCopyNotification(message) {
            const existingNotification = document.getElementById('copy-notification');
            if (existingNotification) existingNotification.remove();
            const notification = document.createElement('div');
            notification.id = 'copy-notification';
            notification.textContent = message;
            Object.assign(notification.style, {
                position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: '#198754', color: 'white', padding: '12px 24px', borderRadius: '8px',
                zIndex: '100000', opacity: '0', transition: 'opacity 0.3s ease-out',
                fontSize: '16px', fontFamily: 'sans-serif', fontWeight: '500',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            });
            document.body.appendChild(notification);
            requestAnimationFrame(() => { notification.style.opacity = '1'; });
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 1500);
        }
    }
    /************ Функция для разблокировки копирования текста ************/
    function enableTextSelectionAndCopy() {
        const style = document.createElement('style');
        style.textContent = `* {-webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; user-select: text !important;}`;
        (document.head || document.documentElement).appendChild(style);
    }
    /************ Перехватчик для получения токена просмотра видео (с проверкой) ************/
    function setupTokenInterceptor() {
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            if (key === SOURCE_VIDEO_STATE_KEY) {
                try {
                    const videoStateObject = JSON.parse(value);
                    const lessonId = Object.keys(videoStateObject)[0];
                    if (!lessonId) return;
                    const lessonData = videoStateObject[lessonId];
                    if (lessonData && lessonData.token && typeof lessonData.lastWatchedTime === 'number') {
                        const { token: newToken, lastWatchedTime } = lessonData;
                        const payload = JSON.parse(atob(newToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                        const { videoDuration } = payload;
                        if (typeof videoDuration === 'number' && lastWatchedTime >= videoDuration) {
                            if (localStorage.getItem(VIDEO_WATCH_TOKEN_KEY) !== newToken) {
                                localStorage.setItem(VIDEO_WATCH_TOKEN_KEY, newToken);
                                console.log("Успешно захвачен и сохранен новый токен просмотра видео!");
                                alert("Новый токен для просмотра видео успешно сохранен! Можете переходить к следующей лекции.");
                            }
                        }
                    }
                } catch (e) {
                    console.error("Ошибка при парсинге данных из unix-video-state:", e);
                }
            }
            originalSetItem.apply(this, arguments);
        };
    }
    /************ Функция для симуляции активной вкладки ************/
    function simulateActiveTab() {
        try {
            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
            Object.defineProperty(document, 'hidden', { value: false, writable: true });
        } catch (e) { }
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'blur') return;
            return originalAddEventListener.apply(this, arguments);
        };
        window.dispatchEvent(new Event('focus'));
    }
    /************ Функции работы с токенами и сохранением данных ************/
    function isTokenExpired() {
        const tokenTimestamp = localStorage.getItem(AUTH_TOKEN_TIMESTAMP_KEY);
        if (!tokenTimestamp) return true;
        return (Date.now() - parseInt(tokenTimestamp, 10)) > (AUTH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    }
    function saveAuthToken(token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_TOKEN_TIMESTAMP_KEY, Date.now().toString());
    }
    function getSavedAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
    function getSavedXsrfToken() { return localStorage.getItem(XSRF_TOKEN_KEY); }
    /************ Функции авторизации и получения CSRF cookie ************/
    async function getAuthToken(email, password) {
        try {
            const response = await fetch("https://uni-x.almv.kz/api/auth/login", {
                method: 'POST',
                headers: { "content-type": "application/json", "user-agent": navigator.userAgent },
                body: JSON.stringify({ "login": email, "password": password })
            });
            if (!response.ok) {
                alert("Login failed. Please check your credentials.");
                return null;
            }
            const json = await response.json();
            return json.token;
        } catch (error) {
            alert("An error occurred while trying to log in.");
            return null;
        }
    }
    async function getCookieFromCsrfToken() {
        try {
            await fetch('https://uni-x.almv.kz/api/validates/csrf', {
                method: 'POST',
                headers: { 'authorization': `Bearer ${getSavedAuthToken()}`, 'cookie': `XSRF-Token=${getSavedXsrfToken()}` }
            });
            GM_cookie.list({}, (cookies, error) => {
                if (error) return;
                const xsrfTokenCookie = cookies.find(c => c.name === "XSRF-Token");
                if (xsrfTokenCookie) localStorage.setItem(XSRF_TOKEN_KEY, xsrfTokenCookie.value);
            });
        } catch (error) { console.error('Error fetching CSRF cookie:', error); }
    }
    function extractLessonId(url) {
        const match = url.match(/lessons\/(\d+)/);
        return match ? match[1] : null;
    }
    async function markVideoAsWatched(authToken, videoDuration) {
        const lessonId = extractLessonId(window.location.href);
        await getCookieFromCsrfToken();
        const xsrfToken = getSavedXsrfToken();
        const videoWatchToken = localStorage.getItem(VIDEO_WATCH_TOKEN_KEY);
        if (!lessonId || !xsrfToken || !videoWatchToken) {
            if (!videoWatchToken) alert("Токен для отметки видео как просмотренного не найден.\n\nПожалуйста, посмотрите любое видео до конца вручную, чтобы скрипт мог его захватить.");
            return;
        }
        try {
            const response = await fetch(`https://uni-x.almv.kz/api/lessons/${lessonId}/watched`, {
                method: 'POST',
                headers: { 'cookie': `XSRF-Token=${xsrfToken}`, "content-type": "application/json", "authorization": `Bearer ${authToken}`, "user-agent": navigator.userAgent },
                body: JSON.stringify({ token: videoWatchToken, "videoDuration": Math.floor(videoDuration), "videoWatched": Math.floor(videoDuration) })
            });
            if (response.ok) console.log("Видео успешно отмечено как просмотренное!");
            else if (response.status === 401 || response.status === 403) alert("Не удалось отметить видео. Возможно, токен просмотра устарел. Посмотрите любое видео до конца вручную.");
        } catch (error) { console.error('Ошибка запроса на отметку видео:', error); }
    }
    /************ Ожидание появления видео и запуск процесса ************/
    function waitForVideoAndMark(authToken) {
        if (!window.location.href.includes('/lessons/')) return;
        const observer = new MutationObserver((mutations, obs) => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                videoElement.addEventListener('loadedmetadata', () => markVideoAsWatched(authToken, videoElement.duration), { once: true });
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    /************ Основной процесс ************/
    async function main() {
        simulateActiveTab();
        enableTextSelectionAndCopy();
        setupClickToCopyBlock();
        setupTokenInterceptor();
        let authToken = getSavedAuthToken();
        if (!authToken || isTokenExpired()) {
            const email = prompt("Введите email:");
            const password = prompt("Введите пароль:");
            if (email && password) {
                authToken = await getAuthToken(email, password);
                if (authToken) saveAuthToken(authToken);
                else return;
            } else return;
        }
        waitForVideoAndMark(authToken);
    }
    main();
})();
