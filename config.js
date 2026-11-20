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
  CONTATO: { whatsapp: '5500000000000', email: 'contato@exemplo.com', exemplo: true }
};
