#!/usr/bin/env python3
"""Converte os questoes.py dos Kahoots das disciplinas em quizzes do ByteQuiz.

Cada questoes.py continua sendo a fonte única (lá cada resposta é validada pela execução real).
Este script só lê a lista QUESTOES e grava quizzes/<id>.json. As imagens geradas pelos
questoes.py são copiadas para public/media/<id>/.

Nas perguntas de Python o código vai como texto (o jogo desenha com cores, nítido no projetor).
Nas de banco de dados vai a imagem, que também mostra as tabelas usadas pela consulta.

    python3 scripts/importar_questoes.py
"""
import json
import shutil
import sys
import types
from pathlib import Path

AQUI = Path(__file__).resolve().parents[1]
UTFPR = AQUI.parent

FONTES = [
    dict(id="fundamentos-listas-matrizes", pasta="fundamentos/kahoot-revisao-listas-matrizes",
         titulo="Revisão: Listas e Matrizes em Python",
         disciplina="Fundamentos de Programação (PMT11E-MCT1)", codigo_como_texto=True,
         descricao="Índices, append, remove, pop, in, for, sum e len; matrizes, for dentro de for, montar e somar."),
    dict(id="fundamentos-selecao-repeticao", pasta="fundamentos/kahoot-revisao-repeticao",
         titulo="Revisão: Seleção e Repetição em Python",
         disciplina="Fundamentos de Programação (PMT11E-MCT1)", codigo_como_texto=True,
         descricao="if / elif / else, while, for com range, contadores, acumuladores, break e continue."),
    dict(id="banco-consultas-sql", pasta="banco/kahoot-revisao-consultas",
         titulo="Revisão: Consultas SQL",
         disciplina="Banco de Dados (TSI33D-TSI3)", codigo_como_texto=False,
         descricao="Do SELECT às subconsultas e funções escalares."),
    dict(id="nosql-redis-elastic", pasta="nosql/kahoot-revisao-redis-elastic",
         titulo="Revisão: Redis e ElasticSearch",
         disciplina="Bancos NoSQL (TSI34E-TSI4)", codigo_como_texto=False,
         descricao="Redis, ElasticSearch e integração entre bancos."),
]


def sem_dependencias():
    """Os questoes.py importam openpyxl e PIL só para gerar arquivos; aqui bastam stubs."""
    for nome in ["openpyxl", "openpyxl.styles", "PIL", "PIL.Image", "PIL.ImageDraw", "PIL.ImageFont"]:
        modulo = types.ModuleType(nome)
        modulo.__getattr__ = lambda attr: type(attr, (), {})
        sys.modules.setdefault(nome, modulo)


def carregar(pasta):
    caminho = UTFPR / pasta / "questoes.py"
    ns = {"__file__": str(caminho), "__name__": "questoes_importadas"}
    exec(compile(caminho.read_text(encoding="utf-8"), str(caminho), "exec"), ns)
    return ns["QUESTOES"]


def codigo_texto(q):
    texto = q.get("codigo_exibido") or q.get("codigo")
    return texto.strip("\n") if isinstance(texto, str) else None


def converter(fonte):
    questoes = carregar(fonte["pasta"])
    media = AQUI / "public" / "media" / fonte["id"]
    if media.exists():
        shutil.rmtree(media)
    perguntas = []
    for num, q in enumerate(questoes, 1):
        p = dict(
            pergunta=q["pergunta"],
            alternativas=list(q["alternativas"]),
            correta=q["correta"],
            tempo=q["tempo"],
            tipo=q.get("tipo", "pratica"),
            explicacao=q.get("explicacao", ""),
        )
        texto = codigo_texto(q)
        png = UTFPR / fonte["pasta"] / "imagens" / f"pergunta_{num:02d}.png"
        if fonte["codigo_como_texto"] and q.get("imagem") and texto:
            p["codigo"] = texto
        elif png.exists():
            media.mkdir(parents=True, exist_ok=True)
            shutil.copy(png, media / png.name)
            p["imagem"] = f"/media/{fonte['id']}/{png.name}"
        elif q.get("imagem") and texto:
            p["codigo"] = texto
        perguntas.append(p)
    quiz = dict(id=fonte["id"], ordem=FONTES.index(fonte), titulo=fonte["titulo"], disciplina=fonte["disciplina"],
                descricao=fonte["descricao"], linguagem="python" if fonte["codigo_como_texto"] else "sql",
                perguntas=perguntas)
    destino = AQUI / "quizzes" / f"{fonte['id']}.json"
    destino.write_text(json.dumps(quiz, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(perguntas)


if __name__ == "__main__":
    sem_dependencias()
    for fonte in FONTES:
        try:
            print(f"ok  {fonte['id']}: {converter(fonte)} perguntas")
        except Exception as erro:  # um quiz com problema não impede os outros
            print(f"ERRO {fonte['id']}: {erro}")
