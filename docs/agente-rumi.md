# Rumi — agente virtual do Rumo

Assistente pessoal e financeiro embutido no app (aba **Rumi**) e disponível no **WhatsApp**. Funciona sem serviço pago: o entendimento é feito por regras e dicionários em português, sobre os dados reais do usuário.

## Como é organizado

| Camada | Arquivo | O que faz |
|---|---|---|
| Núcleo de conversa (fonte única) | `apps-script/agente_core.js` | Interpreta a frase (valor, data, categoria, conta, tipo), conduz o diálogo (perguntas, confirmações), faz o Modo Contador. Funções puras: não acessam rede nem planilha. |
| Servidor | `apps-script/agente_servidor.js` | Executa o que o núcleo decidiu: valida, aplica permissões, grava com idempotência, audita, desfaz, guarda memória, recebe o webhook do WhatsApp. |
| Montagem | `apps-script/montar.js` | Copia o núcleo e o servidor para o `Code.gs` (entre `// <<NLU`…`// NLU>>` e `// <<AGENTE`…`// AGENTE>>`) e gera `js/servicos/agente-core.js` (modo demonstração). **Edite os dois arquivos-fonte e rode `node apps-script/montar.js`.** O teste `teste_agente_core.js` falha se algum espelho estiver diferente. |
| Interface | `js/agente/` + `css/agente.css` | Mascote (`mascote.js`), voz (`voz.js`), tela (`tela.js`), demo (`demo.js`). |

O mesmo núcleo atende o app e o WhatsApp, então os dois entendem as mesmas frases.

## Tabelas novas (Google Planilhas)
`AgenteMemoria` (o que aprendeu e as permissões), `AgenteHistorico` (conversa), `AgenteAuditoria` (cada criação/alteração/exclusão, com antes e depois), `AgentePendentes` (confirmação ou pergunta em andamento) e `ZapVinculos` (telefone ↔ conta). Todas têm a coluna `Email`: cada conta só enxerga as próprias linhas, e **Apagar conta** remove tudo.

## Regras de segurança
- Criar, alterar e excluir seguem as permissões que o usuário liga/desliga em *Permissões e privacidade*.
- **Alterar e excluir sempre pedem confirmação** (“sim/não”). Nada é inventado: sem valor ou sem categoria, o Rumi pergunta.
- Cada mensagem tem um `msgId`; repetir o mesmo id devolve a resposta anterior e **não duplica** (no WhatsApp o id é o `wamid` da Meta).
- Tudo ou nada: se uma etapa falhar, as anteriores da mesma mensagem são desfeitas.
- **Desfazer** reverte o grupo de ações de uma mensagem (criação, alteração e exclusão).
- Limite de 60 mensagens/hora por usuário; memória até 300 itens; histórico 200 mensagens.

## Memória e aprendizado (sem treinar modelo)
O Rumi guarda, por usuário: como você chama cada gasto (“mercadinho” → Mercado), conta padrão, apelido. Aprende ao registrar, ao ser corrigido (“não, é lazer”) e ao ser ensinado (“quando eu disser pastelaria, é Restaurantes”). Tudo pode ser editado ou apagado em *O que o Rumi aprendeu*, e a memória pode ser desligada.

## Voz
- **Entrada:** reconhecimento de fala do navegador (Web Speech API, pt-BR). A frase falada vira texto e segue o mesmo caminho do chat. Funciona no Chrome/Edge/Safari recentes; sem suporte, o botão fica desativado e o ditado do teclado do celular serve.
- **Saída:** síntese de voz do navegador, opcional (*Responder também em áudio*).
- Privacidade: no Chrome o áudio pode ser processado pelo serviço de voz do próprio navegador (Google). O Rumo não grava nem guarda áudio, só o texto transcrito.

## Modo Contador
Botão e frases como “como está minha situação financeira?”, “estou gastando mais do que ganho?”, “quanto posso gastar até o fim do mês?”, “onde estou gastando mais?”, “consigo comprar algo de R$ 500?”, “quais minhas despesas fixas?”, “onde posso economizar?”. Usa só lançamentos reais; projeções, “disponível” e possíveis desperdícios são apresentados como **estimativas**, com aviso. Não é recomendação de investimento.

## WhatsApp (API oficial da Meta — WhatsApp Cloud API)
1. Crie um app em developers.facebook.com com o produto **WhatsApp** e um número de teste/real.
2. Em *Propriedades do script* do Apps Script, crie: `WHATSAPP_TOKEN` (token permanente), `WHATSAPP_NUMERO_ID` (ID do número), `WHATSAPP_VERIFY_TOKEN` (texto que você inventar), `WHATSAPP_WEBHOOK_SECRET` (outro texto longo e aleatório) e, opcional, `WHATSAPP_NUMERO_EXIBICAO` (o número como o usuário deve digitar).
3. No painel da Meta, configure o webhook: **URL** = `URL_DO_APP_DA_WEB?s=SEU_WHATSAPP_WEBHOOK_SECRET`, **Verify token** = `WHATSAPP_VERIFY_TOKEN`, e assine o campo `messages`.
4. No app: **Rumi › Ajustes › WhatsApp › Gerar código** e envie o código pelo WhatsApp para o número. O telefone fica vinculado à conta.
5. Depois: “gastei 30 no almoço”, “quanto gastei este mês?”, e mensagens **encaminhadas** (ex.: “Compra aprovada R$ 89,90 em Loja X”) viram uma proposta que você confirma com “sim”.

Limites honestos: o Apps Script não expõe o cabeçalho de assinatura da Meta (`X-Hub-Signature-256`), por isso a autenticidade do webhook é garantida por um segredo na URL; o Rumi lê **só texto** (áudio e imagem do WhatsApp precisariam de transcrição/OCR no servidor, o que exige serviço externo); respostas só podem ser enviadas dentro da janela de 24 h após a última mensagem do usuário; a Meta exige conta Business e pode cobrar conversas iniciadas pela empresa.

## Como a identidade visual é usada
Nome **Rumi**, mascote em SVG com sombreamento (aparência 3D) e 7 estados: espera, processando, analisando, executando, confirmando, problema e apresentando análise. Aparece no cabeçalho da tela (64 px) e em miniatura nas respostas (28 px), sem ocupar espaço extra; respeita “reduzir movimento”.
