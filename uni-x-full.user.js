// ==UserScript==
// @name         Mark Video Watched & Tools (with Quiz Helper)
// @namespace    http://tampermonkey.net/
// @version      3.9
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

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================
    const CONFIG = {
        api: {
            base: 'https://uni-x.almv.kz/api',
            lessonRegex: /\/api\/lessons\/(\d+)/,
            quizCheckRegex: /\/api\/quizes\/.*\/check/
        },
        events: {
            LESSON_DATA_LOADED: 'lesson:data:loaded',
            QUIZ_RESULT_LOADED: 'quiz:result:loaded'
        },
        storage: {
            videoToken: 'uniXVideoWatchToken',
            videoState: 'unix-video-state',
            quizCache: 'uniX_Quiz_Answers_Cache',
            auth: 'user-store'
        },
        selectors: {
            header: 'h1',
            questionText: 'p.select-none',
            answerContainer: 'div.cursor-pointer[class*="rounded-"]',
            answerText: 'p.ml-4',
            copyBlock: '.md\\:pt-10.p-4.pr-1.bg-white, .rounded-b-xl.flex-col',
            excludeCopy: 'p.select-none, div.cursor-pointer[class*="rounded-"], button, [role="button"]'
        },
        ui: {
            successColor: '#10b981',
            errorColor: '#ef4444',
            warnColor: '#f59e0b'
        }
    };

    // ==========================================
    // 2. UTILITIES & EVENT BUS
    // ==========================================

    class EventBus {
        constructor() {
            this.listeners = {};
        }

        on(event, callback) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
        }

        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error(`[EventBus] Error in listener for ${event}:`, e);
                    }
                });
            }
        }
    }

    const Utils = {
        parseJwt: (token) => {
            try {
                const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                const binaryString = window.atob(base64);
                const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
                return JSON.parse(new TextDecoder().decode(bytes));
            } catch (e) { return null; }
        },
        getCookie: (name) => {
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            if (match) return Promise.resolve(match[2]);
            return new Promise(resolve => {
                if (typeof GM_cookie !== 'undefined') {
                    GM_cookie.list({ name }, (cookies, error) => resolve(!error && cookies[0] ? cookies[0].value : null));
                } else resolve(null);
            });
        },
        normalizeText: (str) => str ? str.replace(/\s+/g, ' ').trim() : ''
    };

    // ==========================================
    // 3. UI MANAGER
    // ==========================================
    const UI = {
        showToast: (message, type = 'success') => {
            const color = type === 'error' ? CONFIG.ui.errorColor : (type === 'warn' ? CONFIG.ui.warnColor : CONFIG.ui.successColor);
            const n = document.createElement('div');
            n.textContent = message;
            Object.assign(n.style, {
                position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%) translateY(20px)',
                backgroundColor: color, color: '#fff', padding: '10px 24px', borderRadius: '12px',
                zIndex: '9999999', opacity: '0', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                fontSize: '14px', fontWeight: '600', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', pointerEvents: 'none'
            });
            document.body.appendChild(n);
            requestAnimationFrame(() => { n.style.opacity = '1'; n.style.transform = 'translateX(-50%) translateY(0)'; });
            setTimeout(() => {
                n.style.opacity = '0'; n.style.transform = 'translateX(-50%) translateY(10px)';
                setTimeout(() => n.remove(), 300);
            }, 3000);
        },
        markHeaderSuccess: () => {
            const header = document.querySelector(CONFIG.selectors.header);
            if (header) {
                header.style.borderBottom = `5px solid ${CONFIG.ui.successColor}`;
                header.style.transition = 'border-color 0.5s ease';
            }
        },
        injectStyles: () => {
            const blockSelectors = CONFIG.selectors.copyBlock.split(',').map(s => s.trim());
            const excludeHoverSelectors = CONFIG.selectors.excludeCopy.split(',')
                .map(s => s.trim() + ':hover')
                .join(', ');
            const smartHoverRules = blockSelectors.map(block => {
                return `${block}:hover:not(:has(${excludeHoverSelectors}))`;
            }).join(',\n');

            GM_addStyle(`
                * { -webkit-user-select: text !important; user-select: text !important; }
                .unix-correct-highlight { border: 2px solid ${CONFIG.ui.successColor} !important; background-color: rgba(16, 185, 129, 0.1) !important; position: relative; }
                .unix-correct-highlight::after { content: '✅'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 1.2rem; }
                ${smartHoverRules} {
                    outline: 2px solid ${CONFIG.ui.successColor} !important;
                    outline-offset: 4px;
                    border-radius: 12px;
                    cursor: copy !important;
                    background-color: rgba(16, 185, 129, 0.05);
                }
                ${CONFIG.selectors.excludeCopy} {
                    cursor: pointer !important;
                }
            `);
        }
    };

    // ==========================================
    // 4. LOGIC MODULES
    // ==========================================
    class VideoManager {
        constructor(eventBus) {
            this.interceptStorage();
            if (eventBus) {
                eventBus.on(CONFIG.events.LESSON_DATA_LOADED, this.processLessonData.bind(this));
            }
        }

        interceptStorage() {
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = function (key, value) {
                if (key === CONFIG.storage.videoState) {
                    try {
                        const state = JSON.parse(value);
                        const lessonData = Object.values(state)[0];
                        if (lessonData?.token && typeof lessonData.lastWatchedTime === 'number') {
                            const payload = Utils.parseJwt(lessonData.token);
                            if (payload && lessonData.lastWatchedTime >= payload.videoDuration) {
                                const currentToken = localStorage.getItem(CONFIG.storage.videoToken);
                                if (currentToken !== lessonData.token) {
                                    originalSetItem.call(localStorage, CONFIG.storage.videoToken, lessonData.token);
                                    UI.showToast('🎬 Токен видео обновлен!', 'success');
                                }
                            }
                        }
                    } catch (e) {}
                }
                originalSetItem.apply(this, arguments);
            };
        }

        async processLessonData(data) {
            const currentId = window.location.href.match(/lessons\/(\d+)/)?.[1];
            if (String(data.id) !== String(currentId)) return;
            if (data.isWatched) {
                console.log("✅ Урок уже пройден");
                UI.markHeaderSuccess();
            } else {
                const duration = data.videoDurationEn || data.videoDurationKz || data.videoDurationRu || 100;
                await this.sendWatchedRequest(data.id, duration);
            }
        }

        async sendWatchedRequest(lessonId, duration) {
            const authToken = JSON.parse(localStorage.getItem(CONFIG.storage.auth) || '{}')?.token;
            const xsrfToken = await Utils.getCookie('XSRF-Token');
            const videoToken = localStorage.getItem(CONFIG.storage.videoToken);
            if (!authToken || !xsrfToken || !videoToken) {
                if (!videoToken) UI.showToast('⚠️ Посмотрите видео 1 раз вручную!', 'warn');
                return;
            }
            try {
                const res = await fetch(`${CONFIG.api.base}/lessons/${lessonId}/watched`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${authToken}`, 'X-XSRF-TOKEN': xsrfToken },
                    body: JSON.stringify({ token: videoToken, videoDuration: Math.floor(duration), videoWatched: Math.floor(duration) })
                });
                if (res.ok) {
                    UI.showToast('🎉 Урок отмечен пройденным!');
                    UI.markHeaderSuccess();
                    setTimeout(() => window.location.reload(), 800);
                }
            } catch (e) { console.error('Ошибка отметки видео:', e); }
        }
    }

    class QuizManager {
        constructor(eventBus) {
            this.cache = GM_getValue(CONFIG.storage.quizCache, {});
            this.initObserver();
            if (eventBus) {
                eventBus.on(CONFIG.events.QUIZ_RESULT_LOADED, this.processQuizData.bind(this));
            }
        }

        processQuizData(data) {
            let count = 0;
            const itemsToProcess = [];

            if (data.questionsWithCorrectAnswers && Array.isArray(data.questionsWithCorrectAnswers)) {
                console.log('[Uni-X] Тест сдан успешно.');
                return;
            }
            else if (data.history && Array.isArray(data.history)) {
                console.log('[Uni-X] ⚠️ Тест не сдан. Сохраняем ответы для пересдачи.');
                data.history.forEach(q => {
                    if (q.answers && Array.isArray(q.answers)) {
                        const correct = q.answers.filter(a => a.isCorrect);
                        if (correct.length > 0) {
                            itemsToProcess.push({
                                question: q.questionText || q.questionTextRu || q.questionTextKz,
                                correctAnswers: correct.map(a => a.answerText || a.answerTextRu || a.answerTextKz)
                            });
                        }
                    } else if (q.correctAnswerText && q.questionText) {
                        itemsToProcess.push({
                            question: q.questionText,
                            correctAnswers: [q.correctAnswerText]
                        });
                    }
                });
            }

            if (itemsToProcess.length === 0) return;

            itemsToProcess.forEach(item => {
                const normQ = Utils.normalizeText(item.question).replace(/^\d+\.\s*/, '');
                if (!normQ) return;
                const validAnswers = item.correctAnswers.map(Utils.normalizeText).filter(Boolean);
                if (validAnswers.length > 0 && !this.cache[normQ]) {
                    this.cache[normQ] = validAnswers;
                    count++;
                }
            });

            if (count > 0) {
                GM_setValue(CONFIG.storage.quizCache, this.cache);
                UI.showToast(`🧠 Запомнил правильных ответов: ${count}`);
                this.highlightAnswers();
            }
        }

        highlightAnswers() {
            const questions = document.querySelectorAll(CONFIG.selectors.questionText);
            if (!questions.length) return;
            for (const qEl of questions) {
                const qText = Utils.normalizeText(qEl.innerText).replace(/^\d+\.\s*/, '');
                const answers = this.cache[qText];
                if (answers) {
                    const container = qEl.closest('.bg-white') || qEl.parentElement.parentElement;
                    if (!container) continue;
                    const answerDivs = container.querySelectorAll(CONFIG.selectors.answerContainer);
                    for (const ansDiv of answerDivs) {
                        if (ansDiv.classList.contains('unix-correct-highlight')) continue;
                        const textEl = ansDiv.querySelector(CONFIG.selectors.answerText) || ansDiv;
                        const text = Utils.normalizeText(textEl.innerText);
                        if (answers.includes(text)) {
                            ansDiv.classList.add('unix-correct-highlight');
                        }
                    }
                }
            }
        }

        initObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                for (const m of mutations) {
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        shouldUpdate = true;
                        break;
                    }
                }
                if (shouldUpdate) {
                    this.highlightAnswers();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    class Tools {
        constructor() { this.hackActiveTab(); this.initClickToCopy(); }
        hackActiveTab() {
            const stop = e => { e.stopImmediatePropagation(); e.stopPropagation(); };
            ['blur', 'visibilitychange', 'webkitvisibilitychange'].forEach(e => {
                window.addEventListener(e, stop, true);
                document.addEventListener(e, stop, true);
            });
            try {
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            } catch (e) {}
        }
        initClickToCopy() {
            document.body.addEventListener('click', e => {
                const targetBlock = e.target.closest(CONFIG.selectors.copyBlock);
                if (targetBlock && !e.target.closest(CONFIG.selectors.excludeCopy)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const q = targetBlock.querySelector(CONFIG.selectors.questionText)?.innerText || '';
                    const ans = Array.from(targetBlock.querySelectorAll(CONFIG.selectors.answerContainer))
                        .map(d => d.innerText.replace(/\s+/g, ' ').trim()).join('\n');
                    GM_setClipboard(`${q}\n${ans}`.trim());
                    UI.showToast('📋 Скопировано в буфер');
                    const originalOutline = targetBlock.style.outline;
                    targetBlock.style.outline = `4px solid ${CONFIG.ui.successColor}`;
                    setTimeout(() => { targetBlock.style.outline = originalOutline; }, 200);
                }
            }, true);
        }
    }

    // ==========================================
    // 5. NETWORK SNIFFER
    // ==========================================
    function setupSniffer(eventBus) {
        const handleResponse = (url, text) => {
            try {
                if (!url || !text) return;
                if (CONFIG.api.lessonRegex.test(url) && !url.includes('/watched')) {
                    const data = JSON.parse(text);
                    eventBus.emit(CONFIG.events.LESSON_DATA_LOADED, data);
                }

                if (CONFIG.api.quizCheckRegex.test(url)) {
                    const data = JSON.parse(text);
                    if (data) {
                        eventBus.emit(CONFIG.events.QUIZ_RESULT_LOADED, data);
                    }
                }
            } catch (e) { console.error('Sniffer Parse Error', e); }
        };

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (_, url) {
            this.addEventListener('load', () => handleResponse(url, this.responseText));
            origOpen.apply(this, arguments);
        };

        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const res = await origFetch(...args);
            const url = res.url;
            const isLessonData = CONFIG.api.lessonRegex.test(url) && !url.includes('/watched');
            const isQuizResult = CONFIG.api.quizCheckRegex.test(url);

            if (isLessonData || isQuizResult) {
                const clone = res.clone();
                clone.text().then(text => handleResponse(url, text)).catch(() => {});
            }
            return res;
        };
    }

    function init() {
        console.log('🚀 [Uni-X Lite] Loaded');
        UI.injectStyles();
        const eventBus = new EventBus();
        new VideoManager(eventBus);
        new QuizManager(eventBus);
        new Tools();
        setupSniffer(eventBus);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
