/* Rumi — mascote do agente. SVG com sombreamento em gradiente (aparência 3D) e 7 estados.
 * Uso: RumiMascote.criar('espera', 64) -> <svg>; RumiMascote.definir(svg, 'analisando').
 * Estados: espera, processando, analisando, executando, confirmando, problema, apresentando. */
(function (g) {
  const NS = 'http://www.w3.org/2000/svg';
  const ESTADOS = { espera: 'Pronto para ajudar', processando: 'Pensando…', analisando: 'Analisando seus dados', executando: 'Executando', confirmando: 'Pronto, feito!', problema: 'Algo não deu certo', apresentando: 'Apresentando a análise' };
  const HUMOR = { ok: 'espera', espera: 'espera', identificando: 'analisando', analisando: 'analisando', executando: 'executando', confirmando: 'confirmando', problema: 'problema', apresentando: 'apresentando', processando: 'processando' };
  let n = 0;
  function criar(estado, tamanho) {
    const id = 'rm' + (++n);
    const h = '<svg xmlns="' + NS + '" viewBox="0 0 120 130" width="' + (tamanho || 64) + '" height="' + Math.round((tamanho || 64) * 130 / 120) + '" class="rumi" role="img" aria-label="Rumi, o assistente do Rumo">' +
      '<defs>' +
      '<radialGradient id="' + id + 'c" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#E4D8FF"/><stop offset=".38" stop-color="#9C74FA"/><stop offset=".8" stop-color="#5B28C8"/><stop offset="1" stop-color="#3A157F"/></radialGradient>' +
      '<radialGradient id="' + id + 'r" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFC2E2"/><stop offset=".6" stop-color="#FF4DA6"/><stop offset="1" stop-color="#B0206F"/></radialGradient>' +
      '<linearGradient id="' + id + 'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241450"/><stop offset="1" stop-color="#0A0518"/></linearGradient>' +
      '<radialGradient id="' + id + 'o" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#67E8F9"/><stop offset="1" stop-color="#0891B2"/></radialGradient>' +
      '</defs>' +
      '<ellipse class="rm-sombra" cx="60" cy="122" rx="34" ry="5.5" fill="#000" opacity=".38"/>' +
      '<g class="rm-corpo">' +
        '<line x1="60" y1="21" x2="60" y2="11" stroke="#C4B5FD" stroke-width="3" stroke-linecap="round"/>' +
        '<circle class="rm-orb" cx="60" cy="8" r="5" fill="url(#' + id + 'o)"/>' +
        '<circle cx="13" cy="70" r="9" fill="url(#' + id + 'r)"/><circle cx="107" cy="70" r="9" fill="url(#' + id + 'r)"/>' +
        '<circle cx="60" cy="68" r="46" fill="url(#' + id + 'c)"/>' +
        '<ellipse cx="40" cy="38" rx="16" ry="8" fill="#fff" opacity=".34" transform="rotate(-28 40 38)"/>' +
        '<rect x="27" y="47" width="66" height="45" rx="22.5" fill="url(#' + id + 'f)" stroke="rgba(196,181,253,.55)" stroke-width="1.4"/>' +
        '<g class="rm-olhos"><g class="rm-olho"><ellipse cx="46" cy="66" rx="6.5" ry="8.5" fill="#22D3EE"/><circle cx="44" cy="62.5" r="2.2" fill="#fff"/></g><g class="rm-olho"><ellipse cx="74" cy="66" rx="6.5" ry="8.5" fill="#22D3EE"/><circle cx="72" cy="62.5" r="2.2" fill="#fff"/></g></g>' +
        '<path class="rm-b rm-b-sorriso" d="M50 79 Q60 88 70 79" fill="none" stroke="#22D3EE" stroke-width="3" stroke-linecap="round"/>' +
        '<path class="rm-b rm-b-reto" d="M52 81 H68" fill="none" stroke="#22D3EE" stroke-width="3" stroke-linecap="round"/>' +
        '<path class="rm-b rm-b-triste" d="M50 85 Q60 77 70 85" fill="none" stroke="#FB7185" stroke-width="3" stroke-linecap="round"/>' +
        '<path class="rm-sobr" d="M38 52 L53 56 M82 52 L67 56" fill="none" stroke="#FB7185" stroke-width="2.6" stroke-linecap="round"/>' +
      '</g>' +
      '<g class="rm-x rm-x-proc"><circle cx="34" cy="2" r="3.4" fill="#C4B5FD"/><circle cx="60" cy="-2" r="3.4" fill="#C4B5FD"/><circle cx="86" cy="2" r="3.4" fill="#C4B5FD"/></g>' +
      '<g class="rm-x rm-x-ana"><circle cx="97" cy="96" r="12" fill="rgba(34,211,238,.18)" stroke="#E4D8FF" stroke-width="4"/><line x1="106" y1="105" x2="116" y2="115" stroke="#E4D8FF" stroke-width="5" stroke-linecap="round"/></g>' +
      '<g class="rm-x rm-x-exe"><g class="rm-engr" transform="translate(98 98)"><circle r="10" fill="none" stroke="#FF8AC6" stroke-width="5" stroke-dasharray="5.2 4.2"/><circle r="5" fill="#FF4DA6"/></g></g>' +
      '<g class="rm-x rm-x-ok"><circle cx="100" cy="28" r="14" fill="#22C55E" stroke="#fff" stroke-width="2.4"/><path d="M93 28.5 L98.5 34 L108 22.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g class="rm-x rm-x-prob"><circle cx="100" cy="28" r="14" fill="#EF4444" stroke="#fff" stroke-width="2.4"/><path d="M100 20 V30" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="36" r="2.3" fill="#fff"/></g>' +
      '<g class="rm-x rm-x-apr"><rect x="84" y="82" width="32" height="30" rx="5" fill="#0A0518" stroke="#E4D8FF" stroke-width="2.2"/><rect x="89" y="99" width="6" height="9" fill="#22D3EE"/><rect x="98" y="93" width="6" height="15" fill="#A78BFA"/><rect x="107" y="87" width="6" height="21" fill="#FF4DA6"/></g>' +
      '</svg>';
    const t = document.createElement('template'); t.innerHTML = h; const svg = t.content.firstChild;
    definir(svg, estado || 'espera'); return svg;
  }
  function definir(svg, estado) { estado = HUMOR[estado] || (ESTADOS[estado] ? estado : 'espera'); svg.dataset.e = estado; svg.setAttribute('aria-label', 'Rumi: ' + ESTADOS[estado].toLowerCase()); return estado; }
  g.RumiMascote = { criar, definir, ESTADOS, HUMOR, rotulo: e => ESTADOS[HUMOR[e] || e] || ESTADOS.espera };
})(window);
