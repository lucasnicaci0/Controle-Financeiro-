# Leitura de notificações do banco — PREPARAÇÃO

**É viável?** Não como site/PWA. Navegadores e PWAs não têm permissão para ler notificações de outros aplicativos (nem no Android nem no iPhone). Só um **app Android nativo** consegue, usando `NotificationListenerService`, e o usuário precisa conceder manualmente "Acesso a notificações". No iPhone não existe esse recurso.

**Impacto:** exige criar e publicar um app (Kotlin/Android Studio ou Flutter/React Native com módulo nativo), conta de desenvolvedor Google Play (taxa única) e política de privacidade. Isso foge de "só GitHub + Apps Script", por isso foi apenas **preparado**.

## O que já existe
- `js/servicos/notificacoes.js`: `RumoNotificacoes.interpretar({pacote, texto, quando})` converte "Compra aprovada R$ 45,90 em IFOOD" em `{tipo, valor, descricao, banco}` (ou `null` se não parecer transação). Lista de pacotes de bancos em `PACOTES`.
- Contrato `FonteNotificacoes` (permissão + callback) que o app nativo cumpre.

## Como seria
1. App nativo filtra pacotes de bancos conhecidos e envia `{pacote, texto, quando}` ao back-end autenticado (mesmo login Google).
2. Nova ação `importar_notificacao` valida, interpreta (mesma lógica) e cria um **rascunho** de lançamento para o usuário confirmar (evita erro e duplicidade com Open Finance, que usa a mesma detecção de duplicados).
3. Privacidade: processar no aparelho e enviar só valor, data e descrição curta; ignorar mensagens de OTP/código.

## Alternativa sem app nativo
Open Finance (já implementado) entrega as mesmas transações, com mais segurança.
