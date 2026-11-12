// Abre um link público (https://xxxx.trycloudflare.com) para o servidor local com o cloudflared.
// Não precisa de conta: é um "quick tunnel". O endereço muda a cada vez que o servidor sobe.

const { spawn } = require('child_process');
const os = require('os');

function ipLocal() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const r of lista || []) {
      if (r.family === 'IPv4' && !r.internal) return r.address;
    }
  }
  return 'localhost';
}

// Abre o túnel e, se ele cair (internet da sala instável), abre de novo sozinho.
// Um túnel novo pode ter outro endereço: aoConectar avisa a tela do professor, que troca o QR.
function abrirTunel(porta, aoConectar) {
  let processo = null;
  let encerrando = false;
  let tentativas = 0;

  const iniciar = () => {
    let encontrado = false;
    try {
      processo = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${porta}`]);
    } catch (erro) {
      console.error('cloudflared não encontrado:', erro.message);
      return;
    }
    const procurar = (dados) => {
      const m = String(dados).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !encontrado) {
        encontrado = true;
        tentativas = 0;
        aoConectar(m[0]);
      }
    };
    processo.stdout.on('data', procurar);
    processo.stderr.on('data', procurar);
    processo.on('error', (erro) => console.error('Falha no cloudflared:', erro.message));
    processo.on('exit', (codigo) => {
      if (encerrando) return;
      tentativas += 1;
      const espera = Math.min(30, 2 * tentativas);
      console.error(`  Link público caiu (código ${codigo}). Reabrindo em ${espera} s...`);
      aoConectar(null);
      setTimeout(iniciar, espera * 1000);
    });
  };
  iniciar();

  const fechar = () => { encerrando = true; try { processo && processo.kill(); } catch (_) { /* já encerrado */ } };
  process.on('exit', fechar);
  process.on('SIGINT', () => { fechar(); process.exit(0); });
  process.on('SIGTERM', () => { fechar(); process.exit(0); });
}

module.exports = { abrirTunel, ipLocal };
