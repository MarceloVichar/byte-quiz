#!/bin/zsh
# Dois cliques: sobe o ByteQuiz com link público e abre a tela do professor.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
CHAVE=$(cat chave_professor.txt 2>/dev/null)
( sleep 2; open "http://localhost:3000/professor${CHAVE:+?chave=$CHAVE}" ) &
exec node server.js
