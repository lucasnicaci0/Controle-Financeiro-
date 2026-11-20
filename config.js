/* ============================================================================
 * Rumo — configuração editável (somente dados PÚBLICOS; este arquivo vai para o navegador).
 * Segredos (chaves de API, tokens) NUNCA entram aqui: ficam em
 * Apps Script ▸ Configurações do projeto ▸ Propriedades do script.
 * ========================================================================== */
window.RUMO_CONFIG = {
  // Preencha aqui (ou deixe em branco para usar os valores do topo do index.html).
  API_URL: '',
  CLIENT_ID: '',

  // Planos mostrados na Jornada. Preços em R$.
  // ⚠ VALORES DE EXEMPLO: troque pelos reais. Enquanto "exemplo: true", a tela mostra o aviso "valor de exemplo".
  // O plano anual é o preço TOTAL por ano (a tela calcula o equivalente mensal e a economia).
  PLANOS: [
    { id: 'gratis',  nome: 'Grátis',  mensal: 0,     anual: 0,      exemplo: false, atual: true,
      itens: ['Lançamentos, contas e categorias', 'Orçamentos e metas', 'Consultor financeiro básico'] },
    { id: 'plus',    nome: 'Plus',    mensal: 14.9,  anual: 149,    exemplo: true,  destaque: true,
      itens: ['Tudo do Grátis', 'Agenda e limites de gastos', 'Exportação para Excel', 'Câmbio e cartões'] },
    { id: 'premium', nome: 'Premium', mensal: 29.9,  anual: 299,    exemplo: true,
      itens: ['Tudo do Plus', 'Investimentos', 'Conexão bancária (Open Finance)', 'Assistente de IA'] }
  ],

  // Fale conosco (Fase 4) — preencha com os dados reais.
  // Perguntas frequentes (aparecem antes do contato, com busca). Edite à vontade.
  FAQ: [
    { p: 'Como adiciono um lançamento?', r: 'Abra Lançamentos, informe valor, data, conta e categoria e toque em Salvar. Dá para usar tags (ex.: viagem) para agrupar gastos.' },
    { p: 'Como importo o extrato do banco?', r: 'Em Lançamentos, use "Importar extrato (CSV)". O arquivo precisa ter colunas de data, descrição e valor. Enviar o mesmo arquivo de novo não duplica.' },
    { p: 'Como crio, edito ou arquivo categorias?', r: 'Aba Categorias. Você pode criar com ícone e cor, editar, arquivar (some das listas mas mantém o histórico) e excluir. Categoria com lançamentos só é excluída depois de mover os itens para outra.' },
    { p: 'Como cadastro meu cartão de crédito?', r: 'Aba Cartões: informe nome, limite, dia de fechamento e dia de vencimento. A fatura é calculada com os lançamentos feitos nesse cartão.' },
    { p: 'Como funcionam os limites de gastos e os alertas?', r: 'Em Limites você define um valor mensal geral, por conta, por cartão ou por categoria. O app avisa aos 80%, ao atingir 100% e ao ultrapassar.' },
    { p: 'Como levo a agenda para o calendário do celular?', r: 'Em Agenda, toque em "Gerar link" e assine o link no Google Agenda ou no calendário do iPhone. Quem tiver o link vê sua agenda; se vazar, gere um novo.' },
    { p: 'Como exporto meus dados para o Excel?', r: 'No Painel, use "Exportar para Excel", escolha período e filtros e baixe o arquivo .xlsx com lançamentos e resumos.' },
    { p: 'Posso trocar minha senha?', r: 'O Rumo usa o login do Google, então não existe senha do app. Para trocar a senha, use as configurações de segurança da sua Conta Google.' },
    { p: 'Meus dados estão seguros? Como apago tudo?', r: 'Seus dados ficam na planilha do responsável pelo app e só você os acessa pelo login. No menu da sua foto há "Exportar meus dados" e "Apagar minha conta".' },
    { p: 'O que é o plano Grátis e quando haverá planos pagos?', r: 'Hoje todos usam o plano Grátis. Os planos e preços da Jornada ainda são informativos e a cobrança não está ativa.' }
  ],

  CONTATO: { whatsapp: '5500000000000', email: 'contato@exemplo.com', exemplo: true }
};
