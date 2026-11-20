/* ============================================================================
 * Rumo — leitura de notificações de bancos (PREPARAÇÃO; ainda não captura nada).
 * ⚠ Um PWA (site instalável) NÃO consegue ler notificações de outros apps no Android nem no iPhone.
 *   Isso exige um app Android NATIVO com NotificationListenerService e permissão explícita do usuário
 *   ("Acesso a notificações"). Não é viável só com GitHub Pages + Apps Script. Veja docs/notificacoes-android.md.
 * O que já existe aqui e é aproveitado depois: o interpretador de texto (puro, testável) e o contrato (interface)
 * da fonte de notificações. O app nativo só precisará entregar { pacote, titulo, texto, quando }.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  const semAc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = s => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

  // pacotes de bancos conhecidos (lista inicial, editável)
  const PACOTES = { 'com.nu.production': 'Nubank', 'com.itau': 'Itaú', 'br.com.bb.android': 'Banco do Brasil', 'com.bradesco': 'Bradesco', 'com.santander.app': 'Santander', 'br.com.intermedium': 'Inter', 'com.c6bank.app': 'C6 Bank' };

  // "Compra aprovada R$ 45,90 em IFOOD" → { tipo, valor, descricao }. Devolve null se não parecer transação.
  function interpretar(n) {
    const t = String(n && n.texto || '').replace(/\s+/g, ' ').trim(), s = semAc(t);
    const m = t.match(/R\$\s*([\d.]+,\d{2})/);
    if (!m) return null;
    const valor = num(m[1]);
    if (!(valor > 0)) return null;
    let tipo = null;
    if (/compra|pagamento|debito|pix enviado|transferencia enviada|saque|boleto|fatura/.test(s)) tipo = 'despesa';
    if (/pix recebido|recebeu|credito em conta|deposito|transferencia recebida|salario/.test(s)) tipo = 'receita';
    if (!tipo) return null;
    const d = t.match(/\b(?:em|para|de)\s+([A-Za-zÀ-ú0-9*&.' -]{3,40})$/i);
    return { tipo, valor, descricao: (d ? d[1] : t).slice(0, 80).trim(), banco: PACOTES[n.pacote] || '', origem: 'notificacao', quando: n.quando || null, confianca: d ? 'media' : 'baixa' };
  }

  // Contrato que o app nativo (ou outro mecanismo) deve cumprir.
  const FonteNotificacoes = {
    disponivel() { return false; },                       // true só quando houver app nativo pareado
    async pedirPermissao() { throw new Error('Leitura de notificações exige o app Android nativo (ainda não existe).'); },
    aoReceber(callback) { /* o app nativo chamaria callback({pacote, titulo, texto, quando}) */ }
  };

  raiz.RumoNotificacoes = { interpretar, PACOTES, FonteNotificacoes };
})(typeof window !== 'undefined' ? window : globalThis);
