// ByteQuiz — quiz em tempo real para a sala de aula.
//
//   npm start            servidor + link público (cloudflared)
//   npm run local        só na rede local (sem túnel)
//
// A tela do professor fica em /professor?chave=... (a chave é impressa ao iniciar).
// Os estudantes entram pela raiz do site (o QR code já leva o PIN).

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Jogo, PADRAO } = require('./lib/jogo');
const { abrirTunel, ipLocal } = require('./lib/tunel');
const { criarArmazem } = require('./lib/armazem');

const PORTA = Number(process.env.PORT || process.env.PORTA || 3000);
const NA_NUVEM = !!process.env.K_SERVICE;           // Cloud Run define K_SERVICE
const URL_PUBLICA = (process.env.URL_PUBLICA || '').replace(/\/$/, '');
const SEM_TUNEL = process.argv.includes('--sem-tunel') || NA_NUVEM || !!URL_PUBLICA;
const RAIZ = __dirname;
const PASTA_QUIZZES = path.join(RAIZ, 'quizzes');
const ARQ_CHAVE = path.join(RAIZ, 'chave_professor.txt');
const armazem = criarArmazem(RAIZ);

// ------------------------------------------------------------------ chave do professor

function chaveProfessor() {
  if (process.env.CHAVE_PROFESSOR) return process.env.CHAVE_PROFESSOR;
  if (fs.existsSync(ARQ_CHAVE)) return fs.readFileSync(ARQ_CHAVE, 'utf8').trim();
  const chave = crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(ARQ_CHAVE, `${chave}\n`);
  return chave;
}
const CHAVE = chaveProfessor();
const ehProfessor = (chave) => typeof chave === 'string' && chave.length > 0
  && crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(chave).digest()),
    Buffer.from(crypto.createHash('sha256').update(CHAVE).digest()));

// ------------------------------------------------------------------ quizzes

function listarQuizzes() {
  if (!fs.existsSync(PASTA_QUIZZES)) return [];
  return fs.readdirSync(PASTA_QUIZZES).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const q = JSON.parse(fs.readFileSync(path.join(PASTA_QUIZZES, f), 'utf8'));
      return { ...q, id: q.id || f.replace(/\.json$/, '') };
    } catch (erro) {
      console.error(`Quiz inválido (${f}): ${erro.message}`);
      return null;
    }
  }).filter((q) => q && Array.isArray(q.perguntas) && q.perguntas.length > 0)
    .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.titulo.localeCompare(b.titulo));
}

// ------------------------------------------------------------------ endereços

const enderecos = { publico: URL_PUBLICA || null, local: NA_NUVEM ? null : `http://${ipLocal()}:${PORTA}` };

// ------------------------------------------------------------------ http

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(RAIZ, 'public'), {
  index: false,
  setHeaders: (res, arquivo) => {
    // Páginas, scripts e estilos nunca ficam em cache: o celular sempre pega a versão atual.
    if (/\.(html|js|css)$/.test(arquivo)) res.setHeader('Cache-Control', 'no-store');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
// Bibliotecas servidas pelo próprio servidor: a aula não depende de CDN.
app.use('/vendor/gsap', express.static(path.join(RAIZ, 'node_modules', 'gsap', 'dist'), { maxAge: '7d' }));
app.use('/vendor/three', express.static(path.join(RAIZ, 'node_modules', 'three'), { maxAge: '7d' }));

const pagina = (nome) => (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(RAIZ, 'public', nome));
app.get('/', pagina('jogar.html'));
app.get('/professor', pagina('professor.html'));

function exigirChave(req, res, next) {
  if (ehProfessor(req.get('x-chave') || req.query.chave)) return next();
  return res.status(401).json({ erro: 'Chave do professor inválida.' });
}

app.get('/api/info', exigirChave, (req, res) => {
  res.json({ ...enderecos, configPadrao: PADRAO });
});

app.get('/api/quizzes', exigirChave, (req, res) => {
  res.json(listarQuizzes().map((q) => ({
    id: q.id, titulo: q.titulo, disciplina: q.disciplina, descricao: q.descricao,
    total: q.perguntas.length, comCodigo: q.perguntas.filter((p) => p.codigo || p.imagem).length,
    tempoTotal: q.perguntas.reduce((s, p) => s + (p.tempo || 20), 0),
  })));
});

app.get('/api/qr', exigirChave, async (req, res) => {
  const texto = String(req.query.texto || '').slice(0, 300);
  const svg = await QRCode.toString(texto, { type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#0b1020', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});

app.get('/api/relatorios', exigirChave, async (req, res) => {
  try {
    const lista = (await armazem.listar('relatorios/')).filter((a) => a.nome.endsWith('.csv'))
      .sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado))).slice(0, 30);
    res.json(lista.map((a) => ({ nome: a.nome.replace(/^relatorios\//, ''), atualizado: a.atualizado })));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/api/relatorios/baixar', exigirChave, async (req, res) => {
  const nome = String(req.query.nome || '');
  if (!/^[\w.-]+\.csv$/.test(nome)) return res.status(400).send('Nome inválido.');
  try {
    const dados = await armazem.ler(`relatorios/${nome}`);
    res.attachment(nome).type('text/csv; charset=utf-8').send(dados);
  } catch (erro) {
    res.status(404).send('Relatório não encontrado.');
  }
});

app.get('/api/relatorio/:pin.:formato', exigirChave, (req, res) => {
  const jogo = jogos.get(req.params.pin);
  if (!jogo) return res.status(404).send('Partida não encontrada.');
  if (req.params.formato === 'csv') {
    res.attachment(`${jogo.nomeArquivo()}.csv`).type('text/csv; charset=utf-8').send(jogo.csv());
  } else {
    res.json(jogo.relatorio());
  }
});


// ------------------------------------------------------------------ socket.io

const servidor = http.createServer(app);
const io = new Server(servidor, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 1e5 });
const jogos = new Map();
const pendentes = new Map();

function novoPin() {
  let pin;
  do pin = String(Math.floor(100000 + Math.random() * 900000)); while (jogos.has(pin));
  return pin;
}

// ------------------------------------------------------------------ salvar partidas
// Cada sala é gravada (no disco ou no bucket) logo depois de cada mudança. No bucket, no máximo
// uma gravação por segundo por arquivo, por isso o intervalo maior na nuvem.
const salvando = new Map();
const INTERVALO_SALVAR = process.env.BUCKET ? 1200 : 250;

function salvarSala(jogo) {
  if (salvando.has(jogo.pin)) return;
  salvando.set(jogo.pin, setTimeout(async () => {
    salvando.delete(jogo.pin);
    try {
      await armazem.gravar(`dados/salas/${jogo.pin}.json`, JSON.stringify(jogo.serializar()));
    } catch (erro) {
      console.error(`Não foi possível salvar a sala ${jogo.pin}: ${erro.message}`);
    }
  }, INTERVALO_SALVAR));
}

const relatoriosPendentes = new Map();
function guardarRelatorio(nome, csv, json) {
  clearTimeout(relatoriosPendentes.get(nome));
  relatoriosPendentes.set(nome, setTimeout(async () => {
    relatoriosPendentes.delete(nome);
    try {
      await armazem.gravar(`relatorios/${nome}.csv`, csv);
      await armazem.gravar(`relatorios/${nome}.json`, json);
    } catch (erro) {
      console.error(`Não foi possível salvar o relatório ${nome}: ${erro.message}`);
    }
  }, INTERVALO_SALVAR));
}

async function restaurarSalas() {
  const limite = Date.now() - 24 * 3600 * 1000;
  let arquivos = [];
  try { arquivos = await armazem.listar('dados/salas/'); } catch (erro) { console.error(`Salas não listadas: ${erro.message}`); }
  for (const arquivo of arquivos.filter((a) => a.nome.endsWith('.json'))) {
    try {
      const dados = JSON.parse(String(await armazem.ler(arquivo.nome)));
      if ((dados.salvoEm || 0) < limite) continue;
      const jogo = Jogo.restaurar(dados, { aoMudar: aoMudarJogo, aoRelatorio: guardarRelatorio });
      jogos.set(jogo.pin, jogo);
      console.log(`  Sala ${jogo.pin} restaurada (${jogo.jogadores.size} jogadores, fase ${jogo.fase}).`);
    } catch (erro) {
      console.error(`  Sala ${arquivo.nome} não pôde ser restaurada: ${erro.message}`);
    }
  }
}

function aoMudarJogo(jogo) {
  transmitir(jogo);
  salvarSala(jogo);
}

// Junta várias mudanças seguidas (ex.: 40 respostas no mesmo segundo) em um envio só.
function transmitir(jogo) {
  if (pendentes.has(jogo.pin)) return;
  pendentes.set(jogo.pin, setTimeout(() => {
    pendentes.delete(jogo.pin);
    io.to(`prof:${jogo.pin}`).emit('estado', jogo.estadoProfessor());
    for (const j of jogo.jogadores.values()) {
      if (j.socketId) io.to(j.socketId).emit('estado', jogo.estadoJogador(j));
    }
  }, 60));
}

function ack(fn) {
  return typeof fn === 'function' ? fn : () => {};
}

io.on('connection', (socket) => {
  const professor = ehProfessor(socket.handshake.auth && socket.handshake.auth.chave);

  // ---------------------------------------------------------------- professor
  if (professor) {
    socket.join('professores');
    socket.emit('enderecos', enderecos);
    const jogoDoProfessor = () => jogos.get(socket.data.pin);

    socket.on('prof:criar', ({ quizId, config } = {}, cb) => {
      const quiz = listarQuizzes().find((q) => q.id === quizId);
      if (!quiz) return ack(cb)({ erro: 'Quiz não encontrado.' });
      const pin = novoPin();
      const jogo = new Jogo({ pin, quiz, config, aoMudar: aoMudarJogo, aoRelatorio: guardarRelatorio });
      jogos.set(pin, jogo);
      socket.data.pin = pin;
      socket.join(`prof:${pin}`);
      ack(cb)({ pin, token: jogo.tokenProfessor });
      transmitir(jogo);
      console.log(`Sala ${pin} criada: ${quiz.titulo}`);
    });

    socket.on('prof:retomar', ({ pin, token } = {}, cb) => {
      const jogo = jogos.get(pin);
      if (!jogo || jogo.tokenProfessor !== token) return ack(cb)({ erro: 'Partida não encontrada.' });
      socket.data.pin = pin;
      socket.join(`prof:${pin}`);
      ack(cb)({ ok: true });
      socket.emit('estado', jogo.estadoProfessor());
    });

    socket.on('prof:config', (config = {}) => {
      const jogo = jogoDoProfessor();
      if (!jogo) return;
      for (const [k, v] of Object.entries(config)) {
        if (k in PADRAO && typeof v === typeof PADRAO[k]) jogo.config[k] = v;
      }
      jogo.mudou();
    });

    socket.on('prof:trancar', (trancado) => {
      const jogo = jogoDoProfessor();
      if (!jogo) return;
      jogo.trancado = !!trancado;
      jogo.mudou();
    });

    socket.on('prof:iniciar', () => { const j = jogoDoProfessor(); if (j) j.iniciar(); });
    socket.on('prof:avancar', () => { const j = jogoDoProfessor(); if (j) j.avancar(); });
    socket.on('prof:encerrar', () => { const j = jogoDoProfessor(); if (j) j.podio(); });

    socket.on('prof:expulsar', (id) => {
      const jogo = jogoDoProfessor();
      if (!jogo) return;
      const j = jogo.expulsar(id);
      if (j && j.socketId) {
        io.to(j.socketId).emit('expulso');
        const s = io.sockets.sockets.get(j.socketId);
        if (s) s.data = {};
      }
    });
    return;
  }

  // ---------------------------------------------------------------- estudante
  const jogadorAtual = () => {
    const jogo = jogos.get(socket.data.pin);
    return jogo ? [jogo, jogo.jogadores.get(socket.data.id)] : [null, null];
  };

  const vincular = (jogo, jogador) => {
    socket.data.pin = jogo.pin;
    socket.data.id = jogador.id;
    jogador.socketId = socket.id;
    jogador.conectado = true;
    socket.emit('estado', jogo.estadoJogador(jogador));
    jogo.mudou();
  };

  socket.on('jog:verificar', ({ pin } = {}, cb) => {
    const jogo = jogos.get(String(pin || '').trim());
    if (!jogo || jogo.fase === 'encerrado') return ack(cb)({ erro: 'PIN não encontrado. Confira o número na tela.' });
    if (jogo.trancado) return ack(cb)({ erro: 'A sala está trancada pelo professor.' });
    if (jogo.fase === 'podio') return ack(cb)({ erro: 'Esta partida já terminou.' });
    ack(cb)({
      ok: true, quiz: jogo.quiz.titulo, pedirNome: jogo.config.pedirNome, apelidos: jogo.config.apelidos,
      sugestao: jogo.sugerirApelido(),
    });
  });

  socket.on('jog:sugerir', ({ pin } = {}, cb) => {
    const jogo = jogos.get(String(pin || ''));
    ack(cb)({ apelido: jogo ? jogo.sugerirApelido() : null });
  });

  socket.on('jog:entrar', ({ pin, apelido, nome, avatar } = {}, cb) => {
    const jogo = jogos.get(String(pin || '').trim());
    if (!jogo) return ack(cb)({ erro: 'PIN não encontrado.' });
    const r = jogo.entrar({ apelido, nome, avatar });
    if (r.erro) return ack(cb)(r);
    // Recuperar alguém que caiu: o celular antigo (se ainda estiver aberto) é desligado da conta.
    if (r.recuperado && r.jogador.socketId) io.to(r.jogador.socketId).emit('substituido');
    ack(cb)({ ok: true, token: r.jogador.token, id: r.jogador.id, recuperado: !!r.recuperado });
    vincular(jogo, r.jogador);
  });

  socket.on('jog:retomar', ({ pin, token } = {}, cb) => {
    const jogo = jogos.get(String(pin || ''));
    const jogador = jogo && jogo.reconectar(token);
    if (!jogador) return ack(cb)({ erro: 'Sessão não encontrada.' });
    if (jogador.socketId && jogador.socketId !== socket.id) io.to(jogador.socketId).emit('substituido');
    ack(cb)({ ok: true, id: jogador.id });
    vincular(jogo, jogador);
  });

  socket.on('jog:responder', ({ escolha } = {}, cb) => {
    const [jogo, jogador] = jogadorAtual();
    if (!jogador) return ack(cb)({ erro: 'Você não está em uma partida.' });
    ack(cb)({ ok: jogo.responder(jogador.id, escolha) });
  });

  socket.on('jog:sair', () => {
    const [jogo, jogador] = jogadorAtual();
    if (jogador && jogo.fase === 'lobby') jogo.expulsar(jogador.id);
    socket.data = {};
  });

  socket.on('disconnect', () => {
    const [jogo, jogador] = jogadorAtual();
    if (jogador && jogador.socketId === socket.id) {
      jogador.conectado = false;
      jogador.socketId = null;
      jogo.mudou();
    }
  });
});

// ------------------------------------------------------------------ início

restaurarSalas().finally(() => servidor.listen(PORTA, () => {
  console.log('\n  ByteQuiz no ar');
  console.log(`  Armazenamento: ${armazem.tipo}`);
  if (NA_NUVEM) {
    console.log(`  Na nuvem. Link: ${URL_PUBLICA || '(defina URL_PUBLICA)'}\n`);
    return;
  }
  console.log(`  Professor:  http://localhost:${PORTA}/professor?chave=${CHAVE}`);
  console.log(`  Rede local: ${enderecos.local}`);
  if (SEM_TUNEL) {
    console.log(URL_PUBLICA ? `  Link público: ${URL_PUBLICA}\n` : '  Link público desativado (--sem-tunel).\n');
    return;
  }
  console.log('  Abrindo link público (cloudflared)...');
  abrirTunel(PORTA, (url) => {
    enderecos.publico = url;
    if (url) console.log(`  Link público: ${url}\n`);
    io.to('professores').emit('enderecos', enderecos);
    for (const jogo of jogos.values()) transmitir(jogo);
  });
}));

module.exports = { app, servidor };
