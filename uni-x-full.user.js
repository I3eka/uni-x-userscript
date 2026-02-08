// ==UserScript==
// @name         Mark Video Watched & Tools (Auto + Manual Fallback)
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  Отмечает видео (авто-генерация или ручной перехват), копирует вопросы, кэширует ответы.
// @author       I3eka
// @match        https://uni-x.almv.kz/*
// @icon         https://github.com/I3eka/uni-x-userscript/raw/main/public/logo.svg
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
        magicLesson: {
            id: 15379 // Урок для генерации токена
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
        delays: {
            reloadSuccess: 1000,
            reloadError: 1500,
            toastLife: 3000
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
            colors: {
                success: '#10b981',
                error: '#ef4444',
                warn: '#f59e0b',
                info: '#3b82f6'
            }
        }
    };

    // ==========================================
    // 2. UTILITIES & EVENT BUS
    // ==========================================

    const Logger = {
        log: (msg, ...args) => console.log(`%c[Uni-X] ℹ️ ${msg}`, 'color: #3b82f6', ...args),
        success: (msg, ...args) => console.log(`%c[Uni-X] ✅ ${msg}`, 'color: #10b981', ...args),
        error: (msg, ...args) => console.error(`%c[Uni-X] ❌ ${msg}`, 'color: #ef4444', ...args),
    };

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
                        Logger.error(`EventBus error (${event}):`, e);
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
        normalizeText: (str) => str ? str.replace(/\s+/g, ' ').trim() : '',
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        getAuthHeaders: async () => {
            try {
                const authToken = JSON.parse(localStorage.getItem(CONFIG.storage.auth) || '{}')?.token;
                const xsrfToken = await Utils.getCookie('XSRF-Token');
                if (!authToken || !xsrfToken) return null;
                return {
                    'content-type': 'application/json',
                    'authorization': `Bearer ${authToken}`,
                    'X-XSRF-TOKEN': xsrfToken
                };
            } catch (e) { return null; }
        }
    };

    // ==========================================
    // 3. UI MANAGER
    // ==========================================
    const UI = {
        showToast: (message, type = 'success') => {
            const existing = document.getElementById('unix-toast');
            if (existing) existing.remove();

            const color = CONFIG.ui.colors[type] || CONFIG.ui.colors.success;
            const n = document.createElement('div');
            n.id = 'unix-toast';
            n.textContent = message;
            Object.assign(n.style, {
                position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%) translateY(20px)',
                backgroundColor: color, color: '#fff', padding: '10px 24px', borderRadius: '12px',
                zIndex: '9999999', opacity: '0', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                fontSize: '14px', fontWeight: '600', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', pointerEvents: 'none'
            });
            document.body.appendChild(n);
            
            requestAnimationFrame(() => { 
                n.style.opacity = '1'; 
                n.style.transform = 'translateX(-50%) translateY(0)'; 
            });

            setTimeout(() => {
                if (n.parentNode) {
                    n.style.opacity = '0'; 
                    n.style.transform = 'translateX(-50%) translateY(10px)';
                    n.addEventListener('transitionend', () => n.remove(), { once: true });
                }
            }, CONFIG.delays.toastLife);
        },
        markHeaderSuccess: () => {
            const header = document.querySelector(CONFIG.selectors.header);
            if (header) {
                header.style.borderBottom = `5px solid ${CONFIG.ui.colors.success}`;
                header.style.transition = 'border-color 0.5s ease';
            }
        },
        injectStyles: () => {
            const { copyBlock, excludeCopy } = CONFIG.selectors;
            const blockSelectors = copyBlock.split(',').map(s => s.trim());
            const excludeHoverSelectors = excludeCopy.split(',').map(s => s.trim() + ':hover').join(', ');

            const smartHoverRules = blockSelectors.map(block =>
                `${block}:hover:not(:has(${excludeHoverSelectors}))`
            ).join(',\n');

            GM_addStyle(`
                * { -webkit-user-select: text !important; user-select: text !important; }
                .unix-correct-highlight { border: 2px solid ${CONFIG.ui.colors.success} !important; background-color: rgba(16, 185, 129, 0.1) !important; position: relative; }
                .unix-correct-highlight::after { content: '✅'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 1.2rem; }
                ${smartHoverRules} {
                    outline: 2px solid ${CONFIG.ui.colors.success} !important;
                    outline-offset: 4px; border-radius: 12px; cursor: copy !important;
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
    class TokenGenerator {
        static async generate() {
            UI.showToast('🔄 Генерирую универсальный токен...', 'info');
            try {
                const headers = await Utils.getAuthHeaders();
                if (!headers) throw new Error('No Auth headers');

                const lessonId = CONFIG.magicLesson.id;
                const ts = new Date().toISOString();
                const baseBody = { lessonId, currentSpeed: 1, clientTimestamp: ts, lang: "EN" };

                const startRes = await fetch(`${CONFIG.api.base}/validates/watched`, {
                    method: 'POST', headers, body: JSON.stringify({ ...baseBody, event: "video-start" })
                });
                if (!startRes.ok) throw new Error('Start failed');
                const startData = await startRes.json();
                if (!startData.token) throw new Error('No token in start');

                const endRes = await fetch(`${CONFIG.api.base}/validates/watched`, {
                    method: 'POST', headers, body: JSON.stringify({ ...baseBody, event: "video-end", token: startData.token })
                });
                const endData = await endRes.json();

                if (endData.token) {
                    localStorage.setItem(CONFIG.storage.videoToken, endData.token);
                    Logger.success('Token generated!');
                    return endData.token;
                }
                throw new Error('End failed');
            } catch (e) {
                Logger.error('Auto-generation failed:', e);
                return null;
            }
        }
    }

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
                const result = originalSetItem.apply(this, arguments);
                if (key === CONFIG.storage.videoState) {
                    queueMicrotask(() => {
                        try {
                            const state = JSON.parse(value);
                            const lessonData = Object.values(state)[0];
                            if (lessonData?.token && typeof lessonData.lastWatchedTime === 'number') {
                                const payload = Utils.parseJwt(lessonData.token);
                                if (payload && lessonData.lastWatchedTime >= payload.videoDuration) {
                                    const currentToken = localStorage.getItem(CONFIG.storage.videoToken);
                                    if (currentToken !== lessonData.token) {
                                        originalSetItem.call(localStorage, CONFIG.storage.videoToken, lessonData.token);
                                        UI.showToast('🎬 Токен обновлен из плеера!', 'info');
                                    }
                                }
                            }
                        } catch (e) { }
                    });
                }
                return result;
            };
        }
        async processLessonData(data) {
            const currentId = window.location.href.match(/lessons\/(\d+)/)?.[1];
            if (String(data.id) !== String(currentId)) return;
            if (data.isWatched) {
                Logger.success("Урок уже пройден");
                UI.markHeaderSuccess();
            } else {
                let token = localStorage.getItem(CONFIG.storage.videoToken);

                if (!token) {
                    token = await TokenGenerator.generate();
                }

                if (token) {
                    const duration = data.videoDurationEn || data.videoDurationKz || data.videoDurationRu || 100;
                    await this.sendWatchedRequest({ lessonId: data.id, duration, token });
                } else {
                    UI.showToast('⚠️ Посмотрите видео вручную (токен не найден)', 'warn');
                }
            }
        }

        async sendWatchedRequest({ lessonId, duration, token }) {
            const headers = await Utils.getAuthHeaders();
            if (!headers) return;

            try {
                const res = await fetch(`${CONFIG.api.base}/lessons/${lessonId}/watched`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ token: token, videoDuration: Math.floor(duration), videoWatched: Math.floor(duration) })
                });
                if (res.ok) {
                    UI.showToast('🎉 Урок отмечен!');
                    UI.markHeaderSuccess();
                    await Utils.sleep(CONFIG.delays.reloadSuccess); 
                    window.location.reload();
                } else if (res.status === 400 || res.status === 401) {
                    localStorage.removeItem(CONFIG.storage.videoToken);
                    UI.showToast('♻️ Токен устарел, обновляю...', 'warn');
                    await Utils.sleep(CONFIG.delays.reloadError);
                    window.location.reload();
                }
            } catch (e) { Logger.error('Ошибка отметки:', e); }
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

            if (data.questionsWithCorrectAnswers?.length) {
                Logger.success('Тест сдан успешно.');
                return;
            }
            else if (data.history?.length) {
                Logger.log('Сохраняем ответы из истории.');
                data.history.forEach(q => {
                    if (q.answers?.length) {
                        const correct = q.answers.filter(a => a.isCorrect);
                        if (correct.length) {
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

            itemsToProcess.forEach(item => {
                const normQ = Utils.normalizeText(item.question).replace(/^\d+\.\s*/, '');
                if (!normQ) return;
                const validAnswers = item.correctAnswers.map(Utils.normalizeText).filter(Boolean);
                if (validAnswers.length && !this.cache[normQ]) {
                    this.cache[normQ] = validAnswers;
                    count++;
                }
            });

            if (count > 0) {
                GM_setValue(CONFIG.storage.quizCache, this.cache);
                UI.showToast(`🧠 Сохранено ответов: ${count}`);
                this.highlightAnswers();
            }
        }

        highlightAnswers() {
            const questions = document.querySelectorAll(CONFIG.selectors.questionText);
            questions.forEach(qEl => {
                const qText = Utils.normalizeText(qEl.innerText).replace(/^\d+\.\s*/, '');
                const answers = this.cache[qText];
                if (answers) {
                    const container = qEl.closest('.bg-white') || qEl.parentElement?.parentElement;
                    if (!container) return;

                    const answerDivs = container.querySelectorAll(CONFIG.selectors.answerContainer);
                    answerDivs.forEach(ansDiv => {
                        if (ansDiv.classList.contains('unix-correct-highlight')) return;
                        const textEl = ansDiv.querySelector(CONFIG.selectors.answerText) || ansDiv;
                        const text = Utils.normalizeText(textEl.innerText);
                        if (answers.includes(text)) {
                            ansDiv.classList.add('unix-correct-highlight');
                        }
                    });
                }
            });
        }

        initObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                for (const m of mutations) {
                    if (m.addedNodes.length > 0 && m.addedNodes[0].nodeType === 1) {
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

    class SystemTools {
        constructor() { this.hackActiveTab(); }
        hackActiveTab() {
            const stop = e => { e.stopImmediatePropagation(); e.stopPropagation(); };
            ['blur', 'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange'].forEach(e => {
                window.addEventListener(e, stop, true);
                document.addEventListener(e, stop, true);
            });
            try {
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            } catch (e) { Logger.error('Visibility hack error:', e); }
        }
    }

    class ClipboardTools {
        constructor() { this.initClickToCopy(); }
        initClickToCopy() {
            document.body.addEventListener('click', e => {
                if (window.getSelection().toString().length > 0) return;
                const targetBlock = e.target.closest(CONFIG.selectors.copyBlock);
                const isExcluded = e.target.closest(CONFIG.selectors.excludeCopy);
                if (targetBlock && !isExcluded) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const q = targetBlock.querySelector(CONFIG.selectors.questionText)?.innerText || '';
                    const ans = Array.from(targetBlock.querySelectorAll(CONFIG.selectors.answerContainer))
                        .map(d => d.innerText.replace(/\s+/g, ' ').trim()).join('\n');

                    if (q || ans) {
                        GM_setClipboard(`${q}\n${ans}`.trim());
                        UI.showToast('📋 Скопировано!');
                        const originalOutline = targetBlock.style.outline;
                        targetBlock.style.outline = `4px solid ${CONFIG.ui.colors.success}`;
                        setTimeout(() => { targetBlock.style.outline = originalOutline; }, 200);
                    }
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
                if (!url || !text || url.includes(CONFIG.magicLesson.id)) return;

                if (CONFIG.api.lessonRegex.test(url) && !url.includes('/watched')) {
                    eventBus.emit(CONFIG.events.LESSON_DATA_LOADED, JSON.parse(text));
                }
                else if (CONFIG.api.quizCheckRegex.test(url)) {
                    eventBus.emit(CONFIG.events.QUIZ_RESULT_LOADED, JSON.parse(text));
                }
            } catch (e) { Logger.error('Response handling error:', e); }
        };

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (_, url) {
            if (!this._unix_patched) {
                this.addEventListener('load', function () {
                    handleResponse(url, this.responseText);
                });
                this._unix_patched = true;
            }
            return origOpen.apply(this, arguments);
        };

        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const res = await origFetch(...args);
            try {
                const url = res.url;
                const isLesson = CONFIG.api.lessonRegex.test(url) && !url.includes('/watched');
                const isQuiz = CONFIG.api.quizCheckRegex.test(url);

                if (isLesson || isQuiz) {
                    const clone = res.clone();
                    clone.text()
                        .then(text => handleResponse(url, text))
                        .catch(e => Logger.error('Fetch clone error:', e));
                }
            } catch (e) {
                Logger.error('Sniffer logic error:', e);
            }
            return res;
        };
    }

    function init() {
        Logger.log('🚀 [Uni-X] Loaded');
        UI.injectStyles();
        const eventBus = new EventBus();
        new VideoManager(eventBus);
        new QuizManager(eventBus);
        new SystemTools();
        new ClipboardTools();
        setupSniffer(eventBus);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
