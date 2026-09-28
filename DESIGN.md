---
name: Hawks Cockpit
description: Painel operacional interno para os fundadores da Hawks.
colors:
  ink: "#17191a"
  paper: "#f6f5f1"
  surface: "#ffffff"
  line: "#dcded9"
  orange: "#e96525"
  orange-deep: "#af3f0a"
  green: "#216a4d"
  red: "#aa3434"
typography:
  headline:
    fontFamily: "Manrope, Arial, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, Arial, sans-serif"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "26px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
---

## Overview

Modo **Operate**. Bruno e Bryan precisam registrar atividade em segundos e ler a situação da Hawks de relance. A direção é uma mesa de operação: fundo claro, estrutura preta, laranja contido para ações e MRR, dados densos porém respirados. Evitar a estética de template SaaS.

## Colors

O preto ancora navegação e o resumo executivo. O papel off-white reduz o brilho em sessões longas. Laranja identifica a ação principal e o MRR. Verde e vermelho comunicam ganhos/entradas e perdas/saídas, sempre acompanhados por texto.

## Typography

Manrope dá hierarquia a títulos e números. DM Sans sustenta rótulos, tabelas e formulários. Valores monetários e contagens usam algarismos tabulares quando comparados em coluna.

## Layout

Desktop: navegação lateral permanente, faixa de quatro métricas e duas colunas de conteúdo. Mobile: cabeçalho compacto, navegação recolhida, métricas em duas colunas, registros em cartões de leitura e ações com alvo de toque adequado. Ações de salvamento ficam visíveis no rodapé do formulário.

## Elevation & Depth

O produto é majoritariamente plano; bordas e superfícies fazem a separação. Apenas a gaveta e o aviso temporário recebem sombra moderada.

## Shapes

Raios de 6 a 10 px. Sem cápsulas ou cartões aninhados decorativos.

## Components

Tabelas priorizam empresa, estágio, próxima ação e MRR; ações aparecem na mesma linha no desktop e no próprio registro no mobile. Formulários em gaveta mantêm contexto e oferecem cancelamento claro. Estados vazios indicam a primeira ação útil.

## Do's and Don'ts

Fazer: destacar números com contexto temporal, explicar ausência de dados, preservar rapidez de cadastro, verificar desktop e mobile em navegador real. Evitar: gráficos decorativos, excesso de cards, dados fictícios em produção, vazios sem orientação e métricas que confundam MRR com caixa.
