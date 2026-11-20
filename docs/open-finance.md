# Conexão bancária (Open Finance) — Pluggy

**Status:** implementada (back-end + tela **Conexões**). Precisa de credenciais do provedor para funcionar fora da demonstração.

## Ativar
1. Crie conta em pluggy.ai (sandbox é gratuito) e gere **Client ID** e **Client Secret**.
2. Apps Script ▸ Configurações do projeto ▸ **Propriedades do script**: `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`. Nunca em `config.js`.
3. Cole o novo `Code.gs`, rode `autorizar` (cria as abas `Conexoes` e `ContasBanco` e pede permissão de rede) e publique **nova versão** da implantação.
4. Em `config.js`, confira `PLUGGY_CONNECT_URL` (versão do widget) na documentação da Pluggy.

## Custos e limites (confirmar nos sites)
Sandbox gratuito; produção paga. Relatos públicos indicam a partir de ~R$ 2,5 mil/mês (Pluggy) e ~US$ 1.000/mês (Belvo). Há também o "Meu Pluggy" para uso pessoal gratuito, com limitações. Valores mudam: confirme antes de lançar.

## Fluxo
1. Usuário lê e aceita o consentimento → `of_token` devolve um token curto para o widget.
2. O widget (Pluggy Connect, carregado só agora) recebe o login do banco. **O Rumo nunca vê a senha.**
3. O widget devolve o `itemId` → `of_conectar` confere (no provedor) que o item pertence a este usuário, grava a data do consentimento e importa.
4. `of_sincronizar` atualiza (janela de 90 dias na primeira vez; depois desde a última sincronização, com 5 dias de sobreposição).
5. `of_desconectar` encerra a conexão no provedor e apaga o vínculo; o usuário escolhe se apaga ou mantém os lançamentos importados.

## Regras de importação
- Contas: corrente/poupança e cartão (limite, fechamento, vencimento). Reconexão reaproveita conta de mesmo nome e tipo.
- Saldo: na criação da conta o saldo inicial é ajustado para o app bater com o banco.
- Chave `of:<id da transação>` → nunca importa duas vezes.
- **Duplicados:** se já existe lançamento com mesmo tipo e valor em ±1 dia (qualquer conta), a transação é ignorada (cada lançamento manual "cobre" uma só).
- **Fatura do cartão:** linhas "pagamento de fatura / pagamento recebido" são ignoradas (as compras do cartão já entram).
- **Categoria automática** por palavras-chave (lista `OF_REGRAS_*` no `Code.gs`, fácil de editar). Sem regra = sem categoria.

## Segurança e LGPD
- Só guardamos `ItemId`, nome do banco, data/versão do consentimento. Nada de senha. O `ItemId` não vai ao navegador nem à exportação.
- Revogação a qualquer momento; "Excluir conta" também revoga tudo no provedor.
- Trocar de provedor: reescreva `pluggy_`, `ofSincronizar_` e `of_token/of_conectar` mantendo o formato de saída.
