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
  currentUser.xp = (currentUser.xp || 0) + amount;
  updateStreak();
  updateNavStats();
  saveUser();
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

  ['chat-lang-select','ex-lang-select','sim-lang-select'].forEach(sel => {
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