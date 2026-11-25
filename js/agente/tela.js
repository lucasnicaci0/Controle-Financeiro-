/* Tela do Rumi: chat, voz, confirmações, Modo Contador e ajustes (permissões, memória, auditoria, WhatsApp). */
(function (g) {
  const M = () => g.RumiMascote, V = () => g.RumiVoz;
  const est = { msgs: [], carregado: false, cfg: null, enviando: false };   // sobrevive à navegação entre telas
  const PERMS = [['criar', 'Criar lançamentos', 'Registrar gastos e receitas que você pedir.'], ['editar', 'Alterar lançamentos', 'Mudar valor, categoria, data ou descrição (sempre com sua confirmação).'], ['excluir', 'Excluir lançamentos', 'Apagar lançamentos (sempre com sua confirmação).'], ['memoria', 'Aprender com você', 'Guardar como você chama seus gastos, conta padrão e apelido.'], ['historico', 'Guardar o histórico da conversa', 'Desligado: a conversa não fica salva (ao sair, some).'], ['voz_resposta', 'Responder também em áudio', 'Lê as respostas em voz alta neste aparelho.']];

  function montar(raiz, ctx) {
    const { api, el, toast, brl } = ctx, falha = e => toast((e && e.message) || 'Erro', 'erro');
    const masc = M().criar('espera', 64), status = el('p', { class: 'rm-status', role: 'status', 'aria-live': 'polite' }, M().rotulo('espera'));
    const log = el('div', { class: 'rm-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o Rumi' });
    const sug = el('div', { class: 'sugestoes', 'aria-label': 'Sugestões de resposta' });
    const campo = el('input', { type: 'text', maxlength: 500, placeholder: 'Ex.: gastei 45 no almoço', autocomplete: 'off', 'aria-label': 'Mensagem para o Rumi' });
    const enviar = el('button', { class: 'btn', type: 'submit' }, 'Enviar');
    const mic = el('button', { type: 'button', class: 'rm-mic', 'aria-label': 'Falar com o Rumi', 'aria-pressed': 'false', title: V().ouvirOk() ? 'Falar (toque, fale e aguarde)' : 'Seu navegador não tem reconhecimento de voz; use o ditado do teclado do celular.' }, '🎙️');
    if (!V().ouvirOk()) mic.disabled = true;
    const ajustes = el('div', { class: 'rm-ajustes' });
    const definirHumor = (h, txt) => { const e = M().definir(masc, h); status.textContent = txt || M().rotulo(e); };

    function linha(papel, texto, extra) {
      const bolha = el('div', { class: 'rm-msg' + (extra && extra.voz ? ' voz' : '') + (papel === 'agente' ? ' txt' : '') }, texto);
      if (extra && extra.grupo && extra.executadas && extra.executadas.some(x => ['lancar', 'alterar', 'excluir'].includes(x.op))) {
        const rotulo = extra.executadas.filter(x => ['lancar', 'alterar', 'excluir'].includes(x.op)).length + ' alteração(ões) feita(s)';
        bolha.append(el('div', { class: 'rm-feito' }, el('span', { class: 'ok' }, '✔ ' + rotulo), el('button', { type: 'button', class: 'chip', 'data-desfazer': extra.grupo, onclick: async ev => { try { await api('agente_desfazer', { grupo: extra.grupo }); ev.target.replaceWith(el('span', { class: 'small mute' }, 'Desfeito')); if (ctx.atualizar) await ctx.atualizar(); definirHumor('confirmando', 'Desfeito'); } catch (e) { falha(e); } } }, 'Desfazer')));
      }
      return el('div', { class: 'rm-linha ' + papel }, papel === 'agente' ? M().criar(extra && extra.humor || 'espera', 28) : null, bolha);
    }
    const desenha = () => {
      const vazio = est.msgs.length ? [] : [linha('agente', 'Olá! Eu sou o Rumi. Diga o que você gastou ou recebeu ("gastei 45 no almoço"), pergunte sobre suas finanças ou toque em Modo Contador para um panorama.', { humor: 'espera' })];
      log.replaceChildren(...vazio, ...est.msgs.map(m => linha(m.papel, m.texto, m))); log.scrollTop = log.scrollHeight;
    };
    const desenhaSug = lista => sug.replaceChildren(...(lista || []).slice(0, 8).map(s => el('button', { type: 'button', class: 'chip', onclick: () => enviarMsg(s) }, s)));

    async function enviarMsg(texto, voz) {
      texto = String(texto || '').trim(); if (!texto || est.enviando) return;
      est.enviando = true; enviar.disabled = true; campo.value = ''; desenhaSug([]);
      est.msgs.push({ papel: 'usuario', texto, voz: !!voz }); desenha(); definirHumor('processando');
      try {
        const r = await api('agente_mensagem', { texto, msgId: (g.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'm' + Date.now() + Math.random() });
        est.msgs.push({ papel: 'agente', texto: r.resposta, humor: r.humor, grupo: r.grupo, executadas: r.executadas });
        desenha(); desenhaSug(r.sugestoes);
        definirHumor(r.humor === 'ok' ? 'espera' : r.humor);
        if (r.executadas && r.executadas.length && ctx.atualizar) await ctx.atualizar();
        if (est.cfg && est.cfg.voz_resposta && V().falarOk()) V().falar(r.resposta);
        if (r.executadas && r.executadas.length) { atualizaAjustes(); }
      } catch (e) { est.msgs.push({ papel: 'agente', texto: 'Não consegui responder agora: ' + (e.message || 'erro'), humor: 'problema' }); desenha(); definirHumor('problema'); }
      est.enviando = false; enviar.disabled = false; campo.focus();
    }

    mic.addEventListener('click', () => {
      if (mic.getAttribute('aria-pressed') === 'true') { V().parar(); return; }
      V().calar(); mic.setAttribute('aria-pressed', 'true'); definirHumor('espera', 'Ouvindo… pode falar'); let final = '';
      V().ouvir({ parcial: t => { campo.value = t; }, final: t => { final = t; campo.value = t; },
        erro: c => { if (c === 'not-allowed' || c === 'service-not-allowed') toast('Permita o uso do microfone para falar com o Rumi.', 'erro'); else if (c === 'no-speech') toast('Não ouvi nada. Tente de novo.', 'erro'); else if (c !== 'aborted') toast('Não consegui ouvir agora.', 'erro'); },
        fim: () => { mic.setAttribute('aria-pressed', 'false'); definirHumor('espera'); if (final) enviarMsg(final, true); } });
    });

    const rapido = el('div', { class: 'rm-rapido' },
      el('button', { type: 'button', class: 'chip forte', 'data-contador': '1', onclick: () => enviarMsg('modo contador') }, '📊 Modo Contador'),
      ...['Quanto posso gastar até o fim do mês?', 'Onde estou gastando mais?', 'Estou gastando mais do que ganho?'].map(t => el('button', { type: 'button', class: 'chip', onclick: () => enviarMsg(t) }, t)),
      el('button', { type: 'button', class: 'chip', onclick: () => enviarMsg('desfazer') }, '↩ Desfazer'));

    /* ---------- ajustes ---------- */
    async function atualizaAjustes() {
      try {
        const [c, mem, aud, zap] = await Promise.all([api('agente_config'), api('agente_memoria'), api('agente_auditoria'), api('agente_zap_status')]);
        est.cfg = c.config;
        const abertas = [...ajustes.querySelectorAll('details[open]')].map(d => d.dataset.sec);
        ajustes.replaceChildren(secPerm(c), secMem(mem), secAud(aud), secZap(zap, c));
        ajustes.querySelectorAll('details').forEach(d => { if (abertas.includes(d.dataset.sec)) d.open = true; });
      } catch (e) { ajustes.replaceChildren(el('p', { class: 'small mute' }, 'Não foi possível carregar os ajustes agora.')); }
    }
    const secPerm = c => el('details', { class: 'card glass', 'data-sec': 'perm' }, el('summary', null, '🔐 Permissões e privacidade'),
      el('div', null, el('p', { class: 'small mute' }, 'Você decide o que o Rumi pode fazer. Excluir e alterar sempre pedem a sua confirmação. Seus dados e a memória do Rumi são só seus e nunca são compartilhados com outras contas.'),
        ...PERMS.map(([k, t, s]) => el('div', { class: 'opt-row' }, el('div', null, el('label', { for: 'rm-p-' + k, class: 'lb' }, t), el('p', { class: 'opt-sub' }, s)),
          el('label', { class: 'sw' }, el('input', { id: 'rm-p-' + k, type: 'checkbox', role: 'switch', checked: c.config[k] ? true : false, onchange: async e => { try { const r = await api('agente_config_salvar', { [k]: e.target.checked }); est.cfg = r.config; if (k === 'voz_resposta' && !e.target.checked) V().calar(); toast('Salvo', 'ok'); } catch (er) { e.target.checked = !e.target.checked; falha(er); } } }), el('span', { class: 'trk' })))),
        el('p', { class: 'small mute' }, 'Voz: ao falar, o navegador pode enviar o áudio ao serviço de reconhecimento de voz dele (no Chrome, ao Google). O Rumo não grava nem guarda áudio; só o texto transcrito.'),
        el('div', { style: 'margin-top:8px' }, el('button', { type: 'button', class: 'btn ghost mini', 'data-limpar-hist': '1', onclick: async () => { if (!confirm('Apagar todo o histórico desta conversa?')) return; try { await api('agente_historico_limpar'); est.msgs = []; desenha(); toast('Histórico apagado', 'ok'); } catch (e) { falha(e); } } }, 'Apagar histórico da conversa'))));
    const secMem = mem => {
      const cats = (ctx.S.cats || []).filter(c => c.tipo === 'despesa' && !c.arquivada), exp = el('input', { type: 'text', maxlength: 40, placeholder: 'Expressão (ex.: mercadinho)', 'aria-label': 'Expressão para o Rumi aprender' }), sel = el('select', { 'aria-label': 'Categoria' }, ...cats.map(c => el('option', { value: c.nome }, c.nome)));
      return el('details', { class: 'card glass', 'data-sec': 'mem' }, el('summary', null, '🧠 O que o Rumi aprendeu (' + mem.length + ')'),
        el('div', null, el('p', { class: 'small mute' }, 'Você pode corrigir ou apagar qualquer item. Ele usa isso para entender seu jeito de falar.'),
          ...(mem.length ? mem.map(m => { const inp = el('input', { type: 'text', value: m.conteudo, maxlength: 120, 'aria-label': 'Valor de ' + m.chave });
            return el('div', { class: 'rm-mem' }, el('span', { class: 'small' }, m.tipo === 'desc' ? '“' + m.chave + '” →' : m.chave + ':'), inp,
              el('button', { type: 'button', class: 'btn ghost mini', onclick: async () => { try { await api('agente_memoria_salvar', { tipo: m.tipo, chave: m.chave, conteudo: inp.value }); toast('Atualizado', 'ok'); } catch (e) { falha(e); } } }, 'Salvar'),
              el('button', { type: 'button', class: 'x', 'aria-label': 'Apagar da memória', onclick: async () => { try { await api('agente_memoria_apagar', { id: m.id }); atualizaAjustes(); } catch (e) { falha(e); } } }, '✕')); }) : [el('div', { class: 'vazio' }, 'Nada guardado ainda.')]),
          el('div', { class: 'rm-mem' }, exp, sel, el('button', { type: 'button', class: 'btn mini', onclick: async () => { if (!exp.value.trim()) return; try { await api('agente_memoria_salvar', { tipo: 'desc', chave: exp.value.trim().toLowerCase(), conteudo: sel.value }); atualizaAjustes(); } catch (e) { falha(e); } } }, 'Ensinar')),
          mem.length ? el('div', { style: 'margin-top:8px' }, el('button', { type: 'button', class: 'btn ghost mini', onclick: async () => { if (!confirm('Apagar tudo o que o Rumi aprendeu sobre você?')) return; try { await api('agente_memoria_limpar'); atualizaAjustes(); } catch (e) { falha(e); } } }, 'Apagar toda a memória')) : null));
    };
    const secAud = aud => el('details', { class: 'card glass', 'data-sec': 'aud' }, el('summary', null, '🧾 Registro de ações (' + aud.length + ')'),
      el('div', null, el('p', { class: 'small mute' }, 'Tudo o que o Rumi criou, alterou ou apagou fica aqui, com data e canal. Dá para desfazer.'),
        ...(aud.length ? aud.slice(0, 20).map(a => el('div', { class: 'rm-aud' + (a.desfeito ? ' desfeito' : '') }, el('span', null, (a.data || '').slice(5, 16).replace('T', ' ') + ' · ' + (a.canal === 'whatsapp' ? '💬 ' : '') + a.resumo),
          a.desfazivel && !a.desfeito ? el('button', { type: 'button', class: 'chip', onclick: async () => { try { await api('agente_desfazer', { grupo: a.grupo }); if (ctx.atualizar) await ctx.atualizar(); atualizaAjustes(); toast('Desfeito', 'ok'); } catch (e) { falha(e); } } }, 'Desfazer') : null)) : [el('div', { class: 'vazio' }, 'Nenhuma ação ainda.')])));
    const secZap = (z, c) => {
      const cod = el('div');
      return el('details', { class: 'card glass', 'data-sec': 'zap' }, el('summary', null, '💬 WhatsApp ' + (z.vinculado ? '(conectado)' : '')),
        el('div', null,
          !z.configurado && !ctx.S.demo ? el('div', { class: 'aviso-ex', role: 'status' }, 'O WhatsApp ainda não foi ativado neste app: o administrador precisa informar as credenciais da WhatsApp Cloud API nas Propriedades do script (veja docs/whatsapp.md).') : '',
          ctx.S.demo ? el('div', { class: 'aviso-ex', role: 'status' }, 'Modo demonstração: o WhatsApp é simulado.') : '',
          el('p', { class: 'small mute' }, 'Conecte seu número para registrar e consultar pelo WhatsApp (API oficial da Meta). Mensagens encaminhadas viram propostas de lançamento que você confirma. Hoje o Rumi lê só texto: para comprovantes, cole o texto. As respostas só chegam dentro da janela de 24 h depois da sua última mensagem.'),
          z.vinculado ? el('div', null, el('p', null, 'Número conectado: ', el('b', null, z.telefone)), el('button', { type: 'button', class: 'btn ghost mini', onclick: async () => { if (!confirm('Desconectar o WhatsApp?')) return; try { await api('agente_zap_desvincular'); atualizaAjustes(); } catch (e) { falha(e); } } }, 'Desconectar'))
            : el('div', null, el('button', { type: 'button', class: 'btn mini', 'data-zap-codigo': '1', onclick: async () => { try { const r = await api('agente_zap_codigo'); cod.replaceChildren(el('div', { class: 'rm-codigo', 'aria-label': 'Código de conexão' }, r.codigo), el('p', { class: 'small mute' }, 'Envie este código' + (r.numero ? ' para ' + r.numero : ' para o número do Rumi') + ' pelo WhatsApp em até 15 minutos.')); } catch (e) { falha(e); } } }, 'Gerar código de conexão'), cod)));
    };

    raiz.replaceChildren(el('div', { class: 'card glass reveal' },
      el('div', { class: 'rm-head' }, masc, el('div', null, el('h3', null, 'Rumi'), status)),
      rapido, log, sug,
      el('form', { class: 'rm-form', onsubmit: ev => { ev.preventDefault(); enviarMsg(campo.value); } }, campo, mic, enviar),
      el('p', { class: 'small mute', style: 'margin:8px 0 0' }, 'O Rumi segue regras e usa só os seus dados; não é uma IA externa. Análises são educativas e baseadas nos seus lançamentos, não recomendação de investimento.')), ajustes);
    desenha();
    if (!est.carregado) { est.carregado = true; api('agente_historico').then(h => { if (!est.msgs.length && h.length) { est.msgs = h.map(m => ({ papel: m.papel, texto: m.texto, humor: m.humor, grupo: m.grupo, executadas: m.grupo ? [{ op: 'lancar' }] : [] })); desenha(); } }).catch(() => { est.carregado = false; }); }
    atualizaAjustes();
    campo.focus();
  }
  g.RumiTela = { montar, reset: () => { est.msgs = []; est.carregado = false; est.cfg = null; } };
})(window);
