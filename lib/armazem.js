// Onde as salas e os relatórios ficam guardados.
// No computador: pastas dados/salas e relatorios/. Na nuvem (variável BUCKET): um bucket do
// Cloud Storage, porque o disco do Cloud Run é apagado quando o servidor reinicia.

const fs = require('fs');
const path = require('path');

function armazemLocal(raiz) {
  const caminho = (nome) => path.join(raiz, nome);
  return {
    tipo: 'disco',
    async gravar(nome, conteudo) {
      const destino = caminho(nome);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(`${destino}.tmp`, conteudo);
      fs.renameSync(`${destino}.tmp`, destino); // troca atômica: nunca fica um arquivo pela metade
    },
    async ler(nome) {
      return fs.readFileSync(caminho(nome));
    },
    async listar(prefixo) {
      const pasta = caminho(prefixo);
      if (!fs.existsSync(pasta)) return [];
      return fs.readdirSync(pasta).filter((f) => !f.endsWith('.tmp')).map((f) => {
        const st = fs.statSync(path.join(pasta, f));
        return { nome: `${prefixo}${f}`, atualizado: st.mtime.toISOString(), tamanho: st.size };
      });
    },
  };
}

function armazemNuvem(bucketNome) {
  const { Storage } = require('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketNome);
  return {
    tipo: `gs://${bucketNome}`,
    async gravar(nome, conteudo) {
      await bucket.file(nome).save(conteudo, { resumable: false, contentType: nome.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json' });
    },
    async ler(nome) {
      const [dados] = await bucket.file(nome).download();
      return dados;
    },
    async listar(prefixo) {
      const [arquivos] = await bucket.getFiles({ prefix: prefixo });
      return arquivos.map((f) => ({ nome: f.name, atualizado: f.metadata.updated, tamanho: Number(f.metadata.size) }));
    },
  };
}

function criarArmazem(raiz) {
  return process.env.BUCKET ? armazemNuvem(process.env.BUCKET) : armazemLocal(raiz);
}

module.exports = { criarArmazem };
