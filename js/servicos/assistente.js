/* ============================================================================
 * Rumo — Assistente de IA (camada de serviço ISOLADA da interface).
 * Nada aqui mexe no DOM. A tela (index.html) só chama RumoAssistente.responder().
 *
 * Peças:
 *   SYSTEM_PROMPT  instruções do assistente (tom, limites, aviso de não-recomendação).
 *   FERRAMENTAS    o que a IA pode consultar (somente leitura). Cada uma = nome, descrição, parâmetros, executar().
 *   provedores     "simulado" (padrão, responde por regras usando os dados reais do app, sem custo)
 *                  "servidor" (PREPARADO, ainda não implementado: chamará uma ação do Apps Script que guarda a
 *                  chave do provedor de IA em Propriedades do script; ver docs/assistente-ia.md).
 * Para plugar uma IA real: implemente um provedor { nome, gerar({system, mensagens, ferramentas, executar}) }
 * e registre com RumoAssistente.registrarProvedor('nome', obj) — a tela não muda.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  const SYSTEM_PROMPT = [
    'Você é o assistente financeiro do Rumo, um app de finanças pessoais. Responda sempre em português do Brasil, de forma curta, clara e gentil.',
    'Use SOMENTE os dados fornecidos pelas ferramentas; nunca invente valores. Se faltar dado, diga o que falta.',
    'Você ajuda a entender gastos, orçamentos, limites, metas e câmbio. Não faz transações nem altera dados: apenas consulta e explica.',
    'Não dê recomendação de investimento, de compra ou de venda de ativos. Em temas de investimento, informe que é orientação educativa e sugira um profissional habilitado.',
    'Valores em reais no formato R$ 1.234,56. Cotações são de referência e podem diferir das praticadas por bancos e corretoras.',
    'Nunca peça nem repita senhas, tokens ou dados de cartão.'
  ].join('\n');

  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const semAc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mesAtual = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

  // Ferramentas: o "executar" recebe (args, api) e devolve dados simples (JSON). A IA real recebe só nome/descrição/parâmetros.
  const FERRAMENTAS = [
    { nome: 'resumo_mes', descricao: 'Receitas, despesas, saldo do mês, saldo total das contas e gastos por categoria.', parametros: { mes: 'AAAA-MM (opcional; padrão: mês atual)' },
      executar: (a, api) => api('resumo', { mes: a.mes || mesAtual() }) },
    { nome: 'saldo_contas', descricao: 'Lista as contas e cartões com seus saldos.', parametros: {},
      executar: async (a, api) => (await api('listar_contas')).map(c => ({ nome: c.nome, tipo: c.tipo, saldo: c.saldo })) },
    { nome: 'limites', descricao: 'Limites de gastos do mês com quanto já foi usado.', parametros: { mes: 'AAAA-MM (opcional)' },
      executar: (a, api) => api('listar_limites', { mes: a.mes || mesAtual() }) },
    { nome: 'metas', descricao: 'Metas de economia com valor alvo e atual.', parametros: {},
      executar: (a, api) => api('listar_metas') },
    { nome: 'ultimos_lancamentos', descricao: 'Lançamentos de um mês (mais recentes primeiro).', parametros: { mes: 'AAAA-MM (opcional)', limite: 'quantidade (padrão 10)' },
      executar: async (a, api) => (await api('listar_lancamentos', { mes: a.mes || mesAtual() })).sort((x, y) => String(y.data).localeCompare(x.data)).slice(0, Math.min(50, Number(a.limite) || 10)) },
    { nome: 'cotacao', descricao: 'Cotação de uma moeda em reais (ex.: USD, EUR, BTC).', parametros: { moeda: 'código da moeda' },
      executar: async (a, api) => { const r = await api('cambio_cotacoes', { moedas: [String(a.moeda || 'USD').toUpperCase()] }); return { cotacoes: r.cotacoes, fonte: r.fonte, aviso: r.aviso }; } }
  ];

  // --- provedor simulado: reconhece a intenção por palavras-chave, consulta a ferramenta certa e monta a resposta
  const MOEDAS = { dolar: 'USD', usd: 'USD', euro: 'EUR', eur: 'EUR', libra: 'GBP', gbp: 'GBP', bitcoin: 'BTC', btc: 'BTC', iene: 'JPY', peso: 'ARS' };
  const simulado = {
    nome: 'simulado',
    async gerar({ mensagens, executar }) {
      const q = semAc(mensagens[mensagens.length - 1].texto), usadas = [];
      const usa = async (n, a) => { usadas.push(n); return executar(n, a || {}); };
      let texto;
      if (/\b(oi|ola|bom dia|boa tarde|boa noite|ajuda)\b/.test(q) && q.length < 25) {
        texto = 'Olá! Posso falar sobre seu saldo, gastos do mês, limites, metas, últimos lançamentos e cotações (dólar, euro…). O que você quer saber?';
      } else if (/cotacao|dolar|euro|libra|bitcoin|\busd\b|\beur\b|\bbtc\b|iene|cambio/.test(q)) {
        const palavra = Object.keys(MOEDAS).find(k => new RegExp('\\b' + k + '\\b').test(q)) || 'dolar', cod = MOEDAS[palavra];
        const r = await usa('cotacao', { moeda: cod }), c = r.cotacoes[cod];
        texto = c ? 'O ' + cod + ' está em ' + brl(c.venda || c.compra) + ' (venda), ' + (c.pct >= 0 ? 'alta' : 'queda') + ' de ' + Math.abs(c.pct).toLocaleString('pt-BR') + '% no dia' + (c.desatualizado ? ' — atenção: cotação desatualizada' : '') + '. ' + r.aviso : 'Não consegui a cotação de ' + cod + ' agora.';
      } else if (/limite/.test(q)) {
        const l = await usa('limites');
        texto = l.length ? 'Seus limites neste mês:\n' + l.map(x => '• ' + x.nome + ': ' + brl(x.gasto) + ' de ' + brl(x.limite) + ' (' + x.pct + '%)').join('\n') : 'Você ainda não definiu limites. Dá para criar na aba Limites.';
      } else if (/meta|objetivo|sonho/.test(q)) {
        const m = await usa('metas');
        texto = m.length ? 'Suas metas:\n' + m.map(x => '• ' + x.nome + ': ' + brl(x.valorAtual) + ' de ' + brl(x.valorAlvo) + ' (' + Math.round(x.valorAtual / x.valorAlvo * 100) + '%)').join('\n') : 'Você ainda não tem metas. Crie uma na aba Metas.';
      } else if (/saldo|quanto tenho|conta|cartao/.test(q) && !/gast|despes/.test(q)) {
        const c = await usa('saldo_contas'), total = c.reduce((s, x) => s + x.saldo, 0);
        texto = 'Saldo total: ' + brl(total) + '.\n' + c.map(x => '• ' + x.nome + ': ' + brl(x.saldo)).join('\n');
      } else if (/ultim|recente|lancamento|movimento/.test(q)) {
        const l = await usa('ultimos_lancamentos', { limite: 5 });
        texto = l.length ? 'Últimos lançamentos:\n' + l.map(x => '• ' + String(x.data).split('-').reverse().join('/') + ' ' + (x.descricao || '(sem descrição)') + ': ' + (x.tipo === 'despesa' ? '−' : '+') + brl(x.valor)).join('\n') : 'Ainda não há lançamentos neste mês.';
      } else if (/gast|despes|categoria|onde|mais gastei|receita|sobr|economi/.test(q)) {
        const r = await usa('resumo_mes'), top = (r.porCategoria || []).slice(0, 3);
        texto = 'Neste mês você recebeu ' + brl(r.receitas) + ' e gastou ' + brl(r.despesas) + ' (saldo do mês ' + brl(r.saldoMes) + ').' + (top.length ? '\nMaiores gastos: ' + top.map(t => t.nome + ' ' + brl(t.valor)).join(', ') + '.' : '');
      } else if (/invest|acao|acoes|fii|cripto|comprar|vender/.test(q)) {
        texto = 'Não faço recomendação de investimento. Posso mostrar quanto você já tem investido e o quanto sobra por mês; para decidir onde aplicar, procure um profissional habilitado. Orientação educativa.';
      } else {
        texto = 'Ainda estou no modo simples e não entendi bem. Tente perguntar: "quanto gastei este mês?", "qual meu saldo?", "como estão meus limites?", "cotação do dólar" ou "últimos lançamentos".';
      }
      return { texto, ferramentasUsadas: usadas };
    }
  };
  // --- provedor de IA real (PREPARADO): chamará uma ação do back-end que guarda a chave. Ainda não implementado.
  const servidor = {
    nome: 'servidor',
    async gerar() { throw new Error('A IA real ainda não foi conectada. Veja docs/assistente-ia.md (o modo simulado continua disponível).'); }
  };

  const provedores = { simulado, servidor };
  let atual = 'simulado';

  async function responder(texto, { api, historico = [] }) {
    texto = String(texto || '').trim().slice(0, 500);
    if (!texto) throw new Error('Escreva uma pergunta.');
    const p = provedores[atual];
    const executar = async (nome, args) => {
      const f = FERRAMENTAS.find(x => x.nome === nome);
      if (!f) throw new Error('Ferramenta desconhecida.');
      return f.executar(args || {}, api);
    };
    const mensagens = historico.slice(-10).concat([{ papel: 'usuario', texto }]);
    const r = await p.gerar({ system: SYSTEM_PROMPT, mensagens, ferramentas: FERRAMENTAS.map(f => ({ nome: f.nome, descricao: f.descricao, parametros: f.parametros })), executar });
    return { texto: r.texto, ferramentasUsadas: r.ferramentasUsadas || [], provedor: p.nome };
  }

  raiz.RumoAssistente = {
    SYSTEM_PROMPT, FERRAMENTAS, responder,
    provedores: () => Object.keys(provedores), provedorAtual: () => atual,
    usarProvedor(n) { if (!provedores[n]) throw new Error('Provedor desconhecido.'); atual = n; },
    registrarProvedor(n, impl) { if (!impl || typeof impl.gerar !== 'function') throw new Error('Provedor inválido.'); provedores[n] = Object.assign({ nome: n }, impl); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
