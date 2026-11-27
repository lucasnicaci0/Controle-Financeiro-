/* Permissões e privacidade do Rumi: etapa de primeiro acesso (modal único) e seção em Opções. As escolhas ficam na conta (servidor). */
(function (g) {
  const DEF = [
    { k: 'privacidade', t: 'Privacidade e tratamento de dados', d: 'Deixa o Rumi ler seus lançamentos, contas e metas para responder e fazer o que você pedir. Seus dados ficam só na sua conta e nunca são compartilhados com outras pessoas.', se: 'O Rumi fica desativado. O restante do app funciona normalmente.' },
    { k: 'memoria', t: 'Memória e aprendizado', d: 'Permite que o Rumi lembre como você chama seus gastos, sua conta padrão e seu apelido. Você pode ver, corrigir e apagar tudo.', se: 'O Rumi não aprende com você; vai perguntar de novo o que já respondeu.' },
    { k: 'whatsapp', t: 'Integração com o WhatsApp', d: 'Permite conectar o seu número para lançar e consultar pelo WhatsApp (API oficial da Meta). A conexão só acontece depois que você enviar um código pelo WhatsApp.', se: 'Não será possível conectar o WhatsApp.' },
    { k: 'voz', t: 'Voz e microfone', d: 'Permite falar com o Rumi e ouvir as respostas. O navegador ainda vai pedir autorização do microfone; o áudio pode ser processado pelo serviço de voz dele e o Rumo não guarda áudio.', se: 'O botão de microfone fica desativado.' }
  ];
  const rotuloEstado = i => i.concedida ? 'Concedida' + (i.data ? ' em ' + String(i.data).slice(8, 10) + '/' + String(i.data).slice(5, 7) + '/' + String(i.data).slice(0, 4) : '') : i.estado === 'negada' ? 'Não concedida' : i.estado === 'adiada' ? 'Decidir depois' : 'Ainda não respondida';

  // modo: 'primeiro' (primeiro acesso, com "Decidir depois") | 'revisar'. Resolve quando o diálogo fecha.
  function abrir(ctx, opc) {
    opc = opc || {};
    const { api, el, toast } = ctx;
    return new Promise(async resolve => {
      let dados; try { dados = await api('permissoes_listar'); } catch (e) { toast((e && e.message) || 'Não foi possível carregar as permissões.', 'erro'); return resolve(null); }
      const atual = {}; dados.itens.forEach(i => { atual[i.chave] = i.concedida; });
      const caixas = {};
      const primeiro = opc.modo === 'primeiro';
      const fundo = el('div', { class: 'rm-modal', role: 'presentation' });
      const fecha = r => { document.removeEventListener('keydown', tecla, true); fundo.remove(); document.body.classList.remove('rm-modal-aberto'); if (antes && antes.focus) try { antes.focus(); } catch (e) { /* ok */ } resolve(r); };
      const salvar = async itens => { try { const r = await api('permissoes_salvar', { itens }); toast('Escolhas salvas', 'ok'); fecha(r); } catch (e) { toast((e && e.message) || 'Não foi possível salvar.', 'erro'); } };
      const lista = DEF.filter(d => !opc.foco || opc.foco === d.k || !primeiro).map(d => {
        const it = dados.itens.find(i => i.chave === d.k), cb = el('input', { id: 'perm-' + d.k, type: 'checkbox', role: 'switch', checked: atual[d.k] ? true : false });
        caixas[d.k] = cb;
        return el('div', { class: 'rm-perm' + (opc.foco === d.k ? ' foco' : ''), 'data-perm': d.k },
          el('div', null, el('label', { for: 'perm-' + d.k, class: 'lb' }, d.t), el('p', { class: 'opt-sub' }, d.d), el('p', { class: 'opt-sub' }, el('b', null, 'Se você não permitir: '), d.se), it && it.estado ? el('p', { class: 'opt-sub' }, 'Situação atual: ' + rotuloEstado(it)) : null),
          el('label', { class: 'sw' }, cb, el('span', { class: 'trk' })));
      });
      const escolhas = () => { const o = {}; Object.keys(caixas).forEach(k => { o[k] = caixas[k].checked ? 'concedida' : 'negada'; }); return o; };
      const adiar = el('button', { type: 'button', class: 'btn ghost', 'data-perm-depois': '1', onclick: () => { const o = {}; Object.keys(caixas).forEach(k => { const it = dados.itens.find(i => i.chave === k); if (!it.estado) o[k] = 'adiada'; }); salvar(o); } }, primeiro ? 'Decidir depois' : 'Cancelar');
      const caixa = el('section', { class: 'rm-modal-caixa glass', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'perm-t' },
        el('h2', { id: 'perm-t' }, primeiro ? 'Antes de começar' : 'Permissões e privacidade'),
        el('p', { class: 'small mute' }, 'Você escolhe o que o app pode fazer. Nada é ativado sem a sua escolha, e você pode mudar tudo depois em Opções › Permissões. Recusar não impede o uso do restante do app.'),
        ...lista,
        el('div', { class: 'rm-modal-acoes' }, adiar,
          el('button', { type: 'button', class: 'btn ghost', 'data-perm-tudo': '1', onclick: () => { Object.keys(caixas).forEach(k => { caixas[k].checked = true; }); } }, 'Permitir tudo'),
          el('button', { type: 'button', class: 'btn', 'data-perm-salvar': '1', onclick: () => salvar(escolhas()) }, 'Salvar minhas escolhas')));
      fundo.append(caixa); document.body.append(fundo); document.body.classList.add('rm-modal-aberto');
      const antes = document.activeElement;
      const tecla = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); if (primeiro) adiar.click(); else fecha(null); } else if (ev.key === 'Tab') { const f = [...caixa.querySelectorAll('input,button')].filter(x => !x.disabled); const i = f.indexOf(document.activeElement); if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); } } };
      document.addEventListener('keydown', tecla, true);
      const alvo = opc.foco && caixas[opc.foco] ? caixas[opc.foco] : caixa.querySelector('input'); if (alvo) alvo.focus();
    });
  }
  // chamada depois do login: só aparece se houver algo sem resposta (ou termo renovado). Respondido não volta a perguntar.
  async function verificar(ctx) {
    let d; try { d = await ctx.api('permissoes_listar'); } catch (e) { return null; }
    if (!d.perguntar.length) return null;
    return abrir(ctx, { modo: 'primeiro' });
  }
  // seção para Opções
  function secao(ctx) {
    const { api, el, toast } = ctx, corpo = el('div');
    const desenhar = async () => {
      let d; try { d = await api('permissoes_listar'); } catch (e) { corpo.replaceChildren(el('p', { class: 'small mute' }, 'Não foi possível carregar as permissões.')); return; }
      corpo.replaceChildren(el('p', { class: 'small mute' }, 'Consulte e altere aqui o que você autorizou. Versão do termo: ' + d.versao + '.'),
        ...DEF.map(def => { const it = d.itens.find(i => i.chave === def.k);
          return el('div', { class: 'opt-row', 'data-perm': def.k }, el('div', null, el('label', { for: 'op-perm-' + def.k, class: 'lb' }, def.t), el('p', { class: 'opt-sub' }, def.d), el('p', { class: 'opt-sub', 'data-estado': it.estado }, rotuloEstado(it))),
            el('label', { class: 'sw' }, el('input', { id: 'op-perm-' + def.k, type: 'checkbox', role: 'switch', checked: it.concedida ? true : false, onchange: async e => {
              const on = e.target.checked;
              if (!on && def.k === 'privacidade' && !confirm('Sem esta permissão o Rumi deixa de funcionar (o resto do app continua normal). Desativar?')) { e.target.checked = true; return; }
              try { await api('permissoes_salvar', { itens: { [def.k]: on ? 'concedida' : 'negada' } }); if (def.k === 'voz' && !on && g.RumiVoz) g.RumiVoz.calar(); toast('Permissão atualizada', 'ok'); await desenhar(); if (ctx.recarregarRumi) ctx.recarregarRumi(); } catch (er) { e.target.checked = !on; toast((er && er.message) || 'Erro', 'erro'); } } }), el('span', { class: 'trk' }))); }));
    };
    desenhar();
    return el('div', { class: 'card glass reveal', id: 'opt-perm' }, el('h3', null, '🔐 Permissões e privacidade'), corpo);
  }
  g.RumiPermissoes = { abrir, verificar, secao, DEF };
})(window);
