import {
  $, $$, gsap, Flip, reduzido, OPCOES, esc, rico, destacar, som, confete, contar, entrada, aviso,
  sincronizar, agora, simbolo,
} from './nucleo.js';

// ------------------------------------------------------------------ estado
const ui = {
  chave: null,
  quizzes: [],
  quizEscolhido: localStorage.getItem('bytequiz:quiz'),
  config: null,
  enderecos: {},
  estado: null,
  tela: null,
  chaveTela: null,
  cena3d: null,
  cena3dTela: null,
  qrTexto: null,
  podioPin: null,
  raf: null,
  ultimoSegundo: null,
  naSala: new Set(),
};
let socket = null;

const DEFINICOES = [
  { grupo: 'Quem joga', itens: [
    { k: 'pedirNome', tipo: 'liga', rot: 'Pedir nome completo', dica: 'Só aparece no relatório; no telão vai o apelido' },
    { k: 'apelidos', tipo: 'sel', rot: 'Apelidos', opcoes: [['livre', 'Livres'], ['gerador', 'Sorteados']], dica: 'Sorteados evitam apelidos inadequados' },
    { k: 'entrarDuranteJogo', tipo: 'liga', rot: 'Entrar depois do início', dica: 'Quem chega atrasado começa com 0 pontos' },
  ] },
  { grupo: 'Perguntas', itens: [
    { k: 'mostrarNoCelular', tipo: 'liga', rot: 'Pergunta e alternativas no celular', dica: 'Desligado: o celular mostra só os símbolos' },
    { k: 'tempoLeitura', tipo: 'liga', rot: 'Tempo para ler antes de responder', dica: '4,5 segundos só com a pergunta' },
    { k: 'multiplicadorTempo', tipo: 'sel', rot: 'Tempo de resposta', opcoes: [[0.5, '½'], [1, '1×'], [1.5, '1,5×'], [2, '2×']] },
    { k: 'embaralharPerguntas', tipo: 'liga', rot: 'Embaralhar perguntas' },
    { k: 'embaralharAlternativas', tipo: 'liga', rot: 'Embaralhar alternativas' },
  ] },
  { grupo: 'Pontos', itens: [
    { k: 'pontuacao', tipo: 'sel', rot: 'Valor', opcoes: [['padrao', 'Normal'], ['dobro', 'Dobro'], ['sem', 'Sem pontos']] },
    { k: 'bonusSequencia', tipo: 'liga', rot: 'Bônus por acertos seguidos', dica: '+100 a cada acerto seguido, até +500' },
    { k: 'rankingAposPergunta', tipo: 'liga', rot: 'Placar depois de cada pergunta' },
  ] },
  { grupo: 'Apresentação', itens: [
    { k: 'avancoAutomatico', tipo: 'liga', rot: 'Avançar sozinho', dica: 'Segue após a resposta e o placar' },
    { k: 'som', tipo: 'liga', rot: 'Música e efeitos' },
  ] },
];

const CORES_PASTA = ['var(--rosa)', 'var(--azul)', 'var(--sol)', 'var(--menta)'];
const POSICOES_ABA = ['4%', '27%', '50%', '72%'];
const PARES = [['{', '}', 0xff4fa3], ['<', '>', 0x3d8bff], ['[', ']', 0xffc31f], ['(', ')', 0x2ee6a6]];
const CORES_BARRA = ['var(--sol)', 'var(--rosa)', 'var(--azul)', 'var(--menta)', 'var(--rosa)'];

// ------------------------------------------------------------------ utilidades
function mostrar(id) {
  if (ui.tela === id) return $(`#${id}`);
  ui.tela = id;
  $$('.tela').forEach((t) => { t.hidden = t.id !== id; });
  if (ui.cena3d && ui.cena3dTela !== id) { ui.cena3d.destruir(); ui.cena3d = null; ui.cena3dTela = null; }
  pararRelogio();
  window.scrollTo(0, 0);
  const tela = $(`#${id}`);
  entrada(tela);
  return tela;
}

async function cena3d(id, fabrica) {
  if (ui.cena3d && ui.cena3dTela === id) return ui.cena3d;
  if (ui.cena3d) ui.cena3d.destruir();
  ui.cena3dTela = id;
  ui.cena3d = null;
  try {
    const cena = await fabrica();
    if (ui.cena3dTela !== id || ui.tela !== id) { if (cena) cena.destruir(); return null; }
    ui.cena3d = cena;
    return cena;
  } catch (erro) {
    console.warn('Cena 3D indisponível:', erro);
    return null;
  }
}

async function api(caminho) {
  const r = await fetch(caminho, { headers: { 'x-chave': ui.chave } });
  if (r.status === 401) throw new Error('chave');
  return r.json();
}

const urlEntrada = () => ui.enderecos.publico || ui.enderecos.local || location.origin;
const semRevisao = (t) => String(t).replace(/^Revisão:\s*/i, '');
const disciplinaCurta = (d) => String(d || 'Quiz').replace(/\s*\(.*\)\s*$/, '');

// ------------------------------------------------------------------ configurações
function montarConfig(destino, aoMudar) {
  destino.innerHTML = DEFINICOES.map((g) => `
    <div class="grupo-config"><h3>${g.grupo}</h3>
      ${g.itens.map((o) => `
        <div class="item-config" data-k="${o.k}">
          <span class="cfg-rotulo" id="rot-${destino.id}-${o.k}">${o.rot}${o.dica ? `<small>${o.dica}</small>` : ''}</span>
          ${o.tipo === 'liga'
            ? `<button class="interruptor" role="switch" aria-labelledby="rot-${destino.id}-${o.k}"></button>`
            : `<div class="seletor" role="group" aria-labelledby="rot-${destino.id}-${o.k}">${o.opcoes.map(([v, r]) => `<button data-v="${v}">${r}</button>`).join('')}</div>`}
        </div>`).join('')}
    </div>`).join('');
  const marcar = () => {
    for (const el of $$('.item-config', destino)) {
      const v = ui.config[el.dataset.k];
      const liga = $('.interruptor', el);
      if (liga) liga.setAttribute('aria-checked', String(!!v));
      $$('.seletor button', el).forEach((b) => b.setAttribute('aria-pressed', String(String(v) === b.dataset.v)));
    }
  };
  destino.onclick = (ev) => {
    const linha = ev.target.closest('.item-config');
    if (!linha) return;
    const k = linha.dataset.k;
    if (ev.target.closest('.interruptor')) ui.config[k] = !ui.config[k];
    else if (ev.target.dataset.v !== undefined) {
      ui.config[k] = typeof ui.config[k] === 'number' ? Number(ev.target.dataset.v) : ev.target.dataset.v;
    } else return;
    som.ativo = ui.config.som;
    som.clique();
    localStorage.setItem('bytequiz:config', JSON.stringify(ui.config));
    marcar();
    if (aoMudar) aoMudar(k, ui.config[k]);
  };
  marcar();
}

// ------------------------------------------------------------------ início: pilha de pastas
function telaInicio() {
  const primeira = ui.tela !== 'tela-inicio';
  mostrar('tela-inicio');
  som.pararMusica();
  if (!ui.quizzes.some((q) => q.id === ui.quizEscolhido)) ui.quizEscolhido = ui.quizzes[0]?.id || null;
  desenharPastas();
  listarRelatorios();
  if (primeira && gsap && !reduzido) {
    gsap.from('.pasta', { y: 80, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.2, clearProps: 'transform,opacity' });
  }
}

async function listarRelatorios() {
  try {
    const lista = await api('/api/relatorios');
    $('#anteriores').hidden = !lista.length;
    $('#lista-relatorios').innerHTML = lista.map((r) => {
      const partes = r.nome.replace(/\.csv$/, '').split('_');
      const [data, hora] = partes;
      const quiz = ui.quizzes.find((q) => q.id === partes.slice(2, -1).join('_'));
      const titulo = quiz ? semRevisao(quiz.titulo) : partes.slice(2, -1).join(' ');
      const [a, m, d] = data.split('-');
      return `<li><a href="/api/relatorios/baixar?nome=${encodeURIComponent(r.nome)}&chave=${encodeURIComponent(ui.chave)}">
        <span>${esc(titulo)}</span><span>${d}/${m}/${a}, ${hora.replace('h', ':')}</span><span>Baixar planilha</span></a></li>`;
    }).join('');
  } catch (_) { /* sem relatórios ainda */ }
}

function desenharPastas() {
  const caixa = $('#pastas');
  const ordem = [...ui.quizzes.filter((q) => q.id !== ui.quizEscolhido), ...ui.quizzes.filter((q) => q.id === ui.quizEscolhido)];
  caixa.innerHTML = ordem.map((q) => {
    const i = ui.quizzes.indexOf(q);
    const aberta = q.id === ui.quizEscolhido;
    const minutos = Math.max(1, Math.round(q.tempoTotal / 60 + q.total * 0.45));
    return `
    <article class="pasta ${aberta ? 'aberta' : ''}" data-id="${q.id}" data-flip-id="${q.id}"
      style="--cor:${CORES_PASTA[i % CORES_PASTA.length]};--x:${POSICOES_ABA[i % POSICOES_ABA.length]}">
      <button class="aba" data-escolher="${q.id}" aria-expanded="${aberta}">${esc(disciplinaCurta(q.disciplina))}</button>
      <div class="faixa" data-escolher="${q.id}">${esc(semRevisao(q.titulo))}<span>${q.total} perguntas</span></div>
      ${aberta ? `
      <div class="pasta-corpo">
        <div class="pasta-quiz">
          <h2>${esc(semRevisao(q.titulo))}</h2>
          <p class="disc">${esc(q.disciplina || '')}</p>
          <p class="desc">${esc(q.descricao || '')}</p>
          <div class="numeros">
            <div><b>${q.total}</b><span>perguntas</span></div>
            <div><b>${q.comCodigo}</b><span>com código</span></div>
            <div><b>${minutos}</b><span>minutos, mais ou menos</span></div>
          </div>
          <button class="botao grande" id="criar">Abrir a sala</button>
        </div>
        <div class="opcoes-config" id="opcoes-config"></div>
      </div>` : ''}
    </article>`;
  }).join('') || '<p>Nenhum quiz encontrado na pasta <code>quizzes/</code>.</p>';
  if ($('#opcoes-config')) montarConfig($('#opcoes-config'));
  const criar = $('#criar');
  if (criar) criar.onclick = criarSala;
}

$('#pastas').addEventListener('click', (ev) => {
  const alvo = ev.target.closest('[data-escolher]');
  if (!alvo || alvo.dataset.escolher === ui.quizEscolhido) return;
  som.garantir();
  som.clique();
  const estado = Flip ? Flip.getState('.pasta') : null;
  ui.quizEscolhido = alvo.dataset.escolher;
  localStorage.setItem('bytequiz:quiz', ui.quizEscolhido);
  desenharPastas();
  if (estado && !reduzido) {
    Flip.from(estado, { targets: '.pasta', duration: 0.65, ease: 'power3.inOut', absolute: false, nested: true });
    gsap.from('.pasta-corpo > *', { y: 24, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06, delay: 0.25, clearProps: 'transform,opacity' });
  }
});

function criarSala() {
  som.garantir();
  const botao = $('#criar');
  botao.disabled = true;
  socket.emit('prof:criar', { quizId: ui.quizEscolhido, config: ui.config }, (r) => {
    botao.disabled = false;
    if (r.erro) return aviso(r.erro, 'erro');
    sessionStorage.setItem('bytequiz:sessao', JSON.stringify({ pin: r.pin, token: r.token }));
  });
}

// ------------------------------------------------------------------ sala de espera
async function atualizarQr(pin) {
  const texto = `${urlEntrada()}/?pin=${pin}`;
  $('#sala-url').textContent = urlEntrada().replace(/^https?:\/\//, '');
  const local = (ui.enderecos.local || '').replace(/^https?:\/\//, '');
  $('#sala-local').textContent = !ui.enderecos.publico
    ? 'Abrindo o link pela internet... enquanto isso, use o endereço da rede da sala.'
    : local ? `Na rede da sala também funciona: ${local}` : '';
  if (ui.qrTexto === texto) return;
  ui.qrTexto = texto;
  const svg = await fetch(`/api/qr?texto=${encodeURIComponent(texto)}`, { headers: { 'x-chave': ui.chave } }).then((r) => r.text());
  $('#sala-qr').innerHTML = svg;
  if (gsap && !reduzido) gsap.from('#sala-qr', { scale: 0.85, opacity: 0, duration: 0.6, ease: 'back.out(1.7)' });
}

function telaSala(e) {
  const nova = ui.chaveTela !== `sala-${e.pin}`;
  if (nova) {
    ui.chaveTela = `sala-${e.pin}`;
    ui.naSala = new Set();
    $('#sala-jogadores').innerHTML = '';
    $('#sala-pin').innerHTML = `<i>{</i> <span>${e.pin.slice(0, 3)}</span> <span>${e.pin.slice(3)}</span> <i>}</i>`;
    mostrar('tela-sala');
    if (e.config.som) som.tocarMusica('sala');
    cena3d('tela-sala', async () => {
      const { cenaPar } = await import('./palco3d.js');
      return cenaPar($('#qr-3d'), { abre: '{', fecha: '}', cor: 0xff4fa3, afastamento: 2.6, tamanho: 2.7 });
    });
  }
  atualizarQr(e.pin);

  const lista = $('#sala-jogadores');
  const ids = new Set(e.jogadores.map((j) => j.id));
  for (const li of $$('li', lista)) {
    if (!ids.has(li.dataset.id)) {
      ui.naSala.delete(li.dataset.id);
      if (gsap && !reduzido) gsap.to(li, { opacity: 0, scale: 0.6, duration: 0.25, onComplete: () => li.remove() });
      else li.remove();
    }
  }
  const novos = [];
  for (const j of e.jogadores) {
    let li = $(`li[data-id="${j.id}"]`, lista);
    if (!li) {
      li = document.createElement('li');
      li.dataset.id = j.id;
      li.title = 'Clique para remover da sala';
      li.innerHTML = `${simbolo(j.avatar, 30)}<span>${esc(j.apelido)}</span>`;
      lista.appendChild(li);
      novos.push(li);
      ui.naSala.add(j.id);
    }
    li.classList.toggle('fora', !j.conectado);
  }
  if (novos.length) {
    som.entrou();
    if (gsap && !reduzido) gsap.from(novos, { y: 18, opacity: 0, scale: 0.7, duration: 0.45, ease: 'back.out(2)', stagger: Math.min(0.04, 0.8 / novos.length), clearProps: 'opacity,transform' });
  }
  const n = e.jogadores.length;
  const total = $('#sala-total');
  if (total.textContent !== String(n)) {
    total.textContent = n;
    if (gsap && !reduzido && !nova) gsap.fromTo(total, { scale: 1.18 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  }
  $('#sala-total-rotulo').textContent = n === 1 ? 'pessoa na sala' : 'na sala';
  // Quanto mais gente, menor o nome, para todos caberem sem rolar.
  lista.style.setProperty('--tam-nome', n > 44 ? '1vw' : n > 32 ? '1.15vw' : n > 20 ? '1.3vw' : '1.55vw');
  $('#sala-vazia').hidden = n > 0;
  $('#btn-comecar').disabled = n === 0;
  $('#btn-trancar').textContent = e.trancado ? 'Destrancar sala' : 'Trancar sala';
}

$('#sala-jogadores').addEventListener('click', (ev) => {
  const li = ev.target.closest('li');
  if (li && confirm(`Remover ${li.textContent.trim()} da sala?`)) socket.emit('prof:expulsar', li.dataset.id);
});
$('#btn-comecar').onclick = () => { som.inicio(); socket.emit('prof:iniciar'); };
$('#btn-trancar').onclick = () => socket.emit('prof:trancar', !ui.estado?.trancado);
$('#btn-ajustes').onclick = () => {
  ui.config = { ...ui.estado.config };
  montarConfig($('#opcoes-ajustes'), (k, v) => {
    socket.emit('prof:config', { [k]: v });
    if (k === 'som') { if (v) som.tocarMusica('sala'); else som.pararMusica(); }
  });
  $('#dialogo-ajustes').showModal();
};

// ------------------------------------------------------------------ leitura
function palavras(el, html) {
  el.innerHTML = html;
  if (!gsap || reduzido) return;
  // Cada palavra entra separada: tipografia que se monta na frente da turma.
  const partes = [];
  const percorrer = (no) => {
    for (const filho of [...no.childNodes]) {
      if (filho.nodeType === 3) {
        const frag = document.createDocumentFragment();
        filho.textContent.split(/(\s+)/).forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const s = document.createElement('span');
          s.style.display = 'inline-block';
          s.textContent = p;
          frag.appendChild(s);
          partes.push(s);
        });
        no.replaceChild(frag, filho);
      } else if (filho.nodeName === 'CODE') {
        filho.style.display = 'inline-block';
        partes.push(filho);
      } else percorrer(filho);
    }
  };
  percorrer(el);
  gsap.from(partes, { y: '0.8em', opacity: 0, rotateX: -60, duration: 0.55, ease: 'power3.out', stagger: 0.045, delay: 0.15 });
}

function telaLeitura(e) {
  const p = e.pergunta;
  const chave = `leitura-${p.numero}`;
  if (ui.chaveTela === chave) return;
  ui.chaveTela = chave;
  som.pararMusica();
  mostrar('tela-leitura');
  $('#leitura-num').textContent = `Pergunta ${p.numero} de ${e.quiz.total}`;
  palavras($('#leitura-pergunta'), rico(p.pergunta));
  const barra = $('#leitura-tempo');
  const dur = Math.max(0.2, (p.fimLeitura - agora()) / 1000);
  if (gsap) gsap.fromTo(barra, { scaleX: 1 }, { scaleX: 0, duration: dur, ease: 'none' });
  const [abre, fecha, cor] = PARES[(p.numero - 1) % PARES.length];
  cena3d('tela-leitura', async () => {
    const { cenaPar } = await import('./palco3d.js');
    const largura = Math.tan((35 / 2) * Math.PI / 180) * 10 * (innerWidth / innerHeight);
    return cenaPar($('#leitura-3d'), { abre, fecha, cor, afastamento: largura * 0.84, tamanho: 3.4 });
  }).then((cena) => { if (cena && cena.trocar && cena.ultimo !== p.numero) { cena.ultimo = p.numero; } });
}

// ------------------------------------------------------------------ pergunta e revelação
function midiaHtml(p, linguagem, compacto = false) {
  if (p.codigo) {
    const linhas = p.codigo.split('\n');
    const largura = Math.max(...linhas.map((l) => l.length)) + 5;
    const w = innerWidth * (compacto ? 0.42 : 0.9);
    const h = innerHeight * (compacto ? 0.28 : 0.42);
    const px = Math.max(14, Math.min(46, w / (largura * 0.62), h / ((linhas.length + 1.4) * 1.5)));
    return `<pre class="codigo" style="font-size:${px.toFixed(1)}px">${destacar(p.codigo, linguagem)}</pre>`;
  }
  if (p.imagem) return `<img src="${esc(p.imagem)}" alt="Código e tabelas da pergunta">`;
  return '';
}

function opcoesHtml(p, revelar) {
  return p.alternativas.map((a, i) => {
    const classe = revelar ? (i === p.correta ? 'certa' : 'apagada') : '';
    return `<div class="opcao ${classe}" data-i="${i}">
      <span class="glifo" aria-hidden="true">${OPCOES[i].glifo}</span>
      <span class="texto">${esc(a)}</span>
      ${revelar && i === p.correta ? '<span class="selo">Resposta certa</span>' : ''}
    </div>`;
  }).join('');
}

function pararRelogio() {
  cancelAnimationFrame(ui.raf);
  ui.raf = null;
}

function rodarRelogio(p) {
  pararRelogio();
  const total = p.tempo * 1000;
  const barra = $('#perg-tempo');
  const quadro = () => {
    const resta = Math.max(0, p.fimPergunta - agora());
    const seg = Math.ceil(resta / 1000);
    barra.style.transform = `scaleX(${resta / total})`;
    if (seg !== ui.ultimoSegundo) {
      ui.ultimoSegundo = seg;
      $('#perg-seg').textContent = seg;
      $('#perg-relogio').classList.toggle('urgente', seg <= 5);
      if (seg <= 5 && seg > 0) {
        som.tique(true);
        if (gsap && !reduzido) gsap.fromTo('#perg-seg', { scale: 1.25 }, { scale: 1, duration: 0.4, ease: 'power2.out', transformOrigin: 'right center' });
      }
    }
    if (resta > 0) ui.raf = requestAnimationFrame(quadro);
  };
  quadro();
}

function rotuloAvancar(e) {
  if (e.fase !== 'revelacao') return 'Pular';
  const ultima = e.numero >= e.quiz.total;
  if (ultima) return 'Ver o pódio';
  return e.config.rankingAposPergunta ? 'Ver o placar' : 'Próxima pergunta';
}

function telaPergunta(e) {
  const p = e.pergunta;
  const chave = `${e.fase}-${p.numero}`;
  const nova = ui.chaveTela !== chave;
  if (nova) {
    ui.chaveTela = chave;
    const tela = mostrar('tela-pergunta');
    const revelar = e.fase === 'revelacao';
    tela.classList.toggle('revelacao', revelar);
    $('#perg-texto').innerHTML = rico(p.pergunta);
    $('#perg-num').textContent = `Pergunta ${p.numero} de ${e.quiz.total}`;
    $('#perg-pin').textContent = e.pin;
    $('#perg-opcoes').innerHTML = opcoesHtml(p, revelar);
    $('#perg-midia').innerHTML = midiaHtml(p, e.quiz.linguagem, revelar);
    tela.classList.toggle('sem-codigo', !p.codigo && !p.imagem && !revelar);
    $('#perg-meio').classList.toggle('sem-midia', !p.codigo && !p.imagem);
    $('#perg-grafico').hidden = !revelar;
    $('#perg-explicacao').hidden = !revelar;
    const avancar = $('#perg-avancar');
    avancar.textContent = rotuloAvancar(e);
    avancar.className = revelar ? 'botao magenta' : 'botao';

    if (e.fase === 'pergunta') {
      ui.ultimoSegundo = null;
      rodarRelogio(p);
      if (e.config.som) som.tocarMusica('pergunta');
      if (gsap && !reduzido) {
        gsap.from('#perg-opcoes .opcao', { y: 60, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.07 });
        gsap.from('#perg-opcoes .glifo', { x: -60, duration: 0.9, ease: 'expo.out', stagger: 0.07 });
        gsap.from('#perg-midia > *', { y: 30, opacity: 0, duration: 0.6, ease: 'power3.out', delay: 0.1 });
      }
    }
    if (revelar) {
      som.pararMusica();
      som.revelar();
      const max = Math.max(1, ...p.distribuicao);
      $('#perg-grafico').innerHTML = p.distribuicao.map((n, i) => `
        <div class="barra ${i === p.correta ? '' : 'errada'}" style="--cor:${OPCOES[i].cor}">
          <span class="n">${n}</span>
          <span class="trilho"><span class="coluna" style="height:${(n / max) * 100}%"></span></span>
          <span class="g">${OPCOES[i].glifo}</span>
        </div>`).join('');
      const total = e.jogadores.length;
      const pct = total ? Math.round((100 * p.acertos) / total) : 0;
      $('#perg-explicacao').innerHTML = `<b>${p.acertos} de ${total} acertaram (${pct}%).</b> ${rico(p.explicacao || '')}`;
      if (gsap && !reduzido) {
        gsap.from('#perg-grafico .coluna', { scaleY: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.15 });
        gsap.from('#perg-grafico .n', { opacity: 0, y: 12, duration: 0.4, stagger: 0.08, delay: 0.5 });
        gsap.fromTo('#perg-opcoes .certa', { scale: 0.96 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
        gsap.from('#perg-explicacao', { y: 40, opacity: 0, duration: 0.6, ease: 'power3.out', delay: 0.35 });
      }
    }
  }
  if (e.fase === 'pergunta') {
    const n = e.jogadores.length;
    $('#perg-respostas').textContent = `${p.respondidas} de ${n} ${n === 1 ? 'respondeu' : 'responderam'}`;
  } else {
    $('#perg-respostas').textContent = '';
  }
}

$('#perg-avancar').onclick = () => socket.emit('prof:avancar');
$('#perg-encerrar').onclick = () => {
  if (confirm('Encerrar o jogo agora e ir para o pódio? As perguntas já feitas contam no relatório.')) socket.emit('prof:encerrar');
};

// ------------------------------------------------------------------ placar: corrida de barras
// As linhas começam na ordem e na pontuação antigas; as barras crescem até a pontuação nova
// e, ao mesmo tempo, as linhas trocam de lugar (Flip).
function linhaHtml(j, pos) {
  return `<li class="linha" data-flip-id="${j.id}" data-id="${j.id}">
    <span class="pos">${pos}</span>
    <div class="corpo">
      <div class="quem">${simbolo(j.avatar, Math.round(innerWidth * 0.028))}<span class="nome">${esc(j.apelido)}</span>
        ${j.sequencia >= 2 ? `<span class="seq">${j.sequencia} seguidas</span>` : ''}</div>
      <div class="pista"><span class="barra-pts"></span><span class="pts">0</span>
        <span class="ganho">${j.ganho ? `+${j.ganho.toLocaleString('pt-BR')}` : ''}</span></div>
    </div>
  </li>`;
}

function telaPlacar(e) {
  const chave = `placar-${e.numero}`;
  if (ui.chaveTela === chave) return;
  ui.chaveTela = chave;
  mostrar('tela-placar');
  $('#placar-sub').textContent = `depois da pergunta ${e.numero} de ${e.quiz.total}`;
  const lista = $('#placar-lista');
  const top = e.ranking.slice(0, 5);
  const maximo = Math.max(1, ...top.map((j) => j.pontos));
  const largura = (pts) => `${Math.max(0, (pts / maximo) * 72)}%`;
  const antigo = (j) => j.pontos - (j.ganho || 0);
  const temAnterior = top.some((j) => j.anterior);
  const animar = gsap && !reduzido;

  const pintar = (li, j, pos) => {
    li.style.setProperty('--cor', CORES_BARRA[pos - 1] || 'var(--azul)');
    li.classList.toggle('primeira', pos === 1);
  };

  // ordem antiga (ou a nova, na primeira pergunta)
  const antes = temAnterior
    ? [...top].sort((a, b) => (a.anterior || 99) - (b.anterior || 99) || a.posicao - b.posicao)
    : top;
  lista.innerHTML = antes.map((j) => linhaHtml(j, temAnterior ? (j.anterior && j.anterior <= 5 ? j.anterior : '') : j.posicao)).join('');
  antes.forEach((j, i) => {
    const li = $(`.linha[data-id="${j.id}"]`, lista);
    pintar(li, j, temAnterior ? (j.anterior || 6) : j.posicao);
    $('.barra-pts', li).style.width = largura(temAnterior ? antigo(j) : 0);
    $('.pts', li).textContent = (temAnterior ? antigo(j) : 0).toLocaleString('pt-BR');
    if (temAnterior && (!j.anterior || j.anterior > 5)) li.style.opacity = '0';
    if (!animar) { $('.barra-pts', li).style.width = largura(j.pontos); $('.pts', li).textContent = j.pontos.toLocaleString('pt-BR'); }
  });
  if (!animar) {
    top.forEach((j) => { const li = $(`.linha[data-id="${j.id}"]`, lista); $('.pos', li).textContent = j.posicao; pintar(li, j, j.posicao); lista.appendChild(li); li.style.opacity = '1'; });
    return;
  }
  gsap.from('.linha', { x: -50, duration: 0.55, ease: 'power3.out', stagger: 0.06 });
  gsap.from('.linha .ganho', { opacity: 0, x: -10, duration: 0.4, delay: 0.5, stagger: 0.05 });

  setTimeout(() => {
    if (ui.chaveTela !== chave) return;
    const estado = Flip ? Flip.getState('.linha') : null;
    top.forEach((j) => {
      const li = $(`.linha[data-id="${j.id}"]`, lista);
      $('.pos', li).textContent = j.posicao;
      pintar(li, j, j.posicao);
      gsap.set(li, { opacity: 1 });
      lista.appendChild(li);
      gsap.to($('.barra-pts', li), { width: largura(j.pontos), duration: 1.3, ease: 'power3.inOut' });
      contar($('.pts', li), temAnterior ? antigo(j) : 0, j.pontos, 1.3);
    });
    if (estado && temAnterior) Flip.from(estado, { duration: 1.1, ease: 'power3.inOut', stagger: 0.04, fade: true });
    som.revelar();
  }, temAnterior ? 900 : 450);
}

$('#placar-avancar').onclick = () => socket.emit('prof:avancar');

// ------------------------------------------------------------------ pódio
async function telaPodio(e) {
  if (ui.chaveTela === `podio-${e.pin}`) return;
  ui.chaveTela = `podio-${e.pin}`;
  som.pararMusica();
  mostrar('tela-podio');
  const top = e.ranking.slice(0, 3);
  const jaVisto = ui.podioPin === e.pin;
  ui.podioPin = e.pin;
  $('#podio-titulo').textContent = top.length ? 'Quem subiu ao pódio' : 'Fim de jogo';
  const rotulos = $('#podio-rotulos');
  rotulos.innerHTML = top.map((j) => `
    <div class="rotulo" data-pos="${j.posicao}">
      ${simbolo(j.avatar, Math.round(innerWidth * (j.posicao === 1 ? 0.05 : 0.038)))}
      <span class="nome">${esc(j.apelido)}</span>
      <span class="pts">${j.pontos.toLocaleString('pt-BR')} pontos</span>
    </div>`).join('');
  // O rótulo fica centrado em cima do ponto que o 3D calcula (o topo do bloco).
  if (gsap) gsap.set($$('.rotulo', rotulos), { xPercent: -50, yPercent: -100 });
  else $$('.rotulo', rotulos).forEach((el) => { el.style.transform = 'translate(-50%, -100%)'; });
  $('#podio-acoes').style.opacity = jaVisto ? '1' : '0';

  const cena = await cena3d('tela-podio', async () => {
    const { cenaPodio } = await import('./palco3d.js');
    return cenaPodio($('#podio-3d'), top.length);
  });
  const plano = $('#podio-plano');
  plano.hidden = !!cena;
  if (cena) {
    cena.aoPosicionar((pontos) => {
      for (const p of pontos) {
        const el = $(`.rotulo[data-pos="${p.pos}"]`, rotulos);
        if (el) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
      }
    });
  } else {
    // Sem WebGL: degraus planos, com os rótulos em cima de cada um.
    const ordem = [2, 1, 3].filter((pos) => pos <= top.length);
    const alturas = { 1: '62%', 2: '44%', 3: '30%' };
    const cores = { 1: 'var(--sol)', 2: 'var(--azul)', 3: 'var(--rosa)' };
    plano.innerHTML = ordem.map((pos) => `<div class="degrau" data-pos="${pos}" style="height:${alturas[pos]};background:${cores[pos]};color:var(--tinta)">${pos}</div>`).join('');
    requestAnimationFrame(() => {
      for (const d of $$('.degrau', plano)) {
        const r = d.getBoundingClientRect();
        const base = plano.getBoundingClientRect();
        const el = $(`.rotulo[data-pos="${d.dataset.pos}"]`, rotulos);
        if (el) { el.style.left = `${r.left - base.left + r.width / 2}px`; el.style.top = `${r.top - base.top}px`; }
      }
    });
  }

  const subir = (pos) => {
    if (cena) cena.subir(pos);
    else if (gsap && !reduzido) gsap.from(`.degrau[data-pos="${pos}"]`, { scaleY: 0, duration: 0.9, ease: 'back.out(1.5)' });
    const el = $(`.rotulo[data-pos="${pos}"]`, rotulos);
    if (el && gsap) gsap.fromTo(el, { opacity: 0, y: 30 }, { opacity: 1, y: 0, xPercent: -50, yPercent: -100, duration: 0.6, ease: 'power3.out', delay: 0.5 });
    else if (el) el.style.opacity = '1';
  };

  if (jaVisto || reduzido || !gsap) {
    if (cena) cena.tudo();
    $$('.rotulo', rotulos).forEach((el) => { el.style.opacity = '1'; });
    $('#podio-acoes').style.opacity = '1';
    return;
  }
  const tl = gsap.timeline();
  tl.from('#podio-titulo', { y: 60, opacity: 0, duration: 0.7, ease: 'power3.out' })
    .call(() => { subir(3); som.revelar(); }, null, 0.9)
    .call(() => { subir(2); som.revelar(); }, null, 2.6)
    .call(() => som.rufar(2.4), null, 3.8)
    .call(() => { subir(1); som.fanfarra(); confete(7000, 1.3); }, null, 6.3)
    .to('#podio-acoes', { opacity: 1, duration: 0.6 }, 7.8);
}

$('#btn-relatorio').onclick = () => telaRelatorio(ui.estado);
$('#btn-voltar-podio').onclick = () => { ui.chaveTela = null; telaPodio(ui.estado); };
function novaPartida() {
  sessionStorage.removeItem('bytequiz:sessao');
  ui.chaveTela = null;
  ui.estado = null;
  ui.config = { ...ui.config, ...JSON.parse(localStorage.getItem('bytequiz:config') || '{}') };
  telaInicio();
}
$('#btn-nova').onclick = novaPartida;
$('#btn-trocar').onclick = () => { som.pararMusica(); novaPartida(); };
$('#btn-nova-2').onclick = novaPartida;

// ------------------------------------------------------------------ relatório
function telaRelatorio(e) {
  ui.chaveTela = 'relatorio';
  mostrar('tela-relatorio');
  const r = e.relatorio;
  $('#btn-csv').href = `/api/relatorio/${e.pin}.csv?chave=${encodeURIComponent(ui.chave)}`;
  const media = r.jogadores.length ? Math.round(r.jogadores.reduce((s, j) => s + j.percentual, 0) / r.jogadores.length) : 0;
  const dificil = [...r.perguntas].sort((a, b) => a.percentual - b.percentual)[0];
  const cor = (p) => (p >= 70 ? 'var(--menta)' : p >= 40 ? 'var(--sol)' : 'var(--rosa)');
  $('#relatorio').innerHTML = `
    <section>
      <h1 data-entra>${esc(semRevisao(r.quiz))}: como a turma foi</h1>
      <div class="resumo" data-entra>
        <div><b>${media}%</b><span>de acertos, em média</span></div>
        <div><b>${r.jogadores.length}</b><span>estudantes jogaram</span></div>
        <div><b>${r.perguntas.length}</b><span>perguntas feitas</span></div>
        <div><b>${dificil ? `${dificil.percentual}%` : '–'}</b><span>${dificil ? `acertaram a pergunta ${dificil.numero}, a mais difícil` : 'sem perguntas feitas'}</span></div>
      </div>
    </section>
    <section data-entra>
      <h2>Estudantes</h2>
      <div class="tabela-rolagem"><table>
        <thead><tr><th class="num">Posição</th><th>Nome</th><th>Apelido</th><th class="num">Pontos</th><th class="num">Acertos</th><th>Aproveitamento</th><th class="num">Tempo médio</th><th class="num">Maior sequência</th></tr></thead>
        <tbody>${r.jogadores.map((j) => `<tr>
          <td class="num">${j.posicao}º</td><td>${esc(j.nome || '–')}</td>
          <td><span class="com-simbolo">${simbolo(j.avatar, 26)}${esc(j.apelido)}</span></td>
          <td class="num">${j.pontos.toLocaleString('pt-BR')}</td><td class="num">${j.acertos} de ${j.perguntas}</td>
          <td><span class="medidor"><i style="width:${j.percentual}%;background:${cor(j.percentual)}"></i></span>${j.percentual}%</td>
          <td class="num">${j.tempoMedio === null ? '–' : `${String(j.tempoMedio).replace('.', ',')} s`}</td>
          <td class="num">${j.maiorSequencia}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section data-entra>
      <h2>Perguntas</h2>
      <div class="tabela-rolagem"><table>
        <thead><tr><th class="num">Nº</th><th>Pergunta</th><th>Resposta certa</th><th>Acertos</th></tr></thead>
        <tbody>${r.perguntas.map((p) => `<tr class="${p.percentual < 40 ? 'dificil' : ''}"><td class="num">${p.numero}</td>
          <td>${rico(p.pergunta)}</td><td><code>${esc(p.alternativaCorreta)}</code></td>
          <td><span class="medidor"><i style="width:${p.percentual}%;background:${cor(p.percentual)}"></i></span>${p.acertos} de ${p.jogadores} (${p.percentual}%)</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="rel-nota">A planilha também fica salva na pasta <code>relatorios/</code> do projeto, atualizada a cada pergunta.</p>
    </section>`;
  entrada($('#relatorio'));
}

// ------------------------------------------------------------------ roteamento por fase
function aplicar(e) {
  sincronizar(e.agora);
  ui.estado = e;
  som.ativo = e.config.som;
  $$('[data-acao="som"]').forEach((b) => { b.textContent = som.ativo ? 'Som ligado' : 'Som desligado'; });
  if (e.fase === 'lobby') return telaSala(e);
  if (e.fase === 'leitura') return telaLeitura(e);
  if (e.fase === 'pergunta' || e.fase === 'revelacao') return telaPergunta(e);
  if (e.fase === 'ranking') return telaPlacar(e);
  if (e.fase === 'podio') return ui.chaveTela === 'relatorio' ? null : telaPodio(e);
  if (e.fase === 'encerrado') return telaRelatorio(e);
}

// ------------------------------------------------------------------ atalhos
function alternarSom() {
  if (!ui.estado) return;
  const ligado = !ui.estado.config.som;
  socket.emit('prof:config', { som: ligado });
  if (!ligado) som.pararMusica();
  else if (ui.estado.fase === 'lobby') som.tocarMusica('sala');
}
const telaCheia = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-acao]');
  if (!b) return;
  if (b.dataset.acao === 'som') alternarSom();
  if (b.dataset.acao === 'tela') telaCheia();
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, dialog')) return;
  const e = ui.estado;
  if (ev.key === 'f' || ev.key === 'F') telaCheia();
  if (ev.key === 'm' || ev.key === 'M') alternarSom();
  if (!e) return;
  if ([' ', 'Enter', 'ArrowRight'].includes(ev.key)) {
    ev.preventDefault();
    if (e.fase === 'lobby' && e.jogadores.length) { som.inicio(); socket.emit('prof:iniciar'); }
    else if (['leitura', 'pergunta', 'revelacao', 'ranking'].includes(e.fase)) socket.emit('prof:avancar');
  }
});
document.addEventListener('pointerdown', () => som.garantir(), { once: true });

// ------------------------------------------------------------------ conexão
function conectar() {
  socket = io({ auth: { chave: ui.chave } });
  socket.on('enderecos', (end) => {
    ui.enderecos = end;
    if (ui.estado && ui.estado.fase === 'lobby') atualizarQr(ui.estado.pin);
  });
  socket.on('estado', aplicar);
  socket.on('connect', () => {
    $$('.faixa-conexao').forEach((f) => f.remove());
    const sessao = JSON.parse(sessionStorage.getItem('bytequiz:sessao') || 'null');
    if (!sessao) { if (!ui.estado) telaInicio(); return; }
    socket.emit('prof:retomar', sessao, (r) => {
      if (r.erro) { sessionStorage.removeItem('bytequiz:sessao'); telaInicio(); }
    });
  });
  socket.on('disconnect', () => {
    if ($('.faixa-conexao')) return;
    const f = document.createElement('div');
    f.className = 'faixa-conexao';
    f.textContent = 'Sem conexão com o servidor. Tentando voltar; a partida continua salva.';
    document.body.appendChild(f);
  });
}

async function iniciar() {
  const params = new URLSearchParams(location.search);
  if (params.get('chave')) {
    localStorage.setItem('bytequiz:chave', params.get('chave'));
    history.replaceState(null, '', '/professor');
  }
  ui.chave = localStorage.getItem('bytequiz:chave');
  try {
    if (!ui.chave) throw new Error('chave');
    const info = await api('/api/info');
    ui.enderecos = { publico: info.publico, local: info.local };
    ui.config = { ...info.configPadrao, ...JSON.parse(localStorage.getItem('bytequiz:config') || '{}') };
    ui.quizzes = await api('/api/quizzes');
  } catch (erro) {
    if (erro.message === 'chave') {
      mostrar('tela-chave');
      $('#form-chave').onsubmit = (ev) => {
        ev.preventDefault();
        localStorage.setItem('bytequiz:chave', $('#chave').value.trim());
        location.reload();
      };
      return;
    }
    aviso('Servidor indisponível.', 'erro');
    return;
  }
  conectar();
}

iniciar();
