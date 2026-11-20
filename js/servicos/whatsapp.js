/* ============================================================================
 * Rumo — agente de WhatsApp (PREPARAÇÃO; não envia nem recebe nada ainda).
 * Caminho oficial: WhatsApp Business Platform (Cloud API da Meta). Precisa de conta Meta Business, número
 * dedicado, token permanente e webhook HTTPS verificado. Segredos ficam em Propriedades do script
 * (WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_NUMERO_ID), NUNCA no navegador. Veja docs/whatsapp.md.
 * Aqui há só o que não depende de servidor: interpretar frases ("gastei 50 no mercado") e normalizar o payload
 * do webhook para um formato simples. O envio (enviarResposta) é um contrato a implementar no back-end.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  const semAc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = s => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

  // "gastei 50 no mercado" | "paguei 120,50 de luz" | "recebi 3000 de salário" | "saldo" | "resumo"
  function interpretar(texto) {
    const t = String(texto || '').trim().slice(0, 300), s = semAc(t);
    if (/^(saldo|quanto tenho)\b/.test(s)) return { comando: 'saldo' };
    if (/^(resumo|extrato|gastos do mes)\b/.test(s)) return { comando: 'resumo' };
    if (/^(ajuda|menu|oi|ola)\b/.test(s)) return { comando: 'ajuda' };
    const m = s.match(/^(gastei|paguei|comprei|recebi|ganhei)\s+(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais)?\s*(?:(?:no|na|em|de|com|do|da|para)\s+)?(.*)$/);
    if (!m) return { comando: 'desconhecido', ajuda: 'Exemplos: "gastei 50 no mercado", "recebi 3000 de salário", "saldo".' };
    const valor = num(m[2]);
    if (!(valor > 0)) return { comando: 'desconhecido' };
    const orig = t.replace(/^\S+\s+(?:r\$\s*)?[\d.,]+\s*(?:reais)?\s*(?:(?:no|na|em|de|com|do|da|para)\s+)?/i, '');
    return { comando: 'lancar', lancamento: { tipo: /recebi|ganhei/.test(m[1]) ? 'receita' : 'despesa', valor, descricao: (orig || m[3] || '').slice(0, 80), origem: 'whatsapp' }, confirmar: true };
  }

  // Normaliza o corpo do webhook da Cloud API para [{ de, texto, id, quando }] (ignora status de entrega e mídia).
  function normalizarWebhook(corpo) {
    const out = [];
    ((corpo && corpo.entry) || []).forEach(e => (e.changes || []).forEach(c => ((c.value && c.value.messages) || []).forEach(m => {
      if (m.type === 'text' && m.text) out.push({ de: String(m.from || ''), texto: String(m.text.body || ''), id: String(m.id || ''), quando: Number(m.timestamp) || 0 });
    })));
    return out;
  }

  // Contrato do serviço (a implementar no back-end, com a chave em Propriedades do script).
  const Servico = {
    configurado() { return false; },
    async enviarResposta(para, texto) { throw new Error('WhatsApp ainda não configurado. Veja docs/whatsapp.md.'); },
    // Regras obrigatórias ao implementar: só responder a números VINCULADOS ao usuário (código de pareamento),
    // confirmar antes de gravar ("Lançar despesa de R$ 50,00 — mercado? Responda SIM"), limitar mensagens por dia
    // e registrar o consentimento (LGPD / política de opt-in da Meta).
  };

  raiz.RumoWhatsApp = { interpretar, normalizarWebhook, Servico };
})(typeof window !== 'undefined' ? window : globalThis);
