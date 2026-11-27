/* Modo demonstração do Rumi: usa o MESMO núcleo de conversa (AgenteCore) sobre os dados fictícios em memória. */
(function (g) {
  const ALIAS = { 'Restaurantes': 'Alimentação', 'Mercado': 'Alimentação', 'Contas de consumo': 'Moradia', 'Moradia/Aluguel': 'Moradia', 'Lazer e Hobbies': 'Lazer', 'Outras receitas': 'Extras', 'Investimentos': 'Extras', 'Compras': 'Outros', 'Investimento': 'Outros', 'Roupas': 'Outros', 'Viagens': 'Lazer', 'Manutenção de veículo': 'Transporte' };
  const iso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const agoraTxt = (min) => { const d = new Date(Date.now() + (min || 0) * 60000); return iso().slice(0, 4) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); };
  function estadoDe(D) { return D.agente || (D.agente = { perm: {}, onb: null,  memoria: [], hist: [], audit: [], estado: {}, vistos: {}, cfg: { criar: true, editar: true, excluir: true, memoria: true, historico: true, voz_resposta: false }, zap: { vinculado: false, codigo: '' } }); }
  const DEFP = ['privacidade', 'memoria', 'whatsapp', 'voz'], ROT = { privacidade: 'Tratamento dos meus dados financeiros pelo Rumi', memoria: 'Memória e aprendizado do Rumi', whatsapp: 'Integração com o WhatsApp', voz: 'Uso do microfone e da voz' };
  const permitido = (A, k) => !!A.perm[k] && A.perm[k].estado === 'concedida';
  const listaPerm = A => { const itens = DEFP.map(k => Object.assign({ rotulo: ROT[k], chave: k, estado: '', data: '', versao: 1 }, A.perm[k] || {}, { concedida: permitido(A, k) })); return { versao: 1, itens, perguntar: itens.filter(i => !i.estado).map(i => i.chave) }; };
  function dados(D, A) {
    const real = D.cats.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, arquivada: !!c.arquivada })), extra = [];
    Object.keys(ALIAS).forEach(n => { const alvo = D.cats.find(c => c.nome === ALIAS[n]); if (alvo && !D.cats.some(c => c.nome === n && c.tipo === alvo.tipo)) extra.push({ id: alvo.id, nome: n, tipo: alvo.tipo, arquivada: false }); });
    const contas = D.contas.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: Math.round(D.lanc.filter(l => l.contaId === c.id).reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), c.saldoInicial) * 100) / 100 }));
    return { hoje: iso(), agora: agoraTxt(0), expira: agoraTxt(10), origem: 'app', encaminhada: false, apelido: (D.perfil && D.perfil.apelido) || '', permissoes: { criar: A.cfg.criar, editar: A.cfg.editar, excluir: A.cfg.excluir },
      categorias: real.concat(extra), contas, lancamentos: D.lanc.map(l => ({ id: l.id, data: l.data, tipo: l.tipo, valor: l.valor, contaId: l.contaId, categoriaId: l.categoriaId, descricao: l.descricao })),
      memoria: A.cfg.memoria && permitido(A, 'memoria') ? A.memoria.map(m => ({ tipo: m.tipo, chave: m.chave, conteudo: m.conteudo })) : [], limites: [], metas: (D.metas || []).map(m => ({ nome: m.nome, valorAlvo: m.valorAlvo, valorAtual: m.valorAtual })), agendaPendentes: [] };
  }
  const resolveCat = (D, id, nome) => { const c = D.cats.find(x => x.id === id); return c; };
  function aprende(A, it) { const i = A.memoria.find(m => m.tipo === it.tipo && m.chave === it.chave); if (i) i.conteudo = it.conteudo; else A.memoria.push({ id: 'm' + Math.random().toString(36).slice(2), tipo: it.tipo, chave: String(it.chave).toLowerCase(), conteudo: it.conteudo }); }
  function audita(A, grupo, op, alvo, antes, depois, resumo) { A.audit.push({ id: 'a' + Math.random().toString(36).slice(2), data: agoraTxt(0), canal: 'app', op, alvo, antes, depois, resumo, desfeito: false, grupo }); }
  function desfaz(D, A, grupo) {
    const regs = A.audit.filter(a => a.grupo === grupo && !a.desfeito && ['criar', 'alterar', 'excluir', 'criar_meta', 'criar_categoria'].includes(a.op));
    if (!regs.length) throw new Error('Não há nada para desfazer aqui (já foi desfeito ou não existe).');
    regs.slice().reverse().forEach(r => {
      if (r.op === 'criar_meta') { const i = D.metas.findIndex(m => m.id === r.alvo); if (i >= 0) D.metas.splice(i, 1); }
      else if (r.op === 'criar_categoria') { const i = D.cats.findIndex(c => c.id === r.alvo); if (i >= 0 && !D.lanc.some(l => l.categoriaId === r.alvo)) D.cats.splice(i, 1); }
      else if (r.op === 'criar') { const i = D.lanc.findIndex(l => l.id === r.alvo); if (i >= 0) D.lanc.splice(i, 1); }
      else if (r.op === 'alterar') { const l = D.lanc.find(x => x.id === r.alvo); if (l) Object.assign(l, r.antes); }
      else if (r.op === 'excluir' && !D.lanc.some(l => l.id === r.alvo)) D.lanc.push(Object.assign({}, r.antes));
      r.desfeito = true;
    });
    return regs.length;
  }
  function executa(D, A, a, ctx) {
    const C = A.cfg;
    if (a.op === 'lancar') {
      if (!C.criar) throw new Error('A permissão de criar lançamentos está desativada.');
      const v = a.dados; if (!(v.valor > 0)) throw new Error('O valor deve ser maior que zero.');
      const l = { id: D.id(), data: v.data, tipo: v.tipo, valor: v.valor, contaId: v.contaId, categoriaId: v.categoriaId || '', descricao: v.descricao || '', moeda: '', valorOrig: 0, cotacao: 0, tags: [] };
      D.lanc.push(l); audita(A, ctx.grupo, 'criar', l.id, null, Object.assign({}, l), (v.tipo === 'despesa' ? 'Despesa ' : 'Receita ') + g.AgenteCore.brl(v.valor) + ' — ' + l.descricao);
      return { op: 'lancar', resumo: l.descricao, lancId: l.id, extra: a.ultimo };
    }
    if (a.op === 'criar_meta') {
      if (!C.criar) throw new Error('A permissão de criar está desativada.');
      if (!(a.dados.valorAlvo > 0)) throw new Error('O valor da meta é inválido; nada foi criado.');
      const m = { id: D.id(), nome: String(a.dados.nome).slice(0, 60), valorAlvo: a.dados.valorAlvo, valorAtual: 0, prazo: '', tipo: 'geral', aporte: 0 }; D.metas.push(m);
      audita(A, ctx.grupo, 'criar_meta', m.id, null, { id: m.id }, 'Meta ' + m.nome + ' — ' + g.AgenteCore.brl(m.valorAlvo));
      return { op: 'criar_meta', resumo: 'meta ' + m.nome, extra: { descricao: m.nome, chaveDesc: '', resumo: 'criação da meta' } };
    }
    if (a.op === 'criar_categoria') {
      if (!C.criar) throw new Error('A permissão de criar está desativada.');
      if (D.cats.some(c => c.tipo === a.dados.tipo && c.nome.toLowerCase() === a.dados.nome.toLowerCase())) throw new Error('Já existe uma categoria de ' + a.dados.tipo + ' com esse nome.');
      const c = { id: D.id(), nome: a.dados.nome, tipo: a.dados.tipo, cor: '#8b5cf6', icone: '🏷️', arquivada: false }; D.cats.push(c);
      audita(A, ctx.grupo, 'criar_categoria', c.id, null, { id: c.id }, 'Categoria ' + c.nome + ' (' + c.tipo + ')');
      return { op: 'criar_categoria', resumo: 'categoria ' + c.nome, extra: { descricao: c.nome, chaveDesc: '', resumo: 'criação da categoria' } };
    }
    if (a.op === 'alterar') {
      if (!C.editar) throw new Error('A permissão de editar lançamentos está desativada.');
      const l = D.lanc.find(x => x.id === a.id); if (!l) throw new Error('Esse lançamento não existe mais.');
      const antes = Object.assign({}, l); Object.assign(l, a.mudancas); audita(A, ctx.grupo, 'alterar', l.id, antes, Object.assign({}, l), 'Alterado: ' + l.descricao + ' — ' + g.AgenteCore.brl(l.valor));
      return { op: 'alterar', resumo: l.descricao, lancId: l.id };
    }
    if (a.op === 'excluir') {
      if (!C.excluir) throw new Error('A permissão de excluir lançamentos está desativada.');
      const i = D.lanc.findIndex(x => x.id === a.id); if (i < 0) throw new Error('Esse lançamento não existe mais.');
      const l = D.lanc.splice(i, 1)[0]; audita(A, ctx.grupo, 'excluir', l.id, Object.assign({}, l), null, 'Excluído: ' + l.descricao + ' — ' + g.AgenteCore.brl(l.valor));
      return { op: 'excluir', resumo: l.descricao };
    }
    if (a.op === 'aprender') { if (!C.memoria) return { op: 'aprender', resumo: 'memória desativada' }; a.itens.forEach(it => { aprende(A, it); if (it.tipo === 'preferencia' && it.chave === 'apelido' && D.perfil) D.perfil.apelido = it.conteudo; }); audita(A, ctx.grupo, 'aprender', '', null, a.itens, 'Aprendi: ' + a.itens.map(i => i.chave + ' → ' + i.conteudo).join('; ')); return { op: 'aprender', resumo: 'memória atualizada' }; }
    if (a.op === 'esquecer') { const i = A.memoria.findIndex(m => m.tipo === a.tipo && m.chave === a.chave); if (i >= 0) A.memoria.splice(i, 1); return { op: 'esquecer', resumo: 'esquecido' }; }
    if (a.op === 'desfazer') { desfaz(D, A, a.auditId); return { op: 'desfazer', resumo: 'desfeito' }; }
    throw new Error('Ação desconhecida do agente.');
  }
  function mensagem(D, d) {
    const A = estadoDe(D), texto = String(d.texto || '').trim().slice(0, 500);
    if (!texto) return Promise.reject(new Error('Mensagem vazia.'));
    const msgId = d.msgId || ('s' + Math.random());
    if (!permitido(A, 'privacidade')) return Promise.resolve({ resposta: 'Para consultar e registrar seus dados eu preciso da sua permissão de privacidade. Você pode revisar as permissões a qualquer momento.', humor: 'problema', sugestoes: [], executadas: [], grupo: '', pendente: false, msgId, canal: 'app', permissao: 'privacidade' });
    if (A.vistos[msgId]) return Promise.resolve(Object.assign({}, A.vistos[msgId], { repetida: true }));
    const dd = dados(D, A); dd.tela = String(d.tela || '').slice(0, 20); if (!permitido(A, 'memoria')) dd.memoria = [];
    const turno = g.AgenteCore.turno(A.estado, texto, dd), grupo = 'g' + Math.random().toString(36).slice(2), exec = [];
    let ultimo = turno.estado.ultimo || null, erro = null;
    const snap = JSON.stringify([D.lanc, A.memoria]);
    for (const a of turno.acoes) {
      try { const r = executa(D, A, a, { grupo }); exec.push({ op: r.op, resumo: r.resumo, lancId: r.lancId || '' });
        if (r.extra) ultimo = { lancId: r.lancId, descricao: r.extra.descricao, chaveDesc: r.extra.chaveDesc, resumo: r.extra.resumo, auditId: grupo };
        else if (a.op === 'alterar' || a.op === 'excluir') ultimo = { lancId: a.op === 'alterar' ? r.lancId : '', descricao: r.resumo, chaveDesc: '', resumo: a.op === 'alterar' ? 'alteração' : 'exclusão', auditId: grupo };
      } catch (e) { erro = e.message; break; }
    }
    let resposta = turno.resposta, humor = turno.humor, executadas = exec;
    if (erro) { const [l, m] = JSON.parse(snap); D.lanc.length = 0; l.forEach(x => D.lanc.push(x)); A.memoria.length = 0; m.forEach(x => A.memoria.push(x)); A.audit = A.audit.filter(a => a.grupo !== grupo); resposta = 'Não registrei nada: ' + erro; humor = 'problema'; executadas = []; turno.estado.pendente = null; ultimo = A.estado.ultimo || null; }
    turno.estado.ultimo = ultimo && ultimo.auditId ? ultimo : null; A.estado = turno.estado;
    const sai = { abrir: turno.abrir || null, resposta, humor, sugestoes: turno.sugestoes || [], executadas, grupo: executadas.length ? grupo : '', pendente: !!turno.estado.pendente, msgId, canal: 'app' };
    A.vistos[msgId] = sai;
    if (A.cfg.historico) { A.hist.push({ papel: 'usuario', texto, data: agoraTxt(0), canal: 'app' }); A.hist.push({ papel: 'agente', texto: resposta, humor, grupo: sai.grupo, data: agoraTxt(0), canal: 'app' }); A.hist = A.hist.slice(-200); }
    return Promise.resolve(sai);
  }
  // devolve uma Promise para ações do agente, ou undefined se a ação não é dele
  function handler(acao, d, D) {
    if (acao.indexOf('agente_') !== 0 && acao.indexOf('permissoes_') !== 0 && acao.indexOf('onboarding_') !== 0) return undefined;
    const A = estadoDe(D), ok = v => Promise.resolve(JSON.parse(JSON.stringify(v === undefined ? {} : v)));
    switch (acao) {
      case 'permissoes_listar': return ok(listaPerm(A));
      case 'permissoes_salvar': Object.keys(d.itens || {}).forEach(k => { const e = d.itens[k]; if (!DEFP.includes(k) || !['concedida', 'negada', 'adiada'].includes(e)) return; if (e === 'adiada' && A.perm[k] && A.perm[k].estado !== 'adiada') return; A.perm[k] = { estado: e, data: iso(), versao: 1 }; }); return ok(listaPerm(A));
      case 'onboarding_estado': { const o = A.onb; return ok({ estado: o ? o.estado : 'novo', passo: o ? o.passo : 0, etapas: 10, automatico: !o }); }
      case 'onboarding_salvar': A.onb = { estado: d.estado, passo: d.estado === 'concluido' ? 10 : Math.max(0, Math.min(10, Number(d.passo) || 0)) }; return ok({ estado: A.onb.estado, passo: A.onb.passo, etapas: 10, automatico: false });
      case 'agente_mensagem': return mensagem(D, d);
      case 'agente_historico': return ok(A.hist.slice(-60));
      case 'agente_historico_limpar': A.hist = []; A.estado = {}; return ok({});
      case 'agente_config': return ok({ config: A.cfg, memorias: A.memoria.length, whatsappConfigurado: false, permitido: { privacidade: permitido(A, 'privacidade'), memoria: permitido(A, 'memoria'), whatsapp: permitido(A, 'whatsapp'), voz: permitido(A, 'voz') } });
      case 'agente_config_salvar': Object.keys(A.cfg).forEach(k => { if (typeof d[k] === 'boolean') A.cfg[k] = d[k]; }); return ok({ config: A.cfg });
      case 'agente_memoria': return ok(A.memoria);
      case 'agente_memoria_salvar': { if (!A.cfg.memoria || !permitido(A, 'memoria')) return Promise.reject(new Error('A memória está desativada.')); aprende(A, { tipo: d.tipo || 'fato', chave: d.chave, conteudo: d.conteudo }); return ok({}); }
      case 'agente_memoria_apagar': A.memoria = A.memoria.filter(m => m.id !== d.id); return ok({});
      case 'agente_memoria_limpar': A.memoria = []; return ok({});
      case 'agente_auditoria': return ok(A.audit.slice(-50).reverse().map(a => ({ id: a.id, data: a.data, canal: a.canal, op: a.op, resumo: a.resumo, desfeito: a.desfeito, grupo: a.grupo, desfazivel: ['criar', 'alterar', 'excluir', 'criar_meta', 'criar_categoria'].includes(a.op) })));
      case 'agente_desfazer': try { return ok({ revertidas: desfaz(D, A, d.grupo) }); } catch (e) { return Promise.reject(e); }
      case 'agente_zap_codigo': A.zap.codigo = 'DEMO42'; return ok({ codigo: 'DEMO42', expira: '', numero: '+55 00 00000-0000', configurado: false });
      case 'agente_zap_status': return ok({ vinculado: A.zap.vinculado, telefone: A.zap.vinculado ? '••••0000' : '', configurado: false, numero: '' });
      case 'agente_zap_desvincular': A.zap.vinculado = false; return ok({ desvinculado: true });
      default: return Promise.reject(new Error('Ação desconhecida.'));
    }
  }
  g.RumiDemo = { handler };
})(window);
