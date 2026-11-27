/* ======================= AGENTE RUMI (servidor) =======================
 * Executa o que o núcleo (agTurno) decide: valida, aplica permissões, grava com idempotência,
 * registra auditoria e permite desfazer. Tudo é isolado por e-mail; nada é compartilhado entre contas.
 */
var AG_PERM_PADRAO = { criar: true, editar: true, excluir: true, memoria: true, historico: true, voz_resposta: false };
var AG_MAX_MEMORIA = 300, AG_MAX_HISTORICO = 200, AG_MAX_MSG_HORA = 60, AG_VALIDADE_PENDENCIA_MIN = 10;

function agConfig_(email) {
  var c = Object.assign({}, AG_PERM_PADRAO);
  var r = doUsuario_('AgenteMemoria', email).filter(function (x) { return x.Tipo === 'config' && x.Chave === 'config'; })[0];
  if (r) { try { var j = JSON.parse(r.Conteudo); Object.keys(AG_PERM_PADRAO).forEach(function (k) { if (typeof j[k] === 'boolean') c[k] = j[k]; }); } catch (e) { /* mantém padrão */ } }
  return c;
}
function agMemItem_(r) { return { id: r.Id, tipo: r.Tipo, chave: r.Chave, conteudo: r.Conteudo, atualizado: r.Atualizado }; }
function agMemorias_(email) { return doUsuario_('AgenteMemoria', email).filter(function (x) { return x.Tipo !== 'config'; }); }
function agMais_(minutos) { return Utilities.formatDate(new Date(Date.now() + minutos * 60000), CONFIG.FUSO, "yyyy-MM-dd'T'HH:mm:ss"); }

function agDados_(email, cfg, canal, encaminhada) {
  var hoje = hoje_(), ym = hoje.slice(0, 7), de = ym.slice(0, 4) + '-01-01', sal = saldos_(email);
  var desde = (function () { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 6; while (m < 1) { m += 12; a--; } return a + '-' + ('0' + m).slice(-2) + '-01'; })();
  var u = doUsuario_('Usuarios', email)[0];
  var d = {
    hoje: hoje, agora: agora_(), expira: agMais_(AG_VALIDADE_PENDENCIA_MIN), origem: canal, encaminhada: !!encaminhada,
    apelido: u ? String(u.Apelido || '') : '', permissoes: { criar: cfg.criar, editar: cfg.editar, excluir: cfg.excluir },
    categorias: doUsuario_('Categorias', email).map(sCategoria_),
    contas: doUsuario_('Contas', email).map(function (c) { return sConta_(c, sal[c.Id] || 0); }),
    lancamentos: movimentos_(email).filter(function (l) { return l.data >= desde; }),
    memoria: cfg.memoria ? agMemorias_(email).map(function (m) { return { tipo: m.Tipo, chave: m.Chave, conteudo: m.Conteudo }; }) : [],
    limites: [], metas: doUsuario_('Metas', email).map(sMeta_), agendaPendentes: []
  };
  try { d.limites = limitesDoMes_(email, ym); } catch (e) { /* opcional */ }
  try { d.agendaPendentes = ACOES.listar_agenda({ email: email }, {}).pendentes.map(function (p) { return { tipo: p.tipo, valor: p.valor, data: p.data || '', descricao: p.titulo || p.descricao || '' }; }); } catch (e2) { /* opcional */ }
  return d;
}

function agEstado_(email, canal) {
  var r = doUsuario_('AgentePendentes', email).filter(function (x) { return x.Canal === canal; })[0];
  if (!r) return {};
  try { return JSON.parse(r.Estado) || {}; } catch (e) { return {}; }
}
function agSalvaEstado_(email, canal, estado) {
  var r = doUsuario_('AgentePendentes', email).filter(function (x) { return x.Canal === canal; })[0], txt = JSON.stringify(estado || {});
  if (r) atualizar_('AgentePendentes', r._linha, Object.assign({}, r, { Estado: txt, Atualizado: agora_() }));
  else acrescentar_('AgentePendentes', [{ Email: email, Canal: canal, Estado: txt, Atualizado: agora_() }]);
}

function agAudita_(email, canal, grupo, op, alvo, antes, depois, resumo, msgId) {
  var reg = { Id: Utilities.getUuid(), Email: email, Data: agora_(), Canal: canal, Op: op, Alvo: alvo, Antes: antes ? JSON.stringify(antes) : '', Depois: depois ? JSON.stringify(depois) : '', Resumo: String(resumo || '').slice(0, 200), Desfeito: '', Grupo: grupo, MsgId: msgId || '' };
  acrescentar_('AgenteAuditoria', [reg]);
  return reg;
}
function agLancObj_(r) { return { Id: r.Id, Data: String(r.Data), Tipo: r.Tipo, Valor: Number(r.Valor), ContaId: r.ContaId, CategoriaId: r.CategoriaId, Descricao: r.Descricao, Chave: r.Chave || '', Tags: r.Tags || '' }; }
function agAchaLanc_(email, id) { return doUsuario_('Lancamentos', email).filter(function (x) { return x.Id === String(id || ''); })[0]; }

// Executa uma ação do núcleo. Devolve { resumo, lancId } ou lança erro.
function agExecuta_(u, cfg, a, ctx) {
  var email = u.email;
  if (a.op === 'lancar') {
    if (!cfg.criar) throw erro_('sem_permissao', 'A permissão de criar lançamentos está desativada.');
    var chave = 'ag:' + ctx.chave + ':' + ctx.idx;
    var dup = doUsuario_('Lancamentos', email).filter(function (x) { return x.Chave === chave; })[0];
    if (dup) return { resumo: 'já registrado', lancId: dup.Id, repetido: true };
    if (doUsuario_('Lancamentos', email).length >= CONFIG.MAX_LANCAMENTOS_POR_USUARIO) throw erro_('limite', 'Limite de lançamentos atingido.');
    var campos = validarLanc_(email, a.dados);
    campos.Chave = chave; campos.Descricao = campos.Descricao || '';
    var novo = upsert_('Lancamentos', email, '', campos);
    if (Number(novo.Valor) !== Math.round(Number(a.dados.valor) * 100) / 100) { excluirPorId_('Lancamentos', email, novo.Id); throw erro_('divergencia', 'O valor gravado não confere com o valor entendido; nada foi registrado.'); }
    agAudita_(email, ctx.canal, ctx.grupo, 'criar', novo.Id, null, agLancObj_(novo), (campos.Tipo === 'despesa' ? 'Despesa ' : 'Receita ') + brl_(campos.Valor) + ' — ' + campos.Descricao, ctx.msgId);
    if (campos.Tipo === 'despesa') (verificarLimites_(email, [campos.Data.slice(0, 7)]) || []).forEach(function (al) { ctx.alertas.push(al.mensagem); });
    return { resumo: campos.Descricao, lancId: novo.Id, extra: a.ultimo };
  }
  if (a.op === 'criar_meta') {
    if (!cfg.criar) throw erro_('sem_permissao', 'A permissão de criar está desativada.');
    var chM = 'ag:' + ctx.chave + ':' + ctx.idx, dM = doUsuario_('Metas', email).filter(function (x) { return x.Chave === chM; })[0];
    if (dM) return { resumo: 'já criada', repetido: true };
    var vM = Number(a.dados && a.dados.valorAlvo);
    if (!(vM > 0) || vM > 1000000000) throw erro_('valor_invalido', 'O valor da meta é inválido; nada foi criado.');
    var nM = ACOES.salvar_meta(u, { nome: a.dados.nome, valorAlvo: vM });
    if (Number(nM.valorAlvo) !== Math.round(vM * 100) / 100 && Number(nM.valorAlvo) !== vM) { excluirPorId_('Metas', email, nM.id); throw erro_('divergencia', 'O valor gravado não confere com o valor entendido; nada foi criado.'); }
    agAudita_(email, ctx.canal, ctx.grupo, 'criar_meta', nM.id, null, { Id: nM.id, Nome: nM.nome }, 'Meta ' + nM.nome + ' — ' + brl_(nM.valorAlvo), ctx.msgId);
    return { resumo: 'meta ' + nM.nome, metaId: nM.id, extra: { descricao: nM.nome, chaveDesc: '', resumo: 'criação da meta' } };
  }
  if (a.op === 'criar_categoria') {
    if (!cfg.criar) throw erro_('sem_permissao', 'A permissão de criar está desativada.');
    var nC = ACOES.salvar_categoria(u, { nome: a.dados.nome, tipo: a.dados.tipo });
    agAudita_(email, ctx.canal, ctx.grupo, 'criar_categoria', nC.id, null, { Id: nC.id, Nome: nC.nome }, 'Categoria ' + nC.nome + ' (' + nC.tipo + ')', ctx.msgId);
    return { resumo: 'categoria ' + nC.nome, extra: { descricao: nC.nome, chaveDesc: '', resumo: 'criação da categoria' } };
  }
  if (a.op === 'alterar') {
    if (!cfg.editar) throw erro_('sem_permissao', 'A permissão de editar lançamentos está desativada.');
    var l = agAchaLanc_(email, a.id); if (!l) throw erro_('nao_encontrado', 'Esse lançamento não existe mais.');
    if (l.MoedaOrig && a.mudancas.valor !== undefined) throw erro_('moeda_estrangeira', 'Lançamento em moeda estrangeira: altere pela tela de lançamentos.');
    var m = a.mudancas || {}, antes = agLancObj_(l);
    var mesclado = { tipo: l.Tipo, data: m.data || String(l.Data), valor: m.valor !== undefined ? m.valor : l.Valor, contaId: l.ContaId, categoriaId: m.categoriaId !== undefined ? m.categoriaId : l.CategoriaId, descricao: m.descricao !== undefined ? m.descricao : l.Descricao, tags: l.Tags };
    var c2 = validarLanc_(email, mesclado);
    if (l.MoedaOrig) { c2.MoedaOrig = l.MoedaOrig; c2.ValorOrig = l.ValorOrig; c2.Cotacao = l.Cotacao; }
    var atual = upsert_('Lancamentos', email, l.Id, c2);
    agAudita_(email, ctx.canal, ctx.grupo, 'alterar', l.Id, antes, agLancObj_(atual), 'Alterado: ' + (atual.Descricao || '') + ' — ' + brl_(Number(atual.Valor)), ctx.msgId);
    if (c2.Tipo === 'despesa') (verificarLimites_(email, [c2.Data.slice(0, 7)]) || []).forEach(function (al) { ctx.alertas.push(al.mensagem); });
    return { resumo: atual.Descricao, lancId: l.Id };
  }
  if (a.op === 'excluir') {
    if (!cfg.excluir) throw erro_('sem_permissao', 'A permissão de excluir lançamentos está desativada.');
    var l2 = agAchaLanc_(email, a.id); if (!l2) throw erro_('nao_encontrado', 'Esse lançamento não existe mais.');
    var ant = agLancObj_(l2);
    // guarda também os campos de câmbio para o desfazer não perder informação
    ant.MoedaOrig = l2.MoedaOrig || ''; ant.ValorOrig = l2.ValorOrig || ''; ant.Cotacao = l2.Cotacao || '';
    excluirPorId_('Lancamentos', email, l2.Id);
    agAudita_(email, ctx.canal, ctx.grupo, 'excluir', l2.Id, ant, null, 'Excluído: ' + (l2.Descricao || '') + ' — ' + brl_(Number(l2.Valor)), ctx.msgId);
    return { resumo: l2.Descricao };
  }
  if (a.op === 'aprender') {
    if (!cfg.memoria) return { resumo: 'memória desativada', ignorado: true };
    (a.itens || []).forEach(function (it) { agMemoriaGrava_(email, it.tipo, it.chave, it.conteudo); });
    agAudita_(email, ctx.canal, ctx.grupo, 'aprender', '', null, a.itens, 'Aprendi: ' + (a.itens || []).map(function (i) { return i.chave + ' → ' + i.conteudo; }).join('; '), ctx.msgId);
    return { resumo: 'memória atualizada' };
  }
  if (a.op === 'esquecer') {
    var mm = doUsuario_('AgenteMemoria', email).filter(function (x) { return x.Tipo === a.tipo && x.Chave === a.chave; })[0];
    if (mm) { excluirPorId_('AgenteMemoria', email, mm.Id); agAudita_(email, ctx.canal, ctx.grupo, 'esquecer', mm.Id, { tipo: mm.Tipo, chave: mm.Chave, conteudo: mm.Conteudo }, null, 'Esqueci: ' + mm.Chave, ctx.msgId); }
    return { resumo: 'esquecido' };
  }
  if (a.op === 'desfazer') { var n = agDesfaz_(u, a.auditId); return { resumo: 'desfeito (' + n + ')', desfeito: true }; }
  throw erro_('acao_invalida', 'Ação desconhecida do agente.');
}

function agMemoriaGrava_(email, tipo, chave, conteudo) {
  tipo = limpo_(tipo, 20); chave = seguro_(chave, 60).toLowerCase(); conteudo = seguro_(conteudo, 120);
  if (['desc', 'preferencia', 'conta_padrao', 'fato'].indexOf(tipo) < 0 || !chave || !conteudo) throw erro_('memoria_invalida', 'Item de memória inválido.');
  var r = doUsuario_('AgenteMemoria', email).filter(function (x) { return x.Tipo === tipo && String(x.Chave).toLowerCase() === chave; })[0];
  if (r) return upsert_('AgenteMemoria', email, r.Id, { Conteudo: conteudo, Atualizado: agora_() });
  if (agMemorias_(email).length >= AG_MAX_MEMORIA) throw erro_('limite', 'A memória está cheia. Apague itens antigos em Configurações › Memória.');
  var novo = upsert_('AgenteMemoria', email, '', { Tipo: tipo, Chave: chave, Conteudo: conteudo, Atualizado: agora_() });
  if (tipo === 'preferencia' && chave === 'apelido') { var us = doUsuario_('Usuarios', email)[0]; if (us) atualizar_('Usuarios', us._linha, Object.assign({}, us, { Apelido: conteudo })); }
  return novo;
}

// Desfaz todas as operações de um grupo (uma mensagem). Devolve quantas foram revertidas.
function agDesfaz_(u, grupo) {
  var email = u.email, regs = doUsuario_('AgenteAuditoria', email).filter(function (x) { return x.Grupo === String(grupo || '') && x.Desfeito !== 'sim' && (x.Op === 'criar' || x.Op === 'alterar' || x.Op === 'excluir' || x.Op === 'criar_meta' || x.Op === 'criar_categoria'); });
  if (!regs.length) throw erro_('nada_a_desfazer', 'Não há nada para desfazer aqui (já foi desfeito ou não existe).');
  var n = 0;
  regs.slice().reverse().forEach(function (r) {
    var antes = r.Antes ? JSON.parse(r.Antes) : null;
    if (r.Op === 'criar_meta') { try { excluirPorId_('Metas', email, r.Alvo); } catch (e0) { /* já removida */ } }
    else if (r.Op === 'criar_categoria') { if (doUsuario_('Lancamentos', email).some(function (x) { return x.CategoriaId === r.Alvo; })) throw erro_('em_uso', 'A categoria já tem lançamentos; não dá para desfazer a criação.'); try { excluirPorId_('Categorias', email, r.Alvo); } catch (e1) { /* já removida */ } }
    else if (r.Op === 'criar') { var l = agAchaLanc_(email, r.Alvo); if (l) excluirPorId_('Lancamentos', email, l.Id); }
    else if (r.Op === 'alterar') { var l2 = agAchaLanc_(email, r.Alvo); if (l2 && antes) upsert_('Lancamentos', email, l2.Id, { Data: antes.Data, Valor: antes.Valor, CategoriaId: antes.CategoriaId, Descricao: antes.Descricao }); }
    else if (r.Op === 'excluir' && antes && !agAchaLanc_(email, antes.Id)) {
      if (!doUsuario_('Contas', email).some(function (c) { return c.Id === antes.ContaId; })) throw erro_('conta_invalida', 'A conta desse lançamento não existe mais.');
      acrescentar_('Lancamentos', [Object.assign({ Email: email, Criado: agora_() }, antes)]);
    }
    atualizar_('AgenteAuditoria', r._linha, Object.assign({}, r, { Desfeito: 'sim' }));
    n++;
  });
  return n;
}

function agLimita_(email) {
  var cache = CacheService.getScriptCache(), k = 'agn_' + hash_(email) + '_' + agora_().slice(0, 13), n = Number(cache.get(k) || 0) + 1;
  if (n > AG_MAX_MSG_HORA) throw erro_('muitas_mensagens', 'Muitas mensagens em pouco tempo. Tente de novo daqui a pouco.');
  cache.put(k, String(n), 3600);
}

function agHistorico_(email, canal, papel, texto, msgId) {
  acrescentar_('AgenteHistorico', [{ Id: Utilities.getUuid(), Email: email, Data: agora_(), Papel: papel, Texto: String(texto).slice(0, 1500), Canal: canal, MsgId: msgId || '' }]);
  var todos = doUsuario_('AgenteHistorico', email);
  if (todos.length > AG_MAX_HISTORICO) todos.slice(0, todos.length - AG_MAX_HISTORICO).map(function (x) { return x._linha; }).sort(function (a, b) { return b - a; }).forEach(function (l) { apagarLinha_('AgenteHistorico', l); });
}

// Uma mensagem do usuário (app ou WhatsApp). Repetir o mesmo msgId devolve a resposta anterior sem executar de novo.
function agProcessa_(u, texto, msgId, canal, encaminhada, tela) {
  var email = u.email;
  texto = limpo_(texto, 500);
  if (!texto) throw erro_('vazio', 'Mensagem vazia.');
  msgId = limpo_(msgId, 80) || ('s-' + Utilities.getUuid());
  var anterior = doUsuario_('AgenteHistorico', email).filter(function (x) { return x.Papel === 'agente' && x.MsgId === msgId; })[0];
  if (anterior) { var salvo = {}; try { salvo = JSON.parse(String(anterior.Texto)); } catch (e) { /* texto simples */ } return Object.assign({ resposta: salvo.resposta || String(anterior.Texto), repetida: true, msgId: msgId }, salvo.resposta ? salvo : {}); }
  if (!agPermitido_(email, 'privacidade')) {   // sem consentimento confirmado o Rumi não lê nem altera dados
    return { resposta: 'Para consultar e registrar seus dados eu preciso da sua permissão de privacidade. Você pode revisar as permissões a qualquer momento.', humor: 'problema', sugestoes: [], executadas: [], grupo: '', pendente: false, msgId: msgId, canal: canal, permissao: 'privacidade' };
  }
  agLimita_(email);
  var cfg = agConfig_(email), estado = agEstado_(email, canal), dados = agDados_(email, cfg, canal, encaminhada);
  dados.tela = canal === 'app' ? limpo_(tela, 20) : ''; cfg.memoria = cfg.memoria && agPermitido_(email, 'memoria'); dados.memoria = cfg.memoria ? dados.memoria : [];
  var turno = agTurno(estado, texto, dados), grupo = Utilities.getUuid(), executadas = [], erroAcao = null;
  var ctx = { canal: canal, grupo: grupo, msgId: msgId, chave: msgId, idx: 0, alertas: [] }, ultimo = turno.estado.ultimo || null;
  for (var i = 0; i < turno.acoes.length; i++) {
    ctx.idx = i;
    try {
      var r = agExecuta_(u, cfg, turno.acoes[i], ctx);
      executadas.push({ op: turno.acoes[i].op, resumo: r.resumo, lancId: r.lancId || '' });
      if (r.extra) ultimo = { lancId: r.lancId, descricao: r.extra.descricao, chaveDesc: r.extra.chaveDesc, resumo: r.extra.resumo, auditId: grupo };
      else if (turno.acoes[i].op === 'alterar' || turno.acoes[i].op === 'excluir') ultimo = { lancId: turno.acoes[i].op === 'alterar' ? r.lancId : '', descricao: r.resumo, chaveDesc: '', resumo: turno.acoes[i].op === 'alterar' ? 'alteração' : 'exclusão', auditId: grupo };
    } catch (err) {
      erroAcao = err && err.codigo ? err.message : 'Não consegui concluir (erro interno).';
      if (!(err && err.codigo)) console.error(err);
      break;
    }
  }
  var resposta = turno.resposta, humor = turno.humor;
  if (erroAcao) {   // desfaz o que já tinha sido gravado nesta mensagem: tudo ou nada
    try { agDesfaz_(u, grupo); } catch (e2) { /* nada gravado */ }
    resposta = 'Não registrei nada: ' + erroAcao; humor = 'problema'; executadas = []; ultimo = estado.ultimo || null; turno.estado.pendente = null;
  } else if (ctx.alertas.length) resposta += '\n⚠ ' + ctx.alertas.join('\n⚠ ');
  var novoEstado = turno.estado; novoEstado.ultimo = ultimo; if (novoEstado.ultimo && !novoEstado.ultimo.auditId) novoEstado.ultimo = null;
  agSalvaEstado_(email, canal, novoEstado);
  var sai = { abrir: canal === 'app' ? (turno.abrir || null) : null, resposta: resposta, humor: humor, sugestoes: turno.sugestoes || [], executadas: executadas, grupo: executadas.length ? grupo : '', pendente: !!novoEstado.pendente, msgId: msgId, canal: canal };
  if (cfg.historico) { agHistorico_(email, canal, 'usuario', texto, ''); agHistorico_(email, canal, 'agente', JSON.stringify({ resposta: resposta, humor: humor, sugestoes: sai.sugestoes, executadas: executadas, grupo: sai.grupo }), msgId); }
  else agHistorico_(email, 'dedupe', 'agente', JSON.stringify({ resposta: resposta, humor: humor, sugestoes: [], executadas: executadas, grupo: sai.grupo }), msgId);   // só para deduplicar; apagado junto com o limite
  return sai;
}

/* ---------- ações expostas ao app ---------- */
LEITURAS.agente_historico = 1; LEITURAS.agente_memoria = 1; LEITURAS.agente_config = 1; LEITURAS.agente_auditoria = 1; LEITURAS.agente_zap_status = 1;
ACOES.agente_mensagem = function (u, d) { return agProcessa_(u, d.texto, d.msgId, 'app', false, d.tela); };
ACOES.agente_historico = function (u) {
  return doUsuario_('AgenteHistorico', u.email).filter(function (x) { return x.Canal === 'app' || x.Canal === 'whatsapp'; }).slice(-60).map(function (x) {
    if (x.Papel === 'usuario') return { papel: 'usuario', texto: x.Texto, data: x.Data, canal: x.Canal };
    var j = {}; try { j = JSON.parse(x.Texto); } catch (e) { j = { resposta: x.Texto }; }
    return { papel: 'agente', texto: j.resposta || '', humor: j.humor || 'ok', grupo: j.grupo || '', data: x.Data, canal: x.Canal };
  });
};
ACOES.agente_historico_limpar = function (u) {
  var ls = doUsuario_('AgenteHistorico', u.email).map(function (x) { return x._linha; }).sort(function (a, b) { return b - a; });
  ls.forEach(function (l) { apagarLinha_('AgenteHistorico', l); });
  var st = doUsuario_('AgentePendentes', u.email).map(function (x) { return x._linha; }).sort(function (a, b) { return b - a; });
  st.forEach(function (l) { apagarLinha_('AgentePendentes', l); });
  return { apagadas: ls.length };
};
ACOES.agente_config = function (u) { return { config: agConfig_(u.email), memorias: agMemorias_(u.email).length, whatsappConfigurado: agZapConfigurado_(), permitido: { privacidade: agPermitido_(u.email, 'privacidade'), memoria: agPermitido_(u.email, 'memoria'), whatsapp: agPermitido_(u.email, 'whatsapp'), voz: agPermitido_(u.email, 'voz') } }; };
ACOES.agente_config_salvar = function (u, d) {
  var c = agConfig_(u.email), n = Object.assign({}, c);
  Object.keys(AG_PERM_PADRAO).forEach(function (k) { if (typeof d[k] === 'boolean') n[k] = d[k]; });
  var r = doUsuario_('AgenteMemoria', u.email).filter(function (x) { return x.Tipo === 'config'; })[0];
  upsert_('AgenteMemoria', u.email, r ? r.Id : '', { Tipo: 'config', Chave: 'config', Conteudo: JSON.stringify(n), Atualizado: agora_() });
  agAudita_(u.email, 'app', Utilities.getUuid(), 'config', '', c, n, 'Permissões do agente alteradas', '');
  return { config: n };
};
ACOES.agente_memoria = function (u) { return agMemorias_(u.email).map(agMemItem_); };
ACOES.agente_memoria_salvar = function (u, d) {
  if (!agConfig_(u.email).memoria || !agPermitido_(u.email, 'memoria')) throw erro_('sem_permissao', 'A memória está desativada.');
  var r = agMemoriaGrava_(u.email, d.tipo || 'fato', d.chave, d.conteudo);
  agAudita_(u.email, 'app', Utilities.getUuid(), 'aprender', r.Id, null, { chave: d.chave, conteudo: d.conteudo }, 'Memória editada: ' + d.chave, '');
  return agMemItem_(r);
};
ACOES.agente_memoria_apagar = function (u, d) {
  var r = excluirPorId_('AgenteMemoria', u.email, d.id);
  agAudita_(u.email, 'app', Utilities.getUuid(), 'esquecer', d.id, null, null, 'Item de memória apagado', '');
  return r;
};
ACOES.agente_memoria_limpar = function (u) {
  var ls = agMemorias_(u.email).map(function (x) { return x._linha; }).sort(function (a, b) { return b - a; });
  ls.forEach(function (l) { apagarLinha_('AgenteMemoria', l); });
  agAudita_(u.email, 'app', Utilities.getUuid(), 'esquecer', '', null, null, 'Toda a memória foi apagada', '');
  return { apagadas: ls.length };
};
ACOES.agente_auditoria = function (u) {
  return doUsuario_('AgenteAuditoria', u.email).slice(-50).reverse().map(function (x) { return { id: x.Id, data: x.Data, canal: x.Canal, op: x.Op, resumo: x.Resumo, desfeito: x.Desfeito === 'sim', grupo: x.Grupo, desfazivel: ['criar', 'alterar', 'excluir', 'criar_meta', 'criar_categoria'].indexOf(x.Op) >= 0 }; });
};
ACOES.agente_desfazer = function (u, d) { var n = agDesfaz_(u, d.grupo); return { revertidas: n }; };


/* ---------- Permissões e consentimento (LGPD) ---------- */
var CONSENT_VERSAO = 1;
var PERMISSOES_DEF = { privacidade: 'Tratamento dos meus dados financeiros pelo Rumi', memoria: 'Memória e aprendizado do Rumi', whatsapp: 'Integração com o WhatsApp', voz: 'Uso do microfone e da voz' };
function agPermissoes_(email) {
  var rows = doUsuario_('Permissoes', email), out = {};
  Object.keys(PERMISSOES_DEF).forEach(function (k) { out[k] = { chave: k, estado: '', data: '', versao: 0 }; });
  rows.forEach(function (r) { if (out[r.Chave]) out[r.Chave] = { chave: r.Chave, estado: String(r.Estado), data: String(r.Data), versao: Number(r.Versao) || 0 }; });
  return out;
}
// Só vale "concedida" quando o usuário confirmou, na versão vigente do termo. Ausente ou adiada = não concedida.
function agPermitido_(email, chave) { var p = agPermissoes_(email)[chave]; return !!p && p.estado === 'concedida' && p.versao >= CONSENT_VERSAO; }
LEITURAS.permissoes_listar = 1; LEITURAS.onboarding_estado = 1;
ACOES.permissoes_listar = function (u) {
  var p = agPermissoes_(u.email), itens = Object.keys(p).map(function (k) { return Object.assign({ rotulo: PERMISSOES_DEF[k] }, p[k], { concedida: agPermitido_(u.email, k) }); });
  var perguntar = itens.filter(function (i) { return i.estado === '' || ((i.estado === 'concedida' || i.estado === 'negada') && i.versao < CONSENT_VERSAO); }).map(function (i) { return i.chave; });
  return { versao: CONSENT_VERSAO, itens: itens, perguntar: perguntar };
};
ACOES.permissoes_salvar = function (u, d) {
  var itens = d.itens || {}, antes = agPermissoes_(u.email), alter = [];
  Object.keys(itens).forEach(function (k) {
    var est = String(itens[k]);
    if (!PERMISSOES_DEF[k] || ['concedida', 'negada', 'adiada'].indexOf(est) < 0) throw erro_('permissao_invalida', 'Permissão inválida.');
    if (est === 'adiada' && (antes[k].estado === 'concedida' || antes[k].estado === 'negada')) return;   // "decidir depois" não desfaz uma resposta já dada
    var r = doUsuario_('Permissoes', u.email).filter(function (x) { return x.Chave === k; })[0];
    upsert_('Permissoes', u.email, r ? r.Id : '', { Chave: k, Estado: est, Versao: CONSENT_VERSAO, Data: agora_() });
    if (est !== antes[k].estado) alter.push(k + ': ' + (est === 'concedida' ? 'concedida' : est === 'negada' ? 'negada' : 'adiada'));
  });
  if (alter.length) agAudita_(u.email, 'app', Utilities.getUuid(), 'config', '', null, null, 'Permissões: ' + alter.join('; '), '');
  return ACOES.permissoes_listar(u);
};

/* ---------- Tutorial de primeiro acesso ---------- */
var TUTORIAL_ETAPAS = 10;
ACOES.onboarding_estado = function (u) {
  var r = doUsuario_('Onboarding', u.email)[0];
  var existente = !r && doUsuario_('Lancamentos', u.email).length >= 5;   // quem já usa o app não recebe o tutorial automaticamente
  return { estado: r ? String(r.Estado) : 'novo', passo: r ? Number(r.Passo) || 0 : 0, etapas: TUTORIAL_ETAPAS, automatico: !r && !existente };
};
ACOES.onboarding_salvar = function (u, d) {
  var est = String(d.estado || ''); if (['em_andamento', 'concluido', 'pulado'].indexOf(est) < 0) throw erro_('estado_invalido', 'Estado do tutorial inválido.');
  var passo = Math.max(0, Math.min(TUTORIAL_ETAPAS, Math.floor(Number(d.passo) || 0)));
  var r = doUsuario_('Onboarding', u.email)[0];
  upsert_('Onboarding', u.email, r ? r.Id : '', { Passo: est === 'concluido' ? TUTORIAL_ETAPAS : passo, Estado: est, Atualizado: agora_() });
  return ACOES.onboarding_estado(u);
};

/* ---------- WhatsApp (API oficial da Meta — WhatsApp Cloud API) ---------- */
function agProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function agZapConfigurado_() { return !!(agProp_('WHATSAPP_TOKEN') && agProp_('WHATSAPP_NUMERO_ID') && agProp_('WHATSAPP_VERIFY_TOKEN') && agProp_('WHATSAPP_WEBHOOK_SECRET')); }
function agZapEnvia_(para, texto) {
  if (!agZapConfigurado_()) return false;
  try {
    var r = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + encodeURIComponent(agProp_('WHATSAPP_NUMERO_ID')) + '/messages', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + agProp_('WHATSAPP_TOKEN') }, muteHttpExceptions: true, payload: JSON.stringify({ messaging_product: 'whatsapp', to: String(para).replace(/\D/g, ''), type: 'text', text: { body: String(texto).slice(0, 1500) } }) });
    return r.getResponseCode() < 300;
  } catch (e) { console.error('zap envio'); return false; }
}
ACOES.agente_zap_codigo = function (u) {
  if (!agPermitido_(u.email, 'whatsapp')) throw erro_('sem_permissao', 'Autorize a integração com o WhatsApp em Opções › Permissões antes de conectar.');
  var cod = Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase(), exp = agMais_(15);
  var r = doUsuario_('ZapVinculos', u.email)[0];
  if (r) atualizar_('ZapVinculos', r._linha, Object.assign({}, r, { Codigo: cod, Expira: exp }));
  else acrescentar_('ZapVinculos', [{ Email: u.email, Telefone: '', Codigo: cod, Expira: exp, Verificado: '', Criado: agora_() }]);
  return { codigo: cod, expira: exp, numero: agProp_('WHATSAPP_NUMERO_EXIBICAO'), configurado: agZapConfigurado_() };
};
ACOES.agente_zap_status = function (u) {
  var r = doUsuario_('ZapVinculos', u.email)[0], tel = r && r.Verificado === 'sim' ? String(r.Telefone) : '';
  return { vinculado: !!tel, telefone: tel ? '••••' + tel.slice(-4) : '', configurado: agZapConfigurado_(), numero: agProp_('WHATSAPP_NUMERO_EXIBICAO') };
};
ACOES.agente_zap_desvincular = function (u) {
  var ls = doUsuario_('ZapVinculos', u.email).map(function (x) { return x._linha; }).sort(function (a, b) { return b - a; });
  ls.forEach(function (l) { apagarLinha_('ZapVinculos', l); });
  agAudita_(u.email, 'app', Utilities.getUuid(), 'config', '', null, null, 'WhatsApp desvinculado', '');
  return { desvinculado: true };
};

// Verificação do webhook (GET). Devolve o desafio só se o token de verificação confere.
function agZapVerifica_(p) {
  if (p['hub.mode'] === 'subscribe' && agProp_('WHATSAPP_VERIFY_TOKEN') && p['hub.verify_token'] === agProp_('WHATSAPP_VERIFY_TOKEN')) return String(p['hub.challenge'] || '');
  return null;
}
// Eventos do WhatsApp (POST). O Apps Script não expõe os cabeçalhos, então a autenticidade é um segredo na URL (?s=...).
function agZapWebhook_(corpo, segredo) {
  var esperado = agProp_('WHATSAPP_WEBHOOK_SECRET');
  if (!esperado || segredo !== esperado) return { ok: false, ignorado: 'nao_autorizado' };
  var cache = CacheService.getScriptCache(), tratadas = 0;
  (corpo.entry || []).forEach(function (en) { (en.changes || []).forEach(function (ch) {
    var v = ch.value || {};
    (v.messages || []).forEach(function (msg) {
      var wamid = limpo_(msg.id, 120), de = String(msg.from || '').replace(/\D/g, '');
      if (!wamid || !de || cache.get('wm_' + hash_(wamid))) return;   // a Meta reenvia: o mesmo wamid nunca é processado duas vezes
      cache.put('wm_' + hash_(wamid), '1', 21600);
      var trava = LockService.getScriptLock();
      if (!trava.tryLock(CONFIG.TRAVA_MS)) { cache.remove('wm_' + hash_(wamid)); return; }   // a Meta tenta de novo depois
      try { memo_ = {}; agZapMensagem_(msg, wamid, de); tratadas++; } catch (err) { console.error(err && err.message); } finally { trava.releaseLock(); }
    });
  }); });
  return { ok: true, tratadas: tratadas };
}
function agZapMensagem_(msg, wamid, de) {
  var vinc = ler_('ZapVinculos').filter(function (x) { return x.Verificado === 'sim' && String(x.Telefone) === de; })[0];
  var texto = msg.type === 'text' && msg.text ? limpo_(msg.text.body, 500) : '';
  if (!vinc) {
    var cod = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var pend = cod.length === 6 ? ler_('ZapVinculos').filter(function (x) { return x.Verificado !== 'sim' && x.Codigo === cod && String(x.Expira) >= agora_(); })[0] : null;
    if (pend) {
      var email = String(pend.Email).toLowerCase();
      atualizar_('ZapVinculos', pend._linha, Object.assign({}, pend, { Telefone: de, Verificado: 'sim', Codigo: '' }));
      agAudita_(email, 'whatsapp', Utilities.getUuid(), 'config', '', null, null, 'WhatsApp vinculado', wamid);
      agZapEnvia_(de, 'Pronto! Seu WhatsApp está vinculado ao Rumi. Mande, por exemplo: "gastei 45 no almoço" ou "como está minha situação financeira?".');
    } else agZapEnvia_(de, 'Não reconheci este número. No app, abra Rumi › Configurações › WhatsApp, gere um código e envie aqui.');
    return;
  }
  var u = { email: String(vinc.Email).toLowerCase(), nome: '' };
  if (!agPermitido_(u.email, 'whatsapp')) { agZapEnvia_(de, 'A integração com o WhatsApp está desativada nas permissões do app. Reative em Opções › Permissões para continuar.'); return; }
  if (!texto) { agZapEnvia_(de, 'Por enquanto leio só texto. Para um comprovante, cole o texto dele aqui (ex.: "compra aprovada R$ 89,90 em Loja X") e eu registro com a sua confirmação.'); return; }
  var enc = !!(msg.context && (msg.context.forwarded || msg.context.frequently_forwarded));
  var r = agProcessa_(u, texto, 'wa:' + wamid, 'whatsapp', enc);
  agZapEnvia_(de, r.resposta);
}
/* ======================= FIM AGENTE ======================= */
