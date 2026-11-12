// Gerador de apelidos com tema de tecnologia e filtro simples de nomes ofensivos.

const NOMES = [
  'Byte', 'Bit', 'Pixel', 'Kernel', 'Cache', 'Lambda', 'Thread', 'Socket', 'Proxy', 'Cookie',
  'Token', 'Commit', 'Branch', 'Docker', 'Python', 'Linux', 'Firewall', 'Router', 'Script',
  'Compilador', 'Ponteiro', 'Array', 'Vetor', 'Matriz', 'Loop', 'Debug', 'Stack', 'Buffer',
  'Hash', 'Query', 'Servidor', 'Algoritmo', 'Chip', 'Modem', 'Drone', 'Robô', 'Cyborg',
  'Hacker', 'Bug', 'Patch', 'Backup', 'Cluster', 'Gateway', 'Terminal', 'Shell', 'Prompt',
  'Neurônio', 'Quantum', 'Laser', 'Nano', 'Giga', 'Tera', 'Mega', 'Sudo', 'Root', 'Ping',
];

const QUALIDADES = [
  'Turbo', 'Ninja', 'Quântico', 'Veloz', 'Furtivo', 'Binário', 'Neon', 'Lendário', 'Supremo',
  'Atômico', 'Sombrio', 'Elétrico', 'Digital', 'Cósmico', 'Galáctico', 'Overclock', 'Hiper',
  'Recursivo', 'Assíncrono', 'Criptografado', 'Indexado', 'Otimizado', 'Compilado', 'Infinito',
  'Mestre', 'Supersônico', 'Blindado', 'Fantasma', 'Glitch', 'Pro', 'Max', 'Ultra', 'Prime',
  '404', '2077', 'X', 'Zero', 'Alpha', 'Beta', 'Omega', 'v2', '3000', 'Dev', 'Ops',
];

const AVATARES = ['🤖', '👾', '🛸', '💾', '🧠', '⚡', '🐍', '🦾', '🔮', '🚀', '🧬', '🛰️',
  '🐧', '🦊', '👽', '🎮', '🕹️', '💡', '🔋', '🐙', '🦉', '🐉', '🦖', '🧪', '🪐', '🌌', '🔥', '🦈'];

// Palavras bloqueadas nos apelidos: ficam em lib/palavras-bloqueadas.json (uma lista JSON de textos),
// arquivo que NÃO vai para o repositório. Sem ele, o jogo funciona, só que sem o filtro.
let BLOQUEADAS = [];
try {
  BLOQUEADAS = require('./palavras-bloqueadas.json');
} catch (_) {
  BLOQUEADAS = [];
}

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ofensivo(texto) {
  const t = ` ${semAcento(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  const junto = t.replace(/ /g, '');
  return BLOQUEADAS.some((p) => t.includes(` ${p.trim()} `) || (p.trim().length >= 6 && junto.includes(p.trim())));
}

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function gerarApelido(emUso = new Set()) {
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const apelido = `${sortear(NOMES)} ${sortear(QUALIDADES)}`;
    if (apelido.length <= 20 && !emUso.has(apelido.toLowerCase())) return apelido;
  }
  return `${sortear(NOMES)} ${Math.floor(Math.random() * 900 + 100)}`;
}

module.exports = { gerarApelido, ofensivo, AVATARES, sortear };
