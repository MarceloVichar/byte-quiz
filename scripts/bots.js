// Simula estudantes para testar a sala antes da aula.
//   node scripts/bots.js <PIN> [quantidade=40] [url=http://localhost:3000]
// Cada robô entra com um apelido sorteado e responde em um tempo aleatório.

const { io } = require('socket.io-client');

const [pin, qtd = '40', url = 'http://localhost:3000'] = process.argv.slice(2);
if (!pin) {
  console.error('Uso: node scripts/bots.js <PIN> [quantidade] [url]');
  process.exit(1);
}

const NOMES = ['Ana', 'Bruno', 'Carla', 'Davi', 'Eva', 'Felipe', 'Gabi', 'Heitor', 'Iris', 'João', 'Kaio', 'Lara',
  'Miguel', 'Nina', 'Otávio', 'Paula', 'Rafa', 'Sofia', 'Tiago', 'Vitória'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Rocha'];
let conectados = 0;
let respostas = 0;

function robo(n) {
  const s = io(url, { transports: ['websocket'], reconnection: true });
  let respondida = null;
  const habilidade = Math.random(); // robôs melhores respondem mais rápido
  s.on('connect', () => {
    s.emit('jog:verificar', { pin }, (r) => {
      if (r.erro) return console.error(`robô ${n}: ${r.erro}`);
      const nome = `${NOMES[n % NOMES.length]} ${SOBRENOMES[n % SOBRENOMES.length]} ${n}`;
      s.emit('jog:entrar', { pin, apelido: r.sugestao, nome, avatar: Math.random().toString(36).slice(2, 8) }, (res) => {
        if (res.erro) console.error(`robô ${n}: ${res.erro}`);
        else conectados += 1;
      });
    });
  });
  s.on('estado', (e) => {
    if (e.fase === 'pergunta' && e.pergunta && respondida !== e.numero && Math.random() < 0.95) {
      respondida = e.numero;
      const resta = e.pergunta.fimPergunta - e.agora;
      const atraso = Math.min(resta - 300, 1200 + Math.random() * resta * (1 - habilidade * 0.7));
      setTimeout(() => {
        s.emit('jog:responder', { escolha: Math.floor(Math.random() * e.pergunta.quantidade) }, () => { respostas += 1; });
      }, Math.max(200, atraso));
    }
    if (e.fase === 'podio' && n === 0) {
      console.log(`Fim: ${conectados} robôs, ${respostas} respostas enviadas.`);
    }
  });
}

for (let i = 0; i < Number(qtd); i++) setTimeout(() => robo(i), i * 120);
setInterval(() => process.stdout.write(`\r${conectados} robôs na sala, ${respostas} respostas`), 1000);
