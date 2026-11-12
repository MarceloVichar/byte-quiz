// Recursos compartilhados entre o telão (professor) e o celular (estudante).

export const gsap = window.gsap;
export const Flip = window.Flip;
if (gsap && Flip) gsap.registerPlugin(Flip);
export const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const OPCOES = [
  { glifo: '{}', cor: 'var(--op-0)', hex: '#ff4fa3', nome: 'chaves' },
  { glifo: '<>', cor: 'var(--op-1)', hex: '#3d8bff', nome: 'sinais de menor e maior' },
  { glifo: '[]', cor: 'var(--op-2)', hex: '#ffc31f', nome: 'colchetes' },
  { glifo: '()', cor: 'var(--op-3)', hex: '#2ee6a6', nome: 'parênteses' },
];

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Texto com `código` vira <code>.
export function rico(texto) {
  return esc(texto).replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function aviso(msg, tipo = '') {
  $$('.aviso').forEach((a) => a.remove());
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  if (gsap) gsap.from(el, { y: 30, opacity: 0, duration: 0.35, ease: 'power3.out' });
  setTimeout(() => el.remove(), 4200);
}

// ------------------------------------------------------------------ relógio do servidor
let desvio = 0;
export function sincronizar(agoraServidor) {
  if (typeof agoraServidor === 'number') desvio = agoraServidor - Date.now();
}
export const agora = () => Date.now() + desvio;

// ------------------------------------------------------------------ símbolo do jogador
// Um padrão 5×5 espelhado, gerado a partir de uma semente: único, legível de longe, sem emoji.

function hash(texto) {
  let h = 2166136261;
  for (const c of String(texto)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PARES = [
  ['#0b0d12', '#ff4fa3'], ['#0b0d12', '#3d8bff'], ['#0b0d12', '#ffc31f'], ['#0b0d12', '#2ee6a6'],
  ['#ff4fa3', '#1f2430'], ['#3d8bff', '#1f2430'], ['#ffc31f', '#1f2430'], ['#2ee6a6', '#1f2430'],
];

export function simbolo(semente, tamanho = 40) {
  let h = hash(semente);
  const [frente, fundo] = PARES[h % PARES.length];
  let celulas = '';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      if (h % 100 < 52) {
        celulas += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        if (x < 2) celulas += `<rect x="${4 - x}" y="${y}" width="1" height="1"/>`;
      }
    }
  }
  return `<span class="simbolo-jogador" style="width:${tamanho}px;height:${tamanho}px" aria-hidden="true">`
    + `<svg viewBox="-0.5 -0.5 6 6" shape-rendering="crispEdges"><rect x="-0.5" y="-0.5" width="6" height="6" fill="${fundo}"/>`
    + `<g fill="${frente}">${celulas}</g></svg></span>`;
}

export function novaSemente() {
  return Math.random().toString(36).slice(2, 8);
}

// ------------------------------------------------------------------ realce de código

const PY_PALAVRAS = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'break', 'continue', 'and', 'or', 'not',
  'True', 'False', 'None', 'def', 'return', 'import', 'from', 'as', 'is', 'pass', 'try', 'except', 'with', 'class',
  'lambda', 'del', 'global']);
const PY_FUNCOES = new Set(['print', 'range', 'input', 'int', 'float', 'str', 'len', 'sum', 'max', 'min', 'list',
  'append', 'remove', 'pop', 'abs', 'round', 'sorted', 'type', 'bool', 'lower', 'upper', 'strip', 'insert', 'index']);
const SQL_PALAVRAS = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'in', 'join', 'inner', 'left', 'right',
  'on', 'group', 'by', 'order', 'having', 'as', 'limit', 'asc', 'desc', 'is', 'null', 'like', 'between', 'distinct',
  'count', 'sum', 'avg', 'max', 'min', 'insert', 'into', 'values', 'update', 'set', 'delete', 'case', 'when', 'then',
  'end', 'else', 'union', 'with', 'exists']);

export function destacar(codigo, linguagem = 'python') {
  const regex = /(#[^\n]*|--[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\w\s])/g;
  return String(codigo).split('\n').map((linha, i) => {
    let html = '';
    let m;
    regex.lastIndex = 0;
    while ((m = regex.exec(linha))) {
      const [t, comentario, texto, numero, nome, espaco] = m;
      if (comentario && !(linguagem === 'python' && t.startsWith('--'))) html += `<span class="tk-com">${esc(t)}</span>`;
      else if (texto) html += `<span class="tk-str">${esc(t)}</span>`;
      else if (numero) html += `<span class="tk-num">${t}</span>`;
      else if (nome) {
        const palavra = linguagem === 'sql' ? SQL_PALAVRAS.has(nome.toLowerCase()) : PY_PALAVRAS.has(nome);
        const funcao = linguagem !== 'sql' && PY_FUNCOES.has(nome);
        html += palavra ? `<span class="tk-kw">${t}</span>` : funcao ? `<span class="tk-fn">${t}</span>` : t;
      } else if (espaco) html += t;
      else html += /[=<>+\-*/%!]/.test(t) ? `<span class="tk-op">${esc(t)}</span>` : esc(t);
    }
    return `<span class="ln"><i>${i + 1}</i>${html || ' '}</span>`;
  }).join('');
}

// ------------------------------------------------------------------ som (sintetizado no navegador)

class Som {
  constructor() { this.ativo = true; this.ctx = null; this.musica = null; }

  garantir() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.saida = this.ctx.createGain();
      this.saida.gain.value = 0.5;
      this.saida.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  nota(freq, inicio, duracao, { tipo = 'square', volume = 0.1, deslizar = null } = {}) {
    const ctx = this.garantir();
    if (!ctx || !this.ativo) return;
    const t0 = ctx.currentTime + inicio;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (deslizar) osc.frequency.exponentialRampToValueAtTime(deslizar, t0 + duracao);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
    osc.connect(g).connect(this.saida);
    osc.start(t0);
    osc.stop(t0 + duracao + 0.05);
  }

  ruido(inicio, duracao, volume = 0.06) {
    const ctx = this.garantir();
    if (!ctx || !this.ativo) return;
    const n = Math.floor(ctx.sampleRate * duracao);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = volume;
    src.buffer = buf;
    src.connect(g).connect(this.saida);
    src.start(ctx.currentTime + inicio);
  }

  entrou() { this.nota(988, 0, 0.07, { volume: 0.06 }); this.nota(1319, 0.06, 0.1, { volume: 0.06 }); }
  clique() { this.nota(660, 0, 0.05, { tipo: 'triangle', volume: 0.12 }); }
  tique(urgente) { this.nota(urgente ? 1250 : 880, 0, 0.04, { volume: urgente ? 0.06 : 0.035 }); }
  revelar() { this.nota(392, 0, 0.1, { volume: 0.08 }); this.nota(784, 0.09, 0.22, { volume: 0.08 }); }
  inicio() { [262, 330, 392, 523].forEach((f, i) => this.nota(f, i * 0.1, 0.18, { volume: 0.08 })); }
  rufar(s = 2.4) { for (let t = 0; t < s; t += 0.055) this.ruido(t, 0.045, 0.02 + t * 0.018); }
  fanfarra() {
    [[523, 0], [659, 0.14], [784, 0.28], [1047, 0.42], [784, 0.66], [1047, 0.8]]
      .forEach(([f, t]) => this.nota(f, t, 0.3, { volume: 0.09 }));
  }

  tocarMusica(estilo = 'sala') {
    this.pararMusica();
    if (!this.ativo || !this.garantir()) return;
    const acordes = estilo === 'pergunta'
      ? [[147, 175, 220, 262], [131, 165, 196, 247], [147, 175, 220, 277], [165, 196, 247, 294]]
      : [[220, 277, 330, 415], [196, 247, 294, 370], [175, 220, 262, 330], [196, 247, 294, 392]];
    const passo = estilo === 'pergunta' ? 0.13 : 0.17;
    let i = 0;
    this.musica = setInterval(() => {
      const a = acordes[Math.floor(i / 8) % acordes.length];
      this.nota(a[i % 4] * (i % 8 >= 4 ? 2 : 1), 0, passo * 0.85, { volume: 0.03 });
      if (i % 4 === 0) this.nota(a[0] / 2, 0, passo * 3.6, { tipo: 'triangle', volume: 0.06 });
      if (i % 2 === 1) this.ruido(0, 0.02, 0.01);
      i += 1;
    }, passo * 1000);
  }

  pararMusica() { clearInterval(this.musica); this.musica = null; }
}
export const som = new Som();

// ------------------------------------------------------------------ confete de símbolos

export function confete(duracaoMs = 5000, intensidade = 1) {
  if (reduzido) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confete';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const glifos = ['{', '}', '<', '>', '[', ']', '(', ')'];
  const cores = ['#ff4fa3', '#3d8bff', '#ffc31f', '#2ee6a6', '#ffffff'];
  const pecas = Array.from({ length: Math.round(140 * intensidade) }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.7,
    vx: (Math.random() - 0.5) * 3 * dpr,
    vy: (2 + Math.random() * 3.5) * dpr,
    giro: Math.random() * Math.PI, vg: (Math.random() - 0.5) * 0.14,
    tam: (18 + Math.random() * 26) * dpr,
    cor: cores[Math.floor(Math.random() * cores.length)],
    glifo: glifos[Math.floor(Math.random() * glifos.length)],
  }));
  const inicio = performance.now();
  const quadro = (t) => {
    const passado = t - inicio;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = passado > duracaoMs - 900 ? Math.max(0, (duracaoMs - passado) / 900) : 1;
    for (const p of pecas) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.035 * dpr; p.giro += p.vg;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.cor;
      ctx.font = `800 ${p.tam}px "JetBrains Mono", monospace`;
      ctx.fillText(p.glifo, -p.tam / 3, p.tam / 3);
      ctx.restore();
    }
    if (passado < duracaoMs) requestAnimationFrame(quadro);
    else canvas.remove();
  };
  requestAnimationFrame(quadro);
}

// ------------------------------------------------------------------ números que contam

export function contar(el, de, para, duracao = 0.9) {
  if (!el) return;
  if (!gsap || reduzido) { el.textContent = Number(para).toLocaleString('pt-BR'); return; }
  const obj = { v: de };
  gsap.to(obj, {
    v: para, duration: duracao, ease: 'power2.out',
    onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString('pt-BR'); },
  });
}

// Entrada padrão de uma tela: os filhos marcados com [data-entra] sobem em sequência.
export function entrada(raiz, atraso = 0) {
  if (!gsap || reduzido) return null;
  const alvos = $$('[data-entra]', raiz);
  if (!alvos.length) return null;
  return gsap.fromTo(alvos, { y: 28, opacity: 0 }, {
    y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.07, delay: atraso, clearProps: 'transform,opacity',
  });
}
