# Assistente de IA — estrutura pronta, IA real pendente

Tela **Assistente** (chat) + camada isolada `js/servicos/assistente.js`. Hoje roda em **modo simulado**: reconhece a intenção por palavras-chave e responde com os dados reais do usuário (resumo do mês, saldos, limites, metas, últimos lançamentos, cotações). Nada sai do app.

## Peças
- `SYSTEM_PROMPT`: tom, regras (usar só dados das ferramentas, não recomendar investimento, nunca pedir senhas).
- `FERRAMENTAS` (somente leitura): `resumo_mes`, `saldo_contas`, `limites`, `metas`, `ultimos_lancamentos`, `cotacao`. Cada uma tem nome, descrição, parâmetros e `executar`.
- Provedores: `simulado` (padrão) e `servidor` (esqueleto). `registrarProvedor(nome, {gerar})` plugam outro sem mexer na tela.

## Para ligar uma IA real (sem expor chave)
1. Criar no `Code.gs` a ação `assistente_chat`: recebe o histórico, chama o provedor de IA via `UrlFetchApp` com a chave em **Propriedades do script** (ex.: `IA_API_KEY`), executa as ferramentas pedidas **no servidor** (usando as mesmas funções de leitura) e devolve o texto.
2. Em `servidor.gerar`, chamar `api('assistente_chat', ...)`; ativar com `RumoAssistente.usarProvedor('servidor')`.
3. Limites: máx. de mensagens por usuário/dia, tamanho de histórico, registro de uso (tabela `Consultor` já reservada), aviso de que é orientação educativa.
4. Privacidade: enviar ao provedor só o necessário (agregados em vez de lançamentos linha a linha quando possível) e informar isso ao usuário.
