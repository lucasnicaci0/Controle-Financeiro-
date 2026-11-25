# Rumo — controle de finanças

Site estático (GitHub Pages) + back-end em Google Apps Script com Google Planilhas como banco.

- `index.html`, `manifest.json`, `sw.js`, `icon*` — o site (PWA). Publicado pelo GitHub Pages.
- `apps-script/Code.gs` — back-end: cole no Apps Script da planilha "Financas DB".
- `apps-script/teste_gs1.js` — testes do back-end em Node (`node apps-script/teste_gs1.js apps-script/Code.gs`).

Para ver o visual sem configurar nada, abra o site com `?demo` no final do endereço.

## Configuração
1. No Apps Script, troque `CONFIG.CLIENT_ID` pelo ID do cliente OAuth, rode `autorizar` e implante como App da Web
   (Executar como: Eu · Acesso: Qualquer pessoa).
2. No `index.html`, preencha `API_URL` (URL que termina em `/exec`) e `CLIENT_ID`.
3. Sempre que mudar o `Code.gs`, publique uma nova versão da implantação.

Nunca coloque senhas ou chaves secretas neste repositório: ele é público.

## Cérebro Financeiro (visual 3D)

A Jornada (primeira aba) é um cérebro 3D procedural em WebGL2 puro, sem dependências nem build. Código em `js/cerebro/`:

| Arquivo | Componente |
|---|---|
| `scene.js` | Cena: contexto, qualidade por GPU, resolução adaptativa, projeção das âncoras |
| `brain.js` + `shaders.js` | Cérebro: malha com giros e sulcos, partículas, rede neural |
| `cards.js` | Cartões de vidro, linhas luminosas, hover nos dois sentidos, clique para voar |
| `camera.js` | Câmera: roteiro por scroll, voos, parallax |
| `post.js` | Pós-processamento: bloom, aberração cromática, grão, vinheta, ACES |
| `cursor.js` | Cursor com rastro, botões magnéticos, revelação de texto |
| `theme.js` | **Todas as cores, tempos e intensidades** |

### Ajustes rápidos (em `js/cerebro/theme.js`, ou pela URL para testar)

- Brilho: `THEME.glow.intensity` (ou `?glow=1.4`). Bloom em `THEME.glow.bloom`, borda em `THEME.glow.rim`.
- Velocidade da câmera: `THEME.camera.speed` (ou `?speed=0.7`).
- Partículas: `THEME.particles.high/mid/low` (ou `?particles=20000`).
- Qualidade forçada: `?q=0|1|2`.

Sem WebGL2 o app mantém o fundo 2D e a Jornada vira uma lista de cartões em texto. Com `prefers-reduced-motion` a cena fica estática e sem warp.

### Opções (aba "Opções")

Fonte (4 tamanhos), paletas (Neural, Sinapse, Córtex, Matriz) ou cor de destaque personalizada, artefatos voadores (liga/desliga + quantidade) e fundo universo (liga/desliga + intensidade). Tudo aplica na hora e fica salvo em `localStorage` (`rumo_opts`). Qualquer cor passa por uma checagem de contraste (mínimo 4,5:1) e é clareada se preciso. "Restaurar padrão" volta ao original.

### Qualidade de imagem

O canvas respeita o `devicePixelRatio` (limite 1,5x / 2x / 3x conforme a GPU), o cérebro usa FXAA e as sinapses são faixas com borda suavizada de 1 px. Se o fps cair abaixo de ~50, a resolução diminui primeiro (até 72%) e depois os efeitos (artefatos, bloom, partículas).

### Atalhos

`Esc` ou clicar em **RUMO** voltam à tela inicial (a Jornada). Se houver menu aberto, o `Esc` fecha o menu primeiro.

## Fase 1 — Categorias, tags e planos (v1.1.0)

- **config.js** (novo, editável): `PLANOS` (preço mensal e anual; `exemplo: true` mostra o aviso "Valor de exemplo"), `CONTATO` e, opcionalmente, `API_URL`/`CLIENT_ID`. Só dados públicos; segredos ficam em *Propriedades do script* no Apps Script.
- **Categorias** (aba nova): criar, editar, arquivar/reativar e excluir, com ícone e cor, tipos Despesa/Receita. Categoria com lançamentos ou orçamentos **não é excluída**: o app oferece mover tudo para outra categoria do mesmo tipo. Botão "Adicionar categorias padrão que faltam" para quem já usava o app.
- **Tags** nos lançamentos (até 8, sem repetir, sugestões das já usadas).
- **Planos** na Jornada (rolar até o fim): alternância Mensal/Anual com economia calculada.
- Planilhas antigas ganham as colunas novas sozinhas (migração automática).
- **Atenção:** após atualizar o `Code.gs`, publique uma **nova versão** da implantação.
- Testes: `node apps-script/teste_gs1.js`, `node apps-script/teste_gs2.js`, `node apps-script/teste_fase1_ui.js` (precisa de Playwright).

## Fase 2 — Agenda, Excel e Limites de gastos (v1.2.0)

- **Agenda** (aba nova): visão de mês (calendário) e lista; tipos *Compromisso*, *Conta a pagar* e *Receita prevista*; repetição semanal, mensal (dia 31 vira o último dia do mês curto) e anual; lembretes (atrasados e os que entram na janela "lembrar X dias antes"). Marcar uma conta/receita como feita **cria o lançamento sozinho** (uma vez só); desmarcar remove o lançamento criado.
- **Celular:** escolhi o **feed de calendário .ics (assinatura por link)** e não a API do Google Agenda. Motivo: funciona em Google Agenda, iPhone e Outlook, é grátis, e a API do Google exigiria uma tela de consentimento OAuth verificada pelo Google e armazenar tokens dos usuários. Limites do .ics: a atualização é feita pelo aplicativo de calendário (o Google pode levar horas) e é somente leitura. O link tem um token secreto; "Gerar novo link" invalida o anterior.
- **Exportar para Excel** (Painel): .xlsx com abas *Lançamentos*, *Resumo por categoria* e *Resumo por conta*, valores numéricos (despesas negativas na aba Lançamentos), datas reais e moeda em R$. Filtros: período (mês, ano ou tudo), conta, categoria e tipo. Gerado no navegador por `js/xlsx.js` (sem biblioteca).
- **Limites de gastos** (aba nova): limite mensal geral, por conta, por cartão (conta do tipo Cartão) e por categoria. Alertas em 80% (atenção), 100% (atingido) e acima (excedido), registrados uma vez por mês/limite/nível, mostrados como aviso ao salvar o lançamento e no histórico da aba.
- **Envio de notificações:** a função `notificar_` do `Code.gs` é o ponto de extensão. Já envia e-mail se você criar a Propriedade do script `NOTIFICAR_EMAIL = sim` (pede uma permissão nova ao rodar `autorizar` de novo). WhatsApp/push ficam para a Fase 5.
- Tabelas novas na planilha: `Agenda`, `Limites`, `Alertas`, `Feeds` (criadas por `autorizar`).
- Testes: `teste_gs3.js` (back-end) e `teste_fase2_ui.js` (interface, desktop e celular).

## Fase 3 — Cartões, Metas de investimento e Investimentos (v1.3.0)

- **Cartões** (aba nova): usa as contas do tipo *Cartão*. Mostra limite, disponível, saldo devedor, fatura atual (gastos desde o último fechamento menos estornos), data de fechamento e vencimento. Contas ganharam as colunas `Limite`, `DiaFechamento`, `DiaVencimento` e `Marca` (migração automática). **Não inventa dados:** o que não foi informado aparece como "Falta informar: …". Limitação: faturas já fechadas não são detalhadas e o pagamento da fatura precisa ser lançado como receita no cartão (ou pela Agenda).
- **Metas:** mantidas; nova opção *Meta de investimento* com aporte mensal, previsão de conclusão pelo aporte e quanto aportar por mês para chegar no prazo.
- **Investimentos** (aba nova): carteira com ações, FIIs, renda fixa, cripto e outros; quantidade, preço médio, valor atual, retorno (R$ e %) e distribuição por classe. Entrada manual. Para cotação automática já existe o ponto de extensão `buscarCotacoes_` no `Code.gs` e o botão "Atualizar cotações" (hoje informa que não está ligada). Aviso fixo: "Informação para acompanhamento, não é recomendação de investimento."
- Testes: `teste_gs4.js` e `teste_fase3_ui.js`.

## Fase 4 — Perfil, Configurações e Fale conosco (v1.4.0)

- **Perfil** (menu da foto ▸ *Meu perfil*): nome, apelido, data de nascimento (mostra a idade), foto com **recorte** (arrastar e zoom; salva JPEG 256×256 leve), plano atual e *Sair*. **Senha:** o Rumo só usa login do Google, então não existe senha do app nem "senha atual" para pedir; a tela leva à segurança da Conta Google. A foto fica numa aba à parte (`Fotos`) para não pesar nas outras chamadas.
- **Configurações** (aba *Opções*): tema **Claro / Escuro / Automático** (claro vale nas telas internas; a Jornada 3D continua escura), tamanho do texto, paletas + cor personalizada (com garantia de contraste também no tema claro), **densidade** (compacta/normal/confortável), **cantos** (reto a arredondado) e efeitos. Tudo aplica em tempo real, fica salvo no aparelho e na conta (vale em outros aparelhos). *Restaurar esta seção* em cada bloco e *Restaurar tudo ao padrão* no fim.
- **Ajuda e contato** (menu da foto): FAQ com busca (ignora acento) antes do contato; botões WhatsApp (`wa.me` com mensagem pronta) e e-mail (`mailto`); mensagem pelo app, salva na aba `Mensagens` (limite de 5 por dia). **Perguntas, número e e-mail ficam em `config.js`** (hoje são exemplos).
- Testes: `teste_gs5.js` e `teste_fase4_ui.js`.

## Câmbio (item 16)
- Aba **Câmbio**: busca com autocomplete (nome/código/país: dólar, USD, euro, libra, iene, peso argentino, bitcoin…), compra/venda, variação do dia (R$ e %), máx/mín, hora da atualização, conversor com inverter e resultado ao digitar, gráfico 7d/30d/6m/1a, favoritos por usuário (padrão USD, EUR, GBP, ARS, BTC) e alertas de cotação (mesma central de alertas dos Limites).
- Painel: cartão "Câmbio hoje" (USD e EUR). Lançamentos: campo **Moeda**; grava o valor em R$ + valor original + cotação do dia (editável).
- Fonte: AwesomeAPI via back-end (cache de 5 min). Chave opcional na Script Property `AWESOMEAPI_KEY` (nunca vai ao navegador). Se a API cair, mostra a última cotação guardada marcada como "desatualizada" com a hora.
- Aviso fixo: "Valores de referência, podem diferir da cotação praticada por bancos e corretoras."
- Testes: `node apps-script/teste_gs6.js` e `node apps-script/teste_cambio_ui.js`.
- Após atualizar o `Code.gs`: rode `autorizar` e publique **nova versão** da implantação.

## Fase 5 — Conexão bancária, Assistente e preparação de canais
- **Conexões (Open Finance, Pluggy):** consentimento explícito, importação de contas/saldos/transações com categorização por regras e detecção de duplicados, revogação a qualquer momento. Credenciais em Propriedades do script (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`). Detalhes em `docs/open-finance.md`. **Atenção:** o widget da Pluggy é um script externo carregado só após o consentimento (`PLUGGY_CONNECT_URL` em `config.js`).
- **Assistente de IA:** tela de chat + `js/servicos/assistente.js` (prompt, ferramentas, provedores). Modo simulado ativo; IA real documentada em `docs/assistente-ia.md`.
- **Preparados (sem funcionar ainda):** leitura de notificações (precisa de app Android nativo; `docs/notificacoes-android.md`) e agente de WhatsApp (API oficial; `docs/whatsapp.md`).
- Testes: `node apps-script/teste_gs7.js`, `node apps-script/teste_servicos.js`, `node apps-script/teste_fase5_ui.js`.

## Cérebro 3D — arquitetura em camadas
- **3D** (`js/cerebro/scene.js`, `camera.js`, `brain.js`…): só renderiza e gira o modelo. Recebe o *palco* (`scene.setStage`) e desloca a lente da câmera; não conhece HTML.
- **Interface** (`cards.js`): cartões e textos. Lado e ordem são **fixos** (`LADOS` em `layout.js`); a rotação não os move. Só os pontos de navegação e as linhas, que fazem parte do modelo, acompanham a rotação.
- **Controle** (`estado.js`, `controle.js`): `BrainState` guarda apenas ligado/desligado (`localStorage: rumo_cerebro3d`), independente de dados e telas. Botão "Cérebro 3D" no cabeçalho da Jornada e interruptor em Opções › Efeitos.
- **Layout** (`layout.js`): calcula o palco livre (entre cabeçalho e abas), publica `--palco-top/--palco-bottom` e a cobertura da folha de **Planos**, que é opaca: a camada de cartões é recortada na borda dela e o 3D pausa quando ela cobre o palco.
- **Desligado:** canvas oculto, render parado, fundo 2D, Jornada vira grade de cartões + Planos, sem espaço vazio. **Religado:** o motor retoma, sem recriar elementos.
- Teste: `node apps-script/teste_cerebro_ui.js` (7 cenários, desktop e celular).
