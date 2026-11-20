/**
 * FINANÇAS DB — back-end em Google Apps Script + Google Planilhas
 * Versão 1.1.0
 *
 * COMO USAR (resumo):
 *  1. Cole este arquivo em Extensões → Apps Script (script vinculado à planilha "Financas DB").
 *  2. Troque CONFIG.CLIENT_ID pelo ID do cliente OAuth (Google Cloud Console → Credenciais),
 *     ou guarde em Configurações do projeto → Propriedades do script → CLIENT_ID.
 *  3. Execute a função `autorizar` uma vez e aceite as permissões. Ela cria todas as abas.
 *  4. Implantar → Nova implantação → App da Web → Executar como: Eu → Acesso: Qualquer pessoa.
 *  5. Sempre que mudar este arquivo: Implantar → Gerenciar implantações → Editar → Nova versão.
 *
 * COMO O SITE CHAMA:
 *  fetch(URL_EXEC, { method:'POST', body: JSON.stringify({ acao, token, dados }) })
 *  (sem cabeçalho Content-Type, para o navegador não fazer preflight CORS).
 *  `token` = ID token do Login com Google. Resposta: { ok:true, dados } ou { ok:false, erro, mensagem }.
 *
 * MODELO: "Executar como eu" (modelo A). Todos os dados ficam nesta planilha, separados por e-mail.
 * Toda leitura e escrita passa pelas funções de acesso a dados (ler_, acrescentar_, atualizar_...),
 * o que facilita trocar a planilha por outro banco no futuro.
 */

var VERSAO = '1.1.0';

var CONFIG = {
  CLIENT_ID: 'COLE_AQUI_O_ID_DO_CLIENTE_OAUTH',
  FUSO: 'America/Sao_Paulo',
  MAX_LINHAS_IMPORTACAO: 500,
  MAX_LANCAMENTOS_POR_USUARIO: 20000,
  TRAVA_MS: 20000
};

var AVISO = 'Orientação educativa de planejamento financeiro. Não é recomendação de investimento.';

/* ======================= TABELAS (uma aba cada) ======================= */

var TABELAS = {
  Usuarios:    ['Email', 'Nome', 'Criado', 'UltimoAcesso'],
  Contas:      ['Id', 'Email', 'Nome', 'Tipo', 'SaldoInicial', 'Criado'],
  Categorias:  ['Id', 'Email', 'Nome', 'Tipo', 'Cor', 'Icone', 'Arquivada'],
  Lancamentos: ['Id', 'Email', 'Data', 'Tipo', 'Valor', 'ContaId', 'CategoriaId', 'Descricao', 'Chave', 'Criado', 'Tags'],
  Orcamentos:  ['Id', 'Email', 'CategoriaId', 'Mes', 'Limite'],
  Metas:       ['Id', 'Email', 'Nome', 'ValorAlvo', 'ValorAtual', 'Prazo', 'Criado'],
  // Reservada para a conversa com IA (fase 2). O motor de regras não grava aqui.
  Consultor:   ['Id', 'Email', 'Data', 'Papel', 'Texto']
};

// Colunas formatadas como texto: impedem que a planilha converta datas ou interprete fórmulas.
var COLUNAS_TEXTO = ['Data', 'Mes', 'Prazo', 'Criado', 'UltimoAcesso', 'Nome', 'Descricao', 'Chave', 'Papel', 'Texto', 'Tags', 'Icone', 'Arquivada'];

var TIPOS_CONTA = ['corrente', 'poupanca', 'reserva', 'investimento', 'dinheiro', 'cartao'];

// [nome, tipo, cor, ícone]. Ordem = ordem de exibição.
var CATEGORIAS_PADRAO = [
  ['Alimentação', 'despesa', '#f97316', '🍽️'], ['Assinaturas', 'despesa', '#eab308', '🔁'], ['Restaurantes', 'despesa', '#fb7185', '🍔'],
  ['Casa', 'despesa', '#6366f1', '🏠'], ['Compras', 'despesa', '#d946ef', '🛍️'], ['Cuidados pessoais', 'despesa', '#f472b6', '💅'],
  ['Dívidas/Empréstimos', 'despesa', '#dc2626', '💳'], ['Educação', 'despesa', '#14b8a6', '🎓'], ['Família e Filhos', 'despesa', '#fb923c', '👨‍👩‍👧'],
  ['Impostos e Taxas', 'despesa', '#64748b', '🧾'], ['Investimento', 'despesa', '#22c55e', '📈'], ['Lazer e Hobbies', 'despesa', '#a855f7', '🎮'],
  ['Mercado', 'despesa', '#84cc16', '🛒'], ['Pets', 'despesa', '#f59e0b', '🐾'], ['Presentes e Doações', 'despesa', '#ec4899', '🎁'],
  ['Roupas', 'despesa', '#8b5cf6', '👕'], ['Saúde', 'despesa', '#ef4444', '🩺'], ['Trabalho', 'despesa', '#0ea5e9', '💼'],
  ['Transporte', 'despesa', '#38bdf8', '🚌'], ['Viagens', 'despesa', '#06b6d4', '✈️'],
  // sugeridas
  ['Moradia/Aluguel', 'despesa', '#818cf8', '🔑'], ['Contas de consumo', 'despesa', '#facc15', '💡'], ['Seguros', 'despesa', '#94a3b8', '🛡️'],
  ['Manutenção de veículo', 'despesa', '#78716c', '🔧'],
  ['Outros', 'despesa', '#94a3b8', '📦'],
  ['Salário', 'receita', '#22c55e', '💰'], ['Investimentos', 'receita', '#10b981', '📊'], ['Empréstimos', 'receita', '#06b6d4', '🤝'],
  ['Outras receitas', 'receita', '#84cc16', '➕']
];
// Nomes antigos que contam como "já existe" ao completar os padrões de quem usa o app desde a versão 1.0.
var ALIAS_PADRAO = { 'moradia/aluguel': ['moradia'], 'lazer e hobbies': ['lazer'], 'outras receitas': ['extras'] };

function categoriasPadrao_(email, existentes) {
  var tem = {};
  (existentes || []).forEach(function (c) { tem[c.Tipo + '|' + norm_(c.Nome)] = 1; });
  var novas = [];
  CATEGORIAS_PADRAO.forEach(function (c) {
    var nomes = [norm_(c[0])].concat(ALIAS_PADRAO[norm_(c[0])] || []);
    if (nomes.some(function (n) { return tem[c[1] + '|' + n]; })) return;
    novas.push({ Id: Utilities.getUuid(), Email: email, Nome: c[0], Tipo: c[1], Cor: c[2], Icone: c[3], Arquivada: '' });
  });
  return novas;
}

/* ======================= ENTRADA (doGet / doPost) ======================= */

var memo_ = {}; // leituras memoizadas por requisição (cada execução começa zerada)

function doGet() {
  return saida_({ ok: true, nome: 'Financas DB', versao: VERSAO });
}

function doPost(e) {
  memo_ = {};
  var resp;
  try {
    var corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    resp = rotear_(corpo);
  } catch (err) {
    if (err && err.codigo) {
      resp = { ok: false, erro: err.codigo, mensagem: err.message, detalhes: err.detalhes };
    } else {
      console.error(err);
      resp = { ok: false, erro: 'erro_interno', mensagem: 'Erro interno. Tente novamente.' };
    }
  }
  return saida_(resp);
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function erro_(codigo, msg) {
  var e = new Error(msg || codigo);
  e.codigo = codigo;
  return e;
}

/* ======================= ROTEADOR ======================= */

var LEITURAS = {
  listar_contas: 1, listar_categorias: 1, listar_lancamentos: 1, listar_orcamentos: 1,
  listar_metas: 1, listar_tags: 1, resumo: 1, consultor: 1, exportar_dados: 1
};

function rotear_(corpo) {
  var acao = String(corpo.acao || '');
  var fn = ACOES[acao];
  if (!fn) throw erro_('acao_desconhecida', 'Ação desconhecida.');
  var u = autenticar_(corpo.token);
  var dados = (corpo.dados && typeof corpo.dados === 'object') ? corpo.dados : {};

  if (acao !== 'iniciar' && !doUsuario_('Usuarios', u.email).length) {
    throw erro_('sem_cadastro', 'Faça o primeiro acesso antes (ação iniciar).');
  }
  if (LEITURAS[acao]) return { ok: true, dados: fn(u, dados) };

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(CONFIG.TRAVA_MS)) throw erro_('ocupado', 'Sistema ocupado. Tente de novo em instantes.');
  try {
    return { ok: true, dados: fn(u, dados) };
  } finally {
    trava.releaseLock();
  }
}

/* ======================= LOGIN (token do Google) ======================= */

function clientId_() {
  var id = PropertiesService.getScriptProperties().getProperty('CLIENT_ID') || CONFIG.CLIENT_ID;
  if (!id || id.indexOf('COLE_AQUI') === 0) throw erro_('config_ausente', 'CLIENT_ID não configurado no Code.gs.');
  return id;
}

function autenticar_(token) {
  token = String(token || '');
  if (!token) throw erro_('nao_autenticado', 'Faça login com o Google.');
  var cache = CacheService.getScriptCache();
  var chave = 'tk_' + hash_(token);
  var guardado = cache.get(chave);
  if (guardado) return JSON.parse(guardado);

  var idCliente = clientId_();
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw erro_('token_invalido', 'Login inválido ou expirado.');
  var info = JSON.parse(resp.getContentText());
  var emissorOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  var verificado = info.email_verified === true || info.email_verified === 'true';
  var expira = Number(info.exp) * 1000;
  if (info.aud !== idCliente || !emissorOk || !verificado || !info.email || !(expira > Date.now())) {
    throw erro_('token_invalido', 'Login inválido ou expirado.');
  }
  var u = { email: String(info.email).toLowerCase(), nome: limpo_(info.name || '', 80) };
  var ttl = Math.max(1, Math.min(300, Math.floor((expira - Date.now()) / 1000)));
  cache.put(chave, JSON.stringify(u), ttl);
  return u;
}

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return Utilities.base64EncodeWebSafe(bytes).slice(0, 43);
}

/* ======================= SANEAMENTO E VALIDAÇÃO ======================= */

function limpo_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

// Texto vindo do cliente: nunca pode virar fórmula na planilha.
function seguro_(v, max) {
  var s = limpo_(v, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(v) {
  var n;
  if (typeof v === 'number') {
    n = v;
  } else {
    var s = String(v == null ? '' : v).trim();
    if (s === '') throw erro_('valor_invalido', 'Valor inválido.');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    n = Number(s);
  }
  if (!isFinite(n) || Math.abs(n) >= 1e9) throw erro_('valor_invalido', 'Valor inválido.');
  return Math.round(n * 100) / 100;
}

function corOk_(c) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c) : '#94a3b8';
}

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ======================= DATAS (sempre no fuso do negócio) ======================= */

function agora_() { return Utilities.formatDate(new Date(), CONFIG.FUSO, "yyyy-MM-dd'T'HH:mm:ss"); }
function hoje_() { return Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd'); }

function dataOk_(s) {
  s = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return dt.getUTCFullYear() === p[0] && dt.getUTCMonth() === p[1] - 1 && dt.getUTCDate() === p[2];
}

function mesOk_(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || '')); }
function mesOu_(s) { return mesOk_(s) ? String(s) : hoje_().slice(0, 7); }

function somarMes_(mes, k) {
  var p = mes.split('-').map(Number);
  var dt = new Date(Date.UTC(p[0], p[1] - 1 + k, 1));
  return dt.getUTCFullYear() + '-' + ('0' + (dt.getUTCMonth() + 1)).slice(-2);
}

function diasNoMes_(mes) {
  var p = mes.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
}

function diasEntre_(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

/* ======================= ACESSO A DADOS (camada isolada) ======================= */

function aba_(nome) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nome), cab = TABELAS[nome];
  if (sh && sh.getLastColumn() < cab.length) {
    // migração: planilha criada numa versão anterior; acrescenta as colunas novas no fim
    var ja = sh.getLastColumn();
    sh.getRange(1, ja + 1, 1, cab.length - ja).setValues([cab.slice(ja)]).setFontWeight('bold');
    for (var k = ja; k < cab.length; k++) {
      if (COLUNAS_TEXTO.indexOf(cab[k]) >= 0) sh.getRange(1, k + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
    for (var i = 0; i < cab.length; i++) {
      if (COLUNAS_TEXTO.indexOf(cab[i]) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  return sh;
}

// Todas as linhas da tabela como objetos (memoizado na requisição).
function ler_(nome) {
  if (memo_[nome]) return memo_[nome];
  var sh = aba_(nome), cab = TABELAS[nome], saida = [];
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var vals = sh.getRange(2, 1, n, cab.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { _linha: i + 2 };
      for (var j = 0; j < cab.length; j++) {
        var v = vals[i][j];
        o[cab[j]] = (v instanceof Date) ? Utilities.formatDate(v, CONFIG.FUSO, 'yyyy-MM-dd') : v;
      }
      saida.push(o);
    }
  }
  memo_[nome] = saida;
  return saida;
}

function doUsuario_(nome, email) {
  return ler_(nome).filter(function (r) { return String(r.Email).toLowerCase() === email; });
}

function linhaDe_(nome, o) {
  return TABELAS[nome].map(function (c) { return o[c] === undefined ? '' : o[c]; });
}

function acrescentar_(nome, objs) {
  if (!objs.length) return;
  var sh = aba_(nome), cab = TABELAS[nome];
  var linhas = objs.map(function (o) { return linhaDe_(nome, o); });
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cab.length).setValues(linhas);
  memo_[nome] = null;
}

function atualizar_(nome, linha, o) {
  var sh = aba_(nome), cab = TABELAS[nome];
  sh.getRange(linha, 1, 1, cab.length).setValues([linhaDe_(nome, o)]);
  memo_[nome] = null;
}

function apagarLinha_(nome, linha) {
  aba_(nome).deleteRow(linha);
  memo_[nome] = null;
}

// Troca completa do conteúdo (usado só para apagar os dados de um usuário).
function reescrever_(nome, objs) {
  var sh = aba_(nome), cab = TABELAS[nome];
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, cab.length).clearContent();
  if (objs.length) sh.getRange(2, 1, objs.length, cab.length).setValues(objs.map(function (o) { return linhaDe_(nome, o); }));
  memo_[nome] = null;
}

function upsert_(nome, email, id, campos) {
  if (id) {
    var r = doUsuario_(nome, email).filter(function (x) { return x.Id === id; })[0];
    if (!r) throw erro_('nao_encontrado', 'Registro não encontrado.');
    var atualizado = Object.assign({}, r, campos);
    atualizar_(nome, r._linha, atualizado);
    return atualizado;
  }
  var novo = Object.assign({ Id: Utilities.getUuid(), Email: email, Criado: agora_() }, campos);
  acrescentar_(nome, [novo]);
  return novo;
}

function excluirPorId_(nome, email, id) {
  var r = doUsuario_(nome, email).filter(function (x) { return x.Id === String(id || ''); })[0];
  if (!r) throw erro_('nao_encontrado', 'Registro não encontrado.');
  apagarLinha_(nome, r._linha);
  return { id: r.Id };
}

// Move lançamentos e orçamentos de uma categoria para outra (gravação em bloco: uma escrita por coluna).
function reatribuir_(email, de, para) {
  var sh = aba_('Lancamentos'), cab = TABELAS.Lancamentos, n = sh.getLastRow() - 1;
  if (n > 0) {
    var col = cab.indexOf('CategoriaId') + 1, ce = cab.indexOf('Email'), vals = sh.getRange(2, 1, n, cab.length).getValues(), cats = [];
    for (var i = 0; i < n; i++) {
      var v = vals[i][col - 1];
      if (v === de && String(vals[i][ce]).toLowerCase() === email) v = para;
      cats.push([v]);
    }
    sh.getRange(2, col, n, 1).setValues(cats);
    memo_.Lancamentos = null;
  }
  var existentes = doUsuario_('Orcamentos', email);
  existentes.filter(function (o) { return o.CategoriaId === de; }).forEach(function (o) {
    var igual = existentes.filter(function (x) { return x.CategoriaId === para && String(x.Mes) === String(o.Mes); })[0];
    if (igual) {   // já há orçamento no destino para o mês: soma os limites e remove o antigo
      atualizar_('Orcamentos', igual._linha, Object.assign({}, igual, { Limite: Number(igual.Limite) + Number(o.Limite) }));
      o._remover = true;
    } else atualizar_('Orcamentos', o._linha, Object.assign({}, o, { CategoriaId: para }));
  });
  existentes.filter(function (o) { return o._remover; }).map(function (o) { return o._linha; }).sort(function (a, b) { return b - a; })
    .forEach(function (l) { apagarLinha_('Orcamentos', l); });
}

/* ======================= FORMATOS DE SAÍDA (nunca expõem e-mail) ======================= */

function sCategoria_(c) { return { id: c.Id, nome: c.Nome, tipo: c.Tipo, cor: c.Cor, icone: c.Icone || '🏷️', arquivada: String(c.Arquivada) === 'sim' }; }
function tagsDe_(t) { return String(t || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function sConta_(c, saldo) { return { id: c.Id, nome: c.Nome, tipo: c.Tipo, saldoInicial: Number(c.SaldoInicial) || 0, saldo: saldo }; }
function sLanc_(l) {
  return { id: l.Id, data: String(l.Data), tipo: l.Tipo, valor: Number(l.Valor), contaId: l.ContaId, categoriaId: l.CategoriaId, descricao: l.Descricao, tags: tagsDe_(l.Tags) };
}
function sOrc_(o) { return { id: o.Id, categoriaId: o.CategoriaId, mes: String(o.Mes), limite: Number(o.Limite) }; }
function sMeta_(m) {
  return { id: m.Id, nome: m.Nome, valorAlvo: Number(m.ValorAlvo), valorAtual: Number(m.ValorAtual) || 0, prazo: String(m.Prazo || '') };
}

function movimentos_(email) {
  return doUsuario_('Lancamentos', email).map(sLanc_);
}

function saldos_(email) {
  var s = {};
  doUsuario_('Contas', email).forEach(function (c) { s[c.Id] = Number(c.SaldoInicial) || 0; });
  doUsuario_('Lancamentos', email).forEach(function (l) {
    if (s[l.ContaId] === undefined) return;
    s[l.ContaId] += (l.Tipo === 'receita' ? 1 : -1) * Number(l.Valor);
  });
  Object.keys(s).forEach(function (k) { s[k] = Math.round(s[k] * 100) / 100; });
  return s;
}

function total_(movs, tipo) {
  var t = 0;
  movs.forEach(function (m) { if (m.tipo === tipo) t += m.valor; });
  return Math.round(t * 100) / 100;
}

function brl_(n) {
  var neg = n < 0;
  var p = Math.abs(n).toFixed(2).split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + 'R$ ' + p[0] + ',' + p[1];
}

/* ======================= VALIDAÇÃO DE LANÇAMENTO ======================= */

// Até 8 tags por lançamento, sem '#', sem repetir (ignora maiúsculas), até 24 caracteres cada.
function normalizaTags_(t) {
  var lista = Array.isArray(t) ? t : String(t || '').split(',');
  var vistos = {}, out = [];
  lista.forEach(function (x) {
    x = seguro_(String(x).replace(/^[#=+\-@\s]+/, ''), 24).replace(/,/g, ' ').trim();
    var k = norm_(x);
    if (x && !vistos[k] && out.length < 8) { vistos[k] = 1; out.push(x); }
  });
  return out.join(',');
}

function validarLanc_(email, d) {
  var tipo = d.tipo === 'receita' ? 'receita' : (d.tipo === 'despesa' ? 'despesa' : null);
  if (!tipo) throw erro_('tipo_invalido', 'Tipo deve ser receita ou despesa.');
  var data = String(d.data || '');
  if (!dataOk_(data)) throw erro_('data_invalida', 'Data inválida (use AAAA-MM-DD).');
  var valor = num_(d.valor);
  if (valor <= 0) throw erro_('valor_invalido', 'O valor deve ser maior que zero.');
  var contaId = String(d.contaId || '');
  if (!doUsuario_('Contas', email).some(function (c) { return c.Id === contaId; })) throw erro_('conta_invalida', 'Conta inválida.');
  var catId = String(d.categoriaId || '');
  if (catId) {
    var cat = doUsuario_('Categorias', email).filter(function (c) { return c.Id === catId; })[0];
    if (!cat) throw erro_('categoria_invalida', 'Categoria inválida.');
    if (String(cat.Arquivada) === 'sim') throw erro_('categoria_arquivada', 'Essa categoria está arquivada. Desarquive ou escolha outra.');
    if (cat.Tipo !== tipo) throw erro_('categoria_invalida', 'A categoria não é de ' + tipo + '.');
  }
  return { Data: data, Tipo: tipo, Valor: valor, ContaId: contaId, CategoriaId: catId, Descricao: seguro_(d.descricao, 200), Tags: normalizaTags_(d.tags) };
}

/* ======================= AÇÕES ======================= */

var ACOES = {

  iniciar: function (u) {
    var existe = ler_('Usuarios').filter(function (r) { return String(r.Email).toLowerCase() === u.email; })[0];
    if (!existe) {
      acrescentar_('Usuarios', [{ Email: u.email, Nome: seguro_(u.nome, 80), Criado: agora_(), UltimoAcesso: agora_() }]);
      acrescentar_('Categorias', categoriasPadrao_(u.email, []));
      acrescentar_('Contas', [{ Id: Utilities.getUuid(), Email: u.email, Nome: 'Carteira', Tipo: 'dinheiro', SaldoInicial: 0, Criado: agora_() }]);
    } else {
      atualizar_('Usuarios', existe._linha, Object.assign({}, existe, { UltimoAcesso: agora_() }));
    }
    return { email: u.email, nome: u.nome, novo: !existe, aviso: AVISO };
  },

  /* ---- contas ---- */
  listar_contas: function (u) {
    var sal = saldos_(u.email);
    return doUsuario_('Contas', u.email).map(function (c) { return sConta_(c, sal[c.Id] || 0); });
  },
  salvar_conta: function (u, d) {
    var nome = seguro_(d.nome, 60);
    if (!nome) throw erro_('nome_invalido', 'Informe o nome da conta.');
    var tipo = TIPOS_CONTA.indexOf(d.tipo) >= 0 ? d.tipo : 'corrente';
    var r = upsert_('Contas', u.email, String(d.id || ''), { Nome: nome, Tipo: tipo, SaldoInicial: d.saldoInicial === undefined ? 0 : num_(d.saldoInicial) });
    return sConta_(r, saldos_(u.email)[r.Id] || 0);
  },
  excluir_conta: function (u, d) {
    var id = String(d.id || '');
    if (doUsuario_('Lancamentos', u.email).some(function (l) { return l.ContaId === id; })) {
      throw erro_('em_uso', 'A conta tem lançamentos. Apague-os antes.');
    }
    return excluirPorId_('Contas', u.email, id);
  },

  /* ---- categorias ---- */
  listar_categorias: function (u) { return doUsuario_('Categorias', u.email).map(sCategoria_); },
  salvar_categoria: function (u, d) {
    var nome = seguro_(d.nome, 40);
    if (!nome) throw erro_('nome_invalido', 'Informe o nome da categoria.');
    var tipo = d.tipo === 'receita' ? 'receita' : 'despesa', id = String(d.id || '');
    var todas = doUsuario_('Categorias', u.email);
    if (todas.some(function (c) { return c.Id !== id && c.Tipo === tipo && norm_(c.Nome) === norm_(nome); })) {
      throw erro_('duplicada', 'Já existe uma categoria de ' + tipo + ' com esse nome.');
    }
    if (id) {
      var atual = todas.filter(function (c) { return c.Id === id; })[0];
      if (atual && atual.Tipo !== tipo && doUsuario_('Lancamentos', u.email).some(function (l) { return l.CategoriaId === id; })) {
        throw erro_('em_uso', 'Não dá para mudar o tipo de uma categoria que já tem lançamentos.');
      }
    }
    var icone = seguro_(d.icone, 8) || '🏷️';
    return sCategoria_(upsert_('Categorias', u.email, id, { Nome: nome, Tipo: tipo, Cor: corOk_(d.cor), Icone: icone }));
  },
  arquivar_categoria: function (u, d) {
    var id = String(d.id || '');
    var r = doUsuario_('Categorias', u.email).filter(function (c) { return c.Id === id; })[0];
    if (!r) throw erro_('nao_encontrado', 'Categoria não encontrada.');
    return sCategoria_(upsert_('Categorias', u.email, id, { Arquivada: d.arquivada === false ? '' : 'sim' }));
  },
  // Não exclui categoria com lançamentos, a menos que o app peça para reatribuir (reatribuirPara = id de outra categoria do mesmo tipo).
  excluir_categoria: function (u, d) {
    var id = String(d.id || '');
    var cat = doUsuario_('Categorias', u.email).filter(function (c) { return c.Id === id; })[0];
    if (!cat) throw erro_('nao_encontrado', 'Categoria não encontrada.');
    var lancs = doUsuario_('Lancamentos', u.email).filter(function (l) { return l.CategoriaId === id; }).length;
    var orcs = doUsuario_('Orcamentos', u.email).filter(function (o) { return o.CategoriaId === id; });
    if (lancs || orcs.length) {
      var dest = String(d.reatribuirPara || '');
      if (!dest) {
        var e = erro_('em_uso', 'A categoria tem ' + lancs + ' lançamento(s) e ' + orcs.length + ' orçamento(s). Escolha outra categoria para receber esses itens.');
        e.detalhes = { lancamentos: lancs, orcamentos: orcs.length };
        throw e;
      }
      var alvo = doUsuario_('Categorias', u.email).filter(function (c) { return c.Id === dest; })[0];
      if (!alvo || alvo.Id === id || alvo.Tipo !== cat.Tipo) throw erro_('categoria_invalida', 'Escolha outra categoria do mesmo tipo (' + cat.Tipo + ').');
      reatribuir_(u.email, id, dest);
    }
    return Object.assign(excluirPorId_('Categorias', u.email, id), { reatribuidos: lancs });
  },
  restaurar_categorias_padrao: function (u) {
    var novas = categoriasPadrao_(u.email, doUsuario_('Categorias', u.email));
    acrescentar_('Categorias', novas);
    return { adicionadas: novas.length, nomes: novas.map(function (c) { return c.Nome; }) };
  },
  listar_tags: function (u) {
    var cont = {};
    doUsuario_('Lancamentos', u.email).forEach(function (l) { tagsDe_(l.Tags).forEach(function (t) { var k = norm_(t); cont[k] = cont[k] || { tag: t, total: 0 }; cont[k].total++; }); });
    return Object.keys(cont).map(function (k) { return cont[k]; }).sort(function (a, b) { return b.total - a.total; });
  },

  /* ---- lançamentos ---- */
  listar_lancamentos: function (u, d) {
    var mes = mesOu_(d.mes);
    return movimentos_(u.email)
      .filter(function (m) { return m.data.slice(0, 7) === mes; })
      .sort(function (a, b) { return a.data < b.data ? 1 : (a.data > b.data ? -1 : 0); })
      .slice(0, 1000);
  },
  salvar_lancamento: function (u, d) {
    var campos = validarLanc_(u.email, d);
    var id = String(d.id || '');
    if (!id && doUsuario_('Lancamentos', u.email).length >= CONFIG.MAX_LANCAMENTOS_POR_USUARIO) {
      throw erro_('limite', 'Limite de lançamentos atingido.');
    }
    return sLanc_(upsert_('Lancamentos', u.email, id, campos));
  },
  excluir_lancamento: function (u, d) { return excluirPorId_('Lancamentos', u.email, d.id); },

  // Importação de extrato (o site lê o CSV/OFX e manda as linhas). Reenviar o mesmo arquivo não duplica.
  importar_lancamentos: function (u, d) {
    var linhas = Array.isArray(d.linhas) ? d.linhas : [];
    if (!linhas.length) throw erro_('vazio', 'Nenhuma linha para importar.');
    if (linhas.length > CONFIG.MAX_LINHAS_IMPORTACAO) throw erro_('muitas_linhas', 'Máximo de ' + CONFIG.MAX_LINHAS_IMPORTACAO + ' linhas por envio.');
    var existentes = {}, total = 0;
    doUsuario_('Lancamentos', u.email).forEach(function (l) { total++; if (l.Chave) existentes[l.Chave] = 1; });
    var ocorr = {}, novos = [], ignoradas = 0, invalidas = [];
    linhas.forEach(function (l, i) {
      var v;
      try {
        v = validarLanc_(u.email, { tipo: l.tipo, data: l.data, valor: l.valor, contaId: d.contaId, categoriaId: l.categoriaId, descricao: l.descricao });
      } catch (err) {
        invalidas.push({ linha: i + 1, motivo: err.codigo || 'erro' });
        return;
      }
      var base = [v.Data, v.Tipo, v.Valor.toFixed(2), String(v.Descricao).toLowerCase().replace(/\s+/g, ' '), v.ContaId].join('|');
      ocorr[base] = (ocorr[base] || 0) + 1;
      var chave = base + '#' + ocorr[base];
      if (existentes[chave]) { ignoradas++; return; }
      v.Chave = chave;
      novos.push(Object.assign({ Id: Utilities.getUuid(), Email: u.email, Criado: agora_() }, v));
    });
    if (total + novos.length > CONFIG.MAX_LANCAMENTOS_POR_USUARIO) throw erro_('limite', 'Limite de lançamentos atingido.');
    acrescentar_('Lancamentos', novos);
    return { importadas: novos.length, ignoradas: ignoradas, invalidas: invalidas };
  },

  /* ---- orçamentos ---- */
  listar_orcamentos: function (u, d) {
    var mes = mesOu_(d.mes);
    return doUsuario_('Orcamentos', u.email).filter(function (o) { return String(o.Mes) === mes; }).map(sOrc_);
  },
  salvar_orcamento: function (u, d) {
    var catId = String(d.categoriaId || ''), mes = String(d.mes || '');
    if (!doUsuario_('Categorias', u.email).some(function (c) { return c.Id === catId; })) throw erro_('categoria_invalida', 'Categoria inválida.');
    if (!mesOk_(mes)) throw erro_('mes_invalido', 'Mês inválido (use AAAA-MM).');
    var limite = num_(d.limite);
    if (limite <= 0) throw erro_('valor_invalido', 'O limite deve ser maior que zero.');
    var existente = doUsuario_('Orcamentos', u.email).filter(function (o) { return o.CategoriaId === catId && String(o.Mes) === mes; })[0];
    return sOrc_(upsert_('Orcamentos', u.email, existente ? existente.Id : '', { CategoriaId: catId, Mes: mes, Limite: limite }));
  },
  excluir_orcamento: function (u, d) { return excluirPorId_('Orcamentos', u.email, d.id); },

  /* ---- metas ---- */
  listar_metas: function (u) { return doUsuario_('Metas', u.email).map(sMeta_); },
  salvar_meta: function (u, d) {
    var nome = seguro_(d.nome, 60);
    if (!nome) throw erro_('nome_invalido', 'Informe o nome da meta.');
    var alvo = num_(d.valorAlvo);
    if (alvo <= 0) throw erro_('valor_invalido', 'O valor da meta deve ser maior que zero.');
    var atual = d.valorAtual === undefined ? 0 : num_(d.valorAtual);
    if (atual < 0) throw erro_('valor_invalido', 'O valor atual não pode ser negativo.');
    var prazo = d.prazo ? String(d.prazo) : '';
    if (prazo && !dataOk_(prazo)) throw erro_('data_invalida', 'Prazo inválido (use AAAA-MM-DD).');
    return sMeta_(upsert_('Metas', u.email, String(d.id || ''), { Nome: nome, ValorAlvo: alvo, ValorAtual: atual, Prazo: prazo }));
  },
  excluir_meta: function (u, d) { return excluirPorId_('Metas', u.email, d.id); },

  /* ---- painel e consultor ---- */
  resumo: function (u, d) { return resumo_(u.email, mesOu_(d.mes)); },
  consultor: function (u, d) { return consultor_(u.email, mesOu_(d.mes)); },

  /* ---- LGPD ---- */
  exportar_dados: function (u) {
    var saida = {};
    Object.keys(TABELAS).forEach(function (nome) {
      saida[nome] = doUsuario_(nome, u.email).map(function (r) {
        var o = {};
        TABELAS[nome].forEach(function (c) { if (c !== 'Email') o[c] = r[c]; });
        return o;
      });
    });
    return saida;
  },
  apagar_conta_usuario: function (u, d) {
    if (d.confirmar !== 'APAGAR') throw erro_('confirmacao', 'Envie confirmar: "APAGAR".');
    Object.keys(TABELAS).forEach(function (nome) {
      var restantes = ler_(nome).filter(function (r) { return String(r.Email).toLowerCase() !== u.email; });
      reescrever_(nome, restantes);
    });
    return { apagado: true };
  }
};

/* ======================= RESUMO DO PAINEL ======================= */

function resumo_(email, mes) {
  var movs = movimentos_(email);
  var doMes = movs.filter(function (m) { return m.data.slice(0, 7) === mes; });
  var cats = {};
  doUsuario_('Categorias', email).forEach(function (c) { cats[c.Id] = c.Nome; });

  var gastoCat = {};
  doMes.forEach(function (m) { if (m.tipo === 'despesa') gastoCat[m.categoriaId] = (gastoCat[m.categoriaId] || 0) + m.valor; });
  var porCategoria = Object.keys(gastoCat).map(function (id) {
    return { categoriaId: id, nome: cats[id] || 'Sem categoria', valor: Math.round(gastoCat[id] * 100) / 100 };
  }).sort(function (a, b) { return b.valor - a.valor; });

  var orcamentos = doUsuario_('Orcamentos', email).filter(function (o) { return String(o.Mes) === mes; }).map(function (o) {
    var gasto = Math.round((gastoCat[o.CategoriaId] || 0) * 100) / 100;
    return { id: o.Id, categoriaId: o.CategoriaId, nome: cats[o.CategoriaId] || 'Categoria', limite: Number(o.Limite), gasto: gasto, pct: Math.round(gasto / Number(o.Limite) * 100) };
  });

  var serie = [];
  for (var k = 5; k >= 0; k--) {
    var mm = somarMes_(mes, -k);
    var dm = movs.filter(function (m) { return m.data.slice(0, 7) === mm; });
    serie.push({ mes: mm, receitas: total_(dm, 'receita'), despesas: total_(dm, 'despesa') });
  }

  var sal = saldos_(email), saldoContas = 0;
  Object.keys(sal).forEach(function (id) { saldoContas += sal[id]; });
  var rec = total_(doMes, 'receita'), desp = total_(doMes, 'despesa');
  return {
    mes: mes, receitas: rec, despesas: desp, saldoMes: Math.round((rec - desp) * 100) / 100,
    saldoContas: Math.round(saldoContas * 100) / 100,
    porCategoria: porCategoria, orcamentos: orcamentos, serie: serie
  };
}

/* ======================= CONSULTOR: MOTOR DE REGRAS (gratuito) ======================= */

function consultor_(email, mes) {
  var hoje = hoje_(), ehAtual = hoje.slice(0, 7) === mes;
  var movs = movimentos_(email);
  var cats = {};
  doUsuario_('Categorias', email).forEach(function (c) { cats[c.Id] = c.Nome; });
  var doMes = movs.filter(function (m) { return m.data.slice(0, 7) === mes; });
  var rec = total_(doMes, 'receita'), desp = total_(doMes, 'despesa');
  var dias = diasNoMes_(mes), dia = ehAtual ? Number(hoje.slice(8)) : dias;
  var dicas = [];
  function add(nivel, titulo, texto) { dicas.push({ nivel: nivel, titulo: titulo, texto: texto }); }

  var gastoCat = {};
  doMes.forEach(function (m) { if (m.tipo === 'despesa') gastoCat[m.categoriaId] = (gastoCat[m.categoriaId] || 0) + m.valor; });

  // 1. Sobra do mês
  if (rec > 0) {
    var sobra = rec - desp, taxa = sobra / rec;
    if (sobra < 0) add('alerta', 'Gastos acima da renda', 'Em ' + mes + ' você gastou ' + brl_(desp) + ' e recebeu ' + brl_(rec) + '. Faltam ' + brl_(-sobra) + '. Revise as maiores categorias.');
    else if (taxa < 0.1) add('atencao', 'Pouca sobra no mês', 'Você guardou ' + Math.round(taxa * 100) + '% da renda. Um ponto de partida comum é poupar entre 10% e 20%.');
    else add('ok', 'Boa sobra no mês', 'Você guardou ' + Math.round(taxa * 100) + '% da renda (' + brl_(sobra) + ').');
  } else if (desp > 0) {
    add('atencao', 'Sem receitas registradas', 'Há gastos em ' + mes + ', mas nenhuma receita. Registre seus ganhos para calcular a sobra.');
  }

  // 2. Projeção de fim de mês
  if (ehAtual && dia >= 5 && desp > 0) {
    var proj = desp / dia * dias;
    if (rec > 0 && proj > rec) add('alerta', 'Projeção acima da renda', 'No ritmo atual você fecha o mês com cerca de ' + brl_(proj) + ' em gastos, acima dos ' + brl_(rec) + ' recebidos.');
    else add('dica', 'Projeção do mês', 'No ritmo atual seus gastos fecham o mês em cerca de ' + brl_(proj) + '.');
  }

  // 3. Orçamentos
  doUsuario_('Orcamentos', email).filter(function (o) { return String(o.Mes) === mes; }).forEach(function (o) {
    var lim = Number(o.Limite), g = gastoCat[o.CategoriaId] || 0, p = g / lim, nome = cats[o.CategoriaId] || 'Categoria';
    if (p >= 1) add('alerta', 'Orçamento estourado: ' + nome, 'Você gastou ' + brl_(g) + ' de um limite de ' + brl_(lim) + ' (' + Math.round(p * 100) + '%).');
    else if (p >= 0.8) add('atencao', 'Orçamento quase no limite: ' + nome, 'Você já usou ' + Math.round(p * 100) + '% do limite de ' + brl_(lim) + '.');
  });

  // 4. Categoria acima da média dos 3 meses anteriores
  var anteriores = [1, 2, 3].map(function (k) { return somarMes_(mes, -k); });
  var somaAnt = {};
  movs.forEach(function (m) {
    if (m.tipo === 'despesa' && anteriores.indexOf(m.data.slice(0, 7)) >= 0) somaAnt[m.categoriaId] = (somaAnt[m.categoriaId] || 0) + m.valor;
  });
  if (!ehAtual || dia >= 10) {
    Object.keys(gastoCat).forEach(function (id) {
      var media = (somaAnt[id] || 0) / 3;
      if (media <= 0) return;
      var g = ehAtual ? gastoCat[id] / dia * dias : gastoCat[id];
      if (g > media * 1.3 && g - media >= 50) {
        add('atencao', 'Acima da média: ' + (cats[id] || 'Categoria'), 'O gasto ' + (ehAtual ? 'projetado ' : '') + 'é ' + brl_(g) + ', contra uma média de ' + brl_(media) + ' nos 3 meses anteriores.');
      }
    });
  }

  // 5. Reserva de emergência
  var totalAnt = 0;
  Object.keys(somaAnt).forEach(function (k) { totalAnt += somaAnt[k]; });
  var mediaDesp = totalAnt / 3;
  if (mediaDesp > 0) {
    var sal = saldos_(email), reserva = 0, temReserva = false;
    doUsuario_('Contas', email).forEach(function (c) {
      if (c.Tipo === 'reserva' || c.Tipo === 'poupanca') { temReserva = true; reserva += sal[c.Id] || 0; }
    });
    var meses = reserva / mediaDesp, mesesTxt = meses.toFixed(1).replace('.', ',');
    if (!temReserva) add('dica', 'Crie sua reserva de emergência', 'Cadastre uma conta do tipo reserva ou poupança. Uma meta comum é cobrir de 3 a 6 meses de gastos (entre ' + brl_(mediaDesp * 3) + ' e ' + brl_(mediaDesp * 6) + ').');
    else if (meses < 3) add('atencao', 'Reserva abaixo de 3 meses', 'Sua reserva cobre ' + mesesTxt + ' meses de gastos. Uma meta comum é de 3 a 6 meses.');
    else add('ok', 'Reserva de emergência em dia', 'Sua reserva cobre ' + mesesTxt + ' meses de gastos.');
  }

  // 6. Metas
  doUsuario_('Metas', email).forEach(function (m) {
    var alvo = Number(m.ValorAlvo), valorAtual = Number(m.ValorAtual) || 0, falta = alvo - valorAtual;
    if (falta <= 0) { add('ok', 'Meta atingida: ' + m.Nome, 'Você chegou a ' + brl_(alvo) + '.'); return; }
    var prazo = String(m.Prazo || '');
    if (!dataOk_(prazo)) return;
    var dd = diasEntre_(hoje, prazo);
    if (dd < 0) add('alerta', 'Meta atrasada: ' + m.Nome, 'O prazo passou e ainda faltam ' + brl_(falta) + '. Vale revisar o prazo ou o valor.');
    else add('dica', 'Meta: ' + m.Nome, 'Faltam ' + brl_(falta) + '. Guardando cerca de ' + brl_(falta / Math.max(1, Math.ceil(dd / 30))) + ' por mês você chega no prazo.');
  });

  // 7. Possíveis assinaturas (mesma descrição e valor em 3 ou mais meses dos últimos 6)
  var seis = [0, 1, 2, 3, 4, 5].map(function (k) { return somarMes_(mes, -k); });
  var grupos = {};
  movs.forEach(function (m) {
    if (m.tipo !== 'despesa') return;
    var mm = m.data.slice(0, 7);
    if (seis.indexOf(mm) < 0) return;
    var n = norm_(m.descricao);
    if (n.length < 3) return;
    var chave = n + '|' + m.valor.toFixed(2);
    var g = grupos[chave] || (grupos[chave] = { nome: m.descricao, valor: m.valor, meses: {} });
    g.meses[mm] = 1;
  });
  Object.keys(grupos).map(function (k) { return grupos[k]; })
    .filter(function (g) { return Object.keys(g.meses).length >= 3; })
    .slice(0, 5)
    .forEach(function (g) { add('dica', 'Possível assinatura: ' + g.nome, 'Aparece todo mês por ' + brl_(g.valor) + '. Vale conferir se você ainda usa.'); });

  var ordem = { alerta: 0, atencao: 1, dica: 2, ok: 3 };
  dicas.sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel]; });
  return { mes: mes, receitas: rec, despesas: desp, saldoMes: Math.round((rec - desp) * 100) / 100, dicas: dicas, aviso: AVISO };
}

/* ======================= AUTORIZAÇÃO (rodar uma vez, manualmente) ======================= */

function autorizar() {
  Object.keys(TABELAS).forEach(function (nome) { aba_(nome); });
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=teste', { muteHttpExceptions: true });
  CacheService.getScriptCache().put('autorizar', '1', 5);
  var trava = LockService.getScriptLock();
  if (trava.tryLock(1000)) trava.releaseLock();
  PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  Logger.log('Pronto: permissões concedidas e abas criadas (' + Object.keys(TABELAS).join(', ') + ').');
}
