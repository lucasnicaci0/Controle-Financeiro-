/**
 * FINANÇAS DB — back-end em Google Apps Script + Google Planilhas
 * Versão 1.5.0
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

var VERSAO = '1.5.0';

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
  Usuarios:    ['Email', 'Nome', 'Criado', 'UltimoAcesso', 'Apelido', 'Nascimento', 'Prefs', 'CambioFav'],
  Contas:      ['Id', 'Email', 'Nome', 'Tipo', 'SaldoInicial', 'Criado', 'Limite', 'DiaFechamento', 'DiaVencimento', 'Marca'],
  Categorias:  ['Id', 'Email', 'Nome', 'Tipo', 'Cor', 'Icone', 'Arquivada'],
  Lancamentos: ['Id', 'Email', 'Data', 'Tipo', 'Valor', 'ContaId', 'CategoriaId', 'Descricao', 'Chave', 'Criado', 'Tags', 'MoedaOrig', 'ValorOrig', 'Cotacao'],
  Orcamentos:  ['Id', 'Email', 'CategoriaId', 'Mes', 'Limite'],
  Metas:       ['Id', 'Email', 'Nome', 'ValorAlvo', 'ValorAtual', 'Prazo', 'Criado', 'Tipo', 'Aporte'],
  // Reservada para a conversa com IA (fase 2). O motor de regras não grava aqui.
  Consultor:   ['Id', 'Email', 'Data', 'Papel', 'Texto'],
  // Fase 2
  Agenda:      ['Id', 'Email', 'Titulo', 'Tipo', 'Data', 'Valor', 'ContaId', 'CategoriaId', 'Recorrencia', 'LembreteDias', 'Fim', 'Concluidos', 'Criado'],
  Limites:     ['Id', 'Email', 'Escopo', 'AlvoId', 'Limite', 'Criado'],
  Alertas:     ['Id', 'Email', 'Mes', 'LimiteId', 'Nivel', 'Gasto', 'Limite', 'Criado', 'Mensagem', 'Enviado'],
  Feeds:       ['Email', 'Token', 'Criado'],
  // Fase 3
  Ativos:      ['Id', 'Email', 'Nome', 'Ticker', 'Classe', 'Quantidade', 'PrecoMedio', 'PrecoAtual', 'AtualizadoEm', 'Fonte', 'Criado'],
  // Fase 4 (foto fica à parte para não pesar em toda requisição)
  Fotos:       ['Email', 'Foto', 'Atualizado'],
  Mensagens:   ['Id', 'Email', 'Assunto', 'Texto', 'Criado', 'Status'],
  // Câmbio
  CambioAlertas: ['Id', 'Email', 'Moeda', 'Direcao', 'Valor', 'Ativo', 'Criado']
};

// Colunas formatadas como texto: impedem que a planilha converta datas ou interprete fórmulas.
var COLUNAS_TEXTO = ['Data', 'Mes', 'Prazo', 'Criado', 'UltimoAcesso', 'Nome', 'Descricao', 'Chave', 'Papel', 'Texto', 'Tags', 'Icone', 'Arquivada', 'Titulo', 'Fim', 'Concluidos', 'Token', 'Mensagem', 'Enviado', 'Escopo', 'AlvoId', 'Marca', 'Ticker', 'Classe', 'AtualizadoEm', 'Fonte', 'Apelido', 'Nascimento', 'Prefs', 'Foto', 'Atualizado', 'Assunto', 'Status', 'CambioFav', 'MoedaOrig', 'Moeda', 'Direcao', 'Ativo'];

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

function doGet(e) {
  var tk = e && e.parameter && e.parameter.feed;
  if (tk) {   // assinatura de calendário (.ics): o token secreto é a chave de acesso
    memo_ = {};
    var f = ler_('Feeds').filter(function (x) { return String(x.Token) === String(tk); })[0];
    var ics = f ? feedIcs_(String(f.Email).toLowerCase()) : 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
    return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
  }
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
  listar_metas: 1, listar_tags: 1, perfil: 1, listar_mensagens: 1, cambio_cotacoes: 1, cambio_historico: 1, cambio_taxa: 1, cambio_favoritos: 1, cambio_alertas: 1, listar_cartoes: 1, listar_investimentos: 1, listar_agenda: 1, listar_limites: 1, listar_alertas: 1, exportar_lancamentos: 1, resumo: 1, consultor: 1, exportar_dados: 1
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

function idade_(nasc, hoje) {
  var a = Number(hoje.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (hoje.slice(5) < nasc.slice(5)) a--;
  return a;
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
function sConta_(c, saldo) { return { id: c.Id, nome: c.Nome, tipo: c.Tipo, saldoInicial: Number(c.SaldoInicial) || 0, saldo: saldo, limite: Number(c.Limite) || 0, diaFechamento: Number(c.DiaFechamento) || 0, diaVencimento: Number(c.DiaVencimento) || 0, marca: c.Marca || '' }; }
function sLanc_(l) {
  return { id: l.Id, data: String(l.Data), tipo: l.Tipo, valor: Number(l.Valor), contaId: l.ContaId, categoriaId: l.CategoriaId, descricao: l.Descricao, tags: tagsDe_(l.Tags), moeda: l.MoedaOrig || '', valorOrig: Number(l.ValorOrig) || 0, cotacao: Number(l.Cotacao) || 0 };
}
function sOrc_(o) { return { id: o.Id, categoriaId: o.CategoriaId, mes: String(o.Mes), limite: Number(o.Limite) }; }
function sMeta_(m) {
  return { id: m.Id, nome: m.Nome, valorAlvo: Number(m.ValorAlvo), valorAtual: Number(m.ValorAtual) || 0, prazo: String(m.Prazo || ''), tipo: m.Tipo === 'investimento' ? 'investimento' : 'geral', aporte: Number(m.Aporte) || 0 };
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
  var r = { Data: data, Tipo: tipo, Valor: valor, ContaId: contaId, CategoriaId: catId, Descricao: seguro_(d.descricao, 200), Tags: normalizaTags_(d.tags), MoedaOrig: '', ValorOrig: '', Cotacao: '' };
  if (d.moeda) {   // lançamento em moeda estrangeira: guarda valor original e a taxa usada; Valor já é o total em R$
    var vo = d.valorOrig === undefined || d.valorOrig === '' ? 0 : num_(d.valorOrig), ct = d.cotacao === undefined || d.cotacao === '' ? 0 : num_(d.cotacao);
    if (!(vo > 0) || !(ct > 0)) throw erro_('cambio_invalido', 'Informe o valor na moeda e a cotação usada.');
    if (Math.abs(Math.round(vo * ct * 100) / 100 - valor) > 0.02) throw erro_('cambio_invalido', 'O valor em R$ não confere com valor × cotação.');
    r.MoedaOrig = codigoMoeda_(d.moeda); r.ValorOrig = vo; r.Cotacao = ct;
  }
  return r;
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

  /* ---- perfil e preferências (Fase 4) ---- */
  perfil: function (u) {
    var r = doUsuario_('Usuarios', u.email)[0], f = doUsuario_('Fotos', u.email)[0];
    var nasc = String(r.Nascimento || ''), idade = nasc ? idade_(nasc, hoje_()) : null;
    var prefs = {}; try { prefs = JSON.parse(r.Prefs || '{}') || {}; } catch (e) { prefs = {}; }
    return { email: u.email, nome: r.Nome, apelido: r.Apelido || '', nascimento: nasc, idade: idade, foto: f ? f.Foto : '', plano: 'gratis', loginGoogle: true, prefs: prefs };
  },
  salvar_perfil: function (u, d) {
    var r = doUsuario_('Usuarios', u.email)[0], campos = {};
    if (d.nome !== undefined) { var n = seguro_(d.nome, 80); if (!n) throw erro_('nome_invalido', 'Informe seu nome.'); campos.Nome = n; }
    if (d.apelido !== undefined) campos.Apelido = seguro_(d.apelido, 30);
    if (d.nascimento !== undefined) {
      var nc = String(d.nascimento || '');
      if (nc) {
        if (!dataOk_(nc) || nc > hoje_() || idade_(nc, hoje_()) > 120) throw erro_('data_invalida', 'Data de nascimento inválida.');
      }
      campos.Nascimento = nc;
    }
    if (d.prefs !== undefined) {
      var js = JSON.stringify(d.prefs && typeof d.prefs === 'object' ? d.prefs : {});
      if (js.length > 4000) throw erro_('muito_grande', 'Preferências grandes demais.');
      campos.Prefs = js;
    }
    if (Object.keys(campos).length) atualizar_('Usuarios', r._linha, Object.assign({}, r, campos));
    if (d.foto !== undefined) {
      var foto = String(d.foto || ''), f = doUsuario_('Fotos', u.email)[0];
      if (foto && (!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(foto) || foto.length > 40000)) throw erro_('foto_invalida', 'Foto inválida ou grande demais.');
      if (f) atualizar_('Fotos', f._linha, Object.assign({}, f, { Foto: foto, Atualizado: agora_() })); else if (foto) acrescentar_('Fotos', [{ Email: u.email, Foto: foto, Atualizado: agora_() }]);
    }
    return { salvo: true };
  },

  /* ---- fale conosco ---- */
  enviar_mensagem: function (u, d) {
    var assunto = seguro_(d.assunto, 80), texto = seguro_(d.texto, 1500);
    if (!assunto || texto.length < 5) throw erro_('mensagem_invalida', 'Escreva o assunto e a mensagem.');
    var hojeIni = hoje_(), minhas = doUsuario_('Mensagens', u.email);
    if (minhas.filter(function (m) { return String(m.Criado).slice(0, 10) === hojeIni; }).length >= 5) throw erro_('limite_diario', 'Você já enviou 5 mensagens hoje. Tente amanhã.');
    var m = { Id: Utilities.getUuid(), Email: u.email, Assunto: assunto, Texto: texto, Criado: agora_(), Status: 'recebida' };
    acrescentar_('Mensagens', [m]);
    return { id: m.Id, status: m.Status };
  },
  listar_mensagens: function (u) {
    return doUsuario_('Mensagens', u.email).map(function (m) { return { id: m.Id, assunto: m.Assunto, texto: m.Texto, criado: m.Criado, status: m.Status }; }).reverse().slice(0, 30);
  },

  /* ---- câmbio (Fase câmbio) ---- */
  cambio_cotacoes: function (u, d) { return cambioCotacoes_(listaMoedas_((d.moedas || []).join ? d.moedas.join(',') : d.moedas)); },
  cambio_historico: function (u, d) {
    var dias = [7, 30, 180, 365].indexOf(Number(d.dias)) >= 0 ? Number(d.dias) : 30;
    return cambioHistorico_(codigoMoeda_(d.moeda), dias);
  },
  cambio_taxa: function (u, d) {
    var data = dataOk_(d.data) ? d.data : hoje_();
    return cambioTaxa_(codigoMoeda_(d.moeda), data, d.tipo === 'receita' ? 'receita' : 'despesa');
  },
  cambio_favoritos: function (u) {
    var r = doUsuario_('Usuarios', u.email)[0], l = listaMoedas_(r.CambioFav);
    return { moedas: r.CambioFav === '' || r.CambioFav === undefined ? CAMBIO_PADRAO : l, padrao: !r.CambioFav };
  },
  cambio_favoritar: function (u, d) {
    var l = listaMoedas_((d.moedas || []).join ? d.moedas.join(',') : d.moedas), r = doUsuario_('Usuarios', u.email)[0];
    atualizar_('Usuarios', r._linha, Object.assign({}, r, { CambioFav: l.length ? l.join(',') : 'NENHUMA' }));
    return { moedas: l };
  },
  cambio_alertas: function (u) {
    return doUsuario_('CambioAlertas', u.email).map(function (a) { return { id: a.Id, moeda: a.Moeda, direcao: a.Direcao, valor: Number(a.Valor), ativo: a.Ativo === 'sim' }; });
  },
  cambio_alerta_salvar: function (u, d) {
    var moeda = codigoMoeda_(d.moeda), valor = num_(d.valor), dir = d.direcao === 'abaixo' ? 'abaixo' : 'acima';
    if (!(valor > 0)) throw erro_('valor_invalido', 'Informe o valor da cotação.');
    if (!String(d.id || '') && doUsuario_('CambioAlertas', u.email).length >= 30) throw erro_('limite', 'Limite de alertas de cotação atingido.');
    var r = upsert_('CambioAlertas', u.email, String(d.id || ''), { Moeda: moeda, Direcao: dir, Valor: valor, Ativo: d.ativo === false ? '' : 'sim' });
    return { id: r.Id };
  },
  cambio_alerta_excluir: function (u, d) { return excluirPorId_('CambioAlertas', u.email, d.id); },
  cambio_verificar_alertas: function (u) { return { alertas: verificarAlertasCambio_(u.email) }; },

  /* ---- contas ---- */
  listar_contas: function (u) {
    var sal = saldos_(u.email);
    return doUsuario_('Contas', u.email).map(function (c) { return sConta_(c, sal[c.Id] || 0); });
  },
  salvar_conta: function (u, d) {
    var nome = seguro_(d.nome, 60);
    if (!nome) throw erro_('nome_invalido', 'Informe o nome da conta.');
    var tipo = TIPOS_CONTA.indexOf(d.tipo) >= 0 ? d.tipo : 'corrente';
    var id = String(d.id || ''), campos = { Nome: nome, Tipo: tipo };
    if (d.saldoInicial !== undefined) campos.SaldoInicial = num_(d.saldoInicial); else if (!id) campos.SaldoInicial = 0;
    if (d.limite !== undefined) { var lim = d.limite === '' ? 0 : num_(d.limite); if (!(lim >= 0)) throw erro_('valor_invalido', 'Limite inválido.'); campos.Limite = lim; }
    ['diaFechamento', 'diaVencimento'].forEach(function (k) {
      if (d[k] === undefined) return;
      var n = d[k] === '' ? 0 : Math.round(Number(d[k]));
      if (!(n >= 0 && n <= 31)) throw erro_('dia_invalido', 'Dia inválido (use de 1 a 31).');
      campos[k === 'diaFechamento' ? 'DiaFechamento' : 'DiaVencimento'] = n;
    });
    if (d.marca !== undefined) campos.Marca = seguro_(d.marca, 20);
    var r = upsert_('Contas', u.email, id, campos);
    return sConta_(r, saldos_(u.email)[r.Id] || 0);
  },
  excluir_conta: function (u, d) {
    var id = String(d.id || '');
    if (doUsuario_('Lancamentos', u.email).some(function (l) { return l.ContaId === id; })) {
      throw erro_('em_uso', 'A conta tem lançamentos. Apague-os antes.');
    }
    limpaRefs_(u.email, 'conta', id);
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
    limpaRefs_(u.email, 'categoria', id);
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
    var salvo = sLanc_(upsert_('Lancamentos', u.email, id, campos));
    salvo.alertas = campos.Tipo === 'despesa' ? verificarLimites_(u.email, [campos.Data.slice(0, 7)]) : [];
    return salvo;
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
    var alertas = verificarLimites_(u.email, mesesDe_(novos.filter(function (n) { return n.Tipo === 'despesa'; }).map(function (n) { return n.Data; })));
    return { importadas: novos.length, ignoradas: ignoradas, invalidas: invalidas, alertas: alertas };
  },

  /* ---- agenda ---- */
  listar_agenda: function (u, d) {
    var mes = mesOu_(d.mes), hoje = hoje_();
    var itens = ocorrenciasLista_(u.email, mes + '-01', mes + '-' + ('0' + diasNoMes_(mes)).slice(-2));
    var pend = ocorrenciasLista_(u.email, somarDias_(hoje, -60), somarDias_(hoje, 30)).filter(function (o) {
      return !o.concluido && o.data <= somarDias_(hoje, o.lembreteDias);   // atrasados + os que entram na janela do lembrete
    }).map(function (o) { o.situacao = o.data < hoje ? 'atrasado' : (o.data === hoje ? 'hoje' : 'proximo'); return o; });
    return { mes: mes, hoje: hoje, itens: itens, pendentes: pend, definicoes: doUsuario_('Agenda', u.email).map(sAgenda_) };
  },
  salvar_agenda: function (u, d) {
    var titulo = seguro_(d.titulo, 80);
    if (!titulo) throw erro_('nome_invalido', 'Informe o título.');
    var tipo = TIPOS_AGENDA.indexOf(d.tipo) >= 0 ? d.tipo : 'compromisso';
    if (!dataOk_(d.data)) throw erro_('data_invalida', 'Data inválida.');
    var rec = RECORRENCIAS.indexOf(d.recorrencia) >= 0 ? d.recorrencia : 'nenhuma';
    var fim = d.fim ? String(d.fim) : '';
    if (fim && (!dataOk_(fim) || fim < d.data)) throw erro_('data_invalida', 'A data final deve ser depois da inicial.');
    var valor = d.valor === '' || d.valor === undefined ? 0 : num_(d.valor);
    if (!(valor >= 0)) throw erro_('valor_invalido', 'Valor inválido.');
    var contaId = String(d.contaId || ''), catId = String(d.categoriaId || '');
    if (contaId && !doUsuario_('Contas', u.email).some(function (c) { return c.Id === contaId; })) throw erro_('conta_invalida', 'Conta inválida.');
    if (catId && !doUsuario_('Categorias', u.email).some(function (c) { return c.Id === catId; })) throw erro_('categoria_invalida', 'Categoria inválida.');
    var lem = Math.max(0, Math.min(30, Math.round(Number(d.lembreteDias === undefined || d.lembreteDias === '' ? 3 : d.lembreteDias)) || 0));
    var id = String(d.id || '');
    if (!id && doUsuario_('Agenda', u.email).length >= 1000) throw erro_('limite', 'Limite de itens da agenda atingido.');
    return sAgenda_(upsert_('Agenda', u.email, id, { Titulo: titulo, Tipo: tipo, Data: d.data, Valor: valor, ContaId: contaId, CategoriaId: catId, Recorrencia: rec, LembreteDias: lem, Fim: fim }));
  },
  excluir_agenda: function (u, d) { return excluirPorId_('Agenda', u.email, d.id); },
  // Marca uma ocorrência como feita. Conta/receita com valor gera o lançamento (uma vez só); desmarcar remove o lançamento gerado.
  concluir_agenda: function (u, d) {
    var a = doUsuario_('Agenda', u.email).filter(function (x) { return x.Id === String(d.id || ''); })[0];
    if (!a) throw erro_('nao_encontrado', 'Item não encontrado.');
    var dt = String(d.data || '');
    if (!dataOk_(dt) || ocorrencias_(a, dt, dt).length !== 1) throw erro_('data_invalida', 'Essa data não é uma ocorrência do item.');
    var feitos = feitos_(a), marcar = d.concluido !== false, chave = 'agenda:' + a.Id + ':' + dt, resp = { concluido: marcar, lancamento: null, alertas: [] };
    var existente = doUsuario_('Lancamentos', u.email).filter(function (l) { return l.Chave === chave; })[0];
    if (marcar) {
      if (feitos.indexOf(dt) < 0) feitos.push(dt);
      if (a.Tipo !== 'compromisso' && Number(a.Valor) > 0 && !existente) {
        var contaId = String(d.contaId || a.ContaId || '');
        if (!contaId) throw erro_('conta_necessaria', 'Escolha a conta usada neste pagamento.');
        var v = validarLanc_(u.email, { tipo: a.Tipo === 'receita' ? 'receita' : 'despesa', valor: Number(a.Valor), data: dataOk_(d.pagoEm) ? d.pagoEm : hoje_(), contaId: contaId, categoriaId: a.CategoriaId, descricao: a.Titulo });
        v.Chave = chave;
        resp.lancamento = sLanc_(upsert_('Lancamentos', u.email, '', v));
        if (v.Tipo === 'despesa') resp.alertas = verificarLimites_(u.email, [v.Data.slice(0, 7)]);
      }
    } else {
      feitos = feitos.filter(function (x) { return x !== dt; });
      if (existente) apagarLinha_('Lancamentos', existente._linha);
    }
    atualizar_('Agenda', a._linha, Object.assign({}, a, { Concluidos: feitos.sort().join(',') }));
    return resp;
  },
  agenda_feed: function (u, d) { return { token: tokenFeed_(u.email, d.renovar === true) }; },

  /* ---- limites de gastos ---- */
  listar_limites: function (u, d) { return limitesDoMes_(u.email, mesOu_(d.mes)); },
  salvar_limite: function (u, d) {
    var esc = ['geral', 'conta', 'categoria'].indexOf(d.escopo) >= 0 ? d.escopo : '', alvo = esc === 'geral' ? '' : String(d.alvoId || '');
    if (!esc) throw erro_('escopo_invalido', 'Escolha onde o limite vale.');
    var lim = num_(d.limite);
    if (!(lim > 0)) throw erro_('valor_invalido', 'Informe um limite maior que zero.');
    if (esc === 'conta' && !doUsuario_('Contas', u.email).some(function (c) { return c.Id === alvo; })) throw erro_('conta_invalida', 'Conta inválida.');
    if (esc === 'categoria' && !doUsuario_('Categorias', u.email).some(function (c) { return c.Id === alvo && c.Tipo === 'despesa'; })) throw erro_('categoria_invalida', 'Escolha uma categoria de despesa.');
    var igual = doUsuario_('Limites', u.email).filter(function (l) { return l.Escopo === esc && l.AlvoId === alvo; })[0];
    var id = String(d.id || (igual ? igual.Id : ''));
    var r = upsert_('Limites', u.email, id, { Escopo: esc, AlvoId: alvo, Limite: lim });
    var alertas = verificarLimites_(u.email, [hoje_().slice(0, 7)]);
    return { id: r.Id, alertas: alertas };
  },
  excluir_limite: function (u, d) { return excluirPorId_('Limites', u.email, d.id); },
  listar_alertas: function (u) {
    return doUsuario_('Alertas', u.email).map(sAlerta_).sort(function (a, b) { return a.criado < b.criado ? 1 : -1; }).slice(0, 60);
  },

  /* ---- exportação (o site monta o .xlsx com estas linhas) ---- */
  exportar_lancamentos: function (u, d) {
    var de = dataOk_(d.de) ? d.de : '0000-01-01', ate = dataOk_(d.ate) ? d.ate : '9999-12-31', tag = norm_(d.tag || '');
    var contas = {}, cats = {};
    doUsuario_('Contas', u.email).forEach(function (c) { contas[c.Id] = c.Nome; });
    doUsuario_('Categorias', u.email).forEach(function (c) { cats[c.Id] = c.Nome; });
    return doUsuario_('Lancamentos', u.email).filter(function (l) {
      var dt = String(l.Data);
      return dt >= de && dt <= ate && (!d.tipo || l.Tipo === d.tipo) && (!d.contaId || l.ContaId === d.contaId) && (!d.categoriaId || l.CategoriaId === d.categoriaId) &&
        (!tag || tagsDe_(l.Tags).some(function (t) { return norm_(t) === tag; }));
    }).sort(function (a, b) { return String(a.Data) < String(b.Data) ? -1 : 1; }).slice(0, 20000).map(function (l) {
      return { data: String(l.Data), tipo: l.Tipo, valor: Number(l.Valor), conta: contas[l.ContaId] || '', categoria: cats[l.CategoriaId] || 'Sem categoria', descricao: l.Descricao, tags: tagsDe_(l.Tags).join(', '), moeda: l.MoedaOrig || '', valorOrig: Number(l.ValorOrig) || 0, cotacao: Number(l.Cotacao) || 0 };
    });
  },

  /* ---- cartões ---- */
  listar_cartoes: function (u) { return cartoes_(u.email); },

  /* ---- investimentos ---- */
  listar_investimentos: function (u) { return resumoCarteira_(u.email); },
  salvar_investimento: function (u, d) {
    var nome = seguro_(d.nome, 60);
    if (!nome) throw erro_('nome_invalido', 'Informe o nome do ativo.');
    var classe = CLASSES_INV[d.classe] ? d.classe : 'outros', q = num_(d.quantidade), pm = num_(d.precoMedio);
    if (!(q > 0)) throw erro_('valor_invalido', 'A quantidade deve ser maior que zero.');
    if (!(pm >= 0)) throw erro_('valor_invalido', 'Preço médio inválido.');
    var pa = d.precoAtual === '' || d.precoAtual === undefined || d.precoAtual === null ? '' : num_(d.precoAtual);
    if (pa !== '' && !(pa >= 0)) throw erro_('valor_invalido', 'Preço atual inválido.');
    var id = String(d.id || '');
    if (!id && doUsuario_('Ativos', u.email).length >= 500) throw erro_('limite', 'Limite de ativos atingido.');
    return sAtivo_(upsert_('Ativos', u.email, id, { Nome: nome, Ticker: seguro_(d.ticker, 12).toUpperCase(), Classe: classe, Quantidade: q, PrecoMedio: pm, PrecoAtual: pa, AtualizadoEm: pa === '' ? '' : hoje_(), Fonte: 'manual' }));
  },
  excluir_investimento: function (u, d) { return excluirPorId_('Ativos', u.email, d.id); },
  atualizar_cotacoes: function (u) {
    var ativos = doUsuario_('Ativos', u.email).filter(function (a) { return a.Ticker; });
    var cot = buscarCotacoes_(ativos.map(function (a) { return a.Ticker; }));
    if (!cot) return { atualizados: 0, motivo: 'Cotação automática ainda não está ligada. Informe o preço atual manualmente.' };
    var n = 0;
    ativos.forEach(function (a) { if (cot[a.Ticker] > 0) { atualizar_('Ativos', a._linha, Object.assign({}, a, { PrecoAtual: cot[a.Ticker], AtualizadoEm: hoje_(), Fonte: 'api' })); n++; } });
    return { atualizados: n, motivo: '' };
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
    var campos = { Nome: nome, ValorAlvo: alvo, ValorAtual: atual, Prazo: prazo };
    if (d.tipo !== undefined) campos.Tipo = d.tipo === 'investimento' ? 'investimento' : 'geral';
    if (d.aporte !== undefined) { var ap = d.aporte === '' ? 0 : num_(d.aporte); if (!(ap >= 0)) throw erro_('valor_invalido', 'Aporte mensal inválido.'); campos.Aporte = ap; }
    return sMeta_(upsert_('Metas', u.email, String(d.id || ''), campos));
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

/* ======================= AGENDA (recorrência, concluir, feed .ics) ======================= */

var TIPOS_AGENDA = ['compromisso', 'conta', 'receita'];
var RECORRENCIAS = ['nenhuma', 'semanal', 'mensal', 'anual'];

function somarDias_(iso, n) {
  var p = iso.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

// Datas (AAAA-MM-DD) em que o item ocorre dentro de [de, ate].
function ocorrencias_(it, de, ate) {
  var ini = String(it.Data), fim = it.Fim ? String(it.Fim) : '', rec = it.Recorrencia || 'nenhuma', out = [];
  var limite = (fim && fim < ate) ? fim : ate;
  if (ini > limite) return out;
  if (rec === 'nenhuma') { if (ini >= de) out.push(ini); return out; }
  if (rec === 'semanal') {
    var d = ini;
    if (d < de) d = somarDias_(d, Math.ceil(diasEntre_(d, de) / 7) * 7);
    for (; d <= limite && out.length < 400; d = somarDias_(d, 7)) out.push(d);
    return out;
  }
  var dia = Number(ini.slice(8)), mesIni = ini.slice(0, 7), mes = de.slice(0, 7) > mesIni ? de.slice(0, 7) : mesIni;
  for (var g = 0; mes <= limite.slice(0, 7) && g < 600; g++, mes = somarMes_(mes, 1)) {
    if (rec === 'anual' && mes.slice(5) !== mesIni.slice(5)) continue;
    var dd = mes + '-' + ('0' + Math.min(dia, diasNoMes_(mes))).slice(-2);
    if (dd >= ini && dd >= de && dd <= limite) out.push(dd);
  }
  return out;
}

function sAgenda_(a) {
  return { id: a.Id, titulo: a.Titulo, tipo: a.Tipo, data: String(a.Data), valor: Number(a.Valor) || 0, contaId: a.ContaId, categoriaId: a.CategoriaId,
    recorrencia: a.Recorrencia || 'nenhuma', lembreteDias: a.LembreteDias === '' ? 3 : Number(a.LembreteDias), fim: a.Fim ? String(a.Fim) : '' };
}
function feitos_(a) { return String(a.Concluidos || '').split(',').filter(Boolean); }

function ocorrenciasLista_(email, de, ate) {
  var out = [];
  doUsuario_('Agenda', email).forEach(function (a) {
    var f = feitos_(a);
    ocorrencias_(a, de, ate).forEach(function (dt) {
      var o = sAgenda_(a); o.data = dt; o.concluido = f.indexOf(dt) >= 0; o.inicio = String(a.Data); out.push(o);
    });
  });
  return out.sort(function (x, y) { return x.data < y.data ? -1 : (x.data > y.data ? 1 : (x.titulo < y.titulo ? -1 : 1)); });
}

function icsTxt_(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsData_(iso) { return iso.replace(/-/g, ''); }

function feedIcs_(email) {
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumo//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Rumo - Agenda financeira', 'X-WR-TIMEZONE:' + CONFIG.FUSO];
  var carimbo = agora_().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  var ico = { compromisso: '📌', conta: '💸', receita: '💰' };
  doUsuario_('Agenda', email).forEach(function (a) {
    var s = sAgenda_(a), f = feitos_(a), rec = { semanal: 'WEEKLY', mensal: 'MONTHLY', anual: 'YEARLY' }[s.recorrencia];
    var titulo = (ico[s.tipo] || '') + ' ' + s.titulo + (s.valor ? ' (' + brl_(s.valor) + ')' : '') + (!rec && f.indexOf(s.data) >= 0 ? ' ✔' : '');
    L.push('BEGIN:VEVENT', 'UID:' + a.Id + '@rumo', 'DTSTAMP:' + carimbo, 'DTSTART;VALUE=DATE:' + icsData_(s.data), 'DTEND;VALUE=DATE:' + icsData_(somarDias_(s.data, 1)), 'SUMMARY:' + icsTxt_(titulo));
    if (rec) L.push('RRULE:FREQ=' + rec + (s.fim ? ';UNTIL=' + icsData_(s.fim) : ''));
    if (s.lembreteDias >= 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTxt_(s.titulo), 'TRIGGER:-P' + s.lembreteDias + 'D', 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

function tokenFeed_(email, renovar) {
  var f = doUsuario_('Feeds', email)[0];
  if (f && !renovar) return f.Token;
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  if (f) atualizar_('Feeds', f._linha, Object.assign({}, f, { Token: t })); else acrescentar_('Feeds', [{ Email: email, Token: t, Criado: agora_() }]);
  return t;
}

// Ao excluir conta/categoria: remove os limites dela e solta a referência na agenda.
function limpaRefs_(email, tipo, id) {
  doUsuario_('Limites', email).filter(function (l) { return l.Escopo === tipo && l.AlvoId === id; })
    .map(function (l) { return l._linha; }).sort(function (a, b) { return b - a; }).forEach(function (n) { apagarLinha_('Limites', n); });
  var campo = tipo === 'conta' ? 'ContaId' : 'CategoriaId';
  doUsuario_('Agenda', email).filter(function (a) { return a[campo] === id; }).forEach(function (a) { var o = Object.assign({}, a); o[campo] = ''; atualizar_('Agenda', a._linha, o); });
}

/* ======================= LIMITES DE GASTOS E ALERTAS ======================= */

var NIVEIS = { aviso: 'Atenção: 80% do limite', atingido: 'Limite atingido', excedido: 'Limite excedido' };

function nivel_(gasto, limite) {
  if (!(limite > 0)) return 'ok';
  var c = Math.round(gasto * 100), l = Math.round(limite * 100);
  if (c > l) return 'excedido';
  if (c === l) return 'atingido';
  if (c * 100 >= l * 80) return 'aviso';
  return 'ok';
}

function limitesDoMes_(email, mes) {
  var gastos = movimentos_(email).filter(function (m) { return m.tipo === 'despesa' && m.data.slice(0, 7) === mes; });
  var contas = doUsuario_('Contas', email), cats = doUsuario_('Categorias', email);
  return doUsuario_('Limites', email).map(function (l) {
    var g = gastos.filter(function (m) { return l.Escopo === 'geral' || (l.Escopo === 'conta' && m.contaId === l.AlvoId) || (l.Escopo === 'categoria' && m.categoriaId === l.AlvoId); })
      .reduce(function (s, m) { return s + m.valor; }, 0);
    g = Math.round(g * 100) / 100;
    var lim = Number(l.Limite), nome = 'Gasto geral', tipoConta = '';
    if (l.Escopo === 'conta') { var c = contas.filter(function (x) { return x.Id === l.AlvoId; })[0]; nome = c ? c.Nome : '(conta removida)'; tipoConta = c ? c.Tipo : ''; }
    if (l.Escopo === 'categoria') { var k = cats.filter(function (x) { return x.Id === l.AlvoId; })[0]; nome = k ? k.Nome : '(categoria removida)'; }
    return { id: l.Id, escopo: l.Escopo, alvoId: l.AlvoId, nome: nome, cartao: tipoConta === 'cartao', limite: lim, gasto: g, restante: Math.round((lim - g) * 100) / 100,
      pct: lim > 0 ? Math.round(g / lim * 100) : 0, nivel: nivel_(g, lim), mes: mes };
  });
}

// Registra (uma vez por mês/limite/nível) os alertas novos e tenta avisar. Chamar só em ações de escrita.
function verificarLimites_(email, meses) {
  var novos = [];
  (meses || []).forEach(function (mes) {
    var ja = doUsuario_('Alertas', email);
    limitesDoMes_(email, mes).forEach(function (l) {
      if (l.nivel === 'ok') return;
      if (ja.some(function (a) { return String(a.Mes) === mes && a.LimiteId === l.id && a.Nivel === l.nivel; })) return;
      var msg = NIVEIS[l.nivel] + ' — ' + l.nome + ': ' + brl_(l.gasto) + ' de ' + brl_(l.limite) + ' (' + l.pct + '%).';
      var al = { Id: Utilities.getUuid(), Email: email, Mes: mes, LimiteId: l.id, Nivel: l.nivel, Gasto: l.gasto, Limite: l.limite, Criado: agora_(), Mensagem: msg, Enviado: '' };
      al.Enviado = notificar_(email, al);
      acrescentar_('Alertas', [al]);
      novos.push(sAlerta_(al));
    });
  });
  return novos;
}

// Ponto de extensão para envio fora do app. Hoje: e-mail opcional (Propriedade do script NOTIFICAR_EMAIL = sim).
// Para WhatsApp/push, troque o corpo desta função por uma chamada ao serviço escolhido.
function notificar_(email, alerta) {
  try {
    if (typeof MailApp !== 'undefined' && PropertiesService.getScriptProperties().getProperty('NOTIFICAR_EMAIL') === 'sim') {
      MailApp.sendEmail(email, 'Rumo: ' + NIVEIS[alerta.Nivel], alerta.Mensagem);
      return 'email';
    }
  } catch (e) { console.error(e); }
  return '';
}

function sAlerta_(a) { return { id: a.Id, mes: String(a.Mes), limiteId: a.LimiteId, nivel: a.Nivel, gasto: Number(a.Gasto), limite: Number(a.Limite), criado: a.Criado, mensagem: a.Mensagem, enviado: a.Enviado || '' }; }
function mesesDe_(datas) { var m = {}; datas.forEach(function (d) { m[String(d).slice(0, 7)] = 1; }); return Object.keys(m).sort().slice(-12); }

/* ======================= CARTÕES ======================= */

function diaClamp_(mes, dia) { return mes + '-' + ('0' + Math.min(Number(dia), diasNoMes_(mes))).slice(-2); }

// Ciclo da fatura em aberto: de (fechamento anterior + 1 dia) até o próximo fechamento.
function cicloFatura_(hoje, diaFech) {
  var mes = hoje.slice(0, 7), fimMes = diaClamp_(mes, diaFech), fim, ini;
  if (hoje <= fimMes) { fim = fimMes; ini = somarDias_(diaClamp_(somarMes_(mes, -1), diaFech), 1); }
  else { fim = diaClamp_(somarMes_(mes, 1), diaFech); ini = somarDias_(fimMes, 1); }
  return { ini: ini, fim: fim };
}

function cartoes_(email) {
  var hoje = hoje_(), movs = movimentos_(email), sal = saldos_(email);
  return doUsuario_('Contas', email).filter(function (c) { return c.Tipo === 'cartao'; }).map(function (c) {
    var lim = Number(c.Limite) || 0, fech = Number(c.DiaFechamento) || 0, venc = Number(c.DiaVencimento) || 0;
    var saldo = sal[c.Id] || 0, divida = Math.max(0, Math.round(-saldo * 100) / 100);
    var o = { id: c.Id, nome: c.Nome, marca: c.Marca || '', limite: lim, diaFechamento: fech, diaVencimento: venc, saldo: saldo, divida: divida,
      disponivel: lim ? Math.round((lim - divida) * 100) / 100 : null, usoPct: lim ? Math.round(divida / lim * 100) : null,
      faturaAtual: null, fechamento: '', vencimento: '', diasParaVencer: null, faltando: [] };
    if (!lim) o.faltando.push('limite');
    if (!fech) o.faltando.push('dia de fechamento');
    if (!venc) o.faltando.push('dia de vencimento');
    if (fech) {
      var ci = cicloFatura_(hoje, fech), t = 0;
      movs.forEach(function (m) { if (m.contaId === c.Id && m.data >= ci.ini && m.data <= ci.fim) t += m.tipo === 'despesa' ? m.valor : -m.valor; });
      o.faturaAtual = Math.max(0, Math.round(t * 100) / 100); o.fechamento = ci.fim;
      if (venc) {
        var mFim = ci.fim.slice(0, 7), mv = venc > fech ? mFim : somarMes_(mFim, 1);
        o.vencimento = diaClamp_(mv, venc); o.diasParaVencer = diasEntre_(hoje, o.vencimento);
      }
    }
    return o;
  });
}

/* ======================= INVESTIMENTOS ======================= */

var CLASSES_INV = { acao: 'Ações', fii: 'Fundos imobiliários', renda_fixa: 'Renda fixa', cripto: 'Criptomoedas', outros: 'Outros' };
var AVISO_INV = 'Informação para acompanhamento, não é recomendação de investimento.';

function sAtivo_(a) {
  var q = Number(a.Quantidade) || 0, pm = Number(a.PrecoMedio) || 0, pa = a.PrecoAtual === '' ? pm : Number(a.PrecoAtual);
  var inv = Math.round(q * pm * 100) / 100, atual = Math.round(q * pa * 100) / 100;
  return { id: a.Id, nome: a.Nome, ticker: a.Ticker || '', classe: a.Classe, quantidade: q, precoMedio: pm, precoAtual: pa, investido: inv, valorAtual: atual,
    retorno: Math.round((atual - inv) * 100) / 100, retornoPct: inv > 0 ? Math.round((atual - inv) / inv * 10000) / 100 : 0, atualizadoEm: String(a.AtualizadoEm || ''), manual: !a.Fonte || a.Fonte === 'manual' };
}

// Ponto de extensão: troque pelo provedor de cotações escolhido (ex.: brapi, Alpha Vantage) guardando a chave em Propriedades do script.
// Deve devolver { 'TICKER': preco }. Hoje não há provedor ligado: o preço atual é informado à mão.
function buscarCotacoes_(tickers) { return null; }

function resumoCarteira_(email) {
  var ativos = doUsuario_('Ativos', email).map(sAtivo_), inv = 0, atual = 0, cls = {};
  ativos.forEach(function (a) { inv += a.investido; atual += a.valorAtual; cls[a.classe] = (cls[a.classe] || 0) + a.valorAtual; });
  inv = Math.round(inv * 100) / 100; atual = Math.round(atual * 100) / 100;
  return { ativos: ativos, investido: inv, valorAtual: atual, retorno: Math.round((atual - inv) * 100) / 100, retornoPct: inv > 0 ? Math.round((atual - inv) / inv * 10000) / 100 : 0,
    porClasse: Object.keys(cls).map(function (k) { return { classe: k, nome: CLASSES_INV[k], valor: Math.round(cls[k] * 100) / 100, pct: atual > 0 ? Math.round(cls[k] / atual * 1000) / 10 : 0 }; }).sort(function (a, b) { return b.valor - a.valor; }),
    cotacoesAutomaticas: false, aviso: AVISO_INV };
}

/* ======================= CÂMBIO (AwesomeAPI, via servidor) ======================= */

var CAMBIO_BASE = 'https://economia.awesomeapi.com.br/json/';
var CAMBIO_FONTE = 'AwesomeAPI (economia.awesomeapi.com.br)';
var CAMBIO_AVISO = 'Valores de referência, podem diferir da cotação praticada por bancos e corretoras.';
var CAMBIO_PADRAO = ['USD', 'EUR', 'GBP', 'ARS', 'BTC'];
var CAMBIO_TTL = 300;   // segundos: cotação em cache por 5 minutos

function codigoMoeda_(c) {
  c = String(c || '').toUpperCase();
  if (!/^[A-Z]{3,5}$/.test(c) || c === 'BRL') throw erro_('moeda_invalida', 'Moeda inválida.');
  return c;
}

function cambioGet_(caminho) {
  // A chave (opcional) fica nas Propriedades do script e vai em cabeçalho: nunca chega ao navegador.
  var k = PropertiesService.getScriptProperties().getProperty('AWESOMEAPI_KEY'), op = { muteHttpExceptions: true };
  if (k) op.headers = { 'x-api-key': k };
  try {
    var r = UrlFetchApp.fetch(CAMBIO_BASE + caminho, op);
    if (r.getResponseCode() !== 200) return null;
    return JSON.parse(r.getContentText());
  } catch (e) { console.error(e); return null; }
}

function cacheGet_(k) { try { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cachePut_(k, v, ttl) { try { CacheService.getScriptCache().put(k, JSON.stringify(v), ttl); } catch (e) { /* cache cheio: segue */ } }

function dataDeTs_(ts) { return Utilities.formatDate(new Date(Number(ts) * 1000), CONFIG.FUSO, 'yyyy-MM-dd'); }

function quote_(c, q) {
  return { codigo: c, nome: String(q.name || c).split('/')[0], compra: Number(q.bid), venda: Number(q.ask), max: Number(q.high), min: Number(q.low), variacao: Number(q.varBid), pct: Number(q.pctChange),
    atualizado: Utilities.formatDate(new Date(Number(q.timestamp) * 1000), CONFIG.FUSO, "yyyy-MM-dd'T'HH:mm:ss"), desatualizado: false };
}

// { cotacoes: {USD:{...}}, falhas: ['XXX'] }. Usa cache de 5 min; se a API cair, devolve a última cotação guardada marcada como desatualizada.
function cambioCotacoes_(codes) {
  var out = {}, falta = [], falhas = [];
  codes.forEach(function (c) { var h = cacheGet_('cambio:q:' + c); if (h) out[c] = h; else falta.push(c); });
  if (falta.length) {
    var j = cambioGet_('last/' + falta.map(function (c) { return c + '-BRL'; }).join(','));
    falta.forEach(function (c) {
      var q = j && j[c + 'BRL'];
      if (q && Number(q.bid) > 0) { var o = quote_(c, q); out[c] = o; cachePut_('cambio:q:' + c, o, CAMBIO_TTL); cachePut_('cambio:u:' + c, o, 21600); }
      else {
        var velho = cacheGet_('cambio:u:' + c);
        if (velho) { velho.desatualizado = true; out[c] = velho; } else falhas.push(c);
      }
    });
  }
  return { cotacoes: out, falhas: falhas, fonte: CAMBIO_FONTE, aviso: CAMBIO_AVISO };
}

function cambioHistorico_(c, dias) {
  var k = 'cambio:h:' + c + ':' + dias, h = cacheGet_(k);
  if (h) return h;
  var j = cambioGet_('daily/' + c + '-BRL/' + dias), serie = [];
  if (j && j.length) {
    var vistos = {};
    j.forEach(function (x) { var d = dataDeTs_(x.timestamp), v = Number(x.bid); if (!vistos[d] && v > 0) { vistos[d] = 1; serie.push({ data: d, valor: v }); } });
    serie.reverse();
    var res = { moeda: c, dias: dias, serie: serie, desatualizado: false };
    cachePut_(k, res, 1800); cachePut_('cambio:hu:' + c + ':' + dias, res, 21600);
    return res;
  }
  var velho = cacheGet_('cambio:hu:' + c + ':' + dias);
  if (velho) { velho.desatualizado = true; return velho; }
  throw erro_('cambio_indisponivel', 'Não consegui obter o histórico agora.');
}

// Taxa para converter um lançamento em moeda estrangeira: despesa usa venda; receita usa compra.
function cambioTaxa_(c, data, tipo) {
  if (data >= hoje_()) {
    var r = cambioCotacoes_([c]).cotacoes[c];
    if (!r) throw erro_('cambio_indisponivel', 'Cotação indisponível agora. Informe a taxa manualmente.');
    return { moeda: c, data: hoje_(), taxa: tipo === 'despesa' && r.venda > 0 ? r.venda : r.compra, base: tipo === 'despesa' ? 'venda' : 'compra', desatualizada: r.desatualizado, fonte: CAMBIO_FONTE };
  }
  var ini = icsData_(somarDias_(data, -5)), fim = icsData_(data);
  var j = cambioGet_('daily/' + c + '-BRL/10?start_date=' + ini + '&end_date=' + fim);
  var alvo = (j || []).filter(function (x) { return dataDeTs_(x.timestamp) <= data && Number(x.bid) > 0; })[0];
  if (!alvo) throw erro_('cambio_indisponivel', 'Sem cotação para essa data. Informe a taxa manualmente.');
  return { moeda: c, data: dataDeTs_(alvo.timestamp), taxa: Number(alvo.bid), base: 'fechamento do dia', desatualizada: false, fonte: CAMBIO_FONTE };
}

function listaMoedas_(txt) {
  var l = String(txt || '').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(function (x) { return /^[A-Z]{3,5}$/.test(x) && x !== 'BRL'; });
  return l.filter(function (x, i) { return l.indexOf(x) === i; }).slice(0, 12);
}

// Alertas de cotação: usam a mesma tabela de histórico (Alertas) dos limites de gastos, com nível "cambio".
function verificarAlertasCambio_(email) {
  var ativos = doUsuario_('CambioAlertas', email).filter(function (a) { return a.Ativo === 'sim'; });
  if (!ativos.length) return [];
  var cot = cambioCotacoes_(ativos.map(function (a) { return a.Moeda; }).filter(function (x, i, v) { return v.indexOf(x) === i; })).cotacoes, novos = [];
  ativos.forEach(function (a) {
    var q = cot[a.Moeda]; if (!q || q.desatualizado) return;
    var alvo = Number(a.Valor), dispara = a.Direcao === 'acima' ? q.compra >= alvo : q.compra <= alvo;
    if (!dispara) return;
    var msg = 'Cotação: ' + a.Moeda + ' ' + (a.Direcao === 'acima' ? 'subiu até' : 'caiu até') + ' ' + brl_(alvo) + ' (agora ' + brl_(q.compra) + ').';
    var al = { Id: Utilities.getUuid(), Email: email, Mes: hoje_().slice(0, 7), LimiteId: a.Id, Nivel: 'cambio', Gasto: q.compra, Limite: alvo, Criado: agora_(), Mensagem: msg, Enviado: '' };
    al.Enviado = notificar_(email, al);
    acrescentar_('Alertas', [al]);
    atualizar_('CambioAlertas', a._linha, Object.assign({}, a, { Ativo: '' }));   // dispara uma vez; o usuário pode reativar
    novos.push(sAlerta_(al));
  });
  return novos;
}

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
