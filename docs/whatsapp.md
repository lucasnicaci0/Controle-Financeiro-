# Agente de WhatsApp — PREPARAÇÃO

Canal oficial: **WhatsApp Business Platform (Cloud API da Meta)**. Não use bibliotecas que automatizam o WhatsApp Web (risco de banimento e violação dos termos).

## Pré-requisitos (a cargo do dono do produto)
- Conta Meta Business verificada e um número dedicado ao Rumo.
- Token permanente e ID do número. Guardar em **Propriedades do script**: `WHATSAPP_TOKEN`, `WHATSAPP_NUMERO_ID`, `WHATSAPP_VERIFY_TOKEN`. Nunca em `config.js`.
- Webhook HTTPS. O Apps Script publica um endereço (`/exec`) que pode receber o webhook: `doGet` responde à verificação (`hub.challenge`) e `doPost` recebe as mensagens. Hoje o `doPost` do Rumo exige token do Google; o webhook precisaria de uma rota própria validando a assinatura `X-Hub-Signature-256` da Meta. Ainda não implementada.
- Custos: a Meta cobra por conversa/mensagem de modelo; confirme a tabela atual.

## O que já existe (`js/servicos/whatsapp.js`)
- `RumoWhatsApp.interpretar("gastei 50 no mercado")` → `{comando:'lancar', lancamento:{tipo,valor,descricao}, confirmar:true}`; também `saldo`, `resumo`, `ajuda`.
- `RumoWhatsApp.normalizarWebhook(corpo)` → lista simples de mensagens de texto recebidas.
- `Servico.enviarResposta` (contrato a implementar no back-end).

## Regras para implementar
1. **Vincular** o número ao usuário: ele gera um código no app e envia ao WhatsApp do Rumo. Só números vinculados são atendidos.
2. **Confirmar antes de gravar**: "Lançar despesa de R$ 50,00 — mercado? Responda SIM".
3. Limitar mensagens/dia e registrar consentimento (opt-in) conforme LGPD e política da Meta.
4. Reutilizar `validarLanc_` e `verificarLimites_` do back-end; responder com o aviso de limites quando houver.
