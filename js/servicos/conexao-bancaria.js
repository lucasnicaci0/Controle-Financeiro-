/* Rumo — abre o widget de conexão do provedor (Pluggy Connect). Carregado SOB DEMANDA, só depois do consentimento.
 * O widget é quem recebe o login do banco: o Rumo nunca vê a senha. Troque este arquivo para mudar de provedor. */
(function (raiz) {
  'use strict';
  let carregando = null;
  function carregar(url) {
    if (raiz.PluggyConnect) return Promise.resolve();
    if (!carregando) carregando = new Promise((ok, falha) => {
      const s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = ok; s.onerror = () => { carregando = null; falha(new Error('Não foi possível carregar a tela segura do banco. Verifique a internet.')); };
      document.head.appendChild(s);
    });
    return carregando;
  }
  // abrir({ connectToken, url }) → Promise com o itemId (ou rejeita se o usuário fechar/der erro)
  async function abrir({ connectToken, url }) {
    await carregar(url);
    return new Promise((ok, falha) => {
      let feito = false;
      const w = new raiz.PluggyConnect({
        connectToken, includeSandbox: false,
        onSuccess: d => { feito = true; ok(d && d.item && d.item.id); },
        onError: e => { feito = true; falha(new Error((e && e.message) || 'O banco não completou a conexão.')); },
        onClose: () => { if (!feito) falha(new Error('Conexão cancelada.')); }
      });
      w.init();
    });
  }
  raiz.RumoBanco = { abrir };
})(window);
