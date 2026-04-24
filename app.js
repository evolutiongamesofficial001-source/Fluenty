/* ════════════════════════════════════════
   FLUENTLY — script.js
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

// chave salva em ROT13 no localStorage
let chaveCodificada = localStorage.getItem('fluently_groq_key') || 'tfx_IjhNQlhBeAl19899CtRTJTqlo3SLsfMSa4fyswjlPUndpzYRJRwD';

// decodifica automaticamente
let GROQ_API_KEY = rot13(chaveCodificada);

// ── COURSES DATA ──────────────────────────────────────────────────────
const COURSES = [
  { id: 'en',  name: 'Inglês',          emoji: '🇬🇧', native: 'English' },
  { id: 'fr',  name: 'Francês',         emoji: '🇫🇷', native: 'Français' },
  { id: 'it',  name: 'Italiano',        emoji: '🇮🇹', native: 'Italiano' },
  { id: 'es',  name: 'Espanhol',        emoji: '🇪🇸', native: 'Español' },
  { id: 'pt',  name: 'Português (PT)',  emoji: '🇵🇹', native: 'Português' },
  { id: 'ko',  name: 'Coreano',         emoji: '🇰🇷', native: '한국어' },
  { id: 'ja',  name: 'Japonês',         emoji: '🇯🇵', native: '日本語' },
  { id: 'la',  name: 'Latim',           emoji: '🏛️',  native: 'Latina' },
  { id: 'zh',  name: 'Chinês (Mandarim)',emoji: '🇨🇳', native: '普通话' },
  { id: 'tr',  name: 'Turco',           emoji: '🇹🇷', native: 'Türkçe' },
  { id: 'ru',  name: 'Russo',           emoji: '🇷🇺', native: 'Русский' },
  { id: 'de',  name: 'Alemão',          emoji: '🇩🇪', native: 'Deutsch' },
  { id: 'el',  name: 'Grego',           emoji: '🇬🇷', native: 'Ελληνικά' },
];

const LEVELS = ['A1','A2','B1','B2','C1','C2'];

const SIM_PROMPTS = {
  restaurante: 'Simule ser um garçom em um restaurante. O usuário é o cliente. Conduza a conversa naturalmente em {lang}. Corrija erros com gentileza ao final de cada resposta.',
  viagem:      'Simule situações de viagem (aeroporto, hotel, turismo). Você é um assistente local. Fale em {lang}. Corrija erros do usuário ao final de cada turno.',
  entrevista:  'Simule um entrevistador de emprego. Conduza uma entrevista profissional em {lang}. Corrija erros de vocabulário e gramática ao final.',
  mercado:     'Simule um vendedor em um mercado/supermercado. Fale em {lang}. Corrija erros do usuário ao final de cada resposta.',
};

// ── STATE ──────────────────────────────────────────────────────────────
let currentUser = null;    // { uid, name, email, age, xp, streak, courses, errors, lastActive }
let chatHistory  = [];     // [{role, content}]
let simHistory   = [];
let currentSim   = null;

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

function xpForNextLevel(xp) {
  const thresholds = [200, 500, 1000, 2000, 4000, 9999];
  for (const t of thresholds) if (xp < t) return { curr: xp, next: t };
  return { curr: xp, next: xp };
}

function addError(tag) {
  if (!currentUser.errors) currentUser.errors = [];
  if (!currentUser.errors.includes(tag)) currentUser.errors.push(tag);
  saveUser();
}

// ── GROQ AI ───────────────────────────────────────────────────────────
async function groqChat(messages, systemPrompt) {
  if (!GROQ_API_KEY) {
    showApiKeyModal();
    throw new Error('API key não definida.');
  }

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
  return `Você é um professor de idiomas especializado em ${langName(langId)}. 
Corrija erros gramaticais, explique de forma simples e sugira melhorias.
Responda sempre em português (PT-BR) quando explicar, mas use ${langName(langId)} nos exemplos.
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
}

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function showApiKeyModal() {
  document.getElementById('apikey-modal').classList.remove('hidden');
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

  const grid = document.getElementById('home-active-courses');
  if (!courses.length) {
    grid.innerHTML = `<div class="empty-state"><p>Nenhum curso iniciado ainda.</p>
      <button class="btn-secondary" onclick="showView('courses')">Ver cursos →</button></div>`;
    return;
  }

  grid.innerHTML = courses.map(id => {
    const course = COURSES.find(c => c.id === id);
    if (!course) return '';
    const prog = currentUser.courses[id] || {};
    const lvl = prog.level || 'A1';
    const pct = Math.min(100, (prog.xp || 0) / 5);
    return `<div class="active-course-card" onclick="startCourse('${id}')">
      <div class="course-emoji">${course.emoji}</div>
      <h4>${course.name}</h4>
      <div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div>
      <div class="mini-level">${lvl}</div>
    </div>`;
  }).join('');
}

// ── RENDER COURSES ────────────────────────────────────────────────────
function renderCourses() {
  const grid = document.getElementById('courses-grid');
  const enrolled = Object.keys(currentUser.courses || {});
  grid.innerHTML = COURSES.map(c => `
    <div class="course-card ${enrolled.includes(c.id) ? 'enrolled' : ''}" 
         onclick="enrollCourse('${c.id}')">
      <span class="course-emoji">${c.emoji}</span>
      <div class="course-name">${c.name}</div>
      <div class="course-native">${c.native}</div>
    </div>`).join('');
}

async function enrollCourse(id) {
  if (!currentUser.courses) currentUser.courses = {};
  if (!currentUser.courses[id]) {
    currentUser.courses[id] = { xp: 0, level: 'A1', messages: 0 };
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

  ['chat-lang-select','ex-lang-select','sim-lang-select','learn-lang-select','games-lang-select'].forEach(sel => {
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
    if (!currentUser.courses[langId]) currentUser.courses[langId] = { xp: 0, level: 'A1', messages: 0 };
    currentUser.courses[langId].messages = (currentUser.courses[langId].messages || 0) + 1;
    addXP(5);

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

  area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando exercício...</p></div>`;

  const prompt = `Crie um exercício de ${type} em ${langName(langId)} para o nível ${getLevelFromXP(currentUser.xp || 0)}.
Formato:
TIPO: ${type}
INSTRUÇÃO: (instrução em português)
EXERCÍCIO: (conteúdo do exercício)
DICA: (uma dica opcional)
Apenas o exercício, sem resposta ainda.`;

  try {
    const result = await groqChat([{ role: 'user', content: prompt }],
      `Você é um professor de ${langName(langId)}. Crie exercícios claros e didáticos.`);

    area.innerHTML = `
      <div class="exercise-card">
        <h3>${langName(langId)} — ${type.charAt(0).toUpperCase()+type.slice(1)}</h3>
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

  const prompt = `Exercício: ${exercise}\n\nResposta do aluno: ${answer}\n\nAvalie a resposta, corrija erros, explique e dê a resposta correta. Seja encorajador.`;

  try {
    const result = await groqChat(
      [{ role: 'user', content: prompt }],
      buildTeacherPrompt(langId)
    );
    feedback.innerHTML = `<div class="exercise-feedback">${escHtml(result)}</div>
      <div class="xp-earned">⚡ +15 XP ganhos!</div>`;
    addXP(15);
    SoundFX.correct();

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
  } catch (err) {
    hideTyping();
    toast('Erro: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── LEARN (AULAS ESCRITAS) ────────────────────────────────────────────
function initLearnView() {
  // Sync lang select if not already done
  const sel = document.getElementById('learn-lang-select');
  if (sel && !sel.dataset.ready) {
    sel.dataset.ready = '1';
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
};

async function generateLesson(topicOverride) {
  const langId = document.getElementById('learn-lang-select').value;
  const level  = document.getElementById('learn-level-select').value;
  const topic  = topicOverride || document.getElementById('learn-topic-select').value;
  const topicLabel = TOPIC_LABELS[topic] || topic;
  const lang   = langName(langId);
  const area   = document.getElementById('lesson-area');

  area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando sua aula de ${lang}...</p></div>`;

  const systemPrompt = `Você é um professor experiente de ${lang}. 
Escreva aulas didáticas, estruturadas e envolventes em português (PT-BR).
Sempre inclua exemplos reais no idioma ${lang} com tradução em parênteses.
Use emojis para tornar o conteúdo mais visual. Seja claro, progressivo e motivador.`;

  const userPrompt = `Crie uma aula completa e didática sobre o tópico "${topicLabel}" em ${lang} para o nível ${level}.

A aula DEVE conter obrigatoriamente estas seções:
1. 📌 INTRODUÇÃO — Contextualização do tópico (2-3 frases motivadoras)
2. 📚 TEORIA — Explicação clara das regras/conceitos principais
3. 📝 VOCABULÁRIO ESSENCIAL — Lista de 8-12 palavras/frases chave com tradução e exemplo de uso
4. 💬 EXEMPLOS PRÁTICOS — 5 frases completas em ${lang} com tradução
5. ⚠️ ATENÇÃO — 2-3 erros comuns que brasileiros cometem neste tópico
6. 🧠 DICA DE OURO — Um truque memorável para fixar o conteúdo
7. ✅ MINI-QUIZ — 3 perguntas de fixação (com as respostas ao final)

Seja detalhado, claro e use exemplos do dia a dia.`;

  try {
    const result = await groqChat([{ role: 'user', content: userPrompt }], systemPrompt);
    renderLesson(result, lang, topicLabel, level, langId);
    addXP(20);
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p>Erro ao gerar aula: ${err.message}</p></div>`;
  }
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
          <button class="btn-primary" style="width:auto" onclick="showView('exercises')">🎯 Praticar agora</button>
          <button class="btn-secondary" onclick="showView('chat')">💬 Perguntar ao professor</button>
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
        <button class="btn-primary" style="width:auto" onclick="showView('exercises')">🎯 Fazer exercícios</button>
        <button class="btn-secondary" onclick="showView('chat')">💬 Tirar dúvidas com a IA</button>
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
      const level = getLevelFromXP(currentUser.xp || 0);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando flash cards...</p></div>`;

      const prompt = `Crie 5 flash cards de vocabulário em ${lang} para nível ${level}.
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
      const level = getLevelFromXP(currentUser.xp || 0);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando quiz...</p></div>`;

      const prompt = `Crie 5 perguntas de múltipla escolha sobre ${lang} para nível ${level}.
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
      const level = getLevelFromXP(currentUser.xp || 0);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Gerando frases...</p></div>`;

      const prompt = `Crie 4 frases em ${lang} com uma palavra faltando (representada por ___), nível ${level}.
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
      const level = getLevelFromXP(currentUser.xp || 0);
      const area = document.getElementById('minigame-play-area');
      area.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Preparando jogo de memória...</p></div>`;

      const prompt = `Gere 6 pares de palavras em ${lang} com tradução em português, nível ${level}.
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
      addXP(xpEarned);
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
function renderQuiz(questions, langId) {
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
        const xpEarned = score * MINI_GAMES.quiz.xp;
        addXP(xpEarned);
        area.innerHTML = `<div class="game-result">
          <div class="result-emoji">${score >= questions.length * 0.8 ? '🏆' : score >= questions.length * 0.5 ? '😊' : '💪'}</div>
          <h3>Você acertou ${score}/${questions.length}</h3>
          <div class="result-xp">+${xpEarned} XP ganhos!</div>
          <button class="btn-primary" style="width:auto;margin-top:16px" onclick="MINI_GAMES.quiz.start('${langId}')">Jogar novamente 🔄</button>
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
        addXP(xpEarned);
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
              addXP(MINI_GAMES.memory.xp);
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
      const lvl = prog.level || 'A1';
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

  // Error patterns
  const epEl = document.getElementById('error-patterns');
  const errors = currentUser.errors || [];
  if (!errors.length) {
    epEl.innerHTML = '<p class="muted">Seus padrões de erro aparecerão aqui conforme você pratica.</p>';
  } else {
    epEl.innerHTML = errors.map(e => `<span class="error-tag">⚠️ ${e}</span>`).join('');
  }
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

  // ── API KEY MODAL
  document.getElementById('btn-save-apikey').addEventListener('click', () => {
    const key = document.getElementById('apikey-input').value.trim();
    if (!key.startsWith('gsk_')) { toast('Chave inválida. Deve começar com gsk_', 'error'); return; }
    GROQ_API_KEY = key;
    localStorage.setItem('fluently_groq_key', key);
    document.getElementById('apikey-modal').classList.add('hidden');
    toast('Chave salva! Pode usar a IA agora 🎉', 'success');
  });

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

  // Ask for Groq key if not set
  if (!GROQ_API_KEY) {
    setTimeout(() => showApiKeyModal(), 800);
  }

  // Welcome toast
  toast(`Bem-vindo de volta, ${currentUser.name.split(' ')[0]}! 👋`, 'success');
}