/* Tutorial interativo de primeiro acesso: destaca elementos reais do app, salva o progresso na conta e pode ser pausado, retomado ou refeito. */
(function (g) {
  const PASSOS = [
    { id: 'visao', titulo: 'Bem-vindo ao Rumo', tela: 'jornada', alvo: '.jornada', texto: 'O Rumo organiza o seu dinheiro: receitas, despesas, contas, metas e planejamento num só lugar. Esta é a Jornada: cada região do cérebro representa uma parte das suas finanças.', ex: 'Toque numa região para ver o resumo dela.' },
    { id: 'nav', titulo: 'Navegação', tela: 'jornada', alvo: '#nav', texto: 'A barra de seções leva você a cada área do app. Deslize para os lados para ver todas.', ex: 'Toque em "Lançamentos" para registrar um gasto.' },
    { id: 'painel', titulo: 'Painel', tela: 'painel', alvo: '#view .hero, #view .card', texto: 'O Painel mostra o saldo nas contas, as receitas e despesas do mês e o comparativo dos últimos 6 meses.', ex: 'Use as setas do mês, no topo, para ver outros períodos.' },
    { id: 'lanc', titulo: 'Receitas e despesas', tela: 'lanc', alvo: '#view form, #view .card', texto: 'Aqui você registra o que entrou e o que saiu: escolha Despesa ou Receita, informe valor, data, conta e categoria.', ex: 'Ex.: Despesa · R$ 45,00 · Almoço · Alimentação.' },
    { id: 'cats', titulo: 'Categorias e movimentações', tela: 'cats', alvo: '#view form, #view .card', texto: 'As categorias organizam os lançamentos (Mercado, Transporte, Salário…). Você pode criar, arquivar e excluir as suas.', ex: 'Ex.: crie a categoria "Pets" e use nos lançamentos.' },
    { id: 'metas', titulo: 'Metas e planejamento', tela: 'metas', alvo: '#view form, #view .card', texto: 'Defina objetivos com valor alvo e prazo. Em Orçamentos você planeja quanto gastar por categoria em cada mês.', ex: 'Ex.: meta "Viagem" de R$ 5.000,00 até dezembro.' },
    { id: 'relat', titulo: 'Relatórios e análises', tela: 'cons', alvo: '#view .card', texto: 'O Consultor analisa o seu mês e mostra avisos e dicas. Em Limites você acompanha tetos de gasto e os alertas.', ex: 'Toque em "Reanalisar" para atualizar a análise.' },
    { id: 'config', titulo: 'Configurações', tela: 'opcoes', alvo: '#opt-perm', texto: 'Em Opções você muda tema, cores e tamanho do texto e controla as permissões e a privacidade do Rumi.', ex: 'Você pode rever o que autorizou quando quiser.' },
    { id: 'zap', titulo: 'WhatsApp', tela: 'opcoes', alvo: '#opt-rumi', texto: 'Você pode conectar o seu número para lançar e consultar pelo WhatsApp. A conexão só acontece depois que você envia um código pelo próprio WhatsApp.', ex: 'Ex.: envie "gastei 30 no almoço" para o número do Rumo.', zap: true },
    { id: 'rumi', titulo: 'Conheça o Rumi', tela: null, alvo: '#rumi-fab', texto: 'Este é o Rumi, seu copiloto. Toque nele para conversar: ele registra gastos, consulta saldos, explica telas e abre qualquer seção para você.', ex: 'Experimente: "gastei 45 no almoço" ou "abrir metas".', rumi: true }
  ];
  let ctxT = null, ativo = null, camada = null, resizeH = null;

  const zapDisponivel = async ctx => { try { const z = await ctx.api('agente_zap_status'); return !!(z && (z.configurado || ctx.S.demo)); } catch (e) { return false; } };

  async function salvar(estado, passo) { try { return await ctxT.api('onboarding_salvar', { estado, passo }); } catch (e) { return null; } }
  function limpar() { if (camada) { camada.remove(); camada = null; } if (resizeH) { removeEventListener('resize', resizeH); removeEventListener('scroll', resizeH); resizeH = null; } document.removeEventListener('keydown', teclas, true); document.body.classList.remove('rm-tut'); ativo = null; }
  function teclas(ev) { if (!ativo) return; if (ev.key === 'Escape' && !document.body.classList.contains('rm-modal-aberto')) { ev.stopPropagation(); pausar(); } else if (ev.key === 'ArrowRight') avancar(1); else if (ev.key === 'ArrowLeft') avancar(-1); }

  async function aguardaAlvo(sel) { for (let i = 0; i < 20; i++) { const e = sel && [...document.querySelectorAll(sel)].find(x => x.getClientRects().length > 0); if (e) return e; await new Promise(r => setTimeout(r, 100)); } return null; }

  async function mostrar() {
    const { el } = ctxT, p = ativo.lista[ativo.i], n = ativo.lista.length;
    if (p.tela && ctxT.S.view !== p.tela) { try { await ctxT.ir(p.tela); } catch (e) { /* segue sem navegar */ } }
    if (!ativo) return;
    const alvo = await aguardaAlvo(p.alvo); if (!ativo) return;
    if (alvo) alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const idxSalvo = PASSOS.indexOf(p) + 1; salvar('em_andamento', Math.min(idxSalvo, PASSOS.length));
    const tira = el('div', { class: 'rm-tut-prog', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': n, 'aria-valuenow': ativo.i + 1, 'aria-label': 'Progresso do tutorial' }, el('i', { style: 'width:' + Math.round((ativo.i + 1) / n * 100) + '%' }));
    const ultimo = ativo.i === n - 1;
    const cartao = el('section', { class: 'rm-tut-card glass', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tut-t', 'aria-describedby': 'tut-d' },
      tira, el('p', { class: 'small mute', 'data-tut-pos': '1' }, 'Passo ' + (ativo.i + 1) + ' de ' + n),
      el('h3', { id: 'tut-t' }, p.titulo), el('p', { id: 'tut-d' }, p.texto), el('p', { class: 'small tut-ex' }, '💡 ' + p.ex),
      el('div', { class: 'rm-tut-acoes' },
        el('button', { type: 'button', class: 'btn ghost', 'data-tut': 'voltar', disabled: ativo.i === 0, onclick: () => avancar(-1) }, 'Voltar'),
        el('button', { type: 'button', class: 'btn', 'data-tut': 'proximo', onclick: () => avancar(1) }, ultimo ? 'Concluir' : 'Próximo')),
      el('div', { class: 'rm-tut-sec' },
        el('button', { type: 'button', class: 'chip', 'data-tut': 'pausar', onclick: () => pausar() }, '⏸ Pausar'),
        el('button', { type: 'button', class: 'chip', 'data-tut': 'pular', onclick: () => pular() }, 'Pular tutorial'),
        el('button', { type: 'button', class: 'chip', 'data-tut': 'rumi', onclick: () => perguntar() }, '💬 Perguntar ao Rumi')));
    const luz = el('div', { class: 'rm-tut-luz', 'aria-hidden': 'true' });
    camada.replaceChildren(luz, cartao); ativo.luz = luz; ativo.cartao = cartao; ativo.alvoEl = alvo;
    posicionar(); setTimeout(posicionar, 350);
    const f = cartao.querySelector('[data-tut=proximo]'); if (f) f.focus({ preventScroll: true });
    if (p.rumi && g.RumiMascote) cartao.querySelector('h3').prepend(g.RumiMascote.criar('apresentando', 34), ' ');
  }
  function posicionar() {
    if (!ativo || !ativo.cartao) return; const luz = ativo.luz, c = ativo.cartao, a = ativo.alvoEl;
    if (!a || !document.contains(a)) { luz.style.cssText = 'display:none'; c.style.cssText = ''; c.classList.add('centro'); return; }
    c.classList.remove('centro'); const r = a.getBoundingClientRect(), pad = 6;
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), w = Math.min(innerWidth - 8, r.width + pad * 2), h = Math.min(r.height + pad * 2, innerHeight * .6);
    luz.style.cssText = 'display:block;top:' + top + 'px;left:' + left + 'px;width:' + w + 'px;height:' + h + 'px';
    const ch = c.offsetHeight || 220, abaixo = top + h + 12 + ch <= innerHeight - 8, acima = top - 12 - ch >= 8;
    let y = abaixo ? top + h + 12 : acima ? top - 12 - ch : Math.max(8, innerHeight - ch - 8);
    y = Math.max(8, Math.min(y, innerHeight - ch - 8));
    c.style.top = y + 'px'; c.style.bottom = 'auto';
  }
  async function avancar(d) {
    if (!ativo) return; const n = ativo.lista.length, novo = ativo.i + d;
    if (novo < 0) return;
    if (novo >= n) return concluir();
    ativo.i = novo; await mostrar();
  }
  async function concluir() { const ctx = ctxT; limpar(); await salvar('concluido', PASSOS.length); ctx.toast('Tutorial concluído! Você pode rever em Opções.', 'ok'); if (g.RumiFlutuante) g.RumiFlutuante.dica('Pode me chamar quando quiser!', 6000); }
  async function pausar() { if (!ativo) return; const ctx = ctxT, p = PASSOS.indexOf(ativo.lista[ativo.i]) + 1; limpar(); await salvar('em_andamento', p); ctx.toast('Tutorial pausado. Retome em Opções ou pedindo ao Rumi.', 'ok'); }
  async function pular() { if (!ativo) return; if (!confirm('Pular o tutorial? Você pode refazê-lo depois em Opções.')) return; limpar(); await salvar('pulado', ativo ? 0 : 0); ctxT.toast('Tutorial dispensado. Ele está disponível em Opções.', 'ok'); }
  async function perguntar() { await pausar(); if (g.RumiFlutuante) g.RumiFlutuante.abrir(); }

  // inicia (ou retoma) o tutorial
  async function iniciar(ctx, opc) {
    opc = opc || {}; ctxT = ctx; limpar();
    const est = await ctx.api('onboarding_estado').catch(() => ({ estado: 'novo', passo: 0 }));
    let lista = PASSOS.filter(p => !p.zap); if (await zapDisponivel(ctx)) lista = PASSOS.slice();
    let i = 0;
    if (opc.retomar && est.estado === 'em_andamento' && est.passo > 0) { const alvo = PASSOS[Math.min(est.passo, PASSOS.length) - 1]; i = Math.max(0, lista.indexOf(alvo)); }
    if (g.RumiFlutuante && g.RumiFlutuante.estaAberto()) g.RumiFlutuante.fechar();
    camada = ctx.el('div', { class: 'rm-tut' }); document.body.append(camada); document.body.classList.add('rm-tut');
    ativo = { lista, i }; resizeH = () => posicionar(); addEventListener('resize', resizeH); addEventListener('scroll', resizeH, { passive: true }); document.addEventListener('keydown', teclas, true);
    await mostrar();
  }
  async function automatico(ctx) {
    ctxT = ctx; let est; try { est = await ctx.api('onboarding_estado'); } catch (e) { return; }
    if (est.automatico) await iniciar(ctx, {});
  }
  function encerrar() { limpar(); }
  // cartão em Opções
  function cartao(ctx) {
    const { el } = ctx, corpo = el('div');
    const desenha = async () => {
      let e; try { e = await ctx.api('onboarding_estado'); } catch (er) { corpo.replaceChildren(el('p', { class: 'small mute' }, 'Não foi possível carregar o tutorial.')); return; }
      const txt = e.estado === 'concluido' ? 'Você concluiu o tutorial.' : e.estado === 'em_andamento' ? 'Tutorial em andamento: passo ' + Math.max(1, e.passo) + ' de ' + e.etapas + '.' : e.estado === 'pulado' ? 'Você dispensou o tutorial.' : 'Você ainda não viu o tutorial.';
      corpo.replaceChildren(el('p', { class: 'opt-sub', 'data-tut-estado': e.estado }, txt), el('div', { class: 'rm-modal-acoes', style: 'justify-content:flex-start' },
        e.estado === 'em_andamento' ? el('button', { type: 'button', class: 'btn', 'data-tut-retomar': '1', onclick: () => iniciar(ctx, { retomar: true }) }, 'Continuar tutorial') : null,
        el('button', { type: 'button', class: 'btn ghost', 'data-tut-refazer': '1', onclick: async () => { await ctx.api('onboarding_salvar', { estado: 'em_andamento', passo: 0 }).catch(() => 0); iniciar(ctx, {}); } }, e.estado === 'novo' ? 'Iniciar tutorial' : 'Refazer tutorial')));
    };
    desenha();
    return el('section', { class: 'card glass', id: 'opt-tutorial' }, el('h3', null, '🎓 Tutorial do app'), corpo);
  }
  g.RumiTutorial = { ativo: () => !!ativo, pausar, iniciar, automatico, encerrar, cartao, PASSOS };
})(window);
