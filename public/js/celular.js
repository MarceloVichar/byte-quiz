import {
  $, $$, gsap, reduzido, OPCOES, esc, rico, destacar, confete, contar, entrada, aviso, sincronizar, agora,
  simbolo, novaSemente,
} from './nucleo.js';

const params = new URLSearchParams(location.search);
const ui = {
  pin: params.get('pin') || '',
  sessao: JSON.parse(localStorage.getItem('bytequiz:sessao') || 'null'),
  estado: null,
  chave: null,
  pontos: 0,
  semente: localStorage.getItem('bytequiz:simbolo') || novaSemente(),
  opcoesSimbolo: [],
  urgente: null,
};
const socket = io({ transports: ['websocket', 'polling'] });
const vibrar = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* sem suporte */ } };

function mostrar(id) {
  const vista = $(`#${id}`);
  const nova = vista.hidden;
  $$('.vista').forEach((v) => { v.hidden = v.id !== id; });
  if (nova) entrada(vista);
  return vista;
}

// ------------------------------------------------------------------ PIN
function telaPin() {
  mostrar('v-pin');
  $('#pin').value = ui.pin;
  if (gsap && !reduzido) {
    gsap.from('.pin-marca span:first-child', { x: '-40vw', duration: 1, ease: 'expo.out' });
    gsap.from('.pin-marca span:last-child', { x: '40vw', duration: 1, ease: 'expo.out' });
  }
}

$('#form-pin').onsubmit = (ev) => {
  ev.preventDefault();
  const pin = $('#pin').value.replace(/\D/g, '');
  if (pin.length !== 6) { aviso('O PIN tem 6 números. Confira no telão.', 'erro'); return; }
  verificar(pin);
};

function verificar(pin) {
  socket.emit('jog:verificar', { pin }, (r) => {
    if (r.erro) { aviso(r.erro, 'erro'); telaPin(); return; }
    ui.pin = pin;
    history.replaceState(null, '', `/?pin=${pin}`);
    telaPerfil(r);
  });
}

// ------------------------------------------------------------------ perfil
function desenharSimbolos() {
  const caixa = $('#simbolos');
  caixa.innerHTML = ui.opcoesSimbolo.map((s) => `
    <button type="button" role="radio" aria-checked="${s === ui.semente}" aria-label="Símbolo ${s}" data-s="${s}">${simbolo(s, 56)}</button>`).join('');
}

function telaPerfil(info) {
  mostrar('v-perfil');
  $('#perfil-quiz').textContent = info.quiz;
  $('#campo-nome').hidden = !info.pedirNome;
  $('#nome').value = localStorage.getItem('bytequiz:nome') || '';
  const apelido = $('#apelido');
  apelido.value = localStorage.getItem('bytequiz:apelido') || info.sugestao;
  apelido.readOnly = info.apelidos === 'gerador';
  if (apelido.readOnly) apelido.value = info.sugestao;
  ui.opcoesSimbolo = [ui.semente, ...Array.from({ length: 7 }, novaSemente)];
  desenharSimbolos();
}

$('#simbolos').onclick = (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  ui.semente = b.dataset.s;
  desenharSimbolos();
  vibrar(10);
};
$('#outros-simbolos').onclick = () => {
  ui.opcoesSimbolo = [ui.semente, ...Array.from({ length: 7 }, novaSemente)];
  desenharSimbolos();
  if (gsap && !reduzido) gsap.from('#simbolos button:not(:first-child)', { scale: 0.6, opacity: 0, duration: 0.35, ease: 'back.out(2)', stagger: 0.03 });
};
$('#sortear').onclick = () => {
  vibrar(12);
  socket.emit('jog:sugerir', { pin: ui.pin }, (r) => {
    if (!r.apelido) return;
    const campo = $('#apelido');
    campo.value = r.apelido;
    if (gsap && !reduzido) gsap.fromTo(campo, { y: -8, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.3 });
  });
};

$('#form-perfil').onsubmit = (ev) => {
  ev.preventDefault();
  const botao = $('#btn-entrar');
  botao.disabled = true;
  const nome = $('#nome').value.trim();
  const apelido = $('#apelido').value.trim();
  socket.emit('jog:entrar', { pin: ui.pin, apelido, nome, avatar: ui.semente }, (r) => {
    botao.disabled = false;
    if (r.erro) {
      if (gsap && !reduzido) gsap.fromTo('#form-perfil', { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      aviso(r.erro, 'erro');
      return;
    }
    if (nome) localStorage.setItem('bytequiz:nome', nome);
    localStorage.setItem('bytequiz:apelido', apelido);
    localStorage.setItem('bytequiz:simbolo', ui.semente);
    ui.sessao = { pin: ui.pin, token: r.token };
    localStorage.setItem('bytequiz:sessao', JSON.stringify(ui.sessao));
    if (r.recuperado) aviso('Você voltou para a partida. Seus pontos foram mantidos.');
    vibrar([20, 40, 20]);
  });
};

// ------------------------------------------------------------------ jogo
function cena(fundo, html, classe = '') {
  $('#v-jogo').className = `vista jogo ${fundo}`;
  const palco = $('#palco');
  palco.innerHTML = `<div class="cena ${classe}">${html}</div>`;
  entrada(palco);
  return palco.firstElementChild;
}

function barraTempo(fim, total) {
  const barra = $('#tempo');
  const i = $('i', barra);
  barra.hidden = false;
  barra.classList.remove('urgente');
  const resta = Math.max(0, fim - agora());
  if (gsap) gsap.fromTo(i, { scaleX: Math.min(1, resta / total) }, { scaleX: 0, duration: resta / 1000, ease: 'none' });
  clearTimeout(ui.urgente);
  ui.urgente = setTimeout(() => barra.classList.add('urgente'), Math.max(0, resta - 5000));
}

function esconderTempo() {
  $('#tempo').hidden = true;
  clearTimeout(ui.urgente);
}

function telaEspera(e) {
  esconderTempo();
  const c = cena('fundo-ceu', `
    <div class="grande-simbolo" data-entra>${simbolo(e.eu.avatar, 200)}</div>
    <p class="apelido-grande" data-entra>${esc(e.eu.apelido)}</p>
    <h2 data-entra>Você está na sala.</h2>
    <p data-entra>Procure seu nome no telão. O jogo começa quando o professor iniciar.</p>
    <p class="nota" id="total-sala" data-entra></p>`, 'centro espera');
  atualizarTotal(e);
  if (gsap && !reduzido) {
    gsap.from($$('rect', c).slice(1), { opacity: 0, duration: 0.25, stagger: { each: 0.025, from: 'random' }, delay: 0.2 });
    gsap.to('.grande-simbolo', { y: -8, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }
}

function atualizarTotal(e) {
  const el = $('#total-sala');
  if (el) el.textContent = `${e.total} ${e.total === 1 ? 'pessoa' : 'pessoas'} na sala até agora.`;
}

function telaLeitura(e) {
  const p = e.pergunta;
  barraTempo(p.fimLeitura, 4500);
  cena('fundo-tinta', `
    <p class="num" data-entra>Pergunta ${p.numero} de ${e.totalPerguntas}</p>
    <h2 data-entra>${p.pergunta ? rico(p.pergunta) : 'Olhe para o telão.'}</h2>
    <p class="nota" data-entra>As alternativas aparecem em instantes.</p>`, 'centro leitura-cel');
}

function telaPergunta(e) {
  const p = e.pergunta;
  if (p.respondeu !== null && p.respondeu !== undefined) return telaEnviada(e, p.respondeu);
  barraTempo(p.fimPergunta, p.tempo * 1000);
  const comTexto = !!p.alternativas;
  const linguagem = p.codigo && /\b(select|from|where)\b/i.test(p.codigo) ? 'sql' : 'python';
  const botoes = Array.from({ length: p.quantidade }, (_, i) => `
    <button class="opcao" data-i="${i}" aria-label="${comTexto ? esc(p.alternativas[i]) : OPCOES[i].nome}">
      <span class="glifo" aria-hidden="true">${OPCOES[i].glifo}</span>
      ${comTexto ? `<span class="texto">${esc(p.alternativas[i])}</span>` : ''}
    </button>`).join('');
  const c = cena('fundo-ceu', `
    <div class="cabeca"><span>Pergunta ${p.numero} de ${e.totalPerguntas}</span><span class="seg" id="seg"></span></div>
    ${p.pergunta ? `<p class="enunciado">${rico(p.pergunta)}</p>` : ''}
    ${p.codigo ? `<pre class="codigo">${destacar(p.codigo, linguagem)}</pre>` : ''}
    ${p.imagem ? `<img class="figura" src="${esc(p.imagem)}" alt="Código da pergunta">` : ''}
    <div class="alternativas ${comTexto ? '' : 'so-simbolos'}">${botoes}</div>`);
  if (gsap && !reduzido) gsap.from($$('.opcao', c), { y: 40, opacity: 0, duration: 0.45, ease: 'power3.out', stagger: 0.06 });

  const seg = $('#seg');
  const relogio = setInterval(() => {
    if (!document.body.contains(seg)) { clearInterval(relogio); return; }
    seg.textContent = `${Math.max(0, Math.ceil((p.fimPergunta - agora()) / 1000))} s`;
  }, 200);

  $('.alternativas', c).onclick = (ev) => {
    const b = ev.target.closest('.opcao');
    const grupo = $('.alternativas', c);
    if (!b || grupo.classList.contains('travado')) return;
    const escolha = Number(b.dataset.i);
    grupo.classList.add('travado');
    b.classList.add('escolhida');
    vibrar(25);
    socket.emit('jog:responder', { escolha }, (r) => {
      if (!r || !r.ok) aviso('A resposta não chegou a tempo.', 'erro');
    });
    const ir = () => telaEnviada(e, escolha);
    if (gsap && !reduzido) gsap.to(b, { scale: 1.04, duration: 0.18, yoyo: true, repeat: 1, onComplete: ir });
    else ir();
  };
}

function telaEnviada(e, escolha) {
  const op = OPCOES[escolha];
  const fundo = ['fundo-magenta', 'fundo-azul', 'fundo-sol', 'fundo-tinta'][escolha];
  const c = cena(fundo, `
    <span class="glifo-grande" aria-hidden="true">${op.glifo}</span>
    <h2>Resposta enviada.</h2>
    <p class="nota">Agora é com o telão. O resultado aparece aqui.</p>`, 'centro enviada');
  if (gsap && !reduzido) gsap.from($('.glifo-grande', c), { scale: 0.4, rotate: -12, duration: 0.7, ease: 'back.out(1.8)' });
}

function telaResultado(e) {
  esconderTempo();
  const r = e.resultado;
  const lugar = e.posicao === 1
    ? '<b>Você está em 1º lugar.</b>'
    : `Você está em <b>${e.posicao}º lugar</b>${!r.acima ? '' : r.acima.diferenca === 0
      ? `, empatado com <b>${esc(r.acima.apelido)}</b>`
      : `, ${r.acima.diferenca.toLocaleString('pt-BR')} pontos atrás de <b>${esc(r.acima.apelido)}</b>`}.`;
  let c;
  if (r.entrouAgora) {
    c = cena('fundo-areia', `
      <h2 data-entra>Você entrou na sala.</h2>
      <p data-entra>Esta pergunta já estava em andamento. A sua primeira é a próxima.</p>`, 'centro resultado');
  } else if (!r.respondeu) {
    c = cena('fundo-areia', `
      <h2 data-entra>Não deu tempo.</h2>
      <p class="certa-era" data-entra>A certa era <code>${OPCOES[r.correta].glifo}</code> ${esc(r.alternativaCorreta)}</p>
      <p class="lugar" data-entra>${lugar}</p>`, 'centro resultado');
    vibrar(120);
  } else if (r.certa) {
    c = cena('fundo-menta', `
      <h2 data-entra>Acertou.</h2>
      <p class="ganho" data-entra>+<span id="ganho">0</span></p>
      ${r.sequencia >= 2 ? `<p class="serie" data-entra>${r.sequencia} acertos seguidos${r.bonus ? `, com ${r.bonus} de bônus` : ''}</p>` : ''}
      <p class="lugar" data-entra>${lugar}</p>`, 'centro resultado');
    contar($('#ganho'), 0, r.pontos + r.bonus, 0.9);
    vibrar([30, 50, 30]);
  } else {
    c = cena('fundo-rosa', `
      <h2 data-entra>Errou.</h2>
      <p class="certa-era" data-entra>A certa era <code>${OPCOES[r.correta].glifo}</code> ${esc(r.alternativaCorreta)}</p>
      <p class="lugar" data-entra>${lugar}</p>`, 'centro resultado');
    vibrar(250);
  }
  if (gsap && !reduzido) gsap.from($('h2', c), { scale: 0.6, duration: 0.6, ease: 'back.out(2)', transformOrigin: 'left center' });
}

function telaPlacar(e) {
  esconderTempo();
  cena('fundo-areia', `
    <div data-entra>${simbolo(e.eu.avatar, 72)}</div>
    <h2 data-entra>Você está em ${e.posicao}º lugar.</h2>
    <p data-entra>${e.eu.pontos.toLocaleString('pt-BR')} pontos, entre ${e.total} pessoas. O placar está no telão.</p>`, 'centro');
}

function telaFinal(e) {
  esconderTempo();
  const f = e.final;
  const podio = e.posicao <= 3;
  const frase = podio ? 'Você subiu ao pódio.' : e.posicao <= Math.ceil(e.total / 2) ? 'Ficou na metade de cima da turma.' : 'Revise as perguntas que errou: elas voltam na prova.';
  const c = cena(podio ? 'fundo-sol' : 'fundo-ceu', `
    <p class="lugar-grande" data-entra>${e.posicao}º</p>
    <h2 data-entra>${frase}</h2>
    <dl data-entra>
      <div><dt>Pontos</dt><dd>${e.eu.pontos.toLocaleString('pt-BR')}</dd></div>
      <div><dt>Acertos</dt><dd>${f.acertos} de ${e.numero || e.totalPerguntas}</dd></div>
      <div><dt>Maior sequência</dt><dd>${f.maiorSequencia}</dd></div>
    </dl>
    <p class="nota" data-entra>${esc(e.quiz)}</p>`, 'centro final');
  if (gsap && !reduzido) gsap.from($('.lugar-grande', c), { yPercent: 60, opacity: 0, duration: 0.9, ease: 'expo.out' });
  if (podio) confete(6000, 0.7);
}

function aplicar(e) {
  sincronizar(e.agora);
  ui.estado = e;
  if ($('#v-jogo').hidden) mostrar('v-jogo');
  $('#eu-simbolo').innerHTML = simbolo(e.eu.avatar, 30);
  $('#eu-apelido').textContent = e.eu.apelido;
  if (e.eu.pontos !== ui.pontos) {
    contar($('#eu-pontos'), ui.pontos, e.eu.pontos, 0.8);
    ui.pontos = e.eu.pontos;
  }
  const respondeu = e.pergunta ? e.pergunta.respondeu : null;
  const chave = `${e.fase}-${e.numero}-${respondeu ?? ''}`;
  if (chave === ui.chave) { if (e.fase === 'lobby') atualizarTotal(e); return; }
  const anterior = ui.chave;
  ui.chave = chave;
  if (e.fase === 'lobby') return telaEspera(e);
  if (e.fase === 'leitura') return telaLeitura(e);
  if (e.fase === 'pergunta') {
    // A resposta já foi desenhada aqui mesmo; não volta para os botões.
    if (anterior && anterior.startsWith(`pergunta-${e.numero}-`) && respondeu !== null) return null;
    return telaPergunta(e);
  }
  if (e.fase === 'revelacao') return telaResultado(e);
  if (e.fase === 'ranking') return telaPlacar(e);
  if (e.fase === 'podio' || e.fase === 'encerrado') return telaFinal(e);
}

// ------------------------------------------------------------------ conexão (sempre tenta voltar sozinho)
function faixa(texto) {
  let f = $('.faixa-conexao');
  if (!texto) { if (f) f.remove(); return; }
  if (!f) { f = document.createElement('div'); f.className = 'faixa-conexao'; document.body.appendChild(f); }
  f.textContent = texto;
}

socket.on('estado', aplicar);
socket.on('expulso', () => {
  localStorage.removeItem('bytequiz:sessao');
  ui.sessao = null;
  ui.chave = null;
  mostrar('v-jogo');
  esconderTempo();
  cena('fundo-areia', '<h2>Você saiu da sala.</h2><p>O professor removeu este apelido. Fale com ele para entrar de novo.</p><a class="botao" href="/">Voltar ao início</a>', 'centro');
});
socket.on('substituido', () => {
  ui.chave = null;
  esconderTempo();
  mostrar('v-jogo');
  cena('fundo-areia', '<h2>Você entrou por outro aparelho.</h2><p>Sua pontuação seguiu com você. Pode fechar esta página.</p>', 'centro');
  socket.disconnect();
});

socket.on('connect', () => {
  faixa(null);
  const s = ui.sessao;
  if (s && (!ui.pin || ui.pin === s.pin)) {
    socket.emit('jog:retomar', s, (r) => {
      if (r.ok) return;
      localStorage.removeItem('bytequiz:sessao');
      ui.sessao = null;
      if (ui.pin) verificar(ui.pin); else telaPin();
    });
  } else if (!ui.estado) {
    if (ui.pin) verificar(ui.pin); else telaPin();
  }
});
socket.on('disconnect', () => faixa('Sem conexão. Tentando voltar; seus pontos estão guardados.'));
socket.on('connect_error', () => {
  faixa('Sem conexão. Tentando voltar; seus pontos estão guardados.');
  if (!ui.estado && $('#v-pin').hidden && $('#v-perfil').hidden) telaPin();
});
