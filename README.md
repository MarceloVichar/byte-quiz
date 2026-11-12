# ByteQuiz

Quiz ao vivo para a sala de aula de programação. O telão (projetor) mostra a pergunta e cada estudante
responde pelo celular, como num game show: PIN, QR code, contagem regressiva, placar animado e pódio em 3D.

Feito para as aulas de Fundamentos de Programação, Banco de Dados e Bancos NoSQL da UTFPR Guarapuava,
com turmas de cerca de 40 estudantes.

> Os quizzes das disciplinas não estão neste repositório, porque trazem o gabarito.
> O repositório vem com um quiz de exemplo (`quizzes/exemplo-python.json`).

## O que ele faz

- **Telão do professor:** escolha do quiz, sala com PIN e QR code, pergunta com código colorido, revelação com
  gráfico das respostas e explicação, placar em corrida de barras, pódio em 3D e relatório da turma.
- **Celular do estudante:** entra pelo QR code, escolhe apelido (ou sorteia um com tema de tecnologia) e um símbolo,
  responde com um toque e vê na hora se acertou, quantos pontos ganhou e em que lugar está.
- **Pontuação:** quanto mais rápido, mais pontos (até 1000 por pergunta), com bônus por acertos seguidos.
- **Relatório:** pontos, acertos e tempo de cada estudante e o aproveitamento de cada pergunta, com planilha CSV.
- **Não perde a colocação:** a partida é salva a cada resposta. Se a internet cair, o celular reconecta sozinho.
  Se o estudante trocar de aparelho, basta entrar de novo com o mesmo nome completo: os pontos voltam.
  Se o servidor reiniciar, a sala volta com todos os jogadores e pontos.
- **Configurações da partida:** pedir nome completo, apelidos livres ou só sorteados, entrar depois do início,
  pergunta no celular, tempo de leitura, tempo de resposta (½× a 2×), embaralhar perguntas e alternativas,
  pontos normal, dobro ou sem pontos, bônus por sequência, placar após cada pergunta, avanço automático e som.

## Como rodar no seu computador

Requisitos: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
npm run local
```

O terminal mostra o endereço da tela do professor, já com a chave (`http://localhost:3000/professor?chave=...`).
Os celulares entram pelo endereço da rede local que também aparece no terminal (mesmo Wi-Fi).

Com o [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
instalado, `npm start` abre também um link público `https://….trycloudflare.com`, sem precisar de conta.

### Testar com estudantes simulados

```bash
node scripts/bots.js <PIN> 40
```

Quarenta "estudantes" entram na sala e respondem com tempos aleatórios.

## Criar um quiz

Um quiz é um arquivo JSON em `quizzes/`:

```json
{
  "id": "meu-quiz",
  "titulo": "Revisão: Variáveis",
  "disciplina": "Fundamentos de Programação",
  "descricao": "Atribuição e operadores.",
  "linguagem": "python",
  "perguntas": [
    {
      "pergunta": "Observe o código. O que aparece na tela?",
      "codigo": "x = 10\nx += 5\nprint(x)",
      "alternativas": ["105", "15", "10", "Erro"],
      "correta": 1,
      "tempo": 20,
      "explicacao": "x += 5 é o mesmo que x = x + 5."
    }
  ]
}
```

- `correta` é a posição da alternativa certa, começando em 0.
- `codigo` (opcional) aparece com cores no telão e no celular; `imagem` (opcional) é o caminho de uma imagem em `public/`.
- `tempo` é em segundos. `explicacao` aparece no telão depois da resposta.

O script `scripts/importar_questoes.py` converte os bancos de questões das disciplinas (arquivos `questoes.py`,
em que cada resposta é validada executando o código) para esse formato.

## Publicar na nuvem

O servidor precisa ficar ligado durante a aula (a conexão em tempo real usa Socket.IO), então serviços só de
funções, como a Vercel, não servem para ele. Uma opção que cabe na faixa gratuita é o Google Cloud Run:

```bash
gcloud run deploy bytequiz --source . --region southamerica-east1 --allow-unauthenticated \
  --max-instances 1 --session-affinity --timeout 3600 \
  --set-env-vars "BUCKET=<seu-bucket>,CHAVE_PROFESSOR=<sua-chave>,URL_PUBLICA=<link-que-os-alunos-usam>"
```

| Variável | Para quê |
| --- | --- |
| `CHAVE_PROFESSOR` | Chave que libera a tela do professor. Sem ela, o servidor gera uma em `chave_professor.txt`. |
| `BUCKET` | Bucket do Cloud Storage onde salas e relatórios ficam guardados (o disco do Cloud Run é apagado ao reiniciar). |
| `URL_PUBLICA` | Endereço mostrado no telão e no QR code. |

`--max-instances 1` é obrigatório: a partida fica na memória de um único servidor.
A pasta `atalho/` tem um redirecionamento para a Vercel, usado para ter um link curto e fácil de digitar.

## Como é feito

| Parte | Arquivos |
| --- | --- |
| Servidor (Express + Socket.IO) | `server.js` |
| Regras do jogo: fases, tempo, pontos, ranking, relatório | `lib/jogo.js` |
| Apelidos com tema de tecnologia e filtro de palavras | `lib/apelidos.js` |
| Onde as salas e relatórios ficam (disco ou Cloud Storage) | `lib/armazem.js` |
| Link público pelo cloudflared | `lib/tunel.js` |
| Telão do professor | `public/professor.html`, `public/js/telao.js`, `public/css/telao.css` |
| Celular do estudante | `public/jogar.html`, `public/js/celular.js`, `public/css/celular.css` |
| Visual, sons, realce de código, confete | `public/css/nucleo.css`, `public/js/nucleo.js` |
| Cenas 3D (Three.js) | `public/js/palco3d.js` |

As animações usam [GSAP](https://gsap.com) e as cenas 3D usam [Three.js](https://threejs.org), servidos pelo próprio
servidor (a aula não depende de CDN). Os sons são sintetizados no navegador, sem arquivos de áudio.

## Quer contribuir?

Achou um erro ou tem uma ideia? Abra uma *issue*. Para mudar o código, faça um *fork* e abra um *pull request*
para a branch `main`: só o mantenedor envia direto para ela, e todo pull request passa por revisão.

## Licença

[MIT](LICENSE): pode usar, copiar e adaptar, mantendo o aviso de autoria.
