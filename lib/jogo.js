// Regras de uma partida: fases, tempo, pontuação, ranking e relatório.
// O servidor (server.js) só traduz eventos do socket.io em chamadas a esta classe.

const crypto = require('crypto');
const { gerarApelido, ofensivo } = require('./apelidos');

const PADRAO = {
  mostrarNoCelular: true,        // pergunta, código e alternativas também no celular
  embaralharPerguntas: false,
  embaralharAlternativas: false,
  apelidos: 'livre',             // 'livre': digita ou sorteia | 'gerador': só apelido sorteado
  pedirNome: true,               // nome completo (só aparece no relatório)
  entrarDuranteJogo: true,
  bonusSequencia: true,
  pontuacao: 'padrao',           // 'padrao' (1000) | 'dobro' (2000) | 'sem' (0)
  rankingAposPergunta: true,
  avancoAutomatico: false,
  tempoLeitura: true,            // mostra a pergunta alguns segundos antes das alternativas
  multiplicadorTempo: 1,         // 0.5, 1, 1.5, 2
  som: true,
};

const LEITURA_MS = 4500;
const AUTO_REVELACAO_MS = 9000;
const AUTO_RANKING_MS = 6000;
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

function embaralhar(lista) {
  const v = [...lista];
  for (let i = v.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}

class Jogo {
  constructor({ pin, quiz, config, aoMudar, aoRelatorio }) {
    this.pin = pin;
    this.quiz = quiz;
    this.config = { ...PADRAO, ...(config || {}) };
    this.aoMudar = aoMudar;               // callback(jogo) para o servidor enviar o estado
    this.aoRelatorio = aoRelatorio;     // callback(nomeBase, csv, json): o servidor decide onde guardar
    this.tokenProfessor = crypto.randomBytes(16).toString('hex');
    this.fase = 'lobby';
    this.trancado = false;
    this.jogadores = new Map();           // id -> jogador
    this.banidos = new Set();             // tokens expulsos
    this.indice = -1;
    this.ordem = [];
    this.perguntaAtual = null;
    this.inicioPergunta = 0;
    this.fimPergunta = 0;
    this.timer = null;
    this.criadoEm = new Date();
    this.rankingAnterior = new Map();
    this.historico = [];                  // por pergunta: distribuição e acertos
  }

  // ---------------------------------------------------------------- jogadores

  apelidosEmUso() {
    return new Set([...this.jogadores.values()].map((j) => j.apelido.toLowerCase()));
  }

  sugerirApelido() {
    return gerarApelido(this.apelidosEmUso());
  }

  entrar({ apelido, nome, avatar }) {
    apelido = String(apelido || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    nome = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    // Quem caiu (internet, bateria, outro celular, link novo) volta com a mesma pontuação
    // entrando de novo com o mesmo nome completo ou o mesmo apelido.
    const recuperado = this.recuperar(apelido, nome);
    if (recuperado) return { jogador: recuperado, recuperado: true };

    if (this.trancado) return { erro: 'A sala está trancada pelo professor.' };
    if (this.fase === 'podio' || this.fase === 'encerrado') return { erro: 'Esta partida já terminou.' };
    if (this.fase !== 'lobby' && !this.config.entrarDuranteJogo) return { erro: 'A partida já começou.' };
    if (this.jogadores.size >= 120) return { erro: 'A sala está cheia.' };
    if (apelido.length < 2) return { erro: 'Escolha um apelido com pelo menos 2 letras.' };
    if (ofensivo(apelido)) return { erro: 'Esse apelido não é permitido. Escolha outro.' };
    if (this.config.pedirNome && nome.split(' ').filter(Boolean).length < 2) {
      return { erro: 'Digite seu nome completo (nome e sobrenome).' };
    }
    if (this.apelidosEmUso().has(apelido.toLowerCase())) return { erro: 'Esse apelido já está em uso.' };

    const jogador = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(16).toString('hex'),
      apelido,
      nome,
      avatar: /^[a-z0-9]{4,12}$/.test(String(avatar)) ? avatar : crypto.randomBytes(4).toString('hex'),
      pontos: 0,
      sequencia: 0,
      maiorSequencia: 0,
      respostas: [],                     // por índice de pergunta
      conectado: true,
      entrouEm: Date.now(),
      entrouNaPergunta: this.indice,
    };
    this.jogadores.set(jogador.id, jogador);
    this.mudou();
    return { jogador };
  }

  recuperar(apelido, nome) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const desconectados = [...this.jogadores.values()].filter((j) => !j.conectado);
    if (nome && norm(nome).split(' ').length >= 2) {
      const porNome = desconectados.find((j) => norm(j.nome) === norm(nome));
      if (porNome) return porNome;
    }
    const porApelido = desconectados.find((j) => norm(j.apelido) === norm(apelido));
    if (porApelido && (!this.config.pedirNome || !porApelido.nome || norm(porApelido.nome) === norm(nome))) return porApelido;
    return null;
  }

  reconectar(token) {
    if (this.banidos.has(token)) return null;
    return [...this.jogadores.values()].find((j) => j.token === token) || null;
  }

  expulsar(id) {
    const j = this.jogadores.get(id);
    if (!j) return null;
    this.banidos.add(j.token);
    this.jogadores.delete(id);
    this.mudou();
    return j;
  }

  // ---------------------------------------------------------------- fluxo

  iniciar() {
    if (this.fase !== 'lobby') return;
    const indices = this.quiz.perguntas.map((_, i) => i);
    this.ordem = this.config.embaralharPerguntas ? embaralhar(indices) : indices;
    this.indice = -1;
    this.proximaPergunta();
  }

  proximaPergunta() {
    clearTimeout(this.timer);
    this.indice += 1;
    if (this.indice >= this.ordem.length) return this.podio();

    const original = this.quiz.perguntas[this.ordem[this.indice]];
    const posicoes = original.alternativas.map((_, i) => i);
    const exibicao = this.config.embaralharAlternativas ? embaralhar(posicoes) : posicoes;
    const tempo = Math.max(5, Math.round(original.tempo * this.config.multiplicadorTempo));
    this.perguntaAtual = {
      ...original,
      numero: this.indice + 1,
      tempo,
      alternativas: exibicao.map((i) => original.alternativas[i]),
      correta: exibicao.indexOf(original.correta),
      original: this.ordem[this.indice],
      respostas: new Map(),                // id do jogador -> {escolha, ms}
    };

    if (this.config.tempoLeitura) {
      this.fase = 'leitura';
      this.fimLeitura = Date.now() + LEITURA_MS;
      this.mudou();
      this.timer = setTimeout(() => this.abrirRespostas(), LEITURA_MS);
    } else {
      this.abrirRespostas();
    }
  }

  abrirRespostas() {
    clearTimeout(this.timer);
    this.fase = 'pergunta';
    this.inicioPergunta = Date.now();
    this.fimPergunta = this.inicioPergunta + this.perguntaAtual.tempo * 1000;
    this.mudou();
    this.timer = setTimeout(() => this.revelar(), this.perguntaAtual.tempo * 1000 + 250);
  }

  responder(id, escolha) {
    const p = this.perguntaAtual;
    const j = this.jogadores.get(id);
    if (this.fase !== 'pergunta' || !p || !j) return false;
    if (p.respostas.has(id)) return false;
    if (!Number.isInteger(escolha) || escolha < 0 || escolha >= p.alternativas.length) return false;
    const ms = Math.min(Date.now() - this.inicioPergunta, p.tempo * 1000);
    p.respostas.set(id, { escolha, ms });

    const ativos = [...this.jogadores.values()].filter((x) => x.conectado);
    const todos = ativos.length > 0 && ativos.every((x) => p.respostas.has(x.id));
    if (todos) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.revelar(), 600);
    }
    this.mudou();
    return true;
  }

  base() {
    return { padrao: 1000, dobro: 2000, sem: 0 }[this.config.pontuacao] ?? 1000;
  }

  revelar() {
    if (this.fase !== 'pergunta') return;
    clearTimeout(this.timer);
    const p = this.perguntaAtual;
    this.rankingAnterior = this.indice === 0 ? new Map() : new Map(this.ranking().map((j, i) => [j.id, i + 1]));

    const distribuicao = p.alternativas.map(() => 0);
    let acertos = 0;
    for (const j of this.jogadores.values()) {
      const r = p.respostas.get(j.id);
      const registro = { pergunta: p.numero, escolha: null, certa: false, ms: null, pontos: 0, bonus: 0 };
      if (r) {
        distribuicao[r.escolha] += 1;
        registro.escolha = r.escolha;
        registro.ms = r.ms;
        registro.certa = r.escolha === p.correta;
      }
      if (registro.certa) {
        acertos += 1;
        j.sequencia += 1;
        j.maiorSequencia = Math.max(j.maiorSequencia, j.sequencia);
        const fracao = registro.ms / (p.tempo * 1000);
        registro.pontos = Math.round(this.base() * (1 - fracao / 2));
        if (this.config.bonusSequencia && this.base() > 0 && j.sequencia >= 2) {
          registro.bonus = Math.min((j.sequencia - 1) * 100, 500);
        }
      } else {
        j.sequencia = 0;
      }
      registro.alternativa = registro.escolha === null ? '' : p.alternativas[registro.escolha];
      j.pontos += registro.pontos + registro.bonus;
      j.respostas[this.indice] = registro;
    }
    this.historico[this.indice] = {
      numero: p.numero,
      pergunta: p.pergunta,
      alternativas: p.alternativas,
      correta: p.correta,
      distribuicao,
      acertos,
      responderam: p.respostas.size,
      jogadores: this.jogadores.size,
    };
    this.fase = 'revelacao';
    this.salvarRelatorio();
    this.mudou();
    if (this.config.avancoAutomatico) {
      this.timer = setTimeout(() => this.avancar(), AUTO_REVELACAO_MS);
    }
  }

  avancar() {
    clearTimeout(this.timer);
    const ultima = this.indice >= this.ordem.length - 1;
    if (this.fase === 'leitura') return this.abrirRespostas();
    if (this.fase === 'pergunta') return this.revelar();
    if (this.fase === 'revelacao') {
      if (this.config.rankingAposPergunta && !ultima) {
        this.fase = 'ranking';
        this.mudou();
        if (this.config.avancoAutomatico) this.timer = setTimeout(() => this.avancar(), AUTO_RANKING_MS);
        return;
      }
      return ultima ? this.podio() : this.proximaPergunta();
    }
    if (this.fase === 'ranking') return this.proximaPergunta();
  }

  podio() {
    clearTimeout(this.timer);
    this.fase = 'podio';
    this.perguntaAtual = null;
    this.salvarRelatorio();
    this.mudou();
  }

  encerrar() {
    clearTimeout(this.timer);
    this.fase = 'encerrado';
    this.salvarRelatorio();
    this.mudou();
  }

  mudou() {
    if (this.aoMudar) this.aoMudar(this);
  }

  // ---------------------------------------------------------------- ranking e estados

  tempoTotal(j) {
    return j.respostas.reduce((s, r) => s + (r && r.certa ? r.ms : 0), 0);
  }

  ranking() {
    return [...this.jogadores.values()].sort((a, b) => b.pontos - a.pontos || this.tempoTotal(a) - this.tempoTotal(b)
      || a.entrouEm - b.entrouEm);
  }

  publicoJogador(j) {
    return { id: j.id, apelido: j.apelido, avatar: j.avatar, pontos: j.pontos, conectado: j.conectado };
  }

  estadoProfessor() {
    const p = this.perguntaAtual;
    const ranking = this.ranking();
    const base = {
      pin: this.pin,
      fase: this.fase,
      trancado: this.trancado,
      config: this.config,
      quiz: { id: this.quiz.id, titulo: this.quiz.titulo, disciplina: this.quiz.disciplina,
        total: this.quiz.perguntas.length, linguagem: this.quiz.linguagem },
      jogadores: [...this.jogadores.values()].map((j) => this.publicoJogador(j)),
      numero: this.indice + 1,
      agora: Date.now(),
    };
    if (p && ['leitura', 'pergunta', 'revelacao'].includes(this.fase)) {
      base.pergunta = {
        numero: p.numero, pergunta: p.pergunta, alternativas: p.alternativas, tempo: p.tempo,
        codigo: p.codigo || null, imagem: p.imagem || null,
        respondidas: p.respostas.size,
        fimLeitura: this.fimLeitura, fimPergunta: this.fimPergunta,
      };
    }
    if (this.fase === 'revelacao') {
      const h = this.historico[this.indice];
      Object.assign(base.pergunta, { correta: p.correta, distribuicao: h.distribuicao, acertos: h.acertos,
        explicacao: p.explicacao });
    }
    if (['ranking', 'revelacao', 'podio', 'encerrado'].includes(this.fase)) {
      base.ranking = ranking.slice(0, 10).map((j, i) => ({
        ...this.publicoJogador(j), posicao: i + 1,
        anterior: this.rankingAnterior.get(j.id) || null,
        ganho: j.respostas[this.indice] ? j.respostas[this.indice].pontos + j.respostas[this.indice].bonus : 0,
        sequencia: j.sequencia,
      }));
    }
    if (['podio', 'encerrado'].includes(this.fase)) base.relatorio = this.relatorio();
    return base;
  }

  estadoJogador(j) {
    const p = this.perguntaAtual;
    const ranking = this.ranking();
    const posicao = ranking.findIndex((x) => x.id === j.id) + 1;
    const estado = {
      fase: this.fase, pin: this.pin, eu: this.publicoJogador(j), posicao, total: this.jogadores.size,
      totalPerguntas: this.quiz.perguntas.length, numero: this.indice + 1, som: this.config.som,
      quiz: this.quiz.titulo, agora: Date.now(),
    };
    if (p && ['leitura', 'pergunta'].includes(this.fase)) {
      const mostrar = this.config.mostrarNoCelular;
      estado.pergunta = {
        numero: p.numero, tempo: p.tempo, quantidade: p.alternativas.length,
        fimLeitura: this.fimLeitura, fimPergunta: this.fimPergunta,
        pergunta: mostrar ? p.pergunta : null,
        alternativas: mostrar ? p.alternativas : null,
        codigo: mostrar ? (p.codigo || null) : null,
        imagem: mostrar ? (p.imagem || null) : null,
        respondeu: p.respostas.has(j.id) ? p.respostas.get(j.id).escolha : null,
      };
    }
    if (this.fase === 'revelacao') {
      const r = j.respostas[this.indice];
      const acima = posicao > 1 ? ranking[posicao - 2] : null;
      estado.resultado = {
        respondeu: !!(r && r.escolha !== null), certa: !!(r && r.certa),
        entrouAgora: j.entrouNaPergunta >= this.indice && !(r && r.escolha !== null),
        pontos: r ? r.pontos : 0, bonus: r ? r.bonus : 0, sequencia: j.sequencia,
        correta: p.correta, alternativaCorreta: p.alternativas[p.correta],
        escolha: r ? r.escolha : null,
        acima: acima ? { apelido: acima.apelido, diferenca: acima.pontos - j.pontos } : null,
      };
    }
    if (['podio', 'encerrado'].includes(this.fase)) {
      estado.final = {
        acertos: j.respostas.filter((r) => r && r.certa).length,
        respondidas: j.respostas.filter((r) => r && r.escolha !== null).length,
        maiorSequencia: j.maiorSequencia,
      };
    }
    return estado;
  }

  // ---------------------------------------------------------------- salvar e restaurar
  // A partida inteira vai para o disco a cada mudança. Se o servidor cair ou o computador
  // reiniciar, a sala volta com a mesma pontuação e os mesmos jogadores.

  serializar() {
    const p = this.perguntaAtual;
    return {
      versao: 1, pin: this.pin, quiz: this.quiz, config: this.config, tokenProfessor: this.tokenProfessor,
      fase: this.fase, trancado: this.trancado, banidos: [...this.banidos], indice: this.indice, ordem: this.ordem,
      criadoEm: this.criadoEm.toISOString(), historico: this.historico,
      rankingAnterior: [...this.rankingAnterior],
      perguntaAtual: p ? { ...p, respostas: [...p.respostas] } : null,
      jogadores: [...this.jogadores.values()].map(({ socketId, ...j }) => ({ ...j, conectado: false })),
      salvoEm: Date.now(),
    };
  }

  static restaurar(dados, opcoes) {
    const jogo = new Jogo({ ...opcoes, pin: dados.pin, quiz: dados.quiz, config: dados.config });
    jogo.tokenProfessor = dados.tokenProfessor;
    jogo.trancado = dados.trancado;
    jogo.banidos = new Set(dados.banidos || []);
    jogo.indice = dados.indice;
    jogo.ordem = dados.ordem || [];
    jogo.criadoEm = new Date(dados.criadoEm);
    jogo.historico = dados.historico || [];
    jogo.rankingAnterior = new Map(dados.rankingAnterior || []);
    for (const j of dados.jogadores || []) jogo.jogadores.set(j.id, { ...j, conectado: false, socketId: null });
    if (dados.perguntaAtual) {
      jogo.perguntaAtual = { ...dados.perguntaAtual, respostas: new Map(dados.perguntaAtual.respostas || []) };
    }
    jogo.fase = dados.fase;
    // Uma pergunta interrompida não conta: a sala volta ao placar e, quando o professor avançar,
    // a mesma pergunta recomeça com o tempo cheio (dá tempo de todos reconectarem).
    if (['leitura', 'pergunta'].includes(dados.fase)) {
      jogo.indice -= 1;
      jogo.perguntaAtual = null;
      jogo.fase = jogo.indice < 0 ? 'lobby' : 'ranking';
    }
    if (jogo.fase === 'revelacao' && !jogo.perguntaAtual) jogo.fase = 'ranking';
    return jogo;
  }

  // ---------------------------------------------------------------- relatório

  relatorio() {
    const ranking = this.ranking();
    const feitas = this.historico.filter(Boolean);
    return {
      quiz: this.quiz.titulo,
      data: this.criadoEm.toISOString(),
      perguntas: feitas.map((h) => ({ ...h, alternativaCorreta: h.alternativas[h.correta],
        percentual: h.jogadores ? Math.round((100 * h.acertos) / h.jogadores) : 0 })),
      jogadores: ranking.map((j, i) => {
        const certas = j.respostas.filter((r) => r && r.certa);
        const respondidas = j.respostas.filter((r) => r && r.escolha !== null);
        return {
          posicao: i + 1, nome: j.nome, apelido: j.apelido, avatar: j.avatar, pontos: j.pontos,
          acertos: certas.length, respondidas: respondidas.length, perguntas: feitas.length,
          percentual: feitas.length ? Math.round((100 * certas.length) / feitas.length) : 0,
          tempoMedio: respondidas.length
            ? +(respondidas.reduce((s, r) => s + r.ms, 0) / respondidas.length / 1000).toFixed(1) : null,
          maiorSequencia: j.maiorSequencia,
          respostas: feitas.map((h, k) => j.respostas[k] || null),
        };
      }),
    };
  }

  csv() {
    const r = this.relatorio();
    const sep = ';';
    const cel = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const cab = ['Posição', 'Nome', 'Apelido', 'Pontos', 'Acertos', 'Respondidas', 'Perguntas', '% acertos',
      'Tempo médio (s)', 'Maior sequência'];
    r.perguntas.forEach((p) => cab.push(`P${p.numero} resposta`, `P${p.numero} certa`, `P${p.numero} tempo (s)`));
    const linhas = [cab.map(cel).join(sep)];
    for (const j of r.jogadores) {
      const l = [j.posicao, j.nome, j.apelido, j.pontos, j.acertos, j.respondidas, j.perguntas, j.percentual,
        j.tempoMedio === null ? '' : String(j.tempoMedio).replace('.', ','), j.maiorSequencia];
      j.respostas.forEach((resp) => {
        if (!resp || resp.escolha === null) l.push('', 'não respondeu', '');
        else l.push(`${LETRAS[resp.escolha]}) ${resp.alternativa}`, resp.certa ? 'sim' : 'não',
          (resp.ms / 1000).toFixed(1).replace('.', ','));
      });
      linhas.push(l.map(cel).join(sep));
    }
    linhas.push('');
    linhas.push(['Pergunta', 'Enunciado', 'Resposta correta', 'Acertos', 'Jogadores', '% acertos'].map(cel).join(sep));
    for (const p of r.perguntas) {
      linhas.push([p.numero, p.pergunta, p.alternativaCorreta, p.acertos, p.jogadores, p.percentual].map(cel).join(sep));
    }
    return '﻿' + linhas.join('\n');
  }

  nomeArquivo() {
    const d = this.criadoEm;
    const dois = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}h${dois(d.getMinutes())}`
      + `_${this.quiz.id}_${this.pin}`;
  }

  salvarRelatorio() {
    if (!this.aoRelatorio || this.jogadores.size === 0) return;
    this.aoRelatorio(this.nomeArquivo(), this.csv(), JSON.stringify(this.relatorio(), null, 2));
  }

}

module.exports = { Jogo, PADRAO };
