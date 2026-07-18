/* ════════════════════════════════════════
   FLUENTLY — app.js
   Firebase + Groq AI integration
════════════════════════════════════════ */

'use strict';

// ── CONFIG ───────────────────────────────────────────────────────────
const FIREBASE_URL = 'https://textos-67d4c-default-rtdb.firebaseio.com';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// ⚠️ TESTE: coloque sua chave Groq aqui ou ela será pedida via modal
function rot13(str){
  return str.replace(/[a-zA-Z]/g, function(c){
    return String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
        ? c
        : c - 26
    );
  });
}

// ── SOUND SYSTEM ─────────────────────────────────────────────────────
const SoundFX = {
  _ctx: null,
  _enabled: () => localStorage.getItem('fluently_sound') !== 'off',

  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  },

  _play(type) {
    if (!this._enabled()) return;
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const configs = {
        correct:  { freq: [523, 659, 784], dur: 0.12, wave: 'sine',     vol: 0.25 },
        wrong:    { freq: [220, 180],       dur: 0.15, wave: 'sawtooth', vol: 0.18 },
        xp:       { freq: [784, 988, 1175], dur: 0.09, wave: 'sine',     vol: 0.2  },
        send:     { freq: [440, 550],       dur: 0.07, wave: 'sine',     vol: 0.15 },
        click:    { freq: [660],            dur: 0.05, wave: 'sine',     vol: 0.12 },
        levelup:  { freq: [523,659,784,1047],dur:0.1, wave: 'sine',      vol: 0.25 },
      };

      const cfg = configs[type] || configs.click;
      osc.type = cfg.wave;
      gain.gain.setValueAtTime(cfg.vol, ctx.currentTime);

      cfg.freq.forEach((f, i) => {
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * cfg.dur);
      });

      const total = cfg.freq.length * cfg.dur;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + total + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + total + 0.06);
    } catch(e) { /* silently ignore if audio unavailable */ }
  },

  correct()  { this._play('correct');  },
  wrong()    { this._play('wrong');    },
  xp()       { this._play('xp');       },
  send()     { this._play('send');     },
  click()    { this._play('click');    },
  levelup()  { this._play('levelup'); },

  toggle() {
    const on = this._enabled();
    localStorage.setItem('fluently_sound', on ? 'off' : 'on');
    return !on;
  },
};

// chave fixa embutida no código (ofuscada em ROT13) — não há mais opção de trocar pela UI
const GROQ_API_KEY = rot13('tfx_IjhNQlhBeAl19899CtRTJTqlo3SLsfMSa4fyswjlPUndpzYRJRwD');

// ── COURSES DATA ──────────────────────────────────────────────────────
const COURSES = [
  { id: 'en',  name: 'Inglês',          emoji: '🇬🇧', native: 'English' },
  { id: 'fr',  name: 'Francês',         emoji: '🇫🇷', native: 'Français' },
  { id: 'it',  name: 'Italiano',        emoji: '🇮🇹', native: 'Italiano' },
  { id: 'es',  name: 'Espanhol',        emoji: '🇪🇸', native: 'Español' },
  { id: 'ko',  name: 'Coreano',         emoji: '🇰🇷', native: '한국어' },
  { id: 'ja',  name: 'Japonês',         emoji: '🇯🇵', native: '日本語' },
  { id: 'la',  name: 'Latim',           emoji: '🏛️',  native: 'Latina' },
  { id: 'zh',  name: 'Chinês (Mandarim)',emoji: '🇨🇳', native: '普通话' },
  { id: 'tr',  name: 'Turco',           emoji: '🇹🇷', native: 'Türkçe' },
  { id: 'ru',  name: 'Russo',           emoji: '🇷🇺', native: 'Русский' },
  { id: 'de',  name: 'Alemão',          emoji: '🇩🇪', native: 'Deutsch' },
  { id: 'el',  name: 'Grego',           emoji: '🇬🇷', native: 'Ελληνικά' },
  { id: 'nl',  name: 'Holandês',        emoji: '🇳🇱', native: 'Nederlands' },
  { id: 'pl',  name: 'Polonês',         emoji: '🇵🇱', native: 'Polski' },
  { id: 'sv',  name: 'Sueco',           emoji: '🇸🇪', native: 'Svenska' },
  { id: 'ar',  name: 'Árabe',           emoji: '🇸🇦', native: 'العربية' },
  { id: 'hi',  name: 'Hindi',           emoji: '🇮🇳', native: 'हिन्दी' },
  { id: 'th',  name: 'Tailandês',       emoji: '🇹🇭', native: 'ไทย' },
  { id: 'vi',  name: 'Vietnamita',      emoji: '🇻🇳', native: 'Tiếng Việt' },
  { id: 'id',  name: 'Indonésio',       emoji: '🇮🇩', native: 'Bahasa Indonesia' },
  { id: 'he',  name: 'Hebraico',        emoji: '🇮🇱', native: 'עברית' },
  { id: 'sw',  name: 'Suaíli',          emoji: '🇰🇪', native: 'Kiswahili' },
  { id: 'ro',  name: 'Romeno',          emoji: '🇷🇴', native: 'Română' },
  { id: 'cs',  name: 'Tcheco',          emoji: '🇨🇿', native: 'Čeština' },
  { id: 'hu',  name: 'Húngaro',         emoji: '🇭🇺', native: 'Magyar' },
  { id: 'fi',  name: 'Finlandês',       emoji: '🇫🇮', native: 'Suomi' },
  { id: 'no',  name: 'Norueguês',       emoji: '🇳🇴', native: 'Norsk' },
  { id: 'da',  name: 'Dinamarquês',     emoji: '🇩🇰', native: 'Dansk' },
  { id: 'uk',  name: 'Ucraniano',       emoji: '🇺🇦', native: 'Українська' },
  { id: 'fa',  name: 'Persa (Farsi)',   emoji: '🇮🇷', native: 'فارسی' },
];

const LEVELS = ['A1','A2','B1','B2','C1','C2'];

// ── Idiomas de explicação disponíveis (idioma em que a IA explica o conteúdo) ──
const EXPLAIN_LANGS = {
  pt: 'português (PT-BR)',
  en: 'inglês',
  es: 'espanhol',
  fr: 'francês',
};

function getExplainLang() {
  return localStorage.getItem('fluently_explain_lang') || 'pt';
}
function setExplainLang(id) {
  localStorage.setItem('fluently_explain_lang', id);
}

// ── Profundidade da aula ──
const LESSON_DEPTHS = {
  rapida:  { label: 'Rápida (resumo direto ao ponto)',        vocabCount: '4-6',  exampleCount: '3', quizCount: '2' },
  padrao:  { label: 'Padrão (equilibrada)',                    vocabCount: '8-12', exampleCount: '5', quizCount: '3' },
  detalhada: { label: 'Detalhada (aprofundada, mais exemplos)', vocabCount: '14-18', exampleCount: '8', quizCount: '5' },
};

function getLessonDepth() {
  return localStorage.getItem('fluently_lesson_depth') || 'padrao';
}
function setLessonDepth(id) {
  localStorage.setItem('fluently_lesson_depth', id);
}

// ── Vincular exercícios/prova à última aula gerada ──
function getLinkLesson() {
  return localStorage.getItem('fluently_link_lesson') !== 'off'; // padrão: ligado
}
function setLinkLesson(on) {
  localStorage.setItem('fluently_link_lesson', on ? 'on' : 'off');
}

// ── Quantidade de questões da prova ──
function getExamQuestionCount() {
  return parseInt(localStorage.getItem('fluently_exam_qcount') || '10', 10);
}
function setExamQuestionCount(v) {
  localStorage.setItem('fluently_exam_qcount', String(v));
}

// ── Dicas de pronúncia nos exercícios ──
function getPronunciationTips() {
  return localStorage.getItem('fluently_pron_tips') !== 'off'; // padrão: ligado
}
function setPronunciationTips(on) {
  localStorage.setItem('fluently_pron_tips', on ? 'on' : 'off');
}

// ── Correção automática de idioma ao navegar a partir de uma aula ──
// Sempre que o usuário sai da tela de aula para exercícios, chat ou prova,
// sincroniza o seletor de idioma daquela tela com o idioma da aula gerada.
function syncLangSelectTo(view, langId) {
  const selMap = { exercises: 'ex-lang-select', chat: 'chat-lang-select', exam: 'exam-lang-select' };
  const selId = selMap[view];
  if (selId) {
    const sel = document.getElementById(selId);
    if (sel) sel.value = langId;
    if (view === 'exam') syncExamAutoLevel();
  }
}
function goFromLessonTo(view, langId) {
  syncLangSelectTo(view, langId);
  showView(view);
}

// ── Meta diária de XP ──
function getDailyGoal() {
  return parseInt(localStorage.getItem('fluently_daily_goal') || '30', 10);
}
function setDailyGoal(v) {
  localStorage.setItem('fluently_daily_goal', String(v));
}
function getTodayXP() {
  if (!currentUser) return 0;
  const todayStr = today();
  if (currentUser.dailyXPDate !== todayStr) return 0;
  return currentUser.dailyXP || 0;
}
function addTodayXP(amount) {
  if (!currentUser) return;
  const todayStr = today();
  if (currentUser.dailyXPDate !== todayStr) {
    currentUser.dailyXPDate = todayStr;
    currentUser.dailyXP = 0;
  }
  currentUser.dailyXP = (currentUser.dailyXP || 0) + amount;
}

const SIM_PROMPTS = {
  restaurante: 'Simule ser um garçom em um restaurante. O usuário é o cliente. Conduza a conversa naturalmente em {lang}. Corrija erros com gentileza ao final de cada resposta.',
  viagem:      'Simule situações de viagem (aeroporto, hotel, turismo). Você é um assistente local. Fale em {lang}. Corrija erros do usuário ao final de cada turno.',
  entrevista:  'Simule um entrevistador de emprego. Conduza uma entrevista profissional em {lang}. Corrija erros de vocabulário e gramática ao final.',
  mercado:     'Simule um vendedor em um mercado/supermercado. Fale em {lang}. Corrija erros do usuário ao final de cada resposta.',
};

// ── COLOR PALETTES (Configurações) ────────────────────────────────────
const PALETTES = {
  duo:    { name: 'Duolingo Verde', accent:'#58cc02', accent2:'#4caf00', blue:'#1cb0f6', purple:'#a560f8', red:'#ff4b4b', orange:'#ff9600', yellow:'#ffd900' },
  ocean:  { name: 'Oceano',         accent:'#00b8d9', accent2:'#0090a8', blue:'#3d7bfa', purple:'#5b6bf0', red:'#ff5c5c', orange:'#ffa63d', yellow:'#ffd93d' },
  sunset: { name: 'Pôr do Sol',     accent:'#ff7849', accent2:'#e85f2e', blue:'#ff9e6d', purple:'#ff477e', red:'#e63946', orange:'#ffb703', yellow:'#ffd166' },
  grape:  { name: 'Uva',            accent:'#a560f8', accent2:'#8a3ff0', blue:'#6c63ff', purple:'#c77dff', red:'#ff4b4b', orange:'#ff9600', yellow:'#ffd900' },
  forest: { name: 'Floresta',       accent:'#2d9d5f', accent2:'#237e4b', blue:'#3aa6b9', purple:'#7c9885', red:'#e0544c', orange:'#e6a23c', yellow:'#f0c929' },
  rose:   { name: 'Rosé',           accent:'#ef476f', accent2:'#d63b60', blue:'#ffa5ab', purple:'#c86bfa', red:'#e63946', orange:'#ff9770', yellow:'#ffd166' },
  mono:   { name: 'Monocromático',  accent:'#6c757d', accent2:'#495057', blue:'#495057', purple:'#868e96', red:'#e03131', orange:'#f08c00', yellow:'#f5c518' },
  candy:  { name: 'Doce',           accent:'#ff6ac1', accent2:'#e8489f', blue:'#7ee8fa', purple:'#c39bd3', red:'#ff5d8f', orange:'#ffb86c', yellow:'#f6f76a' },
};

function applyPalette(key) {
  const p = PALETTES[key];
  if (!p) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent2', p.accent2);
  root.style.setProperty('--blue', p.blue);
  root.style.setProperty('--purple', p.purple);
  root.style.setProperty('--red', p.red);
  root.style.setProperty('--orange', p.orange);
  root.style.setProperty('--yellow', p.yellow);
  root.style.setProperty('--accent-glow', hexToRgba(p.accent, 0.25));
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function loadPalette() {
  const saved = localStorage.getItem('fluently_palette') || 'duo';
  applyPalette(saved);
  return saved;
}

function savePalette(key) {
  localStorage.setItem('fluently_palette', key);
  applyPalette(key);
}

function renderPaletteGrid() {
  const grid = document.getElementById('palette-grid');
  if (!grid) return;
  const current = localStorage.getItem('fluently_palette') || 'duo';
  grid.innerHTML = Object.entries(PALETTES).map(([key, p]) => `
    <div class="palette-swatch ${key === current ? 'active' : ''}" data-palette="${key}">
      <div class="palette-dots">
        <div class="palette-dot" style="background:${p.accent}"></div>
        <div class="palette-dot" style="background:${p.blue}"></div>
        <div class="palette-dot" style="background:${p.purple}"></div>
      </div>
      <div class="palette-name">${p.name}</div>
    </div>`).join('');

  grid.querySelectorAll('.palette-swatch').forEach(el => {
    el.addEventListener('click', () => {
      savePalette(el.dataset.palette);
      renderPaletteGrid();
      SoundFX.click();
      toast('Paleta aplicada e salva neste dispositivo! 🎨', 'success');
    });
  });
}

// ── STATE ──────────────────────────────────────────────────────────────
let currentUser = null;    // { uid, name, email, age, xp, streak, courses, errors, lastActive }
let chatHistory  = [];     // [{role, content}]
let simHistory   = [];
let currentSim   = null;
let currentExam  = null;   // { langId, level, questions, answers }
let lastLesson   = null;   // { langId, lang, level, topic, topicLabel, raw, vocabWords } — última aula gerada, usada para vincular exercícios/prova

// ── FIREBASE HELPERS ──────────────────────────────────────────────────
async function fbGet(path) {
  const r = await fetch(`${FIREBASE_URL}/${path}.json`);
  return r.ok ? r.json() : null;
}
async function fbSet(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
async function fbUpdate(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Gera UID simples (sem Firebase Auth)
function genUID() {
  return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Sanitiza email para usar como chave Firebase
function emailKey(email) {
  return email.toLowerCase().replace(/[.#$\[\]]/g, '_');
}

// ── AUTH ──────────────────────────────────────────────────────────────
async function register(name, email, password, age) {
  const key = emailKey(email);
  const existing = await fbGet(`fluently_users/${key}`);
  if (existing) throw new Error('Este email já está cadastrado.');

  const uid = genUID();
  const user = {
    uid, name, email: email.toLowerCase(), password,
    age: parseInt(age), xp: 0, streak: 0,
    courses: {}, errors: [],
    lastActive: today(), createdAt: Date.now(),
  };
  await fbSet(`fluently_users/${key}`, user);
  return user;
}

async function login(email, password) {
  const key = emailKey(email);
  const user = await fbGet(`fluently_users/${key}`);
  if (!user) throw new Error('Email não encontrado.');
  if (user.password !== password) throw new Error('Senha incorreta.');
  return user;
}

function saveSession(user) {
  localStorage.setItem('fluently_session', JSON.stringify({ email: user.email }));
}

async function loadSession() {
  const s = localStorage.getItem('fluently_session');
  if (!s) return null;
  try {
    const { email } = JSON.parse(s);
    return await login(email, (await fbGet(`fluently_users/${emailKey(email)}`))?.password || '');
  } catch { return null; }
}

function logout() {
  localStorage.removeItem('fluently_session');
  currentUser = null;
  chatHistory = [];
  showScreen('auth');
}

// ── USER DATA HELPERS ─────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function saveUser() {
  if (!currentUser) return;
  await fbSet(`fluently_users/${emailKey(currentUser.email)}`, currentUser);
}

function addXP(amount) {
  const prevLevel = getLevelFromXP(currentUser.xp || 0);
  currentUser.xp = (currentUser.xp || 0) + amount;
  addTodayXP(amount);
  const newLevel = getLevelFromXP(currentUser.xp);
  updateStreak();
  updateNavStats();
  saveUser();
  if (prevLevel !== newLevel) {
    SoundFX.levelup();
    toast(`🎉 Você subiu para o nível ${newLevel}!`, 'success');
  } else {
    SoundFX.xp();
  }
}

// Adiciona XP específico de um curso (usado para calcular nível/dificuldade por idioma)
function addCourseXP(langId, amount) {
  if (!currentUser.courses) currentUser.courses = {};
  if (!currentUser.courses[langId]) currentUser.courses[langId] = emptyCourseProgress();
  currentUser.courses[langId].xp = (currentUser.courses[langId].xp || 0) + amount;
  currentUser.courses[langId].level = getLevelFromXP(currentUser.courses[langId].xp);
  saveUser();
}

function emptyCourseProgress() {
  return { xp: 0, level: 'A1', messages: 0, taughtItems: [], topicsCovered: {}, examHistory: [], difficulty: 50 };
}

function updateStreak() {
  const last = currentUser.lastActive;
  const todayStr = today();
  if (last === todayStr) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (last === yesterday) {
    currentUser.streak = (currentUser.streak || 0) + 1;
  } else {
    currentUser.streak = 1;
  }
  currentUser.lastActive = todayStr;
}

function getLevelFromXP(xp) {
  if (xp < 200)  return 'A1';
  if (xp < 500)  return 'A2';
  if (xp < 1000) return 'B1';
  if (xp < 2000) return 'B2';
  if (xp < 4000) return 'C1';
  return 'C2';
}

const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 2000, 4000, 6000]; // 6000 = fluência plena (C2 dominado)

function xpForNextLevel(xp) {
  const thresholds = [200, 500, 1000, 2000, 4000, 9999];
  for (const t of thresholds) if (xp < t) return { curr: xp, next: t };
  return { curr: xp, next: xp };
}

// Retorna informações completas de progresso de um curso: nível atual, % para o próximo
// nível, % total rumo à fluência (C2 dominado) e uma "sub-etapa" de dificuldade dentro do nível.
function getCourseProgressInfo(langId) {
  const prog = currentUser?.courses?.[langId] || {};
  const xp = prog.xp || 0;
  const level = getLevelFromXP(xp);
  const idx = LEVELS.indexOf(level);
  const prevT = LEVEL_THRESHOLDS[idx] ?? 0;
  const nextT = LEVEL_THRESHOLDS[idx + 1] ?? prevT + 2000;
  const pctToNext = Math.min(100, Math.round(((xp - prevT) / (nextT - prevT)) * 100));
  const fluencyPct = Math.min(100, Math.round((xp / LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) * 100));
  const nextLevel = LEVELS[idx + 1] || null;
  const difficulty = prog.difficulty ?? 50;
  const tier = difficulty < 34 ? 'consolidação' : difficulty < 67 ? 'padrão' : 'desafio avançado';
  return { level, xp, pctToNext, fluencyPct, nextLevel, difficulty, tier };
}

// Ajusta a dificuldade adaptativa (0-100) de um curso com base no desempenho do aluno
function adjustDifficulty(langId, delta) {
  if (!currentUser.courses) currentUser.courses = {};
  if (!currentUser.courses[langId]) currentUser.courses[langId] = emptyCourseProgress();
  const prog = currentUser.courses[langId];
  prog.difficulty = Math.max(0, Math.min(100, (prog.difficulty ?? 50) + delta));
  return prog.difficulty;
}

// Descreve a sub-etapa de dificuldade dentro do nível CEFR, para ajustar exercícios/jogos
function difficultyTierPrompt(langId) {
  const { tier, level, nextLevel } = getCourseProgressInfo(langId);
  if (tier === 'consolidação') return `O aluno está consolidando o nível ${level} — prefira exercícios ligeiramente mais simples e diretos dentro deste nível, reforçando o básico antes de avançar.`;
  if (tier === 'desafio avançado') return `O aluno está dominando o nível ${level} e caminhando para ${nextLevel || 'a fluência total'} — traga desafios um pouco mais avançados, com vocabulário/estruturas no limite superior do nível ${level}, quase tocando ${nextLevel || 'o próximo patamar'}.`;
  return `O aluno está em ritmo padrão no nível ${level} — mantenha a dificuldade típica deste nível.`;
}

// Nível específico do curso (usado para ajuste automático de dificuldade)
function getCourseLevel(langId) {
  const prog = currentUser?.courses?.[langId];
  if (!prog) return 'A1';
  return getLevelFromXP(prog.xp || 0);
}

function addError(tag) {
  if (!currentUser.errors) currentUser.errors = [];
  if (!currentUser.errors.includes(tag)) currentUser.errors.push(tag);
  saveUser();
}

// ── GROQ AI ───────────────────────────────────────────────────────────
async function groqChat(messages, systemPrompt) {
  const body = {
    model: GROQ_MODEL,
    max_tokens: 800,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${r.status}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content || '(sem resposta)';
}

function langName(id) {
  return COURSES.find(c => c.id === id)?.name || id;
}

function buildTeacherPrompt(langId) {
  const explainLang = EXPLAIN_LANGS[getExplainLang()] || EXPLAIN_LANGS.pt;
  return `Você é um professor de idiomas especializado em ${langName(langId)}. 
Corrija erros gramaticais, explique de forma simples e sugira melhorias.
Responda sempre em ${explainLang} quando explicar, mas use ${langName(langId)} nos exemplos.
Seja encorajador, conciso e didático.`;
}

// ── UI HELPERS ────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const el = document.getElementById(name === 'auth' ? 'auth-screen' : 'app-screen');
  el.classList.remove('hidden');
  el.classList.add('active');
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const el = document.getElementById(`view-${name}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === name);
  });

  if (name === 'home') renderHome();
  if (name === 'progress') renderProgress();
  if (name === 'courses') renderCourses();
  if (name === 'learn') initLearnView();
  if (name === 'exam') initExamView();
  if (name === 'settings') renderPaletteGrid();
}

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ── NAV / STATS ───────────────────────────────────────────────────────
function updateNavStats() {
  if (!currentUser) return;
  const initial = (currentUser.name || '?')[0].toUpperCase();
  document.getElementById('nav-avatar').textContent = initial;
  document.getElementById('nav-username').textContent = currentUser.name.split(' ')[0];
  document.getElementById('nav-xp').textContent = `${currentUser.xp || 0} XP`;
}

// ── RENDER HOME ───────────────────────────────────────────────────────
function renderHome() {
  document.getElementById('home-username').textContent = currentUser.name.split(' ')[0];

  const xp = currentUser.xp || 0;
  const streak = currentUser.streak || 0;
  const courses = Object.keys(currentUser.courses || {});
  const level = getLevelFromXP(xp);

  document.getElementById('stat-xp').textContent = xp;
  document.getElementById('stat-streak').textContent = streak;
  document.getElementById('stat-courses').textContent = courses.length;
  document.getElementById('stat-level').textContent = level;

  const goalBar = document.getElementById('daily-goal-fill');
  const goalText = document.getElementById('daily-goal-text');
  if (goalBar && goalText) {
    const goal = getDailyGoal();
    const done = getTodayXP();
    const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
    goalBar.style.width = pct + '%';
    goalText.textContent = `${done} / ${goal} XP hoje`;
    goalBar.parentElement?.parentElement?.classList.toggle('goal-complete', done >= goal);
  }

  const grid = document.getElementById('home-active-courses');
  loadPhraseOfDay(courses);
  if (!courses.length) {
    grid.innerHTML = `<div class="empty-state"><p>Nenhum curso iniciado ainda.</p>
      <button class="btn-secondary" onclick="showView('courses')">Ver cursos →</button></div>`;
    return;
  }

  grid.innerHTML = courses.map(id => {
    const course = COURSES.find(c => c.id === id);
    if (!course) return '';
    const info = getCourseProgressInfo(id);
    return `<div class="active-course-card" onclick="startCourse('${id}')">
      <div class="course-emoji">${course.emoji}</div>
      <h4>${course.name}</h4>
      <div class="mini-progress"><div class="mini-progress-fill" style="width:${info.pctToNext}%"></div></div>
      <div class="mini-level">${info.level} · ${info.pctToNext}% para ${info.nextLevel || 'fluência!'} · 🔥 ${info.fluencyPct}% fluente</div>
    </div>`;
  }).join('');
}

// ── FRASE DO DIA ─────────────────────────────────────────────────────
let _podLoading = false;
async function loadPhraseOfDay(courses) {
  const card = document.getElementById('phrase-of-day-card');
  if (!card) return;
  if (!courses.length) { card.classList.add('hidden'); return; }

  const langId = courses[0];
  const cacheKey = `fluently_pod_${langId}_${today()}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const { phrase, translation } = JSON.parse(cached);
      renderPhraseOfDay(langId, phrase, translation);
      return;
    } catch (e) { /* regenerate below */ }
  }

  if (_podLoading) return;
  _podLoading = true;
  card.classList.remove('hidden');
  document.getElementById('pod-lang').textContent = `— ${langName(langId)}`;
  document.getElementById('pod-phrase').textContent = 'Carregando...';
  document.getElementById('pod-translation').textContent = '';

  try {
    const explainLang = EXPLAIN_LANGS[getExplainLang()] || EXPLAIN_LANGS.pt;
    const level = getCourseLevel(langId);
    const raw = await groqChat(
      [{ role: 'user', content: `Dê UMA frase curta e útil do dia a dia em ${langName(langId)}, nível ${level}, com sua tradução em ${explainLang}. Retorne APENAS JSON: {"phrase":"frase no idioma","translation":"tradução"}` }],
      'Você é um gerador de "frase do dia" para estudantes de idiomas. Retorne apenas JSON puro, sem markdown.'
    );
    const clean = raw.replace(/```json|```/g, '').trim();
    const { phrase, translation } = JSON.parse(clean);
    localStorage.setItem(cacheKey, JSON.stringify({ phrase, translation }));
    renderPhraseOfDay(langId, phrase, translation);
  } catch (e) {
    card.classList.add('hidden');
  } finally {
    _podLoading = false;
  }
}

function renderPhraseOfDay(langId, phrase, translation) {
  const card = document.getElementById('phrase-of-day-card');
  if (!card) return;
  card.classList.remove('hidden');
  document.getElementById('pod-lang').textContent = `— ${langName(langId)}`;
  document.getElementById('pod-phrase').textContent = phrase;
  document.getElementById('pod-translation').textContent = translation;
}

// ── RENDER COURSES ────────────────────────────────────────────────────
function renderCourses() {
  const grid = document.getElementById('courses-grid');
  const enrolled = Object.keys(currentUser.courses || {});
  grid.innerHTML = COURSES.map(c => {
    const isEnrolled = enrolled.includes(c.id);
    const info = isEnrolled ? getCourseProgressInfo(c.id) : null;
    return `
    <div class="course-card ${isEnrolled ? 'enrolled' : ''}">
      <div onclick="enrollCourse('${c.id}')">
        <span class="course-emoji">${c.emoji}</span>
        <div class="course-name">${c.name}</div>
        <div class="course-native">${c.native}</div>
        ${info ? `
          <div class="mini-progress" style="margin-top:10px"><div class="mini-progress-fill" style="width:${info.pctToNext}%"></div></div>
          <div class="mini-level">${info.level} · 🔥 ${info.fluencyPct}% rumo à fluência</div>` : ''}
      </div>
      ${isEnrolled ? `<button class="btn-cancel-course" onclick="event.stopPropagation(); confirmCancelCourse('${c.id}')">✕ Cancelar curso</button>` : ''}
    </div>`;
  }).join('');
}

// Cancela um curso, removendo o progresso e aplicando um desconto de XP como penalidade
function confirmCancelCourse(id) {
  const info = getCourseProgressInfo(id);
  const penalty = Math.round((currentUser.courses[id]?.xp || 0) * 0.3);
  const ok = confirm(`Cancelar o curso de ${langName(id)}?\n\nVocê está no nível ${info.level}. Ao cancelar, todo o progresso deste curso será perdido e você perderá ${penalty} XP do seu total geral como penalidade. Essa ação não pode ser desfeita.`);
  if (!ok) return;
  cancelCourse(id, penalty);
}

async function cancelCourse(id, penalty) {
  delete currentUser.courses[id];
  currentUser.xp = Math.max(0, (currentUser.xp || 0) - penalty);
  await saveUser();
  updateNavStats();
  renderCourses();
  populateLangSelects();
  toast(`Curso de ${langName(id)} cancelado. -${penalty} XP 💔`, 'info');
}

async function enrollCourse(id) {
  if (!currentUser.courses) currentUser.courses = {};
  if (!currentUser.courses[id]) {
    currentUser.courses[id] = emptyCourseProgress();
    await saveUser();
    toast(`Curso de ${langName(id)} iniciado! 🎉`, 'success');
    renderCourses();
    populateLangSelects();
  }
  startCourse(id);
}

function startCourse(id) {
  document.getElementById('chat-lang-select').value = id;
  showView('chat');
}

// ── LANG SELECTS ──────────────────────────────────────────────────────
function populateLangSelects() {
  const enrolled = Object.keys(currentUser.courses || {});
  const opts = enrolled.length
    ? enrolled.map(id => {
        const c = COURSES.find(x => x.id === id);
        return `<option value="${id}">${c?.emoji} ${c?.name}</option>`;
      }).join('')
    : COURSES.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

  ['chat-lang-select','ex-lang-select','sim-lang-select','learn-lang-select','games-lang-select','exam-lang-select'].forEach(sel => {
    const el = document.getElementById(sel);
    if (el) el.innerHTML = opts;
  });
}

// ── CHAT ──────────────────────────────────────────────────────────────
function appendMessage(windowId, role, text) {
  const win = document.getElementById(windowId);
  // Remove welcome placeholder
  win.querySelector('.chat-welcome')?.remove();

  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-label">${role === 'user' ? '👤 Você' : '🤖 Professor'}</div>
                   <div class="msg-bubble">${escHtml(text)}</div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function showTyping(windowId) {
  const win = document.getElementById(windowId);
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typing-indicator';
  div.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}
function hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  const langId = document.getElementById('chat-lang-select').value;
  input.value = '';
  input.style.height = 'auto';

  appendMessage('chat-window', 'user', text);
  chatHistory.push({ role: 'user', content: text });
  SoundFX.send();

  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  showTyping('chat-window');

  try {
    const reply = await groqChat(chatHistory, buildTeacherPrompt(langId));
    hideTyping();
    appendMessage('chat-window', 'ai', reply);
    chatHistory.push({ role: 'assistant', content: reply });

    // Save message count and add XP
    if (!currentUser.courses[langId]) currentUser.courses[langId] = emptyCourseProgress();
    currentUser.courses[langId].messages = (currentUser.courses[langId].messages || 0) + 1;
    addXP(5);
    addCourseXP(langId, 5);

  } catch (err) {
    hideTyping();
    toast('Erro ao conectar com a IA: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── EXERCISES ─────────────────────────────────────────────────────────
async function generateExercise() {
  const langId = document.getElementById('ex-lang-select').value;
  const type   = document.getElementById('ex-type-select').value;
  const area   = document.getElementById('exercise-area');
  const level  = getCourseLevel(langId);
  const tierNote = difficultyTierPrompt(langId);

  // Vincula o exercício à última aula gerada (mesmo idioma), se a opção estiver ativa
  const linkedToLesson = getLinkLesson() && lastLesson && lastLesson.langId === langId;
  const lessonContext = linkedToLesson
    ? `\n\nIMPORTANTE: este exercício DEVE se relacionar diretamente com a aula que o aluno acabou de estudar sobre "${lastLesson.topicLabel}". Use o vocabulário, as estruturas gramaticais e/ou os exemplos abordados nela sempre que possível. Palavras/expressões ensinadas na aula: ${lastLesson.vocabWords.slice(0, 12).join(', ') || '(baseie-se no tema geral da aula)'}.`
    : '';

  const pronExtra = getPronunciationTips() ? ' Se fizer sentido, inclua uma breve dica de pronúncia no campo DICA.' : '';

  area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando exercício${linkedToLesson ? ` baseado na aula "${lastLesson.topicLabel}"` : ''}...</p></div>`;

  const typeExtra = type === 'leitura'
    ? ' Escreva um pequeno texto (5-8 frases) em ${lang} adequado ao nível, seguido de UMA pergunta de compreensão sobre o texto.'.replace('${lang}', langName(langId))
    : type === 'escrita'
    ? ' Dê um tema/contexto e peça para o aluno escrever de 2 a 4 frases sobre ele.'
    : '';

  const prompt = `Crie um exercício de ${type} em ${langName(langId)} para o nível ${level}.${typeExtra}
${tierNote}${lessonContext}${pronExtra}
Formato:
TIPO: ${type}
INSTRUÇÃO: (instrução em português)
EXERCÍCIO: (conteúdo do exercício)
DICA: (uma dica opcional)
Apenas o exercício, sem resposta ainda.`;

  try {
    const result = await groqChat([{ role: 'user', content: prompt }],
      `Você é um professor de ${langName(langId)}. Crie exercícios claros, didáticos e calibrados exatamente para a etapa de dificuldade indicada — nem fáceis nem difíceis demais.`);

    area.innerHTML = `
      <div class="exercise-card">
        <h3>${langName(langId)} — ${type.charAt(0).toUpperCase()+type.slice(1)} <span class="ex-level-badge">${level}</span></h3>
        ${linkedToLesson ? `<div class="ex-linked-badge">🔗 Baseado na sua aula: ${escHtml(lastLesson.topicLabel)}</div>` : ''}
        <div class="exercise-question">${escHtml(result)}</div>
        <textarea id="ex-answer" placeholder="Sua resposta aqui..." rows="3"></textarea>
        <button class="btn-primary" style="width:auto" onclick="checkExercise(${JSON.stringify(result).replace(/"/g,'&quot;')}, '${langId}')">
          Verificar resposta ✓
        </button>
        <div id="ex-feedback"></div>
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

async function checkExercise(exercise, langId) {
  const answer = document.getElementById('ex-answer')?.value?.trim();
  if (!answer) { toast('Escreva sua resposta primeiro!', 'error'); return; }

  const feedback = document.getElementById('ex-feedback');
  feedback.innerHTML = `<div class="spinner"></div>`;

  const prompt = `Exercício: ${exercise}\n\nResposta do aluno: ${answer}\n\nAvalie a resposta. Comece sua resposta OBRIGATORIAMENTE com uma destas linhas exatas (sem nada antes):
RESULTADO: CORRETO
RESULTADO: PARCIAL
RESULTADO: INCORRETO
Depois, corrija erros, explique e dê a resposta correta. Seja encorajador.`;

  try {
    const result = await groqChat(
      [{ role: 'user', content: prompt }],
      buildTeacherPrompt(langId)
    );

    const firstLine = result.split('\n')[0].toUpperCase();
    const isCorrect = firstLine.includes('CORRETO') && !firstLine.includes('INCORRETO');
    const isPartial = firstLine.includes('PARCIAL');
    const bodyText = result.replace(/^RESULTADO:.*\n?/i, '').trim();

    const xpGain = isCorrect ? 15 : isPartial ? 8 : 4;
    const diffDelta = isCorrect ? 6 : isPartial ? 0 : -6;
    const newDifficulty = adjustDifficulty(langId, diffDelta);

    feedback.innerHTML = `<div class="exercise-feedback">${escHtml(bodyText)}</div>
      <div class="xp-earned">${isCorrect ? '✅' : isPartial ? '🟡' : '❌'} +${xpGain} XP ganhos! · Dificuldade adaptativa: ${newDifficulty}/100</div>`;
    addXP(xpGain);
    addCourseXP(langId, xpGain);
    SoundFX[isCorrect ? 'correct' : 'wrong']();

    // Detect common error patterns
    if (result.toLowerCase().includes('past tense') || result.toLowerCase().includes('passado')) addError('Past Tense');
    if (result.toLowerCase().includes('artigo')) addError('Artigos');
    if (result.toLowerCase().includes('gênero')) addError('Gênero gramatical');

  } catch (err) {
    feedback.textContent = 'Erro: ' + err.message;
  }
}

// ── SIMULATIONS ───────────────────────────────────────────────────────
function startSimulation(simKey) {
  const langId = document.getElementById('sim-lang-select').value;
  const lang   = langName(langId);
  currentSim   = { key: simKey, langId };
  simHistory   = [];

  const area = document.getElementById('sim-chat-area');
  const win  = document.getElementById('sim-chat-window');
  const simNames = { restaurante:'🍽️ Restaurante', viagem:'✈️ Viagem', entrevista:'💼 Entrevista', mercado:'🛒 Mercado' };

  document.getElementById('sim-title').textContent = `${simNames[simKey]} — ${lang}`;
  win.innerHTML = '';
  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth' });

  // Kick off with AI greeting
  const systemPrompt = SIM_PROMPTS[simKey].replace('{lang}', lang);
  const intro = `Inicie a simulação de "${simNames[simKey]}" em ${lang}. Apresente-se e comece a cena naturalmente.`;

  showTyping('sim-chat-window');
  groqChat([{ role: 'user', content: intro }], systemPrompt)
    .then(reply => {
      hideTyping();
      appendMessage('sim-chat-window', 'ai', reply);
      simHistory.push({ role: 'assistant', content: reply });
    })
    .catch(err => { hideTyping(); toast('Erro: ' + err.message, 'error'); });
}

async function sendSimMessage() {
  if (!currentSim) return;
  const input = document.getElementById('sim-input');
  const text  = input.value.trim();
  if (!text) return;

  const langId = currentSim.langId;
  const lang   = langName(langId);
  input.value  = '';

  appendMessage('sim-chat-window', 'user', text);
  simHistory.push({ role: 'user', content: text });

  const btn = document.getElementById('sim-send');
  btn.disabled = true;
  showTyping('sim-chat-window');

  try {
    const systemPrompt = SIM_PROMPTS[currentSim.key].replace('{lang}', lang);
    const reply = await groqChat(simHistory, systemPrompt);
    hideTyping();
    appendMessage('sim-chat-window', 'ai', reply);
    simHistory.push({ role: 'assistant', content: reply });
    addXP(8);
    addCourseXP(langId, 8);
  } catch (err) {
    hideTyping();
    toast('Erro: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── LEARN (AULAS ESCRITAS) ────────────────────────────────────────────
function initLearnView() {
  const sel = document.getElementById('learn-lang-select');
  if (sel && !sel.dataset.ready) {
    sel.dataset.ready = '1';
    sel.addEventListener('change', syncLearnAutoLevel);
  }
  syncLearnAutoLevel();
}

function syncLearnAutoLevel() {
  const auto = document.getElementById('learn-auto-toggle')?.checked;
  const badge = document.getElementById('learn-auto-badge');
  const levelSelect = document.getElementById('learn-level-select');
  const langId = document.getElementById('learn-lang-select')?.value;
  if (!levelSelect) return;
  if (auto && langId) {
    levelSelect.value = getCourseLevel(langId);
    levelSelect.disabled = true;
    badge?.classList.remove('hidden');
  } else {
    levelSelect.disabled = false;
    badge?.classList.add('hidden');
  }
}

const TOPIC_LABELS = {
  alfabeto: 'Alfabeto e Pronúncia', saudacoes: 'Saudações e Apresentações',
  numeros: 'Números e Quantidades', cores: 'Cores e Adjetivos',
  familia: 'Família e Pessoas', alimentacao: 'Alimentação e Restaurante',
  transporte: 'Transporte e Direções', tempo: 'Tempo e Clima',
  trabalho: 'Trabalho e Profissões', verbos: 'Verbos Essenciais e Conjugação',
  passado: 'Tempos Verbais — Passado', futuro: 'Tempos Verbais — Futuro',
  expressoes: 'Expressões Idiomáticas', cultura: 'Cultura e Costumes',
  saude: 'Saúde e Emergências', tecnologia: 'Tecnologia e Internet',
  negocios: 'Negócios e Reuniões', hobbies: 'Hobbies e Lazer',
  compras: 'Compras e Negociação', casa: 'Casa e Moradia',
};

async function generateLesson(topicOverride) {
  const langId = document.getElementById('learn-lang-select').value;
  const autoMode = document.getElementById('learn-auto-toggle')?.checked;
  const level  = autoMode ? getCourseLevel(langId) : document.getElementById('learn-level-select').value;
  const topic  = topicOverride || document.getElementById('learn-topic-select').value;
  const topicLabel = TOPIC_LABELS[topic] || topic;
  const lang   = langName(langId);
  const area   = document.getElementById('lesson-area');

  if (!currentUser.courses) currentUser.courses = {};
  if (!currentUser.courses[langId]) currentUser.courses[langId] = emptyCourseProgress();
  const courseProg = currentUser.courses[langId];
  if (!courseProg.taughtItems) courseProg.taughtItems = [];
  if (!courseProg.topicsCovered) courseProg.topicsCovered = {};

  const timesSeen = courseProg.topicsCovered[topic] || 0;
  const alreadyTaught = courseProg.taughtItems.slice(-40);

  const explainLang = EXPLAIN_LANGS[getExplainLang()] || EXPLAIN_LANGS.pt;
  const depthKey = getLessonDepth();
  const depth = LESSON_DEPTHS[depthKey] || LESSON_DEPTHS.padrao;

  area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando sua aula de ${lang} (${level})...</p></div>`;

  const systemPrompt = `Você é um professor experiente de ${lang}, didático e apaixonado por ensinar.
Escreva aulas estruturadas e envolventes, explicando sempre em ${explainLang}.
Sempre inclua exemplos reais no idioma ${lang} com tradução entre parênteses e, quando fizer sentido, uma dica simples de pronúncia.
Use emojis para tornar o conteúdo mais visual. Seja claro, progressivo e motivador.
Conecte o conteúdo com contextos do dia a dia e, quando possível, curiosidades culturais do idioma.
Nunca repita vocabulário ou exemplos que o aluno já viu antes — sempre traga conteúdo NOVO e, se o tópico já foi abordado antes, aumente ligeiramente a complexidade (frases mais longas, vocabulário mais raro, nuances gramaticais adicionais).`;

  const avoidBlock = alreadyTaught.length
    ? `\n\nO aluno JÁ aprendeu estas palavras/expressões neste curso — NÃO as repita, ensine itens diferentes e mais avançados relacionados ao tópico:\n${alreadyTaught.join(', ')}`
    : '';

  const repeatNote = timesSeen > 0
    ? `\n\nEsta é a ${timesSeen + 1}ª vez que o aluno estuda o tópico "${topicLabel}" neste nível/curso. Aprofunde mais do que da última vez: use vocabulário mais avançado, frases mais complexas e nuances que ainda não foram cobertas.`
    : '';

  const userPrompt = `Crie uma aula completa e didática sobre o tópico "${topicLabel}" em ${lang} para o nível ${level}. Profundidade desejada: ${depth.label}.

A aula DEVE conter obrigatoriamente estas seções:
1. 📌 INTRODUÇÃO — Contextualização do tópico (2-3 frases motivadoras)
2. 📚 TEORIA — Explicação clara das regras/conceitos principais
3. 📝 VOCABULÁRIO ESSENCIAL — Lista de ${depth.vocabCount} palavras/frases chave, cada uma com tradução, exemplo de uso e uma dica curta de pronúncia
4. 💬 EXEMPLOS PRÁTICOS — ${depth.exampleCount} frases completas em ${lang} com tradução, variando o contexto (formal/informal, pergunta/resposta)
5. ⚠️ ATENÇÃO — 2-3 erros comuns cometidos por quem fala português
6. 🧠 DICA DE OURO — Um truque memorável para fixar o conteúdo
7. ✅ MINI-QUIZ — ${depth.quizCount} perguntas de fixação (com as respostas ao final)

Seja claro e use exemplos do dia a dia.${avoidBlock}${repeatNote}`;

  try {
    const result = await groqChat([{ role: 'user', content: userPrompt }], systemPrompt);
    renderLesson(result, lang, topicLabel, level, langId);
    addXP(20);
    addCourseXP(langId, 20);

    // Atualiza contagem do tópico e extrai novo vocabulário ensinado para não repetir depois
    courseProg.topicsCovered[topic] = timesSeen + 1;
    const newWords = extractVocabWords(result);
    courseProg.taughtItems = dedupCap([...courseProg.taughtItems, ...newWords], 80);
    saveUser();

    // Guarda a última aula gerada — usada para vincular exercícios e provas ao mesmo conteúdo/idioma
    lastLesson = { langId, lang, level, topic, topicLabel, raw: result, vocabWords: newWords };
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p>Erro ao gerar aula: ${err.message}</p></div>`;
  }
}

// Extrai palavras/expressões da seção de vocabulário para lembrar o que já foi ensinado
function extractVocabWords(raw) {
  const lines = raw.split('\n');
  const words = [];
  let inVocab = false;
  for (const line of lines) {
    if (line.includes('📝')) { inVocab = true; continue; }
    if (inVocab && /[📌📚💬⚠️🧠✅]/.test(line)) { inVocab = false; }
    if (inVocab) {
      const cleaned = line.replace(/^[-*•\d.\s]+/, '').trim();
      const firstChunk = cleaned.split(/[-–:(]/)[0].trim();
      if (firstChunk && firstChunk.length < 40) words.push(firstChunk);
    }
  }
  return words.filter(Boolean);
}

function dedupCap(arr, cap) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = item.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out.slice(-cap);
}

function renderLesson(raw, lang, topic, level, langId) {
  const area = document.getElementById('lesson-area');

  // Parse sections by emoji markers
  const sections = [];
  const markers = [
    { emoji: '📌', key: 'intro' },
    { emoji: '📚', key: 'teoria' },
    { emoji: '📝', key: 'vocab' },
    { emoji: '💬', key: 'exemplos' },
    { emoji: '⚠️', key: 'atencao' },
    { emoji: '🧠', key: 'dica' },
    { emoji: '✅', key: 'quiz' },
  ];

  // Split raw text into lines and group by section
  const lines = raw.split('\n');
  let parsed = {};
  let currentKey = null;
  let currentLines = [];

  for (const line of lines) {
    const marker = markers.find(m => line.includes(m.emoji));
    if (marker) {
      if (currentKey) parsed[currentKey] = currentLines.join('\n').trim();
      currentKey = marker.key;
      currentLines = [line.replace(/^#+\s*/, '')];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  if (currentKey) parsed[currentKey] = currentLines.join('\n').trim();

  // If parsing failed, render raw
  if (!Object.keys(parsed).length) {
    area.innerHTML = `
      <div class="lesson-card">
        <div class="lesson-header">
          <div class="lesson-badge">${level}</div>
          <h3>${topic} — ${lang}</h3>
          <div class="lesson-xp">⚡ +20 XP</div>
        </div>
        <div class="lesson-body">${escHtml(raw)}</div>
        <div class="lesson-actions">
          <button class="btn-primary" style="width:auto" onclick="goFromLessonTo('exercises','${langId}')">🎯 Praticar agora</button>
          <button class="btn-secondary" onclick="goFromLessonTo('chat','${langId}')">💬 Perguntar ao professor</button>
        </div>
      </div>`;
    return;
  }

  const sectionHTML = (emoji, title, key, cls='') => {
    if (!parsed[key]) return '';
    return `<div class="lesson-section ${cls}">
      <div class="lesson-section-title">${emoji} ${title}</div>
      <div class="lesson-section-body">${escHtml(parsed[key])}</div>
    </div>`;
  };

  area.innerHTML = `
    <div class="lesson-card">
      <div class="lesson-header">
        <div class="lesson-badge">${level}</div>
        <h3>${topic} — ${lang}</h3>
        <div class="lesson-xp">⚡ +20 XP ganhos!</div>
      </div>
      <div class="lesson-body">
        ${sectionHTML('📌','Introdução','intro','lesson-intro')}
        ${sectionHTML('📚','Teoria','teoria')}
        ${sectionHTML('📝','Vocabulário Essencial','vocab','lesson-vocab')}
        ${sectionHTML('💬','Exemplos Práticos','exemplos','lesson-examples')}
        ${sectionHTML('⚠️','Atenção — Erros Comuns','atencao','lesson-warning')}
        ${sectionHTML('🧠','Dica de Ouro','dica','lesson-tip')}
        ${sectionHTML('✅','Mini-Quiz','quiz','lesson-quiz')}
      </div>
      <div class="lesson-actions">
        <button class="btn-primary" style="width:auto" onclick="goFromLessonTo('exercises','${langId}')">🎯 Fazer exercícios</button>
        <button class="btn-secondary" onclick="goFromLessonTo('exam','${langId}')">📝 Fazer prova</button>
        <button class="btn-secondary" onclick="goFromLessonTo('chat','${langId}')">💬 Tirar dúvidas com a IA</button>
      </div>
    </div>`;
}

// ── MINI GAMES ────────────────────────────────────────────────────────
const MINI_GAMES = {
  // Jogo 1: Flash Cards
  flashcard: {
    name: 'Flash Cards',
    emoji: '🃏',
    desc: 'Adivinhe o significado da palavra',
    xp: 8,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando flash cards...</p></div>`;

      const prompt = `Crie 5 flash cards de vocabulário em ${lang} para nível ${level}. ${tierNote}
Retorne APENAS JSON válido, sem markdown, neste formato exato:
[{"word":"palavra em ${lang}","translation":"tradução em português","example":"frase de exemplo em ${lang}"}]`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de flash cards. Retorne apenas JSON puro, sem texto adicional, sem blocos de código.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const cards = JSON.parse(clean);
        renderFlashCards(cards, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar cards: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 2: Quiz de Múltipla Escolha
  quiz: {
    name: 'Quiz Rápido',
    emoji: '⚡',
    desc: 'Responda 5 perguntas de múltipla escolha',
    xp: 10,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando quiz...</p></div>`;

      const prompt = `Crie 5 perguntas de múltipla escolha sobre ${lang} para nível ${level}. ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"pergunta em português","options":["A","B","C","D"],"correct":0,"explanation":"explicação breve"}]
O campo correct é o índice (0-3) da resposta correta.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de quizzes. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar quiz: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 3: Completar a Frase
  fillblank: {
    name: 'Complete a Frase',
    emoji: '✏️',
    desc: 'Preencha o espaço em branco',
    xp: 12,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando frases...</p></div>`;

      const prompt = `Crie 4 frases em ${lang} com uma palavra faltando (representada por ___), nível ${level}. ${tierNote}
Retorne APENAS JSON válido:
[{"sentence":"frase com ___ no lugar da palavra","answer":"palavra correta","hint":"dica em português"}]`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios fill-in-the-blank. Retorne apenas JSON puro sem markdown.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const items = JSON.parse(clean);
        renderFillBlank(items, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 4: Memória de Pares
  memory: {
    name: 'Memória',
    emoji: '🧠',
    desc: 'Combine a palavra com sua tradução',
    xp: 15,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando jogo de memória...</p></div>`;

      const prompt = `Gere 6 pares de palavras em ${lang} com tradução em português, nível ${level}. ${tierNote}
Retorne APENAS JSON válido:
[{"word":"palavra em ${lang}","translation":"tradução"}]`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de pares de vocabulário. Retorne apenas JSON puro sem markdown.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const pairs = JSON.parse(clean);
        renderMemoryGame(pairs, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 5: Ordene as Palavras (Unscramble)
  unscramble: {
    name: 'Ordene as Palavras',
    emoji: '🔀',
    desc: 'Reconstrua a frase na ordem correta',
    xp: 12,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando frases para ordenar...</p></div>`;

      const prompt = `Crie 5 frases simples e completas em ${lang} para nível ${level} (entre 4 e 8 palavras cada), com tradução em português. ${tierNote}
Retorne APENAS JSON válido:
[{"sentence":"frase completa em ${lang}","translation":"tradução em português"}]`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de frases para jogo de ordenar palavras. Retorne apenas JSON puro sem markdown.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const items = JSON.parse(clean);
        renderUnscramble(items, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 6: Verdadeiro ou Falso
  truefalse: {
    name: 'Verdadeiro ou Falso',
    emoji: '✅',
    desc: 'Avalie afirmações sobre o idioma',
    xp: 8,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando afirmações...</p></div>`;

      const prompt = `Crie 6 afirmações sobre vocabulário, gramática ou cultura relacionadas a ${lang}, nível ${level}. Metade verdadeiras e metade falsas. ${tierNote}
Retorne APENAS JSON válido:
[{"statement":"afirmação em português sobre o idioma ou cultura","isTrue":true,"explanation":"explicação breve em português"}]`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de afirmações verdadeiro/falso sobre idiomas. Retorne apenas JSON puro sem markdown.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const items = JSON.parse(clean);
        renderTrueFalse(items, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 7: Intruso (Odd One Out)
  oddone: {
    name: 'Intruso',
    emoji: '🕵️',
    desc: 'Encontre a palavra que não pertence ao grupo',
    xp: 10,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Montando grupos de palavras...</p></div>`;

      const prompt = `Crie 5 grupos de 4 palavras em ${lang} para nível ${level}. Em cada grupo, 3 palavras pertencem à mesma categoria (ex: frutas, cores, verbos) e 1 palavra é intrusa (de categoria diferente). ${tierNote}
Retorne APENAS JSON válido:
[{"words":["palavra1","palavra2","palavra3","palavra4"],"oddIndex":2,"explanation":"explicação breve em português de qual é a categoria e por que a palavra é intrusa"}]
O campo oddIndex é o índice (0-3) da palavra intrusa.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de jogos "intruso" de vocabulário. Retorne apenas JSON puro sem markdown.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const items = JSON.parse(clean);
        renderOddOne(items, langId);
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 8: Sinônimos e Antônimos
  synonyms: {
    name: 'Sinônimos & Antônimos',
    emoji: '🔁',
    desc: 'Escolha o sinônimo ou antônimo correto',
    xp: 10,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando sinônimos...</p></div>`;

      const prompt = `Crie 5 perguntas de múltipla escolha em que se dá uma palavra em ${lang} e o aluno escolhe o SINÔNIMO ou ANTÔNIMO correto (alterne entre os dois tipos) entre 4 opções, nível ${level}. ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"pergunta em português indicando se é sinônimo ou antônimo da palavra X","options":["A","B","C","D"],"correct":0,"explanation":"explicação breve"}]
O campo correct é o índice (0-3) da resposta correta.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios de sinônimos e antônimos. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId, 'synonyms');
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar jogo: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 9: Conjugação Relâmpago
  conjugation: {
    name: 'Conjugação Relâmpago',
    emoji: '⏱️',
    desc: 'Escolha a conjugação verbal correta',
    xp: 12,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando conjugações...</p></div>`;

      const prompt = `Crie 5 perguntas de múltipla escolha sobre conjugação verbal em ${lang}, nível ${level}. Cada pergunta mostra uma frase com um verbo faltando (indicando pessoa/tempo verbal em português) e o aluno escolhe a forma conjugada correta entre 4 opções. ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"frase em ${lang} com lacuna + instrução em português de qual pessoa/tempo usar","options":["A","B","C","D"],"correct":0,"explanation":"explicação breve"}]
O campo correct é o índice (0-3) da resposta correta.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios de conjugação verbal. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId, 'conjugation');
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar jogo: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 10: Detetive Gramatical
  granddetective: {
    name: 'Detetive Gramatical',
    emoji: '🔎',
    desc: 'Encontre a frase com erro gramatical',
    xp: 12,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Escondendo os erros...</p></div>`;

      const prompt = `Crie 5 perguntas para um jogo "Detetive Gramatical" em ${lang}, nível ${level}. Em cada pergunta, mostre 4 frases em ${lang} numeradas (A-D), onde 3 estão gramaticalmente corretas e 1 tem um erro claro (concordância, conjugação, ordem, etc). ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"Qual frase tem um erro gramatical?","options":["frase A em ${lang}","frase B em ${lang}","frase C em ${lang}","frase D em ${lang}"],"correct":0,"explanation":"explicação breve em português do erro e da correção"}]
O campo correct é o índice (0-3) da frase ERRADA.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios de detecção de erros gramaticais. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId, 'granddetective');
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar jogo: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 11: Tradução Relâmpago
  speedtranslate: {
    name: 'Tradução Relâmpago',
    emoji: '🌩️',
    desc: 'Escolha a tradução correta rapidinho',
    xp: 8,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando traduções...</p></div>`;

      const prompt = `Crie 6 perguntas de múltipla escolha em que se dá uma palavra ou expressão curta em português e o aluno escolhe a tradução correta em ${lang} entre 4 opções, nível ${level}. ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"Como se diz \\"palavra/expressão em português\\" em ${lang}?","options":["opção 1","opção 2","opção 3","opção 4"],"correct":0,"explanation":"explicação breve"}]
O campo correct é o índice (0-3) da resposta correta.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios de tradução rápida. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId, 'speedtranslate');
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar jogo: ${e.message}</p></div>`;
      }
    }
  },

  // Jogo 12: Complete o Diálogo
  dialogue: {
    name: 'Complete o Diálogo',
    emoji: '🗨️',
    desc: 'Escolha a melhor resposta na conversa',
    xp: 12,
    async start(langId) {
      const lang = langName(langId);
      const level = getCourseLevel(langId);
      const tierNote = difficultyTierPrompt(langId);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Montando diálogos...</p></div>`;

      const prompt = `Crie 5 mini-diálogos de múltipla escolha em ${lang}, nível ${level}. Cada pergunta mostra 1-2 falas de contexto em ${lang} (com tradução entre parênteses) seguidas de "Qual seria a melhor resposta?", com 4 opções de resposta em ${lang}. ${tierNote}
Retorne APENAS JSON válido neste formato:
[{"question":"contexto do diálogo em ${lang} (tradução em português) — Qual seria a melhor resposta?","options":["resposta A","resposta B","resposta C","resposta D"],"correct":0,"explanation":"explicação breve de por que essa é a melhor resposta"}]
O campo correct é o índice (0-3) da resposta correta.`;

      try {
        const raw = await groqChat([{role:'user',content:prompt}],
          `Você é um gerador de exercícios de diálogos contextuais. Retorne apenas JSON puro sem markdown nem texto extra.`);
        const clean = raw.replace(/```json|```/g,'').trim();
        const questions = JSON.parse(clean);
        renderQuiz(questions, langId, 'dialogue');
      } catch(e) {
        area.innerHTML = `<div class="empty-state"><p>Erro ao gerar jogo: ${e.message}</p></div>`;
      }
    }
  },
};

// ── FLASH CARDS RENDERER ──────────────────────────────────────────────
function renderFlashCards(cards, langId) {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0, flipped = false;

  const render = () => {
    const c = cards[idx];
    const pct = Math.round((idx / cards.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Card ${idx+1}/${cards.length}</span><span>⭐ ${score} acertos</span></div>
      <div class="flashcard-container" id="fc-container">
        <div class="flashcard" id="flashcard">
          <div class="flashcard-front">
            <div class="fc-label">Qual a tradução?</div>
            <div class="fc-word">${c.word}</div>
            <div class="fc-hint">Clique para revelar</div>
          </div>
          <div class="flashcard-back">
            <div class="fc-translation">${c.translation}</div>
            <div class="fc-example">${c.example}</div>
          </div>
        </div>
      </div>
      <div class="fc-actions hidden" id="fc-actions">
        <button class="btn-wrong" onclick="fcAnswer(false)">❌ Errei</button>
        <button class="btn-correct" onclick="fcAnswer(true)">✅ Acertei</button>
      </div>`;

    document.getElementById('fc-container').addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      SoundFX.click();
      document.getElementById('flashcard').classList.add('flipped');
      document.getElementById('fc-actions').classList.remove('hidden');
    });
  };

  window.fcAnswer = (correct) => {
    SoundFX[correct ? 'correct' : 'wrong']();
    if (correct) score++;
    flipped = false;
    idx++;
    if (idx >= cards.length) {
      const xpEarned = score * MINI_GAMES.flashcard.xp;
      addXP(xpEarned); addCourseXP(langId, xpEarned);
      adjustDifficulty(langId, score >= cards.length * 0.8 ? 6 : score <= cards.length * 0.3 ? -6 : 0);
      area.innerHTML = `<div class="game-result">
        <div class="result-emoji">${score >= cards.length * 0.8 ? '🏆' : score >= cards.length * 0.5 ? '😊' : '💪'}</div>
        <h3>Você acertou ${score}/${cards.length}</h3>
        <div class="result-xp">+${xpEarned} XP ganhos!</div>
        <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.flashcard.start('${langId}')">Jogar novamente 🔄</button>
      </div>`;
    } else render();
  };

  render();
}

// ── QUIZ RENDERER ─────────────────────────────────────────────────────
function renderQuiz(questions, langId, gameKey = 'quiz') {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0;

  const render = () => {
    const q = questions[idx];
    const pct = Math.round((idx / questions.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Pergunta ${idx+1}/${questions.length}</span><span>⭐ ${score}</span></div>
      <div class="quiz-card">
        <div class="quiz-question">${escHtml(q.question)}</div>
        <div class="quiz-options" id="quiz-options">
          ${q.options.map((opt, i) => `
            <button class="quiz-option" onclick="quizAnswer(${i}, ${q.correct}, '${escHtml(q.explanation).replace(/'/g,"\\'")}')">
              <span class="opt-letter">${'ABCD'[i]}</span> ${escHtml(opt)}
            </button>`).join('')}
        </div>
        <div id="quiz-explanation" class="quiz-explanation hidden"></div>
      </div>`;
  };

  window.quizAnswer = (chosen, correct, explanation) => {
    const opts = document.querySelectorAll('.quiz-option');
    opts.forEach(b => b.disabled = true);
    opts[correct].classList.add('correct');
    const isRight = chosen === correct;
    if (!isRight) opts[chosen].classList.add('wrong');
    SoundFX[isRight ? 'correct' : 'wrong']();
    if (isRight) score++;

    const expEl = document.getElementById('quiz-explanation');
    expEl.classList.remove('hidden');
    expEl.innerHTML = `${isRight ? '✅' : '❌'} ${explanation}`;

    setTimeout(() => {
      idx++;
      if (idx >= questions.length) {
        const xpEarned = score * MINI_GAMES[gameKey].xp;
        addXP(xpEarned); addCourseXP(langId, xpEarned);
        adjustDifficulty(langId, score >= questions.length * 0.8 ? 6 : score <= questions.length * 0.3 ? -6 : 0);
        area.innerHTML = `<div class="game-result">
          <div class="result-emoji">${score >= questions.length * 0.8 ? '🏆' : score >= questions.length * 0.5 ? '😊' : '💪'}</div>
          <h3>Você acertou ${score}/${questions.length}</h3>
          <div class="result-xp">+${xpEarned} XP ganhos!</div>
          <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.${gameKey}.start('${langId}')">Jogar novamente 🔄</button>
        </div>`;
      } else render();
    }, 1600);
  };

  render();
}

// ── FILL BLANK RENDERER ───────────────────────────────────────────────
function renderFillBlank(items, langId) {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0;

  const render = () => {
    const it = items[idx];
    const pct = Math.round((idx / items.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Frase ${idx+1}/${items.length}</span><span>⭐ ${score}</span></div>
      <div class="fillblank-card">
        <div class="fb-sentence">${escHtml(it.sentence)}</div>
        <div class="fb-hint">💡 Dica: ${escHtml(it.hint)}</div>
        <input class="fb-input" id="fb-input" type="text" placeholder="Digite a palavra que falta..." autocomplete="off" />
        <button class="btn-primary" style="width:auto" onclick="checkFillBlank('${escHtml(it.answer).replace(/'/g,"\\'")}', '${langId}')">Verificar ✓</button>
        <div id="fb-result" class="fb-result hidden"></div>
      </div>`;

    document.getElementById('fb-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') checkFillBlank(it.answer, langId);
    });
  };

  window.checkFillBlank = (answer, lId) => {
    const input = document.getElementById('fb-input');
    const val = input?.value?.trim().toLowerCase();
    if (!val) return;
    const correct = val === answer.toLowerCase();
    SoundFX[correct ? 'correct' : 'wrong']();
    if (correct) score++;
    const res = document.getElementById('fb-result');
    res.classList.remove('hidden');
    res.innerHTML = correct
      ? `<span class="fb-correct">✅ Correto! A resposta é: <strong>${answer}</strong></span>`
      : `<span class="fb-wrong">❌ A resposta correta é: <strong>${answer}</strong></span>`;

    setTimeout(() => {
      idx++;
      if (idx >= items.length) {
        const xpEarned = score * MINI_GAMES.fillblank.xp;
        addXP(xpEarned); addCourseXP(lId, xpEarned);
        adjustDifficulty(lId, score >= items.length * 0.8 ? 6 : score <= items.length * 0.3 ? -6 : 0);
        area.innerHTML = `<div class="game-result">
          <div class="result-emoji">${score >= items.length * 0.8 ? '🏆' : score >= items.length * 0.5 ? '😊' : '💪'}</div>
          <h3>Você acertou ${score}/${items.length}</h3>
          <div class="result-xp">+${xpEarned} XP ganhos!</div>
          <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.fillblank.start('${lId}')">Jogar novamente 🔄</button>
        </div>`;
      } else render();
    }, 1600);
  };

  render();
}

// ── MEMORY GAME RENDERER ──────────────────────────────────────────────
function renderMemoryGame(pairs, langId) {
  const area = document.getElementById('minigame-play-area');
  // Build card array (word + translation interleaved)
  const cards = [];
  pairs.forEach((p, i) => {
    cards.push({ id: i, type: 'word', text: p.word, pair: i });
    cards.push({ id: i + pairs.length, type: 'trans', text: p.translation, pair: i });
  });
  // Shuffle
  cards.sort(() => Math.random() - 0.5);

  let flipped = [], matched = [], moves = 0, locked = false;

  const render = () => {
    area.innerHTML = `
      <div class="game-score-row"><span>🧠 Jogo de Memória</span><span>Jogadas: ${moves}</span></div>
      <div class="memory-grid" id="memory-grid">
        ${cards.map((c, i) => `
          <div class="mem-card ${matched.includes(c.pair) ? 'matched' : ''}" data-idx="${i}" data-pair="${c.pair}">
            <div class="mem-front">❓</div>
            <div class="mem-back">${escHtml(c.text)}</div>
          </div>`).join('')}
      </div>
      <div id="mem-result" class="mem-result hidden"></div>`;

    document.querySelectorAll('.mem-card:not(.matched)').forEach(card => {
      card.addEventListener('click', () => {
        if (locked) return;
        const idx = parseInt(card.dataset.idx);
        if (flipped.includes(idx)) return;
        card.classList.add('reveal');
        flipped.push(idx);
        SoundFX.click();

        if (flipped.length === 2) {
          locked = true;
          moves++;
          const [a, b] = flipped.map(i => cards[i]);
          if (a.pair === b.pair && a.type !== b.type) {
            SoundFX.correct();
            matched.push(a.pair);
            flipped = [];
            locked = false;
            if (matched.length === pairs.length) {
              addXP(MINI_GAMES.memory.xp); addCourseXP(langId, MINI_GAMES.memory.xp);
              const res = document.getElementById('mem-result');
              if(res){ res.classList.remove('hidden'); res.innerHTML = `🏆 Parabéns! Concluído em ${moves} jogadas! <strong>+${MINI_GAMES.memory.xp} XP</strong>`; }
              SoundFX.levelup();
            }
          } else {
            SoundFX.wrong();
            setTimeout(() => {
              document.querySelectorAll('.mem-card.reveal:not(.matched)').forEach(c => c.classList.remove('reveal'));
              flipped = [];
              locked = false;
            }, 900);
          }
        }
      });
    });
  };

  render();
}

// ── UNSCRAMBLE RENDERER ───────────────────────────────────────────────
function renderUnscramble(items, langId) {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0;

  const render = () => {
    const it = items[idx];
    const words = it.sentence.trim().replace(/[.!?]$/,'').split(/\s+/);
    const shuffled = words.map((w,i) => ({ w, i })).sort(() => Math.random() - 0.5);
    let answer = []; // indices of words placed in order

    const pct = Math.round((idx / items.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Frase ${idx+1}/${items.length}</span><span>⭐ ${score}</span></div>
      <div class="unscramble-card">
        <div class="unscramble-translation">💡 ${escHtml(it.translation)}</div>
        <div class="unscramble-answer-slot" id="uns-answer"></div>
        <div class="unscramble-bank" id="uns-bank">
          ${shuffled.map((s, si) => `<span class="word-chip" data-si="${si}">${escHtml(s.w)}</span>`).join('')}
        </div>
        <button class="btn-primary" style="width:auto" id="uns-check" disabled>Verificar ✓</button>
        <div id="uns-result" class="fb-result hidden" style="margin-top:14px"></div>
      </div>`;

    const answerSlot = document.getElementById('uns-answer');
    const checkBtn = document.getElementById('uns-check');

    const refreshAnswerDisplay = () => {
      answerSlot.innerHTML = answer.map(si => `<span class="word-chip in-answer">${escHtml(shuffled[si].w)}</span>`).join('') || '<span class="muted">Toque nas palavras abaixo, na ordem certa</span>';
      checkBtn.disabled = answer.length !== words.length;
    };
    refreshAnswerDisplay();

    document.querySelectorAll('#uns-bank .word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const si = parseInt(chip.dataset.si);
        if (chip.classList.contains('placed')) return;
        chip.classList.add('placed');
        answer.push(si);
        SoundFX.click();
        refreshAnswerDisplay();
      });
    });

    checkBtn.addEventListener('click', () => {
      const builtSentence = answer.map(si => shuffled[si].w).join(' ');
      const correct = builtSentence.toLowerCase() === words.join(' ').toLowerCase();
      SoundFX[correct ? 'correct' : 'wrong']();
      if (correct) score++;
      const res = document.getElementById('uns-result');
      res.classList.remove('hidden');
      res.innerHTML = correct
        ? `<span class="fb-correct">✅ Correto! "${escHtml(it.sentence)}"</span>`
        : `<span class="fb-wrong">❌ A frase correta é: "${escHtml(it.sentence)}"</span>`;
      checkBtn.disabled = true;
      document.querySelectorAll('#uns-bank .word-chip').forEach(c => c.style.pointerEvents = 'none');

      setTimeout(() => {
        idx++;
        if (idx >= items.length) {
          const xpEarned = score * MINI_GAMES.unscramble.xp;
          addXP(xpEarned); addCourseXP(langId, xpEarned);
        adjustDifficulty(langId, score >= items.length * 0.8 ? 6 : score <= items.length * 0.3 ? -6 : 0);
          area.innerHTML = `<div class="game-result">
            <div class="result-emoji">${score >= items.length * 0.8 ? '🏆' : score >= items.length * 0.5 ? '😊' : '💪'}</div>
            <h3>Você acertou ${score}/${items.length}</h3>
            <div class="result-xp">+${xpEarned} XP ganhos!</div>
            <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.unscramble.start('${langId}')">Jogar novamente 🔄</button>
          </div>`;
        } else render();
      }, 1800);
    });
  };

  render();
}

// ── TRUE/FALSE RENDERER ───────────────────────────────────────────────
function renderTrueFalse(items, langId) {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0;

  const render = () => {
    const it = items[idx];
    const pct = Math.round((idx / items.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Afirmação ${idx+1}/${items.length}</span><span>⭐ ${score}</span></div>
      <div class="tf-card">
        <div class="tf-statement">${escHtml(it.statement)}</div>
        <div class="tf-actions" id="tf-actions">
          <button class="btn-tf-true" data-ans="true">✅ Verdadeiro</button>
          <button class="btn-tf-false" data-ans="false">❌ Falso</button>
        </div>
        <div id="tf-explanation" class="quiz-explanation hidden" style="margin-top:18px;text-align:left"></div>
      </div>`;

    document.querySelectorAll('#tf-actions button').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.ans === 'true';
        const isRight = chosen === it.isTrue;
        SoundFX[isRight ? 'correct' : 'wrong']();
        if (isRight) score++;
        document.querySelectorAll('#tf-actions button').forEach(b => b.disabled = true);
        const exp = document.getElementById('tf-explanation');
        exp.classList.remove('hidden');
        exp.innerHTML = `${isRight ? '✅ Certo!' : '❌ Errado.'} A afirmação é <strong>${it.isTrue ? 'verdadeira' : 'falsa'}</strong>. ${escHtml(it.explanation)}`;

        setTimeout(() => {
          idx++;
          if (idx >= items.length) {
            const xpEarned = score * MINI_GAMES.truefalse.xp;
            addXP(xpEarned); addCourseXP(langId, xpEarned);
        adjustDifficulty(langId, score >= items.length * 0.8 ? 6 : score <= items.length * 0.3 ? -6 : 0);
            area.innerHTML = `<div class="game-result">
              <div class="result-emoji">${score >= items.length * 0.8 ? '🏆' : score >= items.length * 0.5 ? '😊' : '💪'}</div>
              <h3>Você acertou ${score}/${items.length}</h3>
              <div class="result-xp">+${xpEarned} XP ganhos!</div>
              <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.truefalse.start('${langId}')">Jogar novamente 🔄</button>
            </div>`;
          } else render();
        }, 1900);
      });
    });
  };

  render();
}

// ── ODD ONE OUT RENDERER ──────────────────────────────────────────────
function renderOddOne(items, langId) {
  const area = document.getElementById('minigame-play-area');
  let idx = 0, score = 0;

  const render = () => {
    const it = items[idx];
    const pct = Math.round((idx / items.length) * 100);
    area.innerHTML = `
      <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-score-row"><span>Grupo ${idx+1}/${items.length}</span><span>⭐ ${score}</span></div>
      <div class="oddone-card">
        <div class="oddone-instruction">🕵️ Qual palavra não pertence ao grupo?</div>
        <div class="oddone-options" id="oddone-options">
          ${it.words.map((w, i) => `<button class="oddone-option" data-i="${i}">${escHtml(w)}</button>`).join('')}
        </div>
        <div id="oddone-explanation" class="quiz-explanation hidden" style="margin-top:16px"></div>
      </div>`;

    document.querySelectorAll('#oddone-options button').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = parseInt(btn.dataset.i);
        const opts = document.querySelectorAll('#oddone-options button');
        opts.forEach(b => b.disabled = true);
        opts[it.oddIndex].classList.add('correct');
        const isRight = chosen === it.oddIndex;
        if (!isRight) opts[chosen].classList.add('wrong');
        SoundFX[isRight ? 'correct' : 'wrong']();
        if (isRight) score++;

        const exp = document.getElementById('oddone-explanation');
        exp.classList.remove('hidden');
        exp.innerHTML = `${isRight ? '✅' : '❌'} ${escHtml(it.explanation)}`;

        setTimeout(() => {
          idx++;
          if (idx >= items.length) {
            const xpEarned = score * MINI_GAMES.oddone.xp;
            addXP(xpEarned); addCourseXP(langId, xpEarned);
        adjustDifficulty(langId, score >= items.length * 0.8 ? 6 : score <= items.length * 0.3 ? -6 : 0);
            area.innerHTML = `<div class="game-result">
              <div class="result-emoji">${score >= items.length * 0.8 ? '🏆' : score >= items.length * 0.5 ? '😊' : '💪'}</div>
              <h3>Você acertou ${score}/${items.length}</h3>
              <div class="result-xp">+${xpEarned} XP ganhos!</div>
              <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.oddone.start('${langId}')">Jogar novamente 🔄</button>
            </div>`;
          } else render();
        }, 1900);
      });
    });
  };

  render();
}

function startMiniGame(gameKey) {
  const langId = document.getElementById('games-lang-select').value;
  const area = document.getElementById('minigame-play-area');
  area.innerHTML = '';
  document.getElementById('minigames-list').classList.add('hidden');
  document.getElementById('minigame-active').classList.remove('hidden');
  document.getElementById('minigame-title').textContent = `${MINI_GAMES[gameKey].emoji} ${MINI_GAMES[gameKey].name}`;
  MINI_GAMES[gameKey].start(langId);
}

function closeMiniGame() {
  document.getElementById('minigames-list').classList.remove('hidden');
  document.getElementById('minigame-active').classList.add('hidden');
  document.getElementById('minigame-play-area').innerHTML = '';
}

// ── PROVA (EXAME DE 10 QUESTÕES) ───────────────────────────────────────
function initExamView() {
  const sel = document.getElementById('exam-lang-select');
  if (sel && !sel.dataset.ready) {
    sel.dataset.ready = '1';
    sel.addEventListener('change', syncExamAutoLevel);
  }
  syncExamAutoLevel();
}

function syncExamAutoLevel() {
  const langId = document.getElementById('exam-lang-select')?.value;
  const levelSelect = document.getElementById('exam-level-select');
  if (!levelSelect || !langId) return;
  levelSelect.value = getCourseLevel(langId);
}

async function generateExam() {
  const langId = document.getElementById('exam-lang-select').value;
  const level  = document.getElementById('exam-level-select').value;
  const lang   = langName(langId);
  const area   = document.getElementById('exam-area');
  const qCount = getExamQuestionCount();

  // Vincula a prova à última aula gerada (mesmo idioma), se a opção estiver ativa
  const linkedToLesson = getLinkLesson() && lastLesson && lastLesson.langId === langId;
  const lessonContext = linkedToLesson
    ? `\n\nIMPORTANTE: as questões DEVEM ter relação direta com a aula que o aluno acabou de estudar sobre "${lastLesson.topicLabel}". Cubra o vocabulário, as regras gramaticais e os exemplos ensinados nela. Palavras/expressões ensinadas na aula: ${lastLesson.vocabWords.slice(0, 15).join(', ') || '(baseie-se no tema geral da aula)'}.`
    : '';

  area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando prova de ${lang} (${level}) com ${qCount} questões${linkedToLesson ? ` baseada na aula "${lastLesson.topicLabel}"` : ''}...</p></div>`;

  const prompt = `Crie uma prova de ${qCount} questões de múltipla escolha sobre ${lang} (vocabulário, gramática e compreensão) para o nível ${level}.
Varie os tipos de pergunta (tradução, gramática, vocabulário, uso correto de expressões).${lessonContext}
Retorne APENAS JSON válido, sem markdown, neste formato exato:
[{"question":"pergunta em português ou no idioma-alvo","options":["A","B","C","D"],"correct":0,"explanation":"explicação breve em português"}]
O campo correct é o índice (0-3) da resposta correta. Retorne exatamente ${qCount} itens.`;

  try {
    const raw = await groqChat([{role:'user',content:prompt}],
      `Você é um gerador de provas de idiomas. Retorne apenas JSON puro sem markdown nem texto extra.`);
    const clean = raw.replace(/```json|```/g,'').trim();
    const questions = JSON.parse(clean);
    currentExam = { langId, level, questions, answers: new Array(questions.length).fill(null), linkedTopic: linkedToLesson ? lastLesson.topicLabel : null };
    renderExam();
  } catch (e) {
    area.innerHTML = `<div class="empty-state"><p>Erro ao gerar prova: ${e.message}</p></div>`;
  }
}

function renderExam() {
  const area = document.getElementById('exam-area');
  const { questions, answers, linkedTopic } = currentExam;

  area.innerHTML = `
    ${linkedTopic ? `<div class="ex-linked-badge">🔗 Baseada na sua aula: ${escHtml(linkedTopic)}</div>` : ''}
    <div class="exam-progress-label">Respondidas: <span id="exam-answered-count">0</span>/${questions.length}</div>
    ${questions.map((q, qi) => `
      <div class="exam-card">
        <div class="exam-q-number">Questão ${qi+1}</div>
        <div class="exam-question">${escHtml(q.question)}</div>
        <div class="exam-options" data-qi="${qi}">
          ${q.options.map((opt, oi) => `
            <button class="exam-option" data-qi="${qi}" data-oi="${oi}">
              <span class="opt-letter">${'ABCD'[oi]}</span> ${escHtml(opt)}
            </button>`).join('')}
        </div>
      </div>`).join('')}
    <div class="exam-submit-bar">
      <button class="btn-primary" id="btn-submit-exam" disabled>Enviar prova ✓</button>
    </div>`;

  const updateCount = () => {
    const answered = answers.filter(a => a !== null).length;
    document.getElementById('exam-answered-count').textContent = answered;
    document.getElementById('btn-submit-exam').disabled = answered !== questions.length;
  };

  document.querySelectorAll('.exam-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = parseInt(btn.dataset.qi);
      const oi = parseInt(btn.dataset.oi);
      answers[qi] = oi;
      document.querySelectorAll(`.exam-option[data-qi="${qi}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      SoundFX.click();
      updateCount();
    });
  });

  document.getElementById('btn-submit-exam').addEventListener('click', finishExam);
  updateCount();
}

function finishExam() {
  const { questions, answers, langId, level } = currentExam;
  let score = 0;
  questions.forEach((q, i) => { if (answers[i] === q.correct) score++; });

  const xpEarned = score * 10;
  addXP(xpEarned);
  addCourseXP(langId, xpEarned);

  if (!currentUser.courses[langId]) currentUser.courses[langId] = emptyCourseProgress();
  if (!currentUser.courses[langId].examHistory) currentUser.courses[langId].examHistory = [];
  currentUser.courses[langId].examHistory.push({
    date: today(), score, total: questions.length, level, langId,
  });
  saveUser();
  SoundFX[score >= questions.length * 0.7 ? 'levelup' : 'wrong']();

  const area = document.getElementById('exam-area');
  const pct = Math.round((score / questions.length) * 100);
  area.innerHTML = `
    <div class="exam-result-card">
      <div class="exam-score-circle">
        <div class="big">${score}/${questions.length}</div>
        <div class="small">${pct}%</div>
      </div>
      <h3>${pct >= 80 ? '🏆 Excelente!' : pct >= 50 ? '😊 Bom trabalho!' : '💪 Continue praticando!'}</h3>
      <p class="subtitle" style="margin:10px 0 20px">+${xpEarned} XP ganhos — Nível: ${level}</p>
      <button class="btn-secondary" id="btn-review-exam">Ver revisão das questões</button>
      <div id="exam-review-list" style="margin-top:20px;display:none"></div>
      <button class="btn-primary" style="width:auto;margin-top:20px" onclick="showView('exam')">Fazer outra prova 🔄</button>
    </div>`;

  document.getElementById('btn-review-exam').addEventListener('click', () => {
    const list = document.getElementById('exam-review-list');
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      list.innerHTML = questions.map((q, i) => {
        const isRight = answers[i] === q.correct;
        return `<div class="exam-review-item ${isRight ? 'ok' : 'bad'}">
          <strong>${i+1}. ${escHtml(q.question)}</strong><br>
          Sua resposta: ${escHtml(q.options[answers[i]] ?? '(sem resposta)')} ${isRight ? '✅' : '❌'}<br>
          ${!isRight ? `Resposta correta: <strong>${escHtml(q.options[q.correct])}</strong><br>` : ''}
          <span class="muted">${escHtml(q.explanation)}</span>
        </div>`;
      }).join('');
    }
  });

  currentExam = null;
}

// ── AVALIAÇÃO DE DESEMPENHO COM IA ─────────────────────────────────────
async function requestPerformanceReview() {
  const resultEl = document.getElementById('ai-review-result');
  const btn = document.getElementById('btn-ai-review');
  btn.disabled = true;
  resultEl.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Analisando seu desempenho...</p></div>`;

  const courses = Object.entries(currentUser.courses || {}).map(([id, prog]) => {
    const examCount = (prog.examHistory || []).length;
    const avgExamScore = examCount
      ? (prog.examHistory.reduce((s,e) => s + (e.score/e.total), 0) / examCount * 100).toFixed(0)
      : null;
    return `- ${langName(id)}: nível ${getCourseLevel(id)}, ${prog.xp || 0} XP no curso, ${prog.messages || 0} mensagens de chat, ${examCount} prova(s) feita(s)${avgExamScore ? ` (média ${avgExamScore}%)` : ''}.`;
  }).join('\n') || 'Nenhum curso iniciado ainda.';

  const errors = (currentUser.errors || []).join(', ') || 'Nenhum erro recorrente registrado ainda.';

  const summary = `Dados do aluno:
Nome: ${currentUser.name}
XP total: ${currentUser.xp || 0}
Streak atual: ${currentUser.streak || 0} dias

Cursos:
${courses}

Padrões de erro frequentes: ${errors}`;

  const systemPrompt = `Você é um coach pedagógico especialista em aquisição de idiomas.
Analise os dados de desempenho do aluno fornecidos e escreva uma avaliação honesta, motivadora e acionável em português (PT-BR).
Estruture a resposta com: 1) um resumo do progresso geral, 2) pontos fortes, 3) pontos a melhorar, 4) 3 recomendações práticas e específicas para as próximas semanas.
Seja específico, use os números fornecidos, e seja encorajador mas realista.`;

  try {
    const result = await groqChat([{ role: 'user', content: summary }], systemPrompt);
    resultEl.innerHTML = `<div class="ai-review-card">${escHtml(result)}</div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="empty-state"><p>Erro ao gerar avaliação: ${e.message}</p></div>`;
  } finally {
    btn.disabled = false;
  }
}

// ── PROGRESS ──────────────────────────────────────────────────────────
function renderProgress() {
  const xp     = currentUser.xp || 0;
  const streak = currentUser.streak || 0;
  const level  = getLevelFromXP(xp);
  const { curr, next } = xpForNextLevel(xp);
  const pct    = Math.min(100, Math.round((curr / next) * 100));

  document.getElementById('prog-level-badge').textContent = level;
  document.getElementById('prog-xp').textContent = xp;
  document.getElementById('prog-streak').textContent = `🔥 ${streak} dias`;
  document.getElementById('prog-bar').style.width = pct + '%';

  // Course list
  const list = document.getElementById('course-progress-list');
  const courses = Object.entries(currentUser.courses || {});
  if (!courses.length) {
    list.innerHTML = '<p class="muted">Nenhum curso iniciado.</p>';
  } else {
    list.innerHTML = courses.map(([id, prog]) => {
      const c   = COURSES.find(x => x.id === id);
      if (!c) return '';
      const lvl = getCourseLevel(id);
      const pct = Math.min(100, (prog.xp || 0) / 5);
      return `<div class="course-prog-item">
        <div class="course-prog-emoji">${c.emoji}</div>
        <div class="course-prog-info">
          <div class="course-prog-name">${c.name}</div>
          <div class="course-prog-bar"><div class="course-prog-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="course-prog-level">${lvl}</div>
      </div>`;
    }).join('');
  }

  // Exam history
  const examList = document.getElementById('exam-history-list');
  const allExams = [];
  courses.forEach(([id, prog]) => {
    (prog.examHistory || []).forEach(e => allExams.push({ ...e, langId: id }));
  });
  allExams.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  if (!allExams.length) {
    examList.innerHTML = '<p class="muted">Nenhuma prova realizada ainda.</p>';
  } else {
    examList.innerHTML = allExams.slice(0, 10).map(e => {
      const c = COURSES.find(x => x.id === e.langId);
      const pct = Math.round((e.score/e.total)*100);
      return `<div class="course-prog-item">
        <div class="course-prog-emoji">${c?.emoji || '📝'}</div>
        <div class="course-prog-info">
          <div class="course-prog-name">${c?.name || e.langId} — ${e.date}</div>
          <div class="course-prog-bar"><div class="course-prog-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="course-prog-level">${e.score}/${e.total} (${e.level})</div>
      </div>`;
    }).join('');
  }

  // Error patterns
  const epEl = document.getElementById('error-patterns');
  const errors = currentUser.errors || [];
  if (!errors.length) {
    epEl.innerHTML = '<p class="muted">Seus padrões de erro aparecerão aqui conforme você pratica.</p>';
  } else {
    epEl.innerHTML = errors.map(e => `<span class="error-tag">⚠️ ${e}</span>`).join('');
  }

  // Reset AI review box on view change
  const reviewResult = document.getElementById('ai-review-result');
  if (reviewResult) reviewResult.innerHTML = '';
}

// ── THEME ─────────────────────────────────────────────────────────────
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fluently_theme', next);
  document.getElementById('btn-theme').textContent = next === 'dark' ? '🌙 Modo claro' : '☀️ Modo escuro';
}

function loadTheme() {
  const saved = localStorage.getItem('fluently_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = saved === 'dark' ? '🌙 Modo claro' : '☀️ Modo escuro';
}

// ── AUDIO STUB (prepared for Whisper / TTS) ──────────────────────────
function startRecording() {
  toast('🎤 Reconhecimento de voz em breve! (Whisper API)', 'info');
}
async function textToSpeech(text, lang) {
  // Stub: integrate with a TTS API later
  toast('🔊 Síntese de voz em breve! (TTS API)', 'info');
}

// ── UTILS ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

function validate(name, email, password, age) {
  if (!name || name.trim().length < 2) return 'Nome deve ter pelo menos 2 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email inválido.';
  if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
  if (!age || age < 5 || age > 120) return 'Idade inválida.';
  return null;
}

// Auto-resize textarea
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── INIT & EVENT LISTENERS ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  loadPalette();

  // ── AUTH TAB SWITCH
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
    });
  });

  // ── REGISTER
  document.getElementById('btn-register').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const age = document.getElementById('reg-age').value;
    const errEl = document.getElementById('reg-error');

    const err = validate(name, email, password, age);
    if (err) { errEl.textContent = err; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

    try {
      const user = await register(name, email, password, age);
      currentUser = user;
      saveSession(user);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Criar conta';
    }
  });

  // ── LOGIN
  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

    try {
      const user = await login(email, password);
      currentUser = user;
      saveSession(user);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  // Allow Enter key in login
  ['login-email','login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });
  });

  // ── NAV LINKS
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showView(link.dataset.view);
      closeSidebar();
    });
  });

  // ── QUICK BUTTONS
  document.querySelectorAll('.quick-btn, [data-view]').forEach(btn => {
    if (btn.dataset.view) {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    }
  });

  // ── LOGOUT
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Deseja sair?')) logout();
  });

  // ── THEME
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // ── SOUND TOGGLE
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) {
    const updateSoundBtn = () => {
      const on = localStorage.getItem('fluently_sound') !== 'off';
      btnSound.textContent = on ? '🔊 Som: On' : '🔇 Som: Off';
    };
    updateSoundBtn();
    btnSound.addEventListener('click', () => { SoundFX.toggle(); updateSoundBtn(); SoundFX.click(); });
  }

  // ── CHAT SEND
  document.getElementById('btn-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  document.getElementById('chat-input').addEventListener('input', function() { autoResize(this); });

  // ── MIC
  document.getElementById('btn-mic').addEventListener('click', startRecording);

  // ── EXERCISE
  document.getElementById('btn-gen-exercise').addEventListener('click', generateExercise);

  // ── LEARN / LESSON
  document.getElementById('btn-gen-lesson').addEventListener('click', () => generateLesson());
  document.getElementById('learn-auto-toggle').addEventListener('change', syncLearnAutoLevel);
  document.querySelectorAll('.topic-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const topic = chip.dataset.topic;
      document.getElementById('learn-topic-select').value = topic;
      generateLesson(topic);
    });
  });

  // ── SIM CARDS
  document.querySelectorAll('.sim-card').forEach(card => {
    card.querySelector('button').addEventListener('click', () => startSimulation(card.dataset.sim));
  });

  // ── SIM SEND
  document.getElementById('sim-send').addEventListener('click', sendSimMessage);
  document.getElementById('sim-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSimMessage(); }
  });
  document.getElementById('sim-input').addEventListener('input', function() { autoResize(this); });

  // ── CLOSE SIM
  document.getElementById('btn-close-sim').addEventListener('click', () => {
    document.getElementById('sim-chat-area').classList.add('hidden');
    currentSim = null; simHistory = [];
  });

  // ── EXAM
  document.getElementById('btn-gen-exam').addEventListener('click', generateExam);

  // ── AI PERFORMANCE REVIEW
  document.getElementById('btn-ai-review').addEventListener('click', requestPerformanceReview);

  // ── SETTINGS: Idioma de explicação
  const explainSel = document.getElementById('settings-explain-lang');
  if (explainSel) {
    explainSel.value = getExplainLang();
    explainSel.addEventListener('change', () => {
      setExplainLang(explainSel.value);
      SoundFX.click();
      toast('Idioma de explicação atualizado! 🌐', 'success');
    });
  }

  // ── SETTINGS: Profundidade da aula
  const depthSel = document.getElementById('settings-lesson-depth');
  if (depthSel) {
    depthSel.value = getLessonDepth();
    depthSel.addEventListener('change', () => {
      setLessonDepth(depthSel.value);
      SoundFX.click();
      toast('Profundidade das aulas atualizada! 📚', 'success');
    });
  }

  // ── SETTINGS: Meta diária de XP
  const goalInput = document.getElementById('settings-daily-goal');
  if (goalInput) {
    goalInput.value = getDailyGoal();
    goalInput.addEventListener('change', () => {
      const v = Math.max(10, parseInt(goalInput.value, 10) || 30);
      goalInput.value = v;
      setDailyGoal(v);
      toast('Meta diária atualizada! 🎯', 'success');
      if (document.getElementById('view-home')?.classList.contains('active')) renderHome();
    });
  }

  // ── SETTINGS: Vincular exercícios/prova à última aula
  const linkLessonToggle = document.getElementById('settings-link-lesson');
  if (linkLessonToggle) {
    linkLessonToggle.checked = getLinkLesson();
    linkLessonToggle.addEventListener('change', () => {
      setLinkLesson(linkLessonToggle.checked);
      SoundFX.click();
      toast(linkLessonToggle.checked
        ? 'Exercícios e provas agora seguem o conteúdo da última aula! 🔗'
        : 'Exercícios e provas voltaram a ser gerados livremente.', 'success');
    });
  }

  // ── SETTINGS: Quantidade de questões da prova
  const examQCountSel = document.getElementById('settings-exam-qcount');
  if (examQCountSel) {
    examQCountSel.value = String(getExamQuestionCount());
    examQCountSel.addEventListener('change', () => {
      setExamQuestionCount(parseInt(examQCountSel.value, 10));
      SoundFX.click();
      toast('Quantidade de questões da prova atualizada! 📝', 'success');
    });
  }

  // ── SETTINGS: Dicas de pronúncia nos exercícios
  const pronTipsToggle = document.getElementById('settings-pron-tips');
  if (pronTipsToggle) {
    pronTipsToggle.checked = getPronunciationTips();
    pronTipsToggle.addEventListener('change', () => {
      setPronunciationTips(pronTipsToggle.checked);
      SoundFX.click();
      toast('Preferência de dicas de pronúncia atualizada!', 'success');
    });
  }

  // ── SETTINGS: Som (espelha o botão da sidebar)
  const soundSettingsToggle = document.getElementById('settings-sound-toggle');
  if (soundSettingsToggle) {
    soundSettingsToggle.checked = localStorage.getItem('fluently_sound') !== 'off';
    soundSettingsToggle.addEventListener('change', () => {
      localStorage.setItem('fluently_sound', soundSettingsToggle.checked ? 'on' : 'off');
      const btnSoundEl = document.getElementById('btn-sound');
      if (btnSoundEl) btnSoundEl.textContent = soundSettingsToggle.checked ? '🔊 Som: On' : '🔇 Som: Off';
      if (soundSettingsToggle.checked) SoundFX.click();
    });
  }

  // ── HAMBURGER
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  // ── AUTO-LOGIN
  const savedUser = await loadSession();
  if (savedUser) {
    currentUser = savedUser;
    enterApp();
  }
});

// ── ENTER APP ─────────────────────────────────────────────────────────
function enterApp() {
  showScreen('app');
  updateNavStats();
  populateLangSelects();
  updateStreak();
  saveUser();
  showView('home');

  // Welcome toast
  toast(`Bem-vindo de volta, ${currentUser.name.split(' ')[0]}! 👋`, 'success');
}