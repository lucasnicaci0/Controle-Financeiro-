/**
 * FINANÇAS DB — back-end em Google Apps Script + Google Planilhas
 * Versão 1.8.0
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

var VERSAO = '1.8.0';

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
  CambioAlertas: ['Id', 'Email', 'Moeda', 'Direcao', 'Valor', 'Ativo', 'Criado'],
  // Fase 5: conexão bancária (só identificador da conexão e consentimento; nunca senha)
  Conexoes:    ['Id', 'Email', 'ItemId', 'Banco', 'Status', 'Consentimento', 'UltimaSync', 'Criado'],
  ContasBanco: ['Id', 'Email', 'ConexaoId', 'ExtId', 'ContaId'],
  // Agente Rumi: memória por usuário, conversa, auditoria, estado de diálogo e vínculo do WhatsApp
  AgenteMemoria:   ['Id', 'Email', 'Tipo', 'Chave', 'Conteudo', 'Atualizado'],
  AgenteHistorico: ['Id', 'Email', 'Data', 'Papel', 'Texto', 'Canal', 'MsgId'],
  AgenteAuditoria: ['Id', 'Email', 'Data', 'Canal', 'Op', 'Alvo', 'Antes', 'Depois', 'Resumo', 'Desfeito', 'Grupo', 'MsgId'],
  AgentePendentes: ['Email', 'Canal', 'Estado', 'Atualizado'],
  ZapVinculos:     ['Email', 'Telefone', 'Codigo', 'Expira', 'Verificado', 'Criado'],
  Permissoes:      ['Id', 'Email', 'Chave', 'Estado', 'Versao', 'Data'],
  Onboarding:      ['Id', 'Email', 'Passo', 'Estado', 'Atualizado']
};

// Colunas formatadas como texto: impedem que a planilha converta datas ou interprete fórmulas.
var COLUNAS_TEXTO = ['Data', 'Mes', 'Prazo', 'Criado', 'UltimoAcesso', 'Nome', 'Descricao', 'Chave', 'Papel', 'Texto', 'Tags', 'Icone', 'Arquivada', 'Titulo', 'Fim', 'Concluidos', 'Token', 'Mensagem', 'Enviado', 'Escopo', 'AlvoId', 'Marca', 'Ticker', 'Classe', 'AtualizadoEm', 'Fonte', 'Apelido', 'Nascimento', 'Prefs', 'Foto', 'Atualizado', 'Assunto', 'Status', 'CambioFav', 'MoedaOrig', 'Moeda', 'Direcao', 'Ativo', 'ItemId', 'Banco', 'Consentimento', 'UltimaSync', 'ConexaoId', 'ExtId', 'ContaId', 'Tipo', 'Chave', 'Conteudo', 'Op', 'Alvo', 'Antes', 'Depois', 'Resumo', 'Desfeito', 'Grupo', 'MsgId', 'Canal', 'Estado', 'Telefone', 'Codigo', 'Expira', 'Verificado'];

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
  var desafio = e && e.parameter && e.parameter['hub.mode'] ? agZapVerifica_(e.parameter) : null;   // verificação do webhook do WhatsApp
  if (desafio !== null) return ContentService.createTextOutput(desafio).setMimeType(ContentService.MimeType.TEXT);
  return saida_({ ok: true, nome: 'Financas DB', versao: VERSAO });
}

function doPost(e) {
  memo_ = {};
  var resp;
  try {
    var corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (corpo && corpo.object === 'whatsapp_business_account') resp = agZapWebhook_(corpo, e.parameter && e.parameter.s);   // eventos do WhatsApp: sempre 200
    else resp = rotear_(corpo);
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
    var pv = agParseValorTexto(s);   // mesmo interpretador do agente e dos formulários: "3.000,00", "3k", "1,5 milhão"
    if (!pv.ok) throw erro_('valor_invalido', 'Valor inválido.');
    n = pv.valor;
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
        TABELAS[nome].forEach(function (c) { if (c !== 'Email' && c !== 'ItemId') o[c] = r[c]; });
        return o;
      });
    });
    return saida;
  },
  apagar_conta_usuario: function (u, d) {
    if (d.confirmar !== 'APAGAR') throw erro_('confirmacao', 'Envie confirmar: "APAGAR".');
    doUsuario_('Conexoes', u.email).forEach(function (c) { ofRevogar_(c.ItemId); });   // LGPD: encerra as conexões bancárias no provedor
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

/* ======================= CONEXÃO BANCÁRIA (Open Finance via Pluggy) — Fase 5 =======================
 * Camada isolada: só estas funções conhecem a Pluggy. Para trocar de provedor (ex.: Belvo), reescreva
 * pluggy_, ofContas_ e ofTransacoes_ mantendo o formato de saída; o resto (consentimento, importação,
 * categorização, duplicados, revogação) não muda.
 * Segurança: o app NUNCA vê nem guarda senha de banco (o login acontece no widget da Pluggy). Guardamos só
 * o ItemId (identificador da conexão) e a data do consentimento. Credenciais da Pluggy ficam em
 * Propriedades do script: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.
 */
var PLUGGY_BASE = 'https://api.pluggy.ai';
var OF_CONSENTIMENTO = {
  versao: '2026-11',
  texto: [
    'Você autoriza o Rumo a ler, por meio da Pluggy (instituição autorizada pelo Banco Central), os dados da conta que escolher: contas, saldos e transações dos últimos 90 dias.',
    'Finalidade: importar seus lançamentos e saldos para você acompanhar suas finanças. Os dados não são vendidos nem compartilhados com terceiros.',
    'O Rumo não vê nem guarda a senha do seu banco. O login é feito na tela segura da Pluggy/instituição. Guardamos apenas o identificador da conexão e a data do seu consentimento.',
    'Você pode revogar quando quiser, em Conexões ▸ Desconectar. A conexão é encerrada na Pluggy e você escolhe se apaga ou mantém o que já foi importado. Também pode apagar tudo em Excluir conta (LGPD).'
  ]
};
var OF_REGRAS_DESPESA = [
  ['Mercado', /mercad|supermerc|atacad|assai|carrefour|pao de acucar|hortifruti|sacolao/],
  ['Restaurantes', /ifood|restaurante|lanchonete|padaria|burger|mcdonald|pizza|starbucks|rappi|ze delivery|cafeteria/],
  ['Transporte', /uber|\b99\b|cabify|combustivel|posto |shell|ipiranga|estaciona|pedagio|sem parar|bilhete unico|metro /],
  ['Assinaturas', /netflix|spotify|disney|hbo|prime video|youtube premium|apple\.com|google one|deezer|globoplay|assinatura/],
  ['Saúde', /farmaci|drogaria|droga raia|drogasil|pague menos|hospital|clinica|laborat|unimed|dentista/],
  ['Contas de consumo', /enel|cemig|sabesp|copel|energia|\bagua\b|claro|\bvivo\b|\btim\b|internet|comgas/],
  ['Educação', /escola|faculdade|curso|udemy|alura|mensalidade/],
  ['Viagens', /airbnb|booking|latam|gol linhas|azul linhas|hotel|decolar/],
  ['Impostos e Taxas', /iptu|ipva|darf|imposto|tarifa|anuidade|\biof\b/],
  ['Lazer e Hobbies', /cinema|ingresso|steam|playstation|xbox|teatro/],
  ['Compras', /amazon|mercado livre|shopee|magalu|americanas|aliexpress|shein/],
  ['Roupas', /renner|riachuelo|c&a|zara|nike|adidas/],
  ['Moradia/Aluguel', /aluguel|condominio/]
];
var OF_REGRAS_RECEITA = [['Salário', /salario|folha de pagamento|proventos/], ['Investimentos', /rendimento|dividendo|juros|resgate/]];
var OF_FATURA = /pagamento (da |de )?fatura|pagto fatura|pgto fatura|fatura (do )?cartao|pagamento recebido/;

function semAc_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function ofClienteId_(email) { return 'rumo-' + hash_(email).slice(0, 24); }
function ofConfigurado_() { var p = PropertiesService.getScriptProperties(); return !!(p.getProperty('PLUGGY_CLIENT_ID') && p.getProperty('PLUGGY_CLIENT_SECRET')); }

function pluggyChave_(renovar) {
  var cache = CacheService.getScriptCache();
  if (!renovar) { var g = cache.get('pluggy_key'); if (g) return g; }
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('PLUGGY_CLIENT_ID'), seg = p.getProperty('PLUGGY_CLIENT_SECRET');
  if (!id || !seg) throw erro_('of_nao_configurado', 'Conexão bancária ainda não configurada pelo administrador.');
  var r = UrlFetchApp.fetch(PLUGGY_BASE + '/auth', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ clientId: id, clientSecret: seg }), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw erro_('of_indisponivel', 'Não foi possível falar com o provedor bancário agora.');
  var k = JSON.parse(r.getContentText()).apiKey;
  cache.put('pluggy_key', k, 6000);   // a chave dura 2 h
  return k;
}
// Chamada autenticada. Devolve { codigo, corpo }. Nunca registra segredos nem corpo de resposta com dados bancários.
function pluggy_(metodo, caminho, corpo, tentou) {
  var op = { method: metodo, muteHttpExceptions: true, headers: { 'X-API-KEY': pluggyChave_(!!tentou) } };
  if (corpo) { op.contentType = 'application/json'; op.payload = JSON.stringify(corpo); }
  var r = UrlFetchApp.fetch(PLUGGY_BASE + caminho, op), cod = r.getResponseCode();
  if (cod === 401 && !tentou) return pluggy_(metodo, caminho, corpo, true);
  var txt = r.getContentText(), j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  return { codigo: cod, corpo: j };
}
function sConexao_(c, contas) { return { id: c.Id, banco: c.Banco, status: c.Status, consentimento: c.Consentimento, ultimaSync: c.UltimaSync, contas: contas }; }

function ofCategoria_(email, tipo, desc, catPluggy) {
  var texto = semAc_(desc + ' ' + (catPluggy || '')), regras = tipo === 'receita' ? OF_REGRAS_RECEITA : OF_REGRAS_DESPESA, nome = '';
  for (var i = 0; i < regras.length && !nome; i++) if (regras[i][1].test(texto)) nome = regras[i][0];
  if (!nome) return '';
  var c = doUsuario_('Categorias', email).filter(function (x) { return x.Tipo === tipo && String(x.Arquivada) !== 'sim' && norm_(x.Nome) === norm_(nome); })[0];
  return c ? c.Id : '';
}

function ofSincronizar_(email, con) {
  var contasR = pluggy_('get', '/accounts?itemId=' + encodeURIComponent(con.ItemId));
  if (contasR.codigo !== 200 || !contasR.corpo) throw erro_('of_indisponivel', 'Não foi possível ler as contas do banco agora. Tente de novo mais tarde.');
  var de = con.UltimaSync ? somarDias_(String(con.UltimaSync).slice(0, 10), -5) : somarDias_(hoje_(), -90), ate = hoje_();
  var res = { contas: 0, novasContas: 0, importadas: 0, duplicadas: 0, ignoradas: 0, semCategoria: 0, alertas: [], saldos: [] };
  var mapa = doUsuario_('ContasBanco', email).filter(function (m) { return m.ConexaoId === con.Id; });
  var existentes = {}, manuais = [], total = 0, contasUsuario = doUsuario_('Contas', email);   // manuais = tudo o que já existe: serve contra duplicar lançamento à mão e reconexão
  doUsuario_('Lancamentos', email).forEach(function (l) {
    total++;
    if (l.Chave) existentes[l.Chave] = 1;
    manuais.push({ conta: l.ContaId, tipo: l.Tipo, valor: Number(l.Valor), data: String(l.Data), usado: false });
  });
  var novos = [];
  (contasR.corpo.results || []).forEach(function (a) {
    var m = mapa.filter(function (x) { return x.ExtId === a.id; })[0], conta, nova = false;
    var cartao = a.type === 'CREDIT';
    if (!m) {
      var campos = { Nome: seguro_((con.Banco ? con.Banco + ' ' : '') + (a.name || (cartao ? 'Cartão' : 'Conta')), 60), Tipo: cartao ? 'cartao' : (a.subtype === 'SAVINGS_ACCOUNT' ? 'poupanca' : 'corrente'), SaldoInicial: 0 };
      if (cartao && a.creditData) {
        campos.Limite = Number(a.creditData.creditLimit) || 0;
        var fe = a.creditData.balanceCloseDate, vc = a.creditData.balanceDueDate;
        if (fe) campos.DiaFechamento = Number(String(fe).slice(8, 10)) || 0;
        if (vc) campos.DiaVencimento = Number(String(vc).slice(8, 10)) || 0;
      }
      var igual = contasUsuario.filter(function (c) { return c.Nome === campos.Nome && c.Tipo === campos.Tipo; })[0];   // reconexão: reaproveita a conta
      if (igual) conta = igual; else { conta = upsert_('Contas', email, '', campos); nova = true; res.novasContas++; }
      acrescentar_('ContasBanco', [{ Id: Utilities.getUuid(), Email: email, ConexaoId: con.Id, ExtId: String(a.id), ContaId: conta.Id }]);
    } else conta = { Id: m.ContaId };
    res.contas++;
    var net = 0;
    var tr = pluggy_('get', '/transactions?accountId=' + encodeURIComponent(a.id) + '&from=' + de + '&to=' + ate + '&pageSize=500');
    var lista = (tr.codigo === 200 && tr.corpo && tr.corpo.results) || [];
    lista.forEach(function (t) {
      var chave = 'of:' + String(t.id);
      if (existentes[chave]) return;
      var valor = Math.abs(Number(t.amount)), data = String(t.date || '').slice(0, 10);
      if (!(valor > 0) || !dataOk_(data)) { res.ignoradas++; return; }
      var tipo = t.type === 'CREDIT' ? 'receita' : 'despesa', desc = seguro_(t.description || t.descriptionRaw || 'Transação bancária', 200);
      if (OF_FATURA.test(semAc_(desc))) { res.ignoradas++; return; }   // pagamento de fatura: evita contar duas vezes (compras do cartão já entram)
      var dup = manuais.filter(function (x) { return !x.usado && x.tipo === tipo && Math.abs(x.valor - valor) < 0.005 && Math.abs(diasEntre_(x.data, data)) <= 1; })[0];
      if (dup) { dup.usado = true; res.duplicadas++; return; }   // já lançado à mão em qualquer conta: não duplica
      var cat = ofCategoria_(email, tipo, desc, t.category);
      if (!cat) res.semCategoria++;
      existentes[chave] = 1;
      net += tipo === 'receita' ? valor : -valor;
      novos.push({ Id: Utilities.getUuid(), Email: email, Data: data, Tipo: tipo, Valor: valor, ContaId: conta.Id, CategoriaId: cat, Descricao: desc, Chave: chave, Criado: agora_(), Tags: '' });
    });
    if (nova) {   // o saldo do app passa a bater com o do banco no momento da conexão
      var saldoBanco = Number(a.balance) || 0;
      upsert_('Contas', email, conta.Id, { SaldoInicial: Math.round(((cartao ? -saldoBanco : saldoBanco) - net) * 100) / 100 });
    }
    res.saldos.push({ conta: a.name || '', saldoBanco: Number(a.balance) || 0 });
  });
  if (total + novos.length > CONFIG.MAX_LANCAMENTOS_POR_USUARIO) throw erro_('limite', 'Limite de lançamentos atingido.');
  acrescentar_('Lancamentos', novos);
  res.importadas = novos.length;
  res.alertas = verificarLimites_(email, mesesDe_(novos.filter(function (n) { return n.Tipo === 'despesa'; }).map(function (n) { return n.Data; })));
  upsert_('Conexoes', email, con.Id, { UltimaSync: agora_(), Status: 'ativa' });
  return res;
}

ACOES.of_status = function (u) {
  var cons = doUsuario_('Conexoes', u.email), mapa = doUsuario_('ContasBanco', u.email);
  return { configurado: ofConfigurado_(), provedor: 'Pluggy', consentimento: OF_CONSENTIMENTO,
    conexoes: cons.map(function (c) { return sConexao_(c, mapa.filter(function (m) { return m.ConexaoId === c.Id; }).length); }), aviso: AVISO };
};
// 1) o usuário aceita o consentimento; devolvemos um token de curta duração para o widget (Pluggy Connect) abrir.
ACOES.of_token = function (u, d) {
  if (d.consentimento !== true) throw erro_('sem_consentimento', 'É preciso aceitar o consentimento para conectar.');
  if (doUsuario_('Conexoes', u.email).length >= 5) throw erro_('limite', 'Limite de 5 conexões atingido.');
  var r = pluggy_('post', '/connect_token', { options: { clientUserId: ofClienteId_(u.email) } });
  if (r.codigo !== 200 || !r.corpo || !r.corpo.accessToken) throw erro_('of_indisponivel', 'Não foi possível iniciar a conexão agora.');
  return { connectToken: r.corpo.accessToken };
};
// 2) o widget devolveu o itemId: confere que pertence a este usuário, grava o consentimento e importa.
ACOES.of_conectar = function (u, d) {
  if (d.consentimento !== true) throw erro_('sem_consentimento', 'É preciso aceitar o consentimento para conectar.');
  var itemId = String(d.itemId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(itemId)) throw erro_('item_invalido', 'Conexão inválida.');
  if (ler_('Conexoes').some(function (c) { return c.ItemId === itemId; })) throw erro_('item_invalido', 'Essa conexão já está em uso.');
  var r = pluggy_('get', '/items/' + encodeURIComponent(itemId));
  if (r.codigo !== 200 || !r.corpo) throw erro_('item_invalido', 'Conexão não encontrada no provedor.');
  if (String(r.corpo.clientUserId || '') !== ofClienteId_(u.email)) throw erro_('item_invalido', 'Essa conexão não pertence a você.');
  if (['LOGIN_ERROR', 'OUTDATED', 'ERROR'].indexOf(String(r.corpo.status)) >= 0) throw erro_('of_login', 'O banco recusou o login. Tente conectar de novo.');
  var con = upsert_('Conexoes', u.email, '', { ItemId: itemId, Banco: seguro_(r.corpo.connector && r.corpo.connector.name || 'Banco', 40), Status: 'ativa', Consentimento: agora_() + ' v' + OF_CONSENTIMENTO.versao, UltimaSync: '' });
  var s = ofSincronizar_(u.email, con);
  return { conexao: sConexao_(con, s.contas), resultado: s };
};
ACOES.of_sincronizar = function (u, d) {
  var con = doUsuario_('Conexoes', u.email).filter(function (c) { return c.Id === String(d.id || ''); })[0];
  if (!con) throw erro_('nao_encontrado', 'Conexão não encontrada.');
  return ofSincronizar_(u.email, con);
};
// Revoga: encerra no provedor, apaga o vínculo; opcionalmente remove o que veio do banco.
ACOES.of_desconectar = function (u, d) {
  var con = doUsuario_('Conexoes', u.email).filter(function (c) { return c.Id === String(d.id || ''); })[0];
  if (!con) throw erro_('nao_encontrado', 'Conexão não encontrada.');
  var revogada = ofRevogar_(con.ItemId), mapa = doUsuario_('ContasBanco', u.email).filter(function (m) { return m.ConexaoId === con.Id; });
  var contas = {}; mapa.forEach(function (m) { contas[m.ContaId] = 1; });
  var removidos = 0;
  if (d.removerDados === true) {
    var resto = ler_('Lancamentos').filter(function (l) {
      var apagar = String(l.Email).toLowerCase() === u.email && String(l.Chave).indexOf('of:') === 0 && contas[l.ContaId];
      if (apagar) removidos++;
      return !apagar;
    });
    reescrever_('Lancamentos', resto);
  }
  apagarLinha_('Conexoes', con._linha);
  ler_('ContasBanco').filter(function (m) { return m.ConexaoId === con.Id; }).map(function (m) { return m._linha; }).sort(function (a, b) { return b - a; }).forEach(function (n) { apagarLinha_('ContasBanco', n); });
  return { desconectada: true, revogadaNoProvedor: revogada, lancamentosRemovidos: removidos };
};
function ofRevogar_(itemId) {
  try { var r = pluggy_('delete', '/items/' + encodeURIComponent(itemId)); return r.codigo === 200 || r.codigo === 204 || r.codigo === 404; } catch (e) { console.error('revogar'); return false; }
}
LEITURAS.of_status = 1;

// <<NLU
/* ===== NÚCLEO DO AGENTE (fonte única) =====
 * Funções puras: nenhuma chama rede, planilha ou DOM. Quem chama (app ou webhook do WhatsApp) entrega os dados
 * em `dados`, recebe de volta o texto da resposta e a lista de ações; as ações são executadas por
 * agente_executar (validação, permissão, idempotência e auditoria). Este trecho é copiado para o Code.gs e para
 * js/servicos/agente-core.js por apps-script/montar.js — edite SOMENTE aqui.
 */
var AG_NOME = 'Rumi';

function agNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$%,.\/\s+-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function agBrl(n) { var neg = n < 0, p = Math.abs(Number(n) || 0).toFixed(2).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (neg ? '-' : '') + 'R$ ' + p[0] + ',' + p[1]; }
function agArr2(n) { return n < 10 ? '0' + n : String(n); }
function agDataBR(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : ''; }
function agSomaDias(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function agDiasNoMes(ym) { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
function agMesAnt(ym, n) { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - (n === undefined ? 1 : n); while (m < 1) { m += 12; a--; } return a + '-' + agArr2(m); }
function agDiaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
function agCap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function agDist1(a, b) {   // distância de edição ≤ 1 (erro de digitação)
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/* ---------- números por extenso e valores ---------- */
var AG_UNID = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };
var AG_MULT = { mil: 1000, k: 1000, milhao: 1000000, milhoes: 1000000 };
var AG_VALOR_MAX = 1000000000;
function agPorExtenso(tokens) {   // tokens normalizados -> [{valor, de, ate}] (sequências de palavras numéricas)
  var out = [], i = 0;
  while (i < tokens.length) {
    var t = tokens[i];
    if (AG_UNID[t] !== undefined || ((t === 'mil' || t === 'milhao' || t === 'milhoes') && false)) {
      var j = i, total = 0, cur = 0, ult = i;
      while (j < tokens.length) {
        var w = tokens[j];
        if (AG_UNID[w] !== undefined) { cur += AG_UNID[w]; ult = j; }
        else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; ult = j; }
        else if (w === 'milhao' || w === 'milhoes') { total += (cur || 1) * 1000000; cur = 0; ult = j; }
        else if (w === 'e' && j + 1 < tokens.length && (AG_UNID[tokens[j + 1]] !== undefined || tokens[j + 1] === 'mil')) { /* conector */ }
        else break;
        j++;
      }
      out.push({ valor: total + cur, de: i, ate: ult }); i = ult + 1;
    } else i++;
  }
  return out;
}
var AG_MOEDA_PAL = /^(reais|real|conto|contos|pila|pilas|paus|pau|r\$)$/;
// Um token numérico (sem R$ nem sinal) no padrão brasileiro -> { v, amb, motivo, suf } ou null. Nunca devolve valor "padrão".
function agNumTok(s) {
  var m, r;
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)(k|mil|milhao|milhoes)$/))) { r = agNumTok(m[1]); return r && r.v > 0 ? { v: r.v * AG_MULT[m[2]], suf: true } : null; }   // 3k · 2,5k · 3mil
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) return { v: parseFloat(s.replace(/\./g, '').replace(',', '.')) };   // 2.500,50
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return { v: parseInt(s.replace(/\./g, ''), 10) };                           // 3.000
  if (/^\d+,\d{1,2}$/.test(s)) return { v: parseFloat(s.replace(',', '.')) };                                      // 12,5
  if (/^\d+,\d{3}$/.test(s)) return { v: parseInt(s.replace(',', ''), 10), amb: true, motivo: 'a vírgula em "' + s + '" pode ser separador de milhar ou decimal' };
  if (/^\d+\.\d{1,2}$/.test(s)) return { v: parseFloat(s), amb: true, motivo: 'o ponto em "' + s + '" pode ser decimal' };
  if (/^\d+$/.test(s)) return { v: parseInt(s, 10) };                                                              // 3000
  return null;
}
// devolve { valor, de, ate, marc, sinal, ambiguo, motivo } (índices de token) ou null. Prefere números marcados como dinheiro.
function agValor(tokens, ignorar) {
  var cand = [], n = tokens.length, i, ign = {};
  (ignorar || []).forEach(function (k) { ign[k] = 1; });
  for (i = 0; i < n; i++) {
    if (ign[i]) continue;
    var t = tokens[i], marc = false, sinal = '', de = i;
    if (t === 'r$') { if (tokens[i + 1] && /^[+-]?\d/.test(tokens[i + 1]) && !ign[i + 1]) { marc = true; de = i; i++; t = tokens[i]; } else continue; }
    var m = t.match(/^([+-]?)(r\$)?(.+)$/); if (!m) continue;
    sinal = m[1]; if (m[2]) marc = true;
    var nt = agNumTok(m[3]); if (!nt) continue;
    var v = nt.v, ate = i, amb = !!nt.amb, motivo = nt.motivo || '';
    if (!nt.suf) {
      var mult = AG_MULT[tokens[i + 1]];
      if (mult && !ign[i + 1] && tokens[i + 1] !== 'k') { v *= mult; ate = i + 1; amb = false; motivo = ''; }
      else if (tokens[i + 1] === 'k') { v *= 1000; ate = i + 1; amb = false; motivo = ''; }
      if (ate > i && AG_MULT[tokens[ate]] === 1000 && tokens[ate + 1] === 'e') {   // "3 mil e 500" · "2 mil e quinhentos"
        var rest = tokens.slice(ate + 2), mr = null, ex = agPorExtenso(rest)[0];
        if (rest[0] && /^\d{1,3}$/.test(rest[0])) mr = { v: parseInt(rest[0], 10), len: 1 };
        else if (ex && ex.de === 0 && ex.valor < 1000) mr = { v: ex.valor, len: ex.ate + 1 };
        if (mr) { v += mr.v; ate = ate + 1 + mr.len; }
      }
    } else if (tokens[i + 1] === 'e' && false) { /* sem uso */ }
    if (tokens[ate + 1] && AG_MOEDA_PAL.test(tokens[ate + 1])) { marc = true; ate++; }
    if (!isFinite(v) || v <= 0 || v >= AG_VALOR_MAX) continue;
    cand.push({ valor: Math.round(v * 100) / 100, de: de, ate: ate, marc: marc, sinal: sinal, ambiguo: amb, motivo: motivo });
    i = ate;
  }
  agPorExtenso(tokens).forEach(function (e) {
    var k, bloq = false; for (k = e.de; k <= e.ate; k++) if (ign[k]) bloq = true;
    if (bloq || !(e.valor > 0) || e.valor >= AG_VALOR_MAX) return;
    if (cand.some(function (c) { return c.de <= e.ate && e.de <= c.ate; })) return;   // já lido como número
    var ate = e.ate, marc = false;
    if (tokens[ate + 1] && AG_MOEDA_PAL.test(tokens[ate + 1])) { marc = true; ate++; }
    cand.push({ valor: e.valor, de: e.de, ate: ate, marc: marc, sinal: '', ambiguo: false, motivo: '' });
  });
  if (!cand.length) return null;
  cand.sort(function (a, b) { return (b.marc ? 1 : 0) - (a.marc ? 1 : 0) || a.de - b.de; });
  var esc = cand[0], outros = cand.filter(function (c) { return c !== esc && !c.marc; });
  if (!esc.marc && outros.length) { esc.ambiguo = true; esc.motivo = esc.motivo || 'há mais de um número na frase'; }
  return esc;
}
// Texto inteiro de um campo de valor ("R$ 3.000,00", "3k", "1,5 milhão") -> { ok, valor, ambiguo, motivo }. Para formulários e servidor.
function agParseValorTexto(txt) {
  var t = agNorm(String(txt == null ? '' : txt)).replace(/^r\$\s*/, 'r$').replace(/\s+/g, ' ').trim(), sinal = '';
  if (!t) return { ok: false, valor: NaN, ambiguo: false, motivo: 'vazio' };
  if (/^[+-]?(r\$)?\s*0+([.,]0+)?$/.test(t)) return { ok: true, valor: 0, ambiguo: false, motivo: '' };
  if (/^-/.test(t)) { sinal = '-'; t = t.slice(1).trim(); }
  var tk = t.split(' '), v = agValor(tk, []);
  if (!v || v.de !== 0 || v.ate !== tk.length - 1) {
    var ex = agPorExtenso(tk)[0]; if (ex && ex.de === 0 && ex.ate === tk.length - 1 && ex.valor > 0) return { ok: true, valor: sinal === '-' ? -ex.valor : ex.valor, ambiguo: false, motivo: '' };
    return { ok: false, valor: NaN, ambiguo: false, motivo: 'formato não reconhecido' };
  }
  return { ok: true, valor: sinal === '-' ? -v.valor : v.valor, ambiguo: v.ambiguo, motivo: v.motivo };
}

/* ---------- datas e períodos ---------- */
var AG_DIAS_SEM = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
var AG_MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
// { data, explicita, usados:[índices] }
function agData(tokens, hoje) {
  var usados = [], data = hoje, expl = false;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i], m;
    if (t === 'hoje') { usados.push(i); expl = true; data = hoje; }
    else if (t === 'ontem') { usados.push(i); expl = true; data = agSomaDias(hoje, -1); }
    else if (t === 'anteontem') { usados.push(i); expl = true; data = agSomaDias(hoje, -2); }
    else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      var a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(hoje.slice(0, 4)), mm = Number(m[2]), dd = Number(m[1]);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) { var iso = a + '-' + agArr2(mm) + '-' + agArr2(dd); if (!m[3] && iso > hoje) iso = (a - 1) + iso.slice(4); data = iso; usados.push(i); expl = true; }
    } else if (t === 'dia' && tokens[i + 1] && /^\d{1,2}$/.test(tokens[i + 1])) {
      var d2 = Number(tokens[i + 1]), ym = hoje.slice(0, 7);
      if (d2 >= 1 && d2 <= 31) { if (agArr2(d2) > hoje.slice(8, 10)) ym = agMesAnt(ym); if (d2 > agDiasNoMes(ym)) d2 = agDiasNoMes(ym); data = ym + '-' + agArr2(d2); usados.push(i, i + 1); expl = true; }
    } else if (AG_DIAS_SEM[t] !== undefined || AG_DIAS_SEM[t.replace(/-feira$/, '')] !== undefined) {
      var alvo = AG_DIAS_SEM[t] !== undefined ? AG_DIAS_SEM[t] : AG_DIAS_SEM[t.replace(/-feira$/, '')], dif = (agDiaSemana(hoje) - alvo + 7) % 7;
      data = agSomaDias(hoje, -(dif === 0 ? 7 : dif)); usados.push(i); expl = true;
      if (tokens[i + 1] === 'passada' || tokens[i + 1] === 'passado') usados.push(i + 1);
    }
  }
  return { data: data, explicita: expl, usados: usados };
}
// { de, ate, rotulo, explicito }
function agPeriodo(texto, hoje) {
  var t = agNorm(texto), ym = hoje.slice(0, 7), m;
  if (/\bhoje\b/.test(t)) return { de: hoje, ate: hoje, rotulo: 'hoje', explicito: true };
  if (/\bontem\b/.test(t)) { var o = agSomaDias(hoje, -1); return { de: o, ate: o, rotulo: 'ontem', explicito: true }; }
  if ((m = t.match(/ultimos? (\d{1,3}) dias/))) return { de: agSomaDias(hoje, -(Number(m[1]) - 1)), ate: hoje, rotulo: 'nos últimos ' + m[1] + ' dias', explicito: true };
  if (/\b(essa|esta) semana\b|\bna semana\b/.test(t)) { var dow = agDiaSemana(hoje), ini = agSomaDias(hoje, -((dow + 6) % 7)); return { de: ini, ate: hoje, rotulo: 'nesta semana', explicito: true }; }
  if (/mes passado|mes anterior|ultimo mes/.test(t)) { var p = agMesAnt(ym); return { de: p + '-01', ate: p + '-' + agDiasNoMes(p), rotulo: 'no mês passado', explicito: true, mes: p }; }
  if (/\b(este|esse|neste|nesse) ano\b|\bno ano\b/.test(t)) return { de: hoje.slice(0, 4) + '-01-01', ate: hoje, rotulo: 'neste ano', explicito: true };
  for (var nome in AG_MESES) if (new RegExp('\\b(em |de |no mes de )?' + nome + '\\b').test(t)) {
    var a = Number(hoje.slice(0, 4)), mm = AG_MESES[nome]; if (mm > Number(hoje.slice(5, 7))) a--;
    var k = a + '-' + agArr2(mm); return { de: k + '-01', ate: k + '-' + agDiasNoMes(k), rotulo: 'em ' + nome, explicito: true, mes: k };
  }
  return { de: ym + '-01', ate: hoje, rotulo: 'neste mês', explicito: false, mes: ym };
}

/* ---------- vocabulário ---------- */
var AG_V_DESP = ['gastei', 'gasto', 'gastando', 'paguei', 'pago', 'pagando', 'comprei', 'compra', 'abasteci', 'torrei', 'desembolsei', 'saiu', 'perdi', 'debitou', 'debitaram', 'investi', 'doei', 'pedi', 'tomei', 'almocei', 'jantei', 'lanchei'];
var AG_V_REC = ['recebi', 'ganhei', 'entrou', 'caiu', 'depositaram', 'vendi', 'pingou', 'rendeu', 'receber', 'creditou'];
var AG_STOP = { de: 1, do: 1, da: 1, dos: 1, das: 1, no: 1, na: 1, nos: 1, nas: 1, em: 1, com: 1, para: 1, pra: 1, pro: 1, o: 1, a: 1, os: 1, as: 1, um: 1, uma: 1, meu: 1, minha: 1, meus: 1, minhas: 1, por: 1, e: 1, que: 1, foi: 1, era: 1, mais: 1, la: 1, ai: 1, ali: 1, hoje: 1, ontem: 1, anteontem: 1, reais: 1, real: 1, conto: 1, contos: 1, pila: 1, pilas: 1, paus: 1, 'r$': 1, ate: 1, agora: 1, acabei: 1, ja: 1, so: 1, aqui: 1, ao: 1, aos: 1, num: 1, numa: 1 };
// palavra-chave -> categoria (nome), por tipo
var AG_KW = [
  ['Restaurantes', 'despesa', 'almoco jantar restaurante lanche lanchonete pizza pizzaria hamburguer burger ifood rappi sushi cafe cafeteria padaria bar boteco churrasco marmita sorvete acai delivery petisco'],
  ['Mercado', 'despesa', 'mercado supermercado feira hortifruti sacolao atacado atacadao acougue compras-do-mes'],
  ['Transporte', 'despesa', 'combustivel gasolina etanol diesel abastecendo abastecer abasteci posto uber 99 taxi onibus metro trem passagem estacionamento pedagio bilhete carro moto'],
  ['Manutenção de veículo', 'despesa', 'mecanico oficina pneu revisao lavagem borracharia'],
  ['Contas de consumo', 'despesa', 'energia luz agua internet telefone celular gas conta-de-luz esgoto wifi'],
  ['Moradia/Aluguel', 'despesa', 'aluguel condominio iptu moradia'],
  ['Saúde', 'despesa', 'farmacia remedio medico dentista consulta exame hospital plano-de-saude psicologo terapia academia'],
  ['Assinaturas', 'despesa', 'netflix spotify assinatura disney hbo prime youtube deezer globoplay'],
  ['Lazer e Hobbies', 'despesa', 'cinema show teatro jogo game steam playstation lazer festa balada ingresso'],
  ['Roupas', 'despesa', 'roupa roupas camisa tenis sapato calca vestido'],
  ['Educação', 'despesa', 'curso faculdade escola mensalidade livro udemy aula'],
  ['Viagens', 'despesa', 'viagem hotel passagem-aerea hospedagem airbnb'],
  ['Pets', 'despesa', 'pet racao veterinario cachorro gato banho-e-tosa'],
  ['Presentes e Doações', 'despesa', 'presente doacao dizimo vaquinha'],
  ['Cuidados pessoais', 'despesa', 'cabelo barbeiro salao manicure perfume cosmetico'],
  ['Compras', 'despesa', 'amazon shopee mercadolivre magalu shein compra eletronico'],
  ['Investimento', 'despesa', 'investimento aporte cdb tesouro acoes'],
  ['Salário', 'receita', 'salario pagamento holerite folha ordenado'],
  ['Investimentos', 'receita', 'rendimento dividendo dividendos juros resgate'],
  ['Outras receitas', 'receita', 'freela freelance venda bonus premio reembolso extra pix mesada']
];
var AG_GRUPOS = { alimentacao: ['Alimentação', 'Mercado', 'Restaurantes'], comida: ['Alimentação', 'Mercado', 'Restaurantes'], comer: ['Alimentação', 'Mercado', 'Restaurantes'], lazer: ['Lazer e Hobbies'], carro: ['Transporte', 'Manutenção de veículo'], casa: ['Casa', 'Moradia/Aluguel', 'Contas de consumo'], transporte: ['Transporte', 'Manutenção de veículo'] };

function agCatPorNome(dados, nome, tipo) {
  var n = agNorm(nome), r = null;
  (dados.categorias || []).forEach(function (c) { if (!r && !c.arquivada && (!tipo || c.tipo === tipo) && agNorm(c.nome) === n) r = c; });
  return r;
}
function agMem(dados, tipo, chave) { var r = null; (dados.memoria || []).forEach(function (m) { if (m.tipo === tipo && agNorm(m.chave) === chave) r = m; }); return r; }
// escolhe categoria para uma descrição: memória aprendida > nome citado > palavra-chave
function agCategoria(tokensDesc, tokensTexto, tipo, dados) {
  var chaveDesc = tokensDesc.join(' '), i, n;
  var m = agMem(dados, 'desc', chaveDesc);
  if (m) { var c0 = agCatPorNome(dados, m.conteudo, tipo); if (c0) return { cat: c0, origem: 'memoria' }; }
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokensTexto.length; i++) {
    var fr = tokensTexto.slice(i, i + n).join(' '), mm = agMem(dados, 'desc', fr);
    if (mm) { var c1 = agCatPorNome(dados, mm.conteudo, tipo); if (c1) return { cat: c1, origem: 'memoria' }; }
  }
  var cats = dados.categorias || [], k;
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokensTexto.length; i++) {   // categoria citada pelo nome
    var f2 = tokensTexto.slice(i, i + n).join(' ');
    for (k = 0; k < cats.length; k++) if (!cats[k].arquivada && cats[k].tipo === tipo && agNorm(cats[k].nome) === f2) return { cat: cats[k], origem: 'nome' };
  }
  for (k = 0; k < AG_KW.length; k++) {
    if (AG_KW[k][1] !== tipo) continue;
    var pal = AG_KW[k][2].split(' ');
    for (i = 0; i < tokensTexto.length; i++) if (pal.indexOf(tokensTexto[i]) >= 0 || (tokensTexto[i].length > 4 && pal.some(function (p) { return p.length > 4 && agDist1(p, tokensTexto[i]); }))) {
      var c2 = agCatPorNome(dados, AG_KW[k][0], tipo); if (c2) return { cat: c2, origem: 'palavra' };
    }
  }
  return null;
}
function agContaDe(tokens, dados) {   // { conta, explicita }
  var contas = dados.contas || [], t = ' ' + tokens.join(' ') + ' ', i;
  if (!contas.length) return null;
  for (i = 0; i < contas.length; i++) { var nm = agNorm(contas[i].nome); if (nm.length >= 3 && t.indexOf(' ' + nm + ' ') >= 0) return { conta: contas[i], explicita: true }; }
  var porTipo = [['cartao', 'cartao'], ['investimento', 'investimento'], ['investimentos', 'investimento'], ['poupanca', 'poupanca'], ['carteira', 'dinheiro'], ['dinheiro', 'dinheiro'], ['corrente', 'corrente'], ['reserva', 'reserva']];
  for (i = 0; i < porTipo.length; i++) if (t.indexOf(' ' + porTipo[i][0] + ' ') >= 0) { var c = contas.filter(function (x) { return x.tipo === porTipo[i][1]; })[0]; if (c) return { conta: c, explicita: true }; }
  var pad = agMem(dados, 'conta_padrao', 'padrao');
  if (pad) { var cp = contas.filter(function (x) { return agNorm(x.nome) === agNorm(pad.conteudo); })[0]; if (cp) return { conta: cp, explicita: false }; }
  var uso = {}, lim = agSomaDias(dados.hoje, -90); (dados.lancamentos || []).forEach(function (l) { if (l.data >= lim) uso[l.contaId] = (uso[l.contaId] || 0) + 1; });
  var cand = contas.filter(function (x) { return x.tipo !== 'cartao'; }); if (!cand.length) cand = contas;
  cand.sort(function (a, b) { return (uso[b.id] || 0) - (uso[a.id] || 0); });
  return { conta: cand[0], explicita: false };
}
function agTokens(texto) { return agNorm(texto).split(' ').filter(Boolean); }
function agOriginais(texto) { return String(texto).replace(/\s+/g, ' ').trim().split(' '); }
function agEhVerbo(tok, lista) { for (var i = 0; i < lista.length; i++) if (tok === lista[i] || (tok.length >= 5 && agDist1(tok, lista[i]))) return lista[i]; return null; }

/* ---------- interpretação de um lançamento a partir do texto ---------- */
function agParseLancamento(texto, dados) {
  var orig = agOriginais(texto), tk = orig.map(agNorm).map(function (x) { return x.replace(/[,.]+$/, ''); });
  var d = agData(tk, dados.hoje), v = agValor(tk, d.usados);
  var tipo = null, verbo = null, i;
  for (i = 0; i < tk.length; i++) {
    if (agEhVerbo(tk[i], AG_V_REC)) { tipo = 'receita'; verbo = i; break; }
    if (agEhVerbo(tk[i], AG_V_DESP)) { tipo = 'despesa'; verbo = i; break; }
  }
  if (/^\+/.test(tk[0] || '')) tipo = tipo || 'receita';
  if (v && v.sinal === '-') tipo = tipo || 'despesa'; else if (v && v.sinal === '+') tipo = tipo || 'receita';
  var usados = {}; d.usados.forEach(function (k) { usados[k] = 1; });
  if (v) for (i = v.de; i <= v.ate; i++) usados[i] = 1;
  if (verbo !== null) usados[verbo] = 1;
  var resto = [], restoN = [];
  tk.forEach(function (t, k) { if (usados[k]) return; var n = t.replace(/^[+-]/, ''); if (AG_STOP[n] || !n || /^(r\$)$/.test(n)) return; if (agEhVerbo(n, AG_V_DESP.concat(AG_V_REC))) return; resto.push(orig[k].replace(/[,.;!?]+$/, '')); restoN.push(n); });
  var desc = resto.join(' ');
  // tipo implícito: "almoço 45" -> despesa; "salário 2800" -> receita
  if (!tipo && v) { var cr = agCategoria(restoN, tk, 'receita', dados), cd = agCategoria(restoN, tk, 'despesa', dados); if (cr && !cd) tipo = 'receita'; else if (cd) tipo = 'despesa'; }
  var cat = tipo ? agCategoria(restoN, tk, tipo, dados) : null;
  var conta = agContaDe(tk, dados);
  // tira o nome da conta da descrição
  if (conta && conta.explicita) { var nc = agNorm(conta.conta.nome).split(' '); restoN = restoN.filter(function (x) { return nc.indexOf(x) < 0; }); resto = resto.filter(function (x) { return nc.indexOf(agNorm(x)) < 0; }); desc = resto.join(' '); }
  return { tipo: tipo, valor: v ? v.valor : null, valorAmbiguo: !!(v && v.ambiguo), motivoValor: v ? v.motivo : '', data: d.data, dataExplicita: d.explicita, descricao: agCap(desc), tokensDesc: restoN, categoria: cat, conta: conta, temVerbo: verbo !== null, ntk: tk.length };
}

/* ---------- consulta de lançamentos ---------- */
function agNomesGrupo(chave) { return AG_GRUPOS[chave] || null; }
function agLancEm(dados, de, ate) { return (dados.lancamentos || []).filter(function (l) { return l.data >= de && l.data <= ate; }); }
function agCatId(dados, id) { var r = null; (dados.categorias || []).forEach(function (c) { if (c.id === id) r = c; }); return r; }
function agSoma(ls, tipo) { var s = 0; ls.forEach(function (l) { if (l.tipo === tipo) s += l.valor; }); return Math.round(s * 100) / 100; }
function agAcharCategoriaNaFrase(tokens, dados) {   // { ids:[], nome }
  var i, n, cats = dados.categorias || [];
  for (i = 0; i < tokens.length; i++) { var g = agNomesGrupo(tokens[i]); if (g) { var ids = []; g.forEach(function (nm) { var c = agCatPorNome(dados, nm); if (c) ids.push(c.id); }); if (ids.length) return { ids: ids, nome: agCap(tokens[i] === 'alimentacao' ? 'alimentação' : tokens[i]) }; } }
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokens.length; i++) { var f = tokens.slice(i, i + n).join(' '); for (var k = 0; k < cats.length; k++) if (agNorm(cats[k].nome) === f) return { ids: [cats[k].id], nome: cats[k].nome }; }
  var m = null;
  for (i = 0; i < tokens.length && !m; i++) { var mm = agMem(dados, 'desc', tokens[i]); if (mm) { var c = agCatPorNome(dados, mm.conteudo); if (c) m = { ids: [c.id], nome: c.nome }; } }
  if (m) return m;
  for (var j = 0; j < AG_KW.length; j++) { var pal = AG_KW[j][2].split(' '); for (i = 0; i < tokens.length; i++) if (pal.indexOf(tokens[i]) >= 0) { var cc = agCatPorNome(dados, AG_KW[j][0]); if (cc) return { ids: [cc.id], nome: cc.nome }; } }
  return null;
}

/* ---------- MODO CONTADOR ---------- */
function agRecorrentes(dados) {
  var ym = dados.hoje.slice(0, 7), meses = [1, 2, 3, 4].map(function (n) { return agMesAnt(ym, n); }), grupos = {};
  (dados.lancamentos || []).forEach(function (l) {
    if (l.tipo !== 'despesa' || meses.indexOf(l.data.slice(0, 7)) < 0) return;
    var chave = agNorm(l.descricao).replace(/[0-9]+/g, '').split(' ').filter(function (w) { return w.length > 2 && !AG_STOP[w]; }).slice(0, 2).join(' ');
    if (!chave) return;
    var g = grupos[chave] = grupos[chave] || { chave: chave, nome: l.descricao, meses: {}, valores: [] };
    g.meses[l.data.slice(0, 7)] = 1; g.valores.push(l.valor);
  });
  var out = [];
  Object.keys(grupos).forEach(function (k) {
    var g = grupos[k], nm = Object.keys(g.meses).length, mn = Math.min.apply(null, g.valores), mx = Math.max.apply(null, g.valores);
    if (nm >= 3 && mx <= mn * 1.5) { var media = g.valores.reduce(function (a, b) { return a + b; }, 0) / g.valores.length; out.push({ nome: g.nome, media: Math.round(media * 100) / 100, meses: nm, lancadoNoMes: !!(dados.lancamentos || []).some(function (l) { return l.data.slice(0, 7) === ym && agNorm(l.descricao).replace(/[0-9]+/g, '').indexOf(k) === 0; }) }); }
  });
  out.sort(function (a, b) { return b.media - a.media; });
  return out;
}
function agAnalise(dados) {
  var hoje = dados.hoje, ym = hoje.slice(0, 7), dia = Number(hoje.slice(8, 10)), dim = agDiasNoMes(ym), r = { ym: ym, dia: dia, dim: dim };
  var meses = []; for (var i = 0; i < 6; i++) meses.push(agMesAnt(ym, i));
  r.serie = meses.map(function (m) { var ls = (dados.lancamentos || []).filter(function (l) { return l.data.slice(0, 7) === m; }); return { mes: m, rec: agSoma(ls, 'receita'), des: agSoma(ls, 'despesa'), n: ls.length }; }).reverse();
  var cur = r.serie[r.serie.length - 1], ant = r.serie[r.serie.length - 2];
  r.rec = cur.rec; r.des = cur.des; r.saldoMes = Math.round((cur.rec - cur.des) * 100) / 100; r.antRec = ant.rec; r.antDes = ant.des;
  r.totalLanc = (dados.lancamentos || []).length;
  var completos = r.serie.slice(0, -1).filter(function (s) { return s.n > 0; }).slice(-3);
  r.mesesBase = completos.length;
  r.mediaDes = completos.length ? Math.round(completos.reduce(function (a, s) { return a + s.des; }, 0) / completos.length * 100) / 100 : null;
  r.mediaRec = completos.length ? Math.round(completos.reduce(function (a, s) { return a + s.rec; }, 0) / completos.length * 100) / 100 : null;
  var contas = dados.contas || [];
  r.saldoLiquido = Math.round(contas.filter(function (c) { return c.tipo !== 'cartao'; }).reduce(function (a, c) { return a + c.saldo; }, 0) * 100) / 100;
  r.faturas = Math.round(contas.filter(function (c) { return c.tipo === 'cartao'; }).reduce(function (a, c) { return a + Math.min(0, c.saldo); }, 0) * 100) / 100;
  r.recorrentes = agRecorrentes(dados);
  r.fixosPendentes = Math.round(r.recorrentes.filter(function (x) { return !x.lancadoNoMes; }).reduce(function (a, x) { return a + x.media; }, 0) * 100) / 100;
  r.agendaPendente = Math.round(((dados.agendaPendentes || []).reduce(function (a, p) { return a + (p.tipo === 'receita' ? 0 : (p.valor || 0)); }, 0)) * 100) / 100;
  r.compromissos = Math.max(r.fixosPendentes, r.agendaPendente);   // não soma os dois: a agenda costuma repetir os fixos
  r.disponivel = Math.round((r.saldoLiquido + r.faturas - r.compromissos) * 100) / 100;
  r.diasRestantes = dim - dia;
  r.porDia = r.diasRestantes > 0 ? Math.round(Math.max(0, r.disponivel) / r.diasRestantes * 100) / 100 : r.disponivel;
  r.projDes = dia >= 5 ? Math.round((cur.des + cur.des / dia * (dim - dia)) * 100) / 100 : (r.mediaDes !== null ? r.mediaDes : null);
  r.projBasis = dia >= 5 ? 'ritmo de gastos deste mês' : 'média dos meses anteriores';
  // categorias
  var porCat = function (mes) { var m = {}; (dados.lancamentos || []).forEach(function (l) { if (l.tipo === 'despesa' && l.data.slice(0, 7) === mes) { var c = agCatId(dados, l.categoriaId), nm = c ? c.nome : 'Sem categoria'; m[nm] = (m[nm] || 0) + l.valor; } }); return m; };
  var mc = porCat(ym), ma = porCat(agMesAnt(ym));
  r.cats = Object.keys(mc).map(function (n) { return { nome: n, valor: Math.round(mc[n] * 100) / 100, ant: Math.round((ma[n] || 0) * 100) / 100 }; }).sort(function (a, b) { return b.valor - a.valor; });
  r.cats.forEach(function (c) { c.pct = r.des ? Math.round(c.valor / r.des * 100) : 0; c.var = c.ant >= 50 ? Math.round((c.valor - c.ant) / c.ant * 100) : null; });
  r.altas = r.cats.filter(function (c) { return c.var !== null && c.var >= 20 && c.valor - c.ant >= 50; });
  // possíveis desperdícios (sempre apresentados como "possível")
  r.desperdicios = [];
  var lsMes = agLancEm(dados, ym + '-01', hoje).filter(function (l) { return l.tipo === 'despesa'; });
  var ass = r.cats.filter(function (c) { return c.nome === 'Assinaturas'; })[0]; if (ass && ass.valor >= 50) r.desperdicios.push('Assinaturas somam ' + agBrl(ass.valor) + ' no mês. Vale revisar o que você realmente usa.');
  var rest = lsMes.filter(function (l) { var c = agCatId(dados, l.categoriaId); return c && c.nome === 'Restaurantes'; });
  if (rest.length >= 8) r.desperdicios.push(rest.length + ' gastos em restaurantes/delivery (' + agBrl(rest.reduce(function (a, l) { return a + l.valor; }, 0)) + ') neste mês.');
  var peq = lsMes.filter(function (l) { return l.valor < 30; }); var somaPeq = peq.reduce(function (a, l) { return a + l.valor; }, 0);
  if (peq.length >= 10 && somaPeq >= 150) r.desperdicios.push(peq.length + ' compras pequenas (abaixo de R$ 30) somam ' + agBrl(somaPeq) + '.');
  // riscos
  r.riscos = [];
  if (r.rec > 0 && r.des > r.rec) r.riscos.push('Neste mês você já gastou mais do que recebeu (' + agBrl(r.des) + ' contra ' + agBrl(r.rec) + ').');
  var ult3 = r.serie.slice(-4, -1).filter(function (s) { return s.rec > 0 || s.des > 0; }), neg = ult3.filter(function (s) { return s.des > s.rec; }).length;
  if (ult3.length >= 2 && neg >= 2) r.riscos.push('Em ' + neg + ' dos últimos ' + ult3.length + ' meses os gastos superaram as receitas.');
  if (r.saldoLiquido < 0) r.riscos.push('O saldo das suas contas está negativo (' + agBrl(r.saldoLiquido) + ').');
  if (r.faturas < 0 && r.saldoLiquido + r.faturas < 0) r.riscos.push('O saldo não cobre as faturas de cartão em aberto (' + agBrl(-r.faturas) + ').');
  if (r.projDes !== null && r.rec > 0 && r.projDes > Math.max(r.rec, r.mediaRec || 0) && dia >= 5) r.riscos.push('No ritmo atual, os gastos do mês chegariam a cerca de ' + agBrl(r.projDes) + ', acima das receitas já registradas.');
  (dados.limites || []).forEach(function (l) { if (l.pct >= 100) r.riscos.push('Limite estourado: ' + l.nome + ' (' + l.pct + '%).'); });
  var base = r.mediaRec || r.rec; if (base > 0 && r.recorrentes.length) { var fx = r.recorrentes.reduce(function (a, x) { return a + x.media; }, 0); if (fx / base > 0.5) r.riscos.push('Contas fixas consomem cerca de ' + Math.round(fx / base * 100) + '% da sua renda média.'); }
  // economia
  r.taxaPoup = r.rec > 0 ? Math.round((r.rec - r.des) / r.rec * 100) : null;
  var sv = r.serie.filter(function (s) { return s.n > 0; }).map(function (s) { return s.rec - s.des; });
  if (sv.length >= 4) { var h = Math.floor(sv.length / 2), a1 = sv.slice(0, h).reduce(function (a, b) { return a + b; }, 0) / h, a2 = sv.slice(h).reduce(function (a, b) { return a + b; }, 0) / (sv.length - h); r.tendencia = a2 > a1 + 50 ? 'melhorando' : (a2 < a1 - 50 ? 'piorando' : 'estável'); } else r.tendencia = null;
  r.metas = (dados.metas || []).map(function (m) { return { nome: m.nome, pct: m.valorAlvo ? Math.round(m.valorAtual / m.valorAlvo * 100) : 0 }; });
  // estratégias
  r.estrategias = [];
  if (r.altas.length) { var al = r.altas[0], lim = Math.ceil(Math.max(al.ant, (r.mediaDes ? al.ant : al.ant)) * 1.1 / 10) * 10; r.estrategias.push('Defina um limite mensal para ' + al.nome + ' (sugestão: ' + agBrl(lim) + ', o valor do mês passado + 10%). Dá para criar na aba Limites.'); }
  else if (r.cats.length && r.cats[0].pct >= 35) r.estrategias.push('Seu maior peso é ' + r.cats[0].nome + ' (' + r.cats[0].pct + '% dos gastos). Um limite mensal ajuda a acompanhar.');
  if (ass && ass.valor >= 50) r.estrategias.push('Revise as assinaturas: cancelar as que não usa libera ' + agBrl(ass.valor) + ' por mês, no máximo.');
  if (r.taxaPoup !== null && r.taxaPoup < 10 && r.rec > 0) r.estrategias.push('Tente reservar pelo menos 10% da renda no começo do mês (' + agBrl(r.rec * 0.1) + ' com a renda atual), em vez de guardar só o que sobra.');
  if (r.mediaDes && r.saldoLiquido < r.mediaDes * 3) r.estrategias.push('Monte uma reserva de emergência: três meses de gastos seriam cerca de ' + agBrl(r.mediaDes * 3) + '.');
  if (!r.estrategias.length) r.estrategias.push('Seus números estão equilibrados. Mantenha os registros em dia para eu continuar acompanhando.');
  return r;
}
var AG_RODAPE = 'Análise educativa, baseada nos lançamentos registrados; estimativas não são valores confirmados.';
function agPoucosDados(a) { return a.totalLanc < 5 || (a.rec === 0 && a.des === 0); }
function agContador(dados, foco, extra) {
  var a = agAnalise(dados), L = [], mes = a.ym.slice(5, 7) + '/' + a.ym.slice(0, 4);
  if (agPoucosDados(a) && foco !== 'ajuda') return { texto: 'Ainda tenho poucos lançamentos para analisar (' + a.totalLanc + '). Registre mais alguns gastos e receitas e volto com um diagnóstico de verdade.', analise: a };
  var pct = function (n) { return (n > 0 ? '+' : '') + n + '%'; };
  if (foco === 'gastando_mais') {
    if (a.rec === 0) L.push('Neste mês ainda não há receitas registradas; já saíram ' + agBrl(a.des) + '.');
    else if (a.des > a.rec) L.push('Sim: neste mês você gastou ' + agBrl(a.des) + ' e recebeu ' + agBrl(a.rec) + ' (faltam ' + agBrl(a.des - a.rec) + ').');
    else L.push('Até agora, não: você recebeu ' + agBrl(a.rec) + ' e gastou ' + agBrl(a.des) + ', sobrando ' + agBrl(a.rec - a.des) + (a.taxaPoup !== null ? ' (' + a.taxaPoup + '% da renda).' : '.'));
    if (a.projDes !== null && a.dia >= 5) L.push('Estimativa: se o ritmo continuar, os gastos do mês fecham perto de ' + agBrl(a.projDes) + '.');
    if (a.mediaRec !== null) L.push('Nos últimos ' + a.mesesBase + ' meses a média foi de ' + agBrl(a.mediaRec) + ' de receita e ' + agBrl(a.mediaDes) + ' de gastos.');
  } else if (foco === 'quanto_posso') {
    L.push('Com base no saldo das contas (' + agBrl(a.saldoLiquido) + ')' + (a.faturas < 0 ? ', as faturas em aberto (' + agBrl(-a.faturas) + ')' : '') + (a.compromissos > 0 ? ' e as contas fixas que ainda não apareceram neste mês (' + agBrl(a.compromissos) + ')' : '') + ', estimo que você pode gastar cerca de ' + agBrl(Math.max(0, a.disponivel)) + ' até o fim do mês' + (a.diasRestantes > 0 ? ', ou ' + agBrl(a.porDia) + ' por dia nos ' + a.diasRestantes + ' dias que restam.' : '.'));
    if (a.disponivel <= 0) L.push('Atenção: o saldo disponível já está comprometido.');
    L.push('É uma estimativa: não considera receitas que ainda vão entrar nem gastos imprevistos.');
  } else if (foco === 'posso_comprar') {
    var x = extra && extra.valor;
    if (!x) return { texto: 'Qual é o valor da compra? Por exemplo: "consigo comprar algo de R$ 500?"', analise: a };
    var reserva = a.mediaDes ? Math.round(a.mediaDes * 0.1) : 0, sobra = Math.round((a.disponivel - x) * 100) / 100;
    if (sobra < 0) L.push('Eu não recomendaria agora: pelas minhas contas, o disponível estimado é ' + agBrl(Math.max(0, a.disponivel)) + ' e a compra de ' + agBrl(x) + ' passaria dele em ' + agBrl(-sobra) + '.');
    else if (sobra < reserva) L.push('Dá, mas fica apertado: depois de ' + agBrl(x) + ' restariam cerca de ' + agBrl(sobra) + ', abaixo de uma folga de ' + agBrl(reserva) + ' (10% dos seus gastos médios).');
    else L.push('Parece possível: depois de ' + agBrl(x) + ' ainda restariam cerca de ' + agBrl(sobra) + ' até o fim do mês, considerando saldo atual menos contas fixas pendentes.');
    L.push('É uma estimativa com os dados registrados; não inclui receitas futuras nem imprevistos.');
  } else if (foco === 'onde_gasto') {
    if (!a.cats.length) L.push('Ainda não há despesas registradas neste mês.');
    else { L.push('Seus maiores gastos em ' + mes + ':'); a.cats.slice(0, 5).forEach(function (c) { L.push('• ' + c.nome + ': ' + agBrl(c.valor) + ' (' + c.pct + '%)' + (c.var !== null ? ', ' + pct(c.var) + ' vs. mês passado' : '')); }); }
  } else if (foco === 'recorrentes') {
    if (!a.recorrentes.length) L.push('Ainda não identifiquei despesas recorrentes (preciso de pelo menos 3 meses de histórico com valores parecidos).');
    else { L.push('Despesas que se repetem todo mês:'); a.recorrentes.slice(0, 8).forEach(function (x) { L.push('• ' + x.nome + ': cerca de ' + agBrl(x.media) + (x.lancadoNoMes ? '' : ' (ainda não lançada neste mês)')); }); }
  } else if (foco === 'economias') {
    L.push('Neste mês o saldo entre receitas e despesas é de ' + agBrl(a.saldoMes) + (a.taxaPoup !== null ? ' (' + a.taxaPoup + '% da renda).' : '.'));
    if (a.tendencia) L.push('A evolução dos últimos meses está ' + a.tendencia + '.');
    a.metas.slice(0, 3).forEach(function (m) { L.push('• Meta ' + m.nome + ': ' + m.pct + '% concluída.'); });
    L.push('Série: ' + a.serie.filter(function (s) { return s.n > 0; }).map(function (s) { return s.mes.slice(5) + '/' + s.mes.slice(2, 4) + ' ' + agBrl(s.rec - s.des); }).join(' · '));
  } else if (foco === 'desperdicio') {
    if (!a.desperdicios.length) L.push('Não vi padrões claros de desperdício neste mês. Compras pequenas e assinaturas dentro do normal.');
    else { L.push('Possíveis pontos de atenção (são indícios, só você sabe o que valeu a pena):'); a.desperdicios.forEach(function (d) { L.push('• ' + d); }); }
  } else if (foco === 'projecao') {
    L.push(a.projDes !== null ? 'Estimativa de gastos para fechar ' + mes + ': cerca de ' + agBrl(a.projDes) + ' (base: ' + a.projBasis + ').' : 'Preciso de mais dias de lançamentos para projetar.');
    if (a.projDes !== null) L.push('Receitas registradas até agora: ' + agBrl(a.rec) + (a.mediaRec ? '; média dos meses anteriores: ' + agBrl(a.mediaRec) + '.' : '.'));
  } else {   // situacao / relatorio
    L.push('Panorama de ' + mes + ' (' + AG_NOME + ', modo contador):');
    L.push('• Receitas: ' + agBrl(a.rec) + (a.antRec ? ' (' + pct(Math.round((a.rec - a.antRec) / a.antRec * 100)) + ' vs. mês passado)' : ''));
    L.push('• Despesas: ' + agBrl(a.des) + (a.antDes ? ' (' + pct(Math.round((a.des - a.antDes) / a.antDes * 100)) + ' vs. mês passado)' : ''));
    L.push('• Saldo do mês: ' + agBrl(a.saldoMes) + ' · saldo nas contas: ' + agBrl(a.saldoLiquido));
    if (a.cats[0]) L.push('• Maior categoria: ' + a.cats[0].nome + ' (' + a.cats[0].pct + '% dos gastos)');
    a.altas.slice(0, 2).forEach(function (c) { L.push('• Atenção: ' + c.nome + ' subiu ' + c.var + '% em relação ao mês passado.'); });
    if (a.projDes !== null && a.dia >= 5) L.push('• Estimativa: gastos do mês perto de ' + agBrl(a.projDes) + '.');
    if (a.riscos.length) { L.push('Riscos que vejo:'); a.riscos.slice(0, 4).forEach(function (x) { L.push('• ' + x); }); } else L.push('Não identifiquei riscos de desequilíbrio no momento.');
    if (foco === 'relatorio') { if (a.recorrentes.length) L.push('Fixos que se repetem: ' + a.recorrentes.slice(0, 4).map(function (x) { return x.nome + ' ' + agBrl(x.media); }).join(', ') + '.'); a.desperdicios.slice(0, 3).forEach(function (d) { L.push('• ' + d); }); if (a.tendencia) L.push('Evolução das economias: ' + a.tendencia + '.'); }
    L.push('O que eu faria:'); a.estrategias.slice(0, foco === 'relatorio' ? 4 : 2).forEach(function (s) { L.push('• ' + s); });
  }
  L.push(AG_RODAPE);
  return { texto: L.join('\n'), analise: a };
}

/* ---------- respostas e utilidades de conversa ---------- */
var AG_SUGESTOES = ['Como está minha situação financeira?', 'Quanto gastei este mês?', 'Onde estou gastando mais?', 'Quanto posso gastar até o fim do mês?'];
function agAjuda(apelido) {
  return ['Posso ajudar com:', '• Registrar: "gastei 45 no almoço", "recebi 2.800 de salário", "paguei 120 de energia ontem"', '• Consultar: "quanto gastei com alimentação este mês?", "qual meu saldo?"', '• Alterar ou apagar (sempre com sua confirmação): "altere a internet para 110", "apague o lançamento do almoço"', '• Modo Contador: "como está minha situação?", "posso comprar algo de R$ 500?"', '• Aprender: "quando eu disser mercadinho, é Mercado", "me chame de ' + (apelido || 'Ana') + '"', '• Corrigir: "desfazer" ou "não, é transporte" logo depois de um registro.'].join('\n');
}
function agMsgAguardo(p) { return p.tipo === 'confirmar' ? 'Responda "sim" para confirmar ou "não" para cancelar.' : ''; }
function agRespostaLanc(t, cat, conta, explicitaConta, usouPalavra) {
  var s = (t.tipo === 'despesa' ? 'Despesa' : 'Receita') + ' de ' + agBrl(t.valor) + ' registrada: ' + (t.descricao || (cat ? cat.nome : 'sem descrição')) + ' · ' + (cat ? cat.nome : 'sem categoria') + ' · ' + agDataBR(t.data) + ' · ' + conta.nome + '.';
  return s;
}
function agSimNao(t) {
  if (/^(sim|s|ss|yes|claro|pode|pode sim|confirmo|confirmar|isso|isso mesmo|ok|okay|beleza|manda|bora|certo|positivo|fechado|vai)$/.test(t)) return 'sim';
  if (/^(nao|n|nope|cancela|cancelar|cancele|deixa|deixa pra la|esquece|negativo|para|melhor nao)$/.test(t)) return 'nao';
  return null;
}
function agAcharLanc(dados, tokensAlvo, tipo, valorHint) {
  var lim = agSomaDias(dados.hoje, -150), alvo = tokensAlvo.filter(function (w) { return w.length > 2 && !AG_STOP[w]; }), melhor = null, mScore = 0;
  (dados.lancamentos || []).forEach(function (l) {
    if (l.data < lim || (tipo && l.tipo !== tipo)) return;
    var c = agCatId(dados, l.categoriaId), alvoTxt = agNorm(l.descricao + ' ' + (c ? c.nome : '')).split(' '), s = 0;
    alvo.forEach(function (w) { if (alvoTxt.some(function (x) { return x === w || (w.length >= 4 && (x.indexOf(w.slice(0, 4)) === 0 || w.indexOf(x.slice(0, 4)) === 0) && x.length >= 4); })) s++; });
    if (valorHint && Math.abs(l.valor - valorHint) < 0.005) s += 2;
    if (s > mScore || (s === mScore && s > 0 && melhor && l.data > melhor.data)) { mScore = s; melhor = l; }
  });
  return mScore > 0 ? melhor : null;
}
function agDescLanc(dados, l) { var c = agCatId(dados, l.categoriaId); return (l.descricao || 'Sem descrição') + ' — ' + agBrl(l.valor) + ' (' + (l.tipo === 'despesa' ? 'despesa' : 'receita') + ', ' + agDataBR(l.data) + (c ? ', ' + c.nome : '') + ')'; }

/* ---------- COPILOTO: guia do app, glossário, consultas, inconsistências ---------- */
var AG_GUIA = [
  { tela: 'jornada', rotulo: 'Jornada', nomes: 'jornada cerebro inicio home', desc: 'visão geral em 3D: cada região do cérebro representa uma parte do seu dinheiro.', como: ['Toque numa região para ver o resumo dela.', 'Use o botão do cérebro para ligar ou desligar o 3D.'] },
  { tela: 'painel', rotulo: 'Painel', nomes: 'painel dashboard indicadores graficos resumo relatorio relatorios', desc: 'saldo nas contas, receitas, despesas do mês e o gráfico dos últimos 6 meses.', como: ['Troque o mês nas setas do topo.', 'Os cartões mostram saldo, receitas e despesas; o gráfico compara os últimos 6 meses.'] },
  { tela: 'lanc', rotulo: 'Lançamentos', nomes: 'lancamento lancamentos transacao transacoes movimentacao movimentacoes extrato gasto gastos despesa despesas receita receitas registrar lancar', desc: 'onde você registra e consulta receitas e despesas.', como: ['Escolha Despesa ou Receita.', 'Informe valor, data, conta e categoria (a descrição é opcional).', 'Toque em Salvar. Dá para editar ou excluir na lista.', 'Atalho: diga ao Rumi "gastei 45 no almoço".'] },
  { tela: 'orc', rotulo: 'Orçamentos', nomes: 'orcamento orcamentos planejamento planejar', desc: 'limite mensal por categoria e acompanhamento do planejado contra o realizado.', como: ['Escolha a categoria e o limite do mês.', 'Toque em Definir limite.', 'Use "Copiar do mês anterior" para repetir o planejamento.'] },
  { tela: 'metas', rotulo: 'Metas', nomes: 'meta metas objetivo objetivos sonho', desc: 'objetivos de poupança com valor alvo, prazo e quanto você já guardou.', como: ['Em "Nova meta", informe o nome (ex.: Viagem) e o valor alvo.', 'Opcional: quanto já guardou e o prazo.', 'Toque em Criar meta. Depois dá para registrar aportes.', 'Atalho: diga ao Rumi "criar meta Viagem de 5 mil".'] },
  { tela: 'contas', rotulo: 'Contas', nomes: 'conta contas carteira banco saldo inicial', desc: 'suas contas e carteiras, com o saldo de cada uma.', como: ['Informe o nome (ex.: Banco principal), o tipo e o saldo inicial.', 'Toque em Adicionar conta.'] },
  { tela: 'cats', rotulo: 'Categorias', nomes: 'categoria categorias classificar', desc: 'as categorias de despesas e receitas.', como: ['Em "Nova categoria", informe o nome e o tipo.', 'Toque em Adicionar categoria. Dá para arquivar ou excluir (movendo os lançamentos).', 'Atalho: diga ao Rumi "criar categoria Pets".'] },
  { tela: 'cambio', rotulo: 'Câmbio', nomes: 'cambio moeda moedas dolar euro cotacao conversor', desc: 'cotações e conversor de moedas.', como: ['Busque a moeda e toque na estrela para favoritar.', 'Use o conversor para calcular valores.'] },
  { tela: 'cartoes', rotulo: 'Cartões', nomes: 'cartao cartoes fatura credito', desc: 'cartões de crédito, fatura atual, limite disponível e datas de fechamento.', como: ['Em "Novo cartão", informe nome, limite e os dias de fechamento e vencimento.', 'Lance as compras na conta do tipo cartão para ver a fatura.'] },
  { tela: 'invest', rotulo: 'Investimentos', nomes: 'investimento investimentos ativo ativos acao acoes carteira', desc: 'seus ativos, quantidade, preço médio e a distribuição por classe.', como: ['Em "Novo ativo", informe nome, código, quantidade e preço médio.', 'Toque em Adicionar ativo.'] },
  { tela: 'agenda', rotulo: 'Agenda', nomes: 'agenda lembrete lembretes vencimento vencimentos conta-a-pagar agendar', desc: 'contas a pagar e a receber, com lembretes.', como: ['Em "Novo item na agenda", informe descrição, valor e data.', 'Marque como concluído quando pagar.'] },
  { tela: 'limites', rotulo: 'Limites', nomes: 'limite limites alerta alertas teto', desc: 'limites de gasto por categoria, conta ou geral, com alertas quando chegar perto.', como: ['Em "Novo limite de gastos", escolha o escopo e o valor.', 'Toque em Salvar limite. Os alertas aparecem no histórico.'] },
  { tela: 'conexoes', rotulo: 'Conexões', nomes: 'conexao conexoes banco open-finance importar', desc: 'conexão bancária (Open Finance) para importar suas transações.', como: ['Leia e aceite o consentimento.', 'Toque em Conectar meu banco e siga o fluxo seguro.'] },
  { tela: 'cons', rotulo: 'Consultor', nomes: 'consultor analise dicas', desc: 'análise automática do seu mês, com avisos e dicas.', como: ['Abra a tela para ver a análise do mês selecionado.', 'Toque em Reanalisar para atualizar.'] },
  { tela: 'opcoes', rotulo: 'Opções', nomes: 'opcoes configuracao configuracoes ajustes tema preferencias permissoes privacidade', desc: 'aparência, permissões, memória e WhatsApp do Rumi, tutorial.', como: ['Troque tema, cores e tamanho do texto.', 'Em Permissões e privacidade você consulta e altera o que autorizou.', 'Aqui também ficam a memória do Rumi, o registro de ações e o WhatsApp.'] },
  { tela: 'perfil', rotulo: 'Perfil', nomes: 'perfil conta-google foto apelido', desc: 'seus dados, foto e apelido.', como: ['Edite o apelido e a data de nascimento e toque em Salvar.'] },
  { tela: 'ajuda', rotulo: 'Ajuda', nomes: 'ajuda suporte duvida duvidas faq contato', desc: 'perguntas frequentes e contato com o suporte.', como: ['Busque sua dúvida na caixa de pesquisa.', 'Se não achar, envie uma mensagem pelo app.'] }
];
var AG_GLOSS = [
  ['saldo nas contas', 'a soma do saldo de todas as suas contas (cartões de crédito não entram: eles têm a fatura).', 'saldoLiquido'],
  ['saldo do mês', 'receitas do mês menos despesas do mês. Positivo = sobrou dinheiro; negativo = gastou mais do que entrou.', 'saldoMes'],
  ['saldo disponivel', 'estimativa de quanto você ainda pode gastar até o fim do mês: saldo das contas, menos faturas em aberto e menos contas fixas que ainda não apareceram.', 'disponivel'],
  ['taxa de poupanca', 'a parte da renda do mês que sobrou: (receitas − despesas) ÷ receitas.', 'taxaPoup'],
  ['limite', 'um teto de gastos (geral, por categoria ou por conta). O app avisa quando você chega perto ou passa.'],
  ['orcamento', 'o valor que você planejou gastar por categoria no mês, comparado com o que realmente gastou.'],
  ['meta', 'um objetivo de poupança com valor alvo e, se quiser, prazo. A barra mostra quanto já foi guardado.'],
  ['fatura', 'o que você já gastou no cartão e ainda vai pagar. Fica como saldo negativo na conta do tipo cartão.'],
  ['despesa recorrente', 'um gasto que se repete todo mês com valor parecido (internet, assinaturas). O Rumi identifica olhando 3 ou mais meses.'],
  ['recorrente', 'um gasto que se repete todo mês com valor parecido (internet, assinaturas). O Rumi identifica olhando 3 ou mais meses.'],
  ['projecao', 'uma estimativa de como o mês vai fechar, mantendo o ritmo atual de gastos. É uma estimativa, não um valor confirmado.'],
  ['modo contador', 'a análise do Rumi sobre seus números reais: panorama, riscos, categorias que subiram e o que fazer. Sempre educativa.'],
  ['cotacao', 'o preço de uma moeda em reais no dia. Nos lançamentos em moeda estrangeira, é a taxa usada na conversão.'],
  ['open finance', 'sistema do Banco Central que permite importar suas transações do banco, com o seu consentimento.']
];
function agAchaGuia(t, dados) {   // texto normalizado -> item do guia (o de maior pontuação)
  var tk = t.split(' '), melhor = null, ms = 0;
  AG_GUIA.forEach(function (g) {
    var pal = g.nomes.split(' '), sc = 0;
    tk.forEach(function (w) { if (w.length >= 3 && pal.some(function (p) { return p === w || (w.length >= 5 && agDist1(p, w)); })) sc++; });
    if (sc > ms) { ms = sc; melhor = g; }
  });
  return melhor;
}
function agTextoGuia(g, dados) {
  return g.rotulo + ': ' + g.desc + '\n' + g.como.map(function (c, i) { return (i + 1) + '. ' + c; }).join('\n');
}
function agMetasTxt(dados) {
  var ms = dados.metas || []; if (!ms.length) return 'Você ainda não tem metas. Diga "criar meta Viagem de 5 mil" ou abra Metas.';
  return 'Suas metas:\n' + ms.slice(0, 8).map(function (m) { var pc = m.valorAlvo ? Math.round(m.valorAtual / m.valorAlvo * 100) : 0; return '• ' + m.nome + ': ' + agBrl(m.valorAtual) + ' de ' + agBrl(m.valorAlvo) + ' (' + pc + '%)' + (m.valorAlvo > m.valorAtual ? ', faltam ' + agBrl(m.valorAlvo - m.valorAtual) : ', concluída'); }).join('\n');
}
// Possíveis inconsistências nos dados (sempre "possíveis": só o usuário sabe o que está certo)
function agInconsistencias(dados) {
  var ls = dados.lancamentos || [], out = [], hoje = dados.hoje, i;
  var vistos = {}, dup = [];
  ls.forEach(function (l) { var k = [l.data, l.tipo, l.valor, l.contaId, agNorm(l.descricao)].join('|'); if (vistos[k]) dup.push(l); else vistos[k] = l; });
  if (dup.length) out.push({ tipo: 'duplicados', n: dup.length, txt: dup.length + ' possível(is) duplicado(s) (mesma data, valor, conta e descrição): ' + dup.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor) + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var semCat = ls.filter(function (l) { return !l.categoriaId || !agCatId(dados, l.categoriaId); });
  if (semCat.length) out.push({ tipo: 'sem_categoria', n: semCat.length, txt: semCat.length + ' lançamento(s) sem categoria: ' + semCat.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor); }).join('; ') + '.' });
  var fut = ls.filter(function (l) { return l.data > hoje; }); if (fut.length) out.push({ tipo: 'futuros', n: fut.length, txt: fut.length + ' lançamento(s) com data futura: ' + fut.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var um = ls.filter(function (l) { return l.valor === 1; }); if (um.length) out.push({ tipo: 'valor_um', n: um.length, txt: um.length + ' lançamento(s) de exatamente R$ 1,00 (pode ser valor digitado errado): ' + um.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var porCat = {}; ls.forEach(function (l) { if (l.tipo === 'despesa' && l.categoriaId) (porCat[l.categoriaId] = porCat[l.categoriaId] || []).push(l); });
  var alt = []; Object.keys(porCat).forEach(function (k) { var v = porCat[k]; if (v.length < 5) return; var ord = v.map(function (x) { return x.valor; }).sort(function (a, b) { return a - b; }), med = ord[Math.floor(ord.length / 2)]; v.forEach(function (l) { if (med > 0 && l.valor >= med * 8 && l.valor >= 200) alt.push(l); }); });
  if (alt.length) out.push({ tipo: 'valor_alto', n: alt.length, txt: alt.length + ' valor(es) muito acima do normal da categoria: ' + alt.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor) + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var neg = (dados.contas || []).filter(function (c) { return c.tipo !== 'cartao' && c.saldo < 0; }); if (neg.length) out.push({ tipo: 'saldo_negativo', n: neg.length, txt: 'Conta(s) com saldo negativo: ' + neg.map(function (c) { return c.nome + ' ' + agBrl(c.saldo); }).join('; ') + ' (confira o saldo inicial ou lançamentos faltando).' });
  var cats = dados.categorias || [], usadas = {}; ls.forEach(function (l) { usadas[l.categoriaId] = 1; });
  return out;
}
function agRespondeGasto(dados, tipoC, catF, per) {
  var lsq = agLancEm(dados, per.de, per.ate).filter(function (l) { return l.tipo === tipoC && (!catF || catF.ids.indexOf(l.categoriaId) >= 0); });
  var soma = Math.round(lsq.reduce(function (a, l) { return a + l.valor; }, 0) * 100) / 100;
  return (tipoC === 'receita' ? 'Você recebeu ' : 'Você gastou ') + agBrl(soma) + (catF ? ' com ' + catF.nome.toLowerCase() : '') + ' ' + per.rotulo + ' (' + lsq.length + ' lançamento' + (lsq.length === 1 ? '' : 's') + ').';
}

/* ---------- o turno de conversa ---------- */
// estado: { pendente, ultimo }  ->  { resposta, acoes, estado, sugestoes, humor, relatorio }
function agTurno(estado, texto, dados) {
  estado = JSON.parse(JSON.stringify(estado || {}));
  var orig = String(texto || '').trim().slice(0, 500);
  var t = agNorm(orig), tk = t.split(' ').filter(Boolean).map(function (x) { return x.replace(/[,.]+$/, ''); }), perm = dados.permissoes || { criar: true, editar: true, excluir: true };
  var out = { resposta: '', acoes: [], estado: estado, sugestoes: [], humor: 'ok', relatorio: null };
  var finaliza = function (resp, humor, sug) { out.resposta = resp; if (humor) out.humor = humor; if (sug) out.sugestoes = sug; return out; };
  if (!t) return finaliza('Pode falar: o que você quer registrar ou consultar?', 'espera', AG_SUGESTOES);
  var chamado = dados.apelido ? ', ' + dados.apelido : '';
  var temContas = (dados.contas || []).length > 0;

  /* 1) pendências (pergunta feita antes ou confirmação) */
  var p = estado.pendente;
  if (p && p.expira && dados.agora && p.expira < dados.agora) { estado.pendente = null; p = null; }
  if (p) {
    if (p.tipo === 'confirmar') {
      var sn = agSimNao(t);
      if (sn === 'sim') { estado.pendente = null; out.acoes = p.acoes; out.humor = 'executando'; return finaliza(p.respostaOk || 'Feito!', 'confirmando'); }
      if (sn === 'nao') { estado.pendente = null; return finaliza('Tudo bem, não fiz nada.', 'ok', AG_SUGESTOES); }
      estado.pendente = null;   // outra frase: descarta a pendência e trata como comando novo
      out.aviso = 'Descartei a confirmação anterior.';
    } else if (p.tipo === 'confirmar_valor') {
      var sv = agSimNao(t); estado.pendente = null;
      if (sv === 'sim') return agTurno(estado, p.texto, Object.assign({}, dados, { valorConfirmado: p.valor }));
      if (sv === 'nao') return finaliza('Ok, não registrei nada. Diga o valor de novo, por exemplo: "gastei R$ 3.000,00 no mercado".', 'ok', AG_SUGESTOES);
    } else if (p.tipo === 'perguntar') {
      var r = agResponderPergunta(p, orig, t, tk, dados);
      if (r) { if (r.pendente) { estado.pendente = r.pendente; return finaliza(r.resposta, 'espera', r.sugestoes); } estado.pendente = null; if (r.acoes) { out.acoes = r.acoes; } return finaliza(r.resposta, r.humor || 'confirmando', r.sugestoes); }
      estado.pendente = null;
    }
  }

  /* 2) meta-intenções */
  if (/^(oi|ola|opa|e ai|eae|bom dia|boa tarde|boa noite|hey|hello|salve)( .*)?$/.test(t) && tk.length <= 4) return finaliza('Olá' + chamado + '! Eu sou o ' + AG_NOME + ', seu assistente financeiro. ' + (dados.resumoRapido || 'Me diga o que gastou ou recebeu, ou pergunte sobre suas finanças.'), 'ok', AG_SUGESTOES);
  if (/^(obrigad|valeu|brigad|thanks|show|legal|perfeito|top|boa|massa)/.test(t) && tk.length <= 4) return finaliza('Por nada' + chamado + '! Estou por aqui.', 'ok');
  if (/^(ajuda|help|o que voce faz|o que voce sabe fazer|comandos|como funciona|menu)/.test(t) || /o que (voce|vc) (faz|pode)/.test(t)) return finaliza(agAjuda(dados.apelido), 'ok', AG_SUGESTOES);
  var m;
  if (/^(desfaz|desfazer|desfaca|volta|voltar|cancela o ultimo|apaga o ultimo|errei)/.test(t) || /^(desfa[cz]|anula)/.test(t)) {
    if (!estado.ultimo || !estado.ultimo.auditId) return finaliza('Não encontrei nada recente para desfazer. Se quiser, apague um lançamento específico dizendo "apague o lançamento de ..."; eu peço confirmação.', 'problema');
    if (!perm.editar && !perm.excluir && !perm.criar) return finaliza('Você desativou minhas permissões de alteração.', 'problema');
    out.acoes = [{ op: 'desfazer', auditId: estado.ultimo.auditId }]; var desfeito = estado.ultimo; estado.ultimo = null;
    return finaliza('Desfeito: ' + (desfeito.resumo || 'a última operação') + '. Se mudar de ideia, é só registrar de novo.', 'confirmando');
  }
  if ((m = t.match(/^(nao|errado|na verdade|errei|corrige|corrija)[, ]+(?:e|foi|era|a categoria e|eh|seria)?\s*(.+)$/)) && estado.ultimo && estado.ultimo.lancId && !/\d/.test(m[2])) {
    var cn = agAcharCategoriaNaFrase(agTokens(m[2]), dados);
    if (cn && cn.ids.length) { var cc = (dados.categorias || []).filter(function (c) { return c.id === cn.ids[0]; })[0];
      if (!perm.editar) return finaliza('Você desativou minha permissão de editar lançamentos.', 'problema');
      out.acoes = [{ op: 'alterar', id: estado.ultimo.lancId, mudancas: { categoriaId: cc.id } }];
      var ap = estado.ultimo.chaveDesc ? [{ tipo: 'desc', chave: estado.ultimo.chaveDesc, conteudo: cc.nome }] : [];
      if (ap.length) out.acoes.push({ op: 'aprender', itens: ap });
      return finaliza('Corrigido: "' + (estado.ultimo.descricao || 'o lançamento') + '" agora está em ' + cc.nome + '.' + (ap.length ? ' Vou lembrar disso da próxima vez.' : ''), 'confirmando');
    }
  }
  if ((m = t.match(/^(?:aprenda|aprende|lembre|lembra|guarde|anote)(?: que| disso)?[: ]+(?:quando eu (?:falar|disser|escrever) )?(.+?) (?:e|eh|=|sao|significa|vai para|vai pra|conta como)\s+(?:da categoria |categoria |de |do |a |o )?(.+)$/)) || (m = t.match(/^quando eu (?:falar|disser|escrever|digitar) (.+?),? (?:e|eh|=|considere|use|lance como|vai para|vai pra)\s+(?:da categoria |categoria |de |do |a |o )?(.+)$/)) || (m = t.match(/^(?:chame|chamar|trate|considere) (.+?) de (?:categoria )?(.+)$/))) {
    var cat2 = agAcharCategoriaNaFrase(agTokens(m[2]), dados), termo = agNorm(m[1]).replace(/^(o|a|os|as) /, '');
    if (cat2 && cat2.ids.length && termo && termo.length >= 2) { var cx = (dados.categorias || []).filter(function (c) { return c.id === cat2.ids[0]; })[0];
      out.acoes = [{ op: 'aprender', itens: [{ tipo: 'desc', chave: termo, conteudo: cx.nome }] }];
      return finaliza('Combinado: quando você falar "' + termo + '", vou classificar em ' + cx.nome + '.', 'confirmando'); }
    return finaliza('Entendi que "' + m[1] + '" tem um significado especial, mas não achei a categoria "' + m[2] + '". Diga o nome de uma categoria que você já tem (por exemplo Mercado, Transporte, Lazer e Hobbies).', 'problema');
  }
  if ((m = t.match(/^(?:me chame|pode me chamar|meu apelido e|meu nome e|pode chamar de|me chama) (?:de )?(.+)$/))) { var nome = agCap(orig.replace(/^.*?(?:de |e )\s*/i, '').replace(/[.!]+$/, '').trim().slice(0, 30)); if (nome.length >= 2) { out.acoes = [{ op: 'aprender', itens: [{ tipo: 'preferencia', chave: 'apelido', conteudo: nome }] }]; return finaliza('Prazer, ' + nome + '! Vou te chamar assim.', 'confirmando'); } }
  if ((m = t.match(/^(?:minha conta (?:principal|padrao) e|use (?:sempre )?a conta|conta padrao)(?: e| a)? (.+)$/))) { var ct = agContaDe(agTokens(m[1]), { contas: dados.contas, hoje: dados.hoje, lancamentos: [], memoria: [] }); if (ct && ct.explicita) { out.acoes = [{ op: 'aprender', itens: [{ tipo: 'conta_padrao', chave: 'padrao', conteudo: ct.conta.nome }] }]; return finaliza('Certo, vou usar "' + ct.conta.nome + '" quando você não disser a conta.', 'confirmando'); } return finaliza('Não achei essa conta. Suas contas: ' + (dados.contas || []).map(function (c) { return c.nome; }).join(', ') + '.', 'problema'); }
  if ((m = t.match(/^(?:esqueca|esquece|apague da memoria|remova da memoria)(?: que| o que| sobre)?\s+(.+)$/)) && !/lancamento|despesa|receita|gasto/.test(t)) { var chave = agNorm(m[1]); var item = (dados.memoria || []).filter(function (x) { return agNorm(x.chave) === chave || agNorm(x.conteudo) === chave; })[0]; if (item) { out.acoes = [{ op: 'esquecer', tipo: item.tipo, chave: item.chave }]; return finaliza('Esqueci: "' + m[1] + '".', 'confirmando'); } return finaliza('Não tenho nada guardado sobre "' + m[1] + '". Para ver o que sei, diga "o que você sabe sobre mim?".', 'ok'); }
  if (/(o que|oque) (voce )?(sabe|lembra|aprendeu)|minha memoria|o que (voce )?guardou/.test(t)) {
    var itens = (dados.memoria || []).filter(function (x) { return x.tipo === 'desc' || x.tipo === 'conta_padrao' || x.tipo === 'preferencia' || x.tipo === 'fato'; });
    if (!itens.length) return finaliza('Ainda não aprendi nada específico sobre você. Conforme você usa, vou lembrando como você chama cada gasto. Também dá para ensinar: "quando eu disser mercadinho, é Mercado".', 'ok');
    return finaliza('Isso é o que eu sei (você pode corrigir ou apagar em Configurações › Memória):\n' + itens.slice(0, 12).map(function (x) { return '• ' + (x.tipo === 'desc' ? '"' + x.chave + '" → ' + x.conteudo : x.tipo === 'conta_padrao' ? 'conta padrão: ' + x.conteudo : x.chave + ': ' + x.conteudo); }).join('\n'), 'ok');
  }

  /* 2b) copiloto do app: navegação, como fazer, explicar tela/indicadores, tutorial */
  if (/\b(tutorial|tour|primeiros passos|me mostra o app|me ensina a usar o app|como usar o app)\b/.test(t) && !/gast|receb/.test(t)) {
    var ret = /continu|retom/.test(t); out.abrir = { tutorial: ret ? 'retomar' : 'iniciar', rotulo: ret ? 'Continuar o tutorial' : 'Iniciar o tutorial', auto: true };
    return finaliza(ret ? 'Vamos continuar de onde você parou.' : 'Vou te mostrar o app passo a passo. Dá para pausar quando quiser.', 'apresentando');
  }
  if ((m = t.match(/^(?:abra|abrir|abre|ir para|ir pra|va para|vai para|vai pra|me leva(?:r)?(?: para| pra| ate)?|leve-me(?: para| ate)?|mostre|mostra|quero ver|quero abrir)\s+(?:a |o |as |os |minha |minhas |meu |meus |na |no |nas |nos )?(.+)$/)) && !/\d/.test(m[1])) {
    var gd = agAchaGuia(agNorm(m[1]), dados);
    if (gd) { out.abrir = { tela: gd.tela, rotulo: 'Abrir ' + gd.rotulo, auto: true }; return finaliza('Abrindo ' + gd.rotulo + '.', 'executando'); }
  }
  if (/(explica|explique|como (eu )?uso|pra que serve|para que serve|o que (e|faz|posso fazer)|me ajuda com|como funciona)\b.*\b(esta|essa|aqui|tela|pagina)\b|^(como uso (isso|aqui)|onde estou|o que posso fazer aqui)/.test(t) && dados.tela) {
    var gt = AG_GUIA.filter(function (x) { return x.tela === dados.tela; })[0];
    if (gt) return finaliza('Você está em ' + agTextoGuia(gt, dados), 'apresentando', ['Como lanço um gasto?', 'Como crio uma meta?', 'Verificar meus dados']);
  }
  if ((m = t.match(/^(?:o que (?:e|significa|quer dizer)|oque e|explique|explica|me explica|defina)\s+(?:o |a |os |as |um |uma )?(.+)$/)) && !/gast|receb|lanc/.test(m[1].split(' ')[0])) {
    var termo = m[1].replace(/\?+$/, '').trim(), gl = AG_GLOSS.filter(function (x) { return termo.indexOf(x[0]) >= 0 || x[0].indexOf(termo) >= 0 && termo.length >= 4; })[0];
    if (gl) { var extra = ''; if (gl[2]) { var an = agAnalise(dados), v = an[gl[2]]; if (v !== null && v !== undefined && !agPoucosDados(an)) extra = ' No seu caso, agora: ' + (gl[2] === 'taxaPoup' ? v + '%.' : agBrl(v) + '.'); } return finaliza(agCap(gl[0].replace('saldo disponivel', 'saldo disponível').replace('taxa de poupanca', 'taxa de poupança').replace('orcamento', 'orçamento').replace('projecao', 'projeção').replace('cotacao', 'cotação')) + ' é ' + gl[1] + extra, 'apresentando'); }
    var gg = agAchaGuia(agNorm(termo), dados); if (gg && !/^(o|a)$/.test(termo)) return finaliza(agTextoGuia(gg, dados), 'apresentando');
  }
  if (/\b(como|onde|aonde|qual)\b.*\b(faco|fazer|crio|criar|cadastro|cadastrar|adiciono|adicionar|registro|registrar|lanco|lancar|uso|usar|configuro|configurar|defino|definir|vejo|ver|encontro|encontrar|acho|achar|fica|ficam|esta|estao|edito|editar|excluo|excluir|apago|apagar|conecto|conectar)\b|^(onde|como)\b|me ensina|me explica como/.test(t) && !/\d/.test(t) && !/(quanto|gastei|recebi|paguei)/.test(t)) {
    var gc = agAchaGuia(t.replace(/\b(como|onde|eu|faco|fazer|crio|criar|cadastro|cadastrar|uso|usar|vejo|ver|fica|esta|um|uma|o|a|os|as|de|do|da|no|na|meu|minha|meus|minhas)\b/g, ' ').replace(/\s+/g, ' ').trim(), dados);
    if (gc) { out.abrir = { tela: gc.tela, rotulo: 'Abrir ' + gc.rotulo, auto: false }; return finaliza('Em ' + agTextoGuia(gc, dados), 'apresentando', ['Abrir ' + gc.rotulo, 'Verificar meus dados']); }
    if (/\b(app|aplicativo|sistema|rumo)\b/.test(t)) return finaliza('Posso explicar qualquer parte do app: Painel, Lançamentos, Orçamentos, Metas, Contas, Categorias, Cartões, Investimentos, Agenda, Limites, Câmbio, Conexões, Consultor e Opções. Diga, por exemplo, "como cadastro uma meta?" ou "onde vejo meus cartões?".', 'apresentando', ['Como crio uma meta?', 'Onde vejo meus cartões?', 'Iniciar tutorial']);
  }
  if (/verific(ar|a|que)|revis(ar|e)|confer(ir|e)|inconsistenc|(tem|ha) (algum )?erro|dados (estao )?(certos|corretos)|auditar/.test(t) && /(dados|lancamentos|contas|inconsistenc|erro|tudo)/.test(t)) {
    var inc = agInconsistencias(dados);
    if (!(dados.lancamentos || []).length) return finaliza('Ainda não há lançamentos para verificar.', 'ok');
    if (!inc.length) return finaliza('Verifiquei seus lançamentos e contas e não encontrei duplicados, valores suspeitos, datas futuras ou lançamentos sem categoria. 👍', 'confirmando');
    return finaliza('Encontrei ' + inc.length + ' ponto(s) para você conferir (são só indícios; você decide o que está certo):\n' + inc.map(function (x) { return '• ' + x.txt; }).join('\n') + '\nPara corrigir, diga por exemplo "altere o valor do mercado para 80" ou "apague o lançamento do almoço" (eu peço sua confirmação).', 'analisando');
  }
  /* 2c) consultas ao app: metas, limites, contas, categorias, agenda */
  if (/\b(minhas?|meus?|quais|como estao|como esta|ver)\b.*\bmetas?\b|\bmetas?\b.*(andamento|progresso|quanto falta)/.test(t) && !/crie|criar|nova|cadastr|adicion/.test(t)) return finaliza(agMetasTxt(dados), 'analisando');
  if (/\b(meus?|quais|como estao|ver)\b.*\blimites?\b/.test(t) && !/crie|criar|novo/.test(t)) { var lm = dados.limites || []; return finaliza(lm.length ? 'Seus limites neste mês:\n' + lm.slice(0, 8).map(function (x) { return '• ' + x.nome + ': ' + agBrl(x.gasto || 0) + ' de ' + agBrl(x.limite || 0) + (x.pct !== undefined ? ' (' + x.pct + '%)' : ''); }).join('\n') : 'Você ainda não definiu limites. Abra Limites para criar o primeiro.', 'analisando', lm.length ? [] : ['Abrir Limites']); }
  if (/\b(minhas|quais|listar|liste)\b.*\bcontas\b|\bcontas (que )?(eu )?tenho\b/.test(t) && !/\d|compr|pagar|comprometer/.test(t)) return finaliza((dados.contas || []).length ? 'Suas contas:\n' + dados.contas.map(function (c) { return '• ' + c.nome + ' (' + c.tipo + '): ' + agBrl(c.saldo); }).join('\n') : 'Você ainda não tem contas.', 'analisando');
  if (/\b(minhas|quais|listar|liste)\b.*\bcategorias\b/.test(t)) { var cs = (dados.categorias || []).filter(function (c) { return !c.arquivada; }); return finaliza('Categorias de despesa: ' + cs.filter(function (c) { return c.tipo === 'despesa'; }).map(function (c) { return c.nome; }).join(', ') + '.\nCategorias de receita: ' + cs.filter(function (c) { return c.tipo === 'receita'; }).map(function (c) { return c.nome; }).join(', ') + '.', 'analisando'); }
  if (/(proximos?|pendentes?|a pagar|vencimentos?|agenda)/.test(t) && /(contas|pagar|vencimento|agenda|proximos|pendente)/.test(t) && !/crie|adicione|lance/.test(t)) { var ag = dados.agendaPendentes || []; return finaliza(ag.length ? 'Pendências na agenda:\n' + ag.slice(0, 8).map(function (x) { return '• ' + (x.data ? agDataBR(x.data) + ' ' : '') + (x.descricao || '(sem descrição)') + ': ' + agBrl(x.valor || 0); }).join('\n') : 'Nada pendente na agenda.', 'analisando'); }
  /* 2d) criar meta / categoria (ferramentas validadas, com auditoria e desfazer) */
  if ((m = t.match(/^(?:crie|criar|cria|nova|novo|quero criar|quero uma|cadastre|cadastrar|adicione|adicionar|adiciona)\s+(?:uma |a )?meta(?:\s+(?:de|para|chamada|chamado|:))?\s*(.*)$/))) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar. Dá para reativar em Opções › Rumi.', 'problema');
    var vm = agValor(tk, []), nomeTk = [], resto = m[1] ? agOriginais(m[1]) : [];
    var usadosM = {}; if (vm) { for (i = vm.de; i <= vm.ate; i++) usadosM[i] = 1; }
    var tkAll = tk, pos = tkAll.indexOf('meta');
    resto = tkAll.map(function (w, ix) { return { w: w, ix: ix }; }).filter(function (o) { return o.ix > pos && !usadosM[o.ix] && !AG_STOP[o.w] && o.w !== 'meta' && o.w !== 'valor' && o.w !== 'chamada'; }).map(function (o) { return agOriginais(orig)[o.ix].replace(/[,.;!?]+$/, ''); });
    var nomeM = agCap(resto.join(' ').slice(0, 60));
    if (vm && vm.ambiguo && dados.valorConfirmado !== vm.valor) { estado.pendente = { tipo: 'confirmar_valor', texto: orig, valor: vm.valor, expira: dados.expira }; return finaliza('Entendi o valor ' + agBrl(vm.valor) + ' (' + (vm.motivo || 'formato ambíguo') + '). Está certo? (sim/não)', 'identificando', ['Sim', 'Não']); }
    if (!nomeM) { estado.pendente = { tipo: 'perguntar', falta: 'meta_nome', slots: { valor: vm ? vm.valor : null }, expira: dados.expira }; return finaliza('Qual é o nome da meta? (ex.: Viagem, Reserva de emergência)', 'espera'); }
    if (!vm) { estado.pendente = { tipo: 'perguntar', falta: 'meta_valor', slots: { nome: nomeM }, expira: dados.expira }; return finaliza('Qual é o valor alvo da meta "' + nomeM + '"?', 'espera'); }
    if ((dados.metas || []).some(function (x) { return agNorm(x.nome) === agNorm(nomeM); })) return finaliza('Já existe uma meta chamada "' + nomeM + '". Escolha outro nome ou abra Metas para editar.', 'problema');
    out.acoes = [{ op: 'criar_meta', dados: { nome: nomeM, valorAlvo: vm.valor } }];
    return finaliza('Meta criada: ' + nomeM + ', alvo de ' + agBrl(vm.valor) + '. Você pode registrar aportes na aba Metas.', 'confirmando');
  }
  if ((m = t.match(/^(?:crie|criar|cria|nova|novo|cadastre|cadastrar|adicione|adicionar|adiciona)\s+(?:uma |a )?categoria\s+(?:de |para |chamada |:)?\s*(.+)$/))) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar. Dá para reativar em Opções › Rumi.', 'problema');
    var recC = /\b(receita|entrada)\b/.test(m[1]), nomeC = agCap(agOriginais(orig).slice(agTokens(orig).indexOf('categoria') + 1).filter(function (w) { var n = agNorm(w); return !AG_STOP[n] && n !== 'categoria' && n !== 'receita' && n !== 'despesa' && n !== 'chamada'; }).join(' ').replace(/[,.;!?]+$/, '').slice(0, 40));
    if (!nomeC) return finaliza('Qual é o nome da categoria? Ex.: "criar categoria Pets".', 'espera');
    var tpC = recC ? 'receita' : 'despesa';
    if (agCatPorNome(dados, nomeC, tpC)) return finaliza('Já existe a categoria "' + nomeC + '" de ' + tpC + '.', 'problema');
    out.acoes = [{ op: 'criar_categoria', dados: { nome: nomeC, tipo: tpC } }];
    return finaliza('Categoria criada: ' + nomeC + ' (' + tpC + ').' + (recC ? '' : ' Se for de receita, diga "criar categoria ' + nomeC + ' de receita".'), 'confirmando');
  }

  /* 3) Modo Contador */
  var foco = null;
  if (/modo contador|relatorio|analise completa|diagnostico|me de um panorama|resumo financeiro/.test(t)) foco = 'relatorio';
  else if (/situacao (financeira|das minhas financas)|como (estao|esta) (minhas|as minhas|minha|a minha) (financas|situacao|vida financeira)|como estou (de dinheiro|financeiramente)|minhas financas/.test(t)) foco = 'situacao';
  else if (/(gastando|gasto|gastei) mais (do )?que (ganho|recebo|recebi|ganhei)|gastando demais|no vermelho|fechando no negativo/.test(t)) foco = 'gastando_mais';
  else if (/quanto (eu )?(posso|dá pra|da pra|consigo) gastar|quanto (me )?(resta|sobra|falta)|quanto tenho (livre|disponivel|pra gastar)|posso gastar quanto/.test(t)) foco = 'quanto_posso';
  else if (/(consigo|posso|da pra|da para|cabe|dá pra) (comprar|pagar|gastar|parcelar)|compro algo|devo comprar/.test(t) && /\d|mil|reais|conto|cem|duzent|quinhent/.test(t)) foco = 'posso_comprar';
  else if (/onde (eu )?(estou|to|tou) gastando|(maiores|principais) (gastos|despesas)|que categoria(s)? (mais )?(gasto|pesa|consome)|em que (eu )?gasto mais|para onde (vai|foi) (meu|o) dinheiro/.test(t)) foco = 'onde_gasto';
  else if (/(despesas|gastos|contas) (fixas|recorrentes)|recorrente|assinaturas que|o que se repete/.test(t) && !/lance|registr/.test(t)) foco = 'recorrentes';
  else if (/desperdic|gastos? (a toa|desnecessario|inutil)|onde (posso|da pra) economizar|onde cortar|como economizar/.test(t)) foco = 'desperdicio';
  else if (/evolucao (das|de) (minhas )?economias|minhas economias|quanto (estou |to )?(guardando|economizando)|taxa de poupanca/.test(t)) foco = 'economias';
  else if (/projecao|previsao|como (vou|vai) fechar|vou fechar o mes|fim do mes.*(gastos|fechar)/.test(t)) foco = 'projecao';
  if (foco) {
    var ex = {}; if (foco === 'posso_comprar') { var vv = agValor(tk, []); ex.valor = vv ? vv.valor : null; }
    var rc = agContador(dados, foco, ex); out.relatorio = rc.analise; return finaliza(rc.texto, foco === 'situacao' || foco === 'relatorio' ? 'apresentando' : 'analisando', foco === 'situacao' || foco === 'relatorio' ? ['Onde estou gastando mais?', 'Quanto posso gastar até o fim do mês?', 'Onde posso economizar?'] : AG_SUGESTOES);
  }

  /* 4) consultas simples */
  if (/qual (e )?(o )?(meu )?saldo|quanto (eu )?tenho( na conta| em conta| de saldo)?$|saldo( total| das contas| atual)?$|^saldo\b/.test(t) && !/gast|receb/.test(t)) {
    if (!temContas) return finaliza('Você ainda não tem contas cadastradas.', 'problema');
    var tot = (dados.contas || []).reduce(function (a, c) { return a + c.saldo; }, 0);
    return finaliza('Saldo total: ' + agBrl(tot) + '.\n' + (dados.contas || []).map(function (c) { return '• ' + c.nome + ': ' + agBrl(c.saldo); }).join('\n'), 'analisando');
  }
  if (/(ultimos|ultimas|recentes) (lancamentos|gastos|movimentacoes|compras)|extrato|ultimas movimentacoes/.test(t)) {
    var ls = (dados.lancamentos || []).slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 6);
    return finaliza(ls.length ? 'Últimos lançamentos:\n' + ls.map(function (l) { return '• ' + agDataBR(l.data) + ' ' + (l.descricao || '(sem descrição)') + ': ' + (l.tipo === 'despesa' ? '−' : '+') + agBrl(l.valor); }).join('\n') : 'Ainda não há lançamentos.', 'analisando');
  }
  var fu = estado.ctx && estado.ctx.gasto ? t.match(/^(?:e|e o|e a|e os|e as|e no|e na|e em|e com|e de)\s+(.+)$/) : null;
  if (fu && tk.length <= 6) {   // "e no mês passado?" / "e com mercado?" reaproveita a última consulta
    var perF = agPeriodo(fu[1], dados.hoje), catN = agAcharCategoriaNaFrase(agTokens(fu[1]).filter(function (w) { return !AG_MESES[w] && ['mes', 'passado', 'hoje', 'ontem', 'semana'].indexOf(w) < 0; }), dados), g0 = estado.ctx.gasto;
    if (perF.explicito || catN) { var per2 = perF.explicito ? perF : { de: g0.de, ate: g0.ate, rotulo: g0.rotulo }, cat2c = catN || (g0.catIds ? { ids: g0.catIds, nome: g0.catNome } : null); estado.ctx.gasto = { tipo: g0.tipo, de: per2.de, ate: per2.ate, rotulo: per2.rotulo, catIds: cat2c ? cat2c.ids : null, catNome: cat2c ? cat2c.nome : '' }; return finaliza(agRespondeGasto(dados, g0.tipo, cat2c, per2), 'analisando', AG_SUGESTOES); }
  }
  if (/quanto (eu )?(gastei|gastamos|gasto|recebi|ganhei|entrou|paguei|sai[ur])|total de (gastos|despesas|receitas)|(minhas )?(despesas|receitas|gastos) (de|do|da|em|neste|este|esse|no)\b/.test(t) && !/lance|registr|adicione/.test(t)) {
    var per = agPeriodo(t, dados.hoje), rec = /recebi|ganhei|entrou|receita/.test(t) && !/gast|despesa|paguei/.test(t), tipoC = rec ? 'receita' : 'despesa';
    var tokensSemPer = tk.filter(function (w) { return !AG_MESES[w]; }), catF = agAcharCategoriaNaFrase(tokensSemPer.filter(function (w) { return ['mes', 'passado', 'hoje', 'ontem', 'semana'].indexOf(w) < 0; }), dados);
    estado.ctx = Object.assign({}, estado.ctx, { gasto: { tipo: tipoC, de: per.de, ate: per.ate, rotulo: per.rotulo, catIds: catF ? catF.ids : null, catNome: catF ? catF.nome : '' } });
    return finaliza(agRespondeGasto(dados, tipoC, catF, per), 'analisando', AG_SUGESTOES);
  }

  /* 5) alterar / excluir */
  var vAlt = /^(altere|alterar|altera|mude|muda|mudar|corrija|corrigir|troque|trocar|atualize|atualizar|edite|editar|modifique)\b/.test(t), vExc = /^(exclua|excluir|apague|apagar|remova|remover|delete|deletar|tire|retire)\b/.test(t);
  if ((vAlt || vExc) && !/^(apague|exclua|remova|delete).*(memoria|conversa|historico)/.test(t)) {
    var tipoF = /\breceita\b|\bentrada\b/.test(t) ? 'receita' : (/\bdespesa\b|\bgasto\b|\bsaida\b/.test(t) ? 'despesa' : null);
    var vl = agValor(tk, []), campo = /categoria/.test(t) ? 'categoria' : (/\bdata\b/.test(t) ? 'data' : (/descricao|\bnome\b/.test(t) ? 'descricao' : 'valor'));
    var iPara = tk.indexOf('para') >= 0 ? tk.indexOf('para') : (tk.indexOf('pra') >= 0 ? tk.indexOf('pra') : -1), antes = iPara >= 0 ? tk.slice(0, iPara) : tk, depois = iPara >= 0 ? tk.slice(iPara + 1) : [];
    var ignore = { altere: 1, alterar: 1, altera: 1, mude: 1, muda: 1, mudar: 1, corrija: 1, corrigir: 1, troque: 1, trocar: 1, atualize: 1, atualizar: 1, edite: 1, editar: 1, modifique: 1, exclua: 1, excluir: 1, apague: 1, apagar: 1, remova: 1, remover: 1, delete: 1, deletar: 1, tire: 1, retire: 1, valor: 1, categoria: 1, data: 1, descricao: 1, nome: 1, despesa: 1, receita: 1, gasto: 1, lancamento: 1, entrada: 1, saida: 1, ultimo: 1, ultima: 1 };
    var alvoTk = antes.filter(function (w) { return !ignore[w] && !/^\d/.test(w) && !AG_STOP[w]; });
    var vAlvo = vExc ? (vl ? vl.valor : null) : null;
    var alvo = null;
    if (!alvoTk.length && /ultimo|ultima/.test(t) && estado.ultimo && estado.ultimo.lancId) alvo = (dados.lancamentos || []).filter(function (l) { return l.id === estado.ultimo.lancId; })[0] || null;
    else alvo = agAcharLanc(dados, alvoTk, tipoF, vAlvo);
    if (!alvo) return finaliza('Não encontrei um lançamento parecido com "' + (alvoTk.join(' ') || '...') + '" nos últimos 5 meses. Diga o nome como aparece na lista (por exemplo "internet") e, se quiser, o valor.', 'problema');
    if (vExc) {
      if (!perm.excluir) return finaliza('Você desativou minha permissão de excluir lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
      estado.pendente = { tipo: 'confirmar', acoes: [{ op: 'excluir', id: alvo.id }], respostaOk: 'Excluído: ' + agDescLanc(dados, alvo) + '. Se foi engano, diga "desfazer".', expira: dados.expira };
      return finaliza('Vou excluir: ' + agDescLanc(dados, alvo) + '.\nConfirma? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    if (!perm.editar) return finaliza('Você desativou minha permissão de editar lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
    var mud = {}, resumoMud = '';
    if (campo === 'valor') { var nv = agValor(depois.length ? depois : tk.filter(function (_, i) { return true; }), []); if (!nv || !(nv.valor > 0)) return finaliza('Para qual valor devo alterar? Por exemplo: "altere a internet para R$ 110".', 'problema'); mud.valor = nv.valor; resumoMud = 'valor ' + agBrl(alvo.valor) + ' → ' + agBrl(nv.valor); }
    else if (campo === 'categoria') { var cn2 = agAcharCategoriaNaFrase(depois, dados); if (!cn2 || !cn2.ids.length) return finaliza('Para qual categoria? Diga o nome de uma categoria sua (por exemplo Mercado, Transporte).', 'problema'); var cobj = (dados.categorias || []).filter(function (c) { return c.id === cn2.ids[0]; })[0]; if (cobj.tipo !== alvo.tipo) return finaliza('A categoria ' + cobj.nome + ' é de ' + cobj.tipo + ' e o lançamento é de ' + alvo.tipo + '.', 'problema'); mud.categoriaId = cobj.id; resumoMud = 'categoria → ' + cobj.nome; }
    else if (campo === 'data') { var dd = agData(depois, dados.hoje); if (!dd.explicita) return finaliza('Para qual data? Por exemplo: "altere a data da internet para dia 10".', 'problema'); mud.data = dd.data; resumoMud = 'data ' + agDataBR(alvo.data) + ' → ' + agDataBR(dd.data); }
    else { var nd = agOriginais(orig); var pos = nd.findIndex(function (w) { return /^(para|pra)$/i.test(w); }); var novaD = pos >= 0 ? agCap(nd.slice(pos + 1).join(' ').replace(/[.!]+$/, '')) : ''; if (!novaD) return finaliza('Qual deve ser a nova descrição?', 'problema'); mud.descricao = novaD.slice(0, 200); resumoMud = 'descrição → "' + mud.descricao + '"'; }
    var depoisL = Object.assign({}, alvo, mud, mud.categoriaId ? { categoriaId: mud.categoriaId } : {});
    estado.pendente = { tipo: 'confirmar', acoes: [{ op: 'alterar', id: alvo.id, mudancas: mud }], respostaOk: 'Alterado: ' + agDescLanc(dados, depoisL) + '.', expira: dados.expira };
    return finaliza('Vou alterar ' + agDescLanc(dados, alvo) + ':\n• ' + resumoMud + '\nConfirma? (sim/não)', 'identificando', ['Sim', 'Não']);
  }

  /* 6) aporte (mover dinheiro para uma conta de investimentos) */
  if ((m = t.match(/^(adicione|adicionar|adiciona|coloque|colocar|deposite|depositar|transfira|transferir|aporte|aportar|invista|investir|guarde|guardar|ponha)\b/)) && /(na|em|para|pra|no) (minha )?(conta|carteira|investiment|poupanca|reserva)|conta de (investimento|poupanca)/.test(t)) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar lançamentos.', 'problema');
    var va = agValor(tk, []); if (!va) return finaliza('Qual o valor do aporte?', 'espera');
    var cdest = agContaDe(tk, dados);
    var invest = (dados.contas || []).filter(function (c) { return c.tipo === 'investimento' || c.tipo === 'poupanca' || c.tipo === 'reserva'; });
    var destino = cdest && cdest.explicita ? cdest.conta : (invest.length === 1 ? invest[0] : null);
    if (!destino) return finaliza('Em qual conta devo registrar o aporte? Suas contas: ' + (dados.contas || []).map(function (c) { return c.nome; }).join(', ') + '.', 'espera');
    var origemT = null, mO = t.match(/\b(?:de|da|do|usando|saindo d[aeo]) (?:minha )?(?:conta )?(.+)$/), origC = mO ? agContaDe(agTokens(mO[1]), dados) : null; if (origC && origC.explicita && origC.conta.id !== destino.id) origemT = origC.conta;
    if (!origemT) { estado.pendente = { tipo: 'perguntar', falta: 'conta_origem', slots: { valor: va.valor, destinoId: destino.id, data: agData(tk, dados.hoje).data }, expira: dados.expira }; return finaliza('Aporte de ' + agBrl(va.valor) + ' em ' + destino.nome + '. De qual conta o dinheiro saiu? (' + (dados.contas || []).filter(function (c) { return c.id !== destino.id; }).map(function (c) { return c.nome; }).join(', ') + ') Se não saiu de nenhuma conta do app, responda "só registrar".', 'espera', (dados.contas || []).filter(function (c) { return c.id !== destino.id; }).map(function (c) { return c.nome; }).concat(['Só registrar'])); }
    return agMontaAporte(out, estado, dados, va.valor, destino, origemT, agData(tk, dados.hoje).data);
  }

  /* 7) lançamento (gastei / recebi / "almoço 45") */
  var L = agParseLancamento(orig, dados);
  var ehLanc = L.valor && (L.temVerbo || (L.tipo && L.ntk <= 7 && !/\?/.test(orig)) || /^[+-]/.test(tk[0] || ''));
  var ehNotificacao = L.valor && /(compra aprovada|compra no cartao|pix (enviado|recebido)|transferencia (enviada|recebida)|pagamento (de|da|do|realizado|efetuado)|debito|voce (pagou|recebeu|transferiu))|\bcompra\b.*r\$/.test(t);
  if (ehNotificacao) { L = agParseNotificacao(orig, dados) || L; ehLanc = !!L.valor; }
  if (ehLanc) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
    if (!temContas) return finaliza('Você ainda não tem nenhuma conta. Crie uma na aba Contas e eu registro daí em diante.', 'problema');
    if (!L.tipo) { estado.pendente = { tipo: 'perguntar', falta: 'tipo', slots: { valor: L.valor, data: L.data, descricao: L.descricao, contaId: L.conta.conta.id }, expira: dados.expira }; return finaliza('Foi uma despesa (saiu dinheiro) ou uma receita (entrou)? Valor: ' + agBrl(L.valor) + '.', 'espera', ['Despesa', 'Receita']); }
    if (!isFinite(L.valor) || L.valor <= 0) return finaliza('Não consegui entender o valor. Diga, por exemplo, "R$ 3.000,00", "3k" ou "3 mil reais".', 'problema');
    if (L.valor > 100000000) return finaliza('Esse valor parece alto demais; confirme o número e tente de novo.', 'problema');
    if (L.valorAmbiguo && dados.valorConfirmado !== L.valor) {   // nunca registra valor duvidoso sem confirmação
      estado.pendente = { tipo: 'confirmar_valor', texto: orig, valor: L.valor, expira: dados.expira };
      return finaliza('Entendi o valor ' + agBrl(L.valor) + ' (' + (L.motivoValor || 'o formato é ambíguo') + '). Está certo? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    if (L.data > dados.hoje) return finaliza('Essa data está no futuro. Para compromissos futuros use a Agenda; para registrar, diga a data do gasto.', 'problema');
    if (!L.categoria) { estado.pendente = { tipo: 'perguntar', falta: 'categoria', slots: { tipo: L.tipo, valor: L.valor, data: L.data, descricao: L.descricao, contaId: L.conta.conta.id, tokensDesc: L.tokensDesc, origem: dados.origem }, expira: dados.expira };
      var opcoes = (dados.categorias || []).filter(function (c) { return !c.arquivada && c.tipo === L.tipo; }).map(function (c) { return c.nome; });
      return finaliza('Entendi ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' (' + L.descricao + ')' : '') + '. Em qual categoria registro?', 'espera', opcoes.slice(0, 8)); }
    var lan = { tipo: L.tipo, valor: L.valor, data: L.data, contaId: L.conta.conta.id, categoriaId: L.categoria.cat.id, descricao: L.descricao || L.categoria.cat.nome };
    var ap2 = L.tokensDesc.length && L.categoria.origem !== 'memoria' ? [{ tipo: 'desc', chave: L.tokensDesc.slice(0, 3).join(' '), conteudo: L.categoria.cat.nome }] : (L.tokensDesc.length ? [{ tipo: 'desc', chave: L.tokensDesc.slice(0, 3).join(' '), conteudo: L.categoria.cat.nome }] : []);
    var txt = agRespostaLanc(lan, L.categoria.cat, L.conta.conta);
    var resumoUlt = (L.tipo === 'despesa' ? 'despesa' : 'receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' (' + L.descricao + ')' : '');
    var cont = { op: 'lancar', dados: lan, ultimo: { descricao: lan.descricao, chaveDesc: L.tokensDesc.slice(0, 3).join(' '), resumo: resumoUlt } };
    var dica = L.categoria.origem === 'palavra' ? ' Não era ' + L.categoria.cat.nome + '? Se estiver errado, diga "não, é lazer" (ou outra categoria) que eu corrijo e aprendo.' : '';
    // origem WhatsApp/notificação encaminhada: sempre pede confirmação antes de registrar
    if (dados.origem === 'whatsapp' && (dados.encaminhada || ehNotificacao)) {
      estado.pendente = { tipo: 'confirmar', acoes: [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []), respostaOk: txt, expira: dados.expira };
      return finaliza('Encontrei ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' em "' + L.descricao + '"' : '') + ' (' + L.categoria.cat.nome + ', ' + agDataBR(L.data) + ', ' + L.conta.conta.nome + '). Registro no app? Responda sim ou não.', 'identificando', ['Sim', 'Não']);
    }
    if (ehNotificacao) {   // no app: mostra o que entendeu e pede confirmação
      estado.pendente = { tipo: 'confirmar', acoes: [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []), respostaOk: txt, expira: dados.expira };
      return finaliza('Li esta mensagem como ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' em "' + L.descricao + '"' : '') + ' (' + L.categoria.cat.nome + ', ' + agDataBR(L.data) + ', ' + L.conta.conta.nome + '). Registro? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    out.acoes = [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []);
    return finaliza(txt + dica, 'confirmando');
  }

  /* 8) não entendi */
  if (L.valor && !L.tipo) { estado.pendente = { tipo: 'perguntar', falta: 'tipo', slots: { valor: L.valor, data: L.data, descricao: L.descricao, contaId: temContas ? L.conta.conta.id : '' }, expira: dados.expira }; return finaliza('Vi o valor ' + agBrl(L.valor) + '. Foi uma despesa ou uma receita?', 'espera', ['Despesa', 'Receita']); }
  return finaliza('Não entendi bem' + chamado + '. Você pode dizer, por exemplo: "gastei 45 no almoço", "quanto gastei com mercado este mês?" ou "como está minha situação financeira?".', 'problema', AG_SUGESTOES);
}

function agMontaAporte(out, estado, dados, valor, destino, origem, data) {
  var catD = agCatPorNome(dados, 'Investimentos', 'receita'), catO = agCatPorNome(dados, 'Investimento', 'despesa'), ac = [];
  var desc = 'Aporte em ' + destino.nome;
  if (origem) ac.push({ op: 'lancar', dados: { tipo: 'despesa', valor: valor, data: data, contaId: origem.id, categoriaId: catO ? catO.id : '', descricao: desc } });
  ac.push({ op: 'lancar', dados: { tipo: 'receita', valor: valor, data: data, contaId: destino.id, categoriaId: catD ? catD.id : '', descricao: desc }, ultimo: { descricao: desc, chaveDesc: '', resumo: 'aporte de ' + agBrl(valor) } });
  out.acoes = ac; out.resposta = 'Aporte de ' + agBrl(valor) + ' registrado em ' + destino.nome + (origem ? ', com a saída correspondente em ' + origem.name : ' (sem saída em outra conta)') + '.'; if (origem) out.resposta = out.resposta.replace(origem.name, origem.nome);
  out.humor = 'confirmando'; return out;
}

// resposta a uma pergunta pendente
function agResponderPergunta(p, orig, t, tk, dados) {
  var s = p.slots || {};
  if (p.falta === 'tipo') {
    var tipo = /desp|saida|gast|paguei|saiu/.test(t) ? 'despesa' : (/rece|entrada|recebi|entrou|ganh/.test(t) ? 'receita' : null);
    if (!tipo) return null;
    var cat = agCategoria(agTokens(s.descricao || ''), agTokens(s.descricao || ''), tipo, dados);
    if (!cat) return { pendente: { tipo: 'perguntar', falta: 'categoria', slots: { tipo: tipo, valor: s.valor, data: s.data, descricao: s.descricao, contaId: s.contaId, tokensDesc: agTokens(s.descricao || '') }, expira: p.expira }, resposta: 'Em qual categoria registro?', sugestoes: (dados.categorias || []).filter(function (c) { return !c.arquivada && c.tipo === tipo; }).map(function (c) { return c.nome; }).slice(0, 8) };
    return agFechaLanc({ tipo: tipo, valor: s.valor, data: s.data, descricao: s.descricao, contaId: s.contaId, tokensDesc: agTokens(s.descricao || '') }, cat.cat, dados);
  }
  if (p.falta === 'categoria') {
    if (tk.length > 4 || /^(apague|exclua|altere|mude|desfaz|quanto|qual|como|gastei|recebi|paguei)/.test(t)) return null;   // frase nova, não a resposta à pergunta
    var cn = agAcharCategoriaNaFrase(tk, dados), c = null;
    (dados.categorias || []).forEach(function (x) { if (!c && !x.arquivada && x.tipo === s.tipo && (agNorm(x.nome) === t || (cn && cn.ids.indexOf(x.id) >= 0))) c = x; });
    if (!c) { var cand = (dados.categorias || []).filter(function (x) { return !x.arquivada && x.tipo === s.tipo && agNorm(x.nome).indexOf(t) === 0 && t.length >= 3; }); if (cand.length === 1) c = cand[0]; }
    if (!c) return { pendente: p, resposta: 'Não achei essa categoria. Escolha uma destas: ' + (dados.categorias || []).filter(function (x) { return !x.arquivada && x.tipo === s.tipo; }).map(function (x) { return x.nome; }).join(', ') + '.', sugestoes: [] };
    return agFechaLanc(s, c, dados);
  }
  if (p.falta === 'meta_nome') {
    var nm = agCap(orig.replace(/[,.;!?]+$/, '').slice(0, 60)); if (!nm || tk.length > 6) return null;
    if (s.valor) return { resposta: 'Meta criada: ' + nm + ', alvo de ' + agBrl(s.valor) + '. Você pode registrar aportes na aba Metas.', acoes: [{ op: 'criar_meta', dados: { nome: nm, valorAlvo: s.valor } }], humor: 'confirmando' };
    return { pendente: { tipo: 'perguntar', falta: 'meta_valor', slots: { nome: nm }, expira: p.expira }, resposta: 'Qual é o valor alvo da meta "' + nm + '"?' };
  }
  if (p.falta === 'meta_valor') {
    var vv = agValor(tk, []); if (!vv || tk.length > 5) return null;
    if (vv.ambiguo) return { pendente: p, resposta: 'Não tenho certeza do valor. Escreva de outro jeito, por exemplo "5.000,00" ou "5 mil".' };
    return { resposta: 'Meta criada: ' + s.nome + ', alvo de ' + agBrl(vv.valor) + '. Você pode registrar aportes na aba Metas.', acoes: [{ op: 'criar_meta', dados: { nome: s.nome, valorAlvo: vv.valor } }], humor: 'confirmando' };
  }
  if (p.falta === 'conta_origem') {
    var destino = (dados.contas || []).filter(function (x) { return x.id === s.destinoId; })[0];
    if (/so registr|apenas registr|nenhuma|sem saida|nao saiu/.test(t)) { var o = { resposta: '', acoes: [], estado: {}, humor: '' }; agMontaAporte(o, {}, dados, s.valor, destino, null, s.data); return { resposta: o.resposta, acoes: o.acoes, humor: 'confirmando' }; }
    var ct = agContaDe(tk, dados);
    if (ct && ct.explicita && ct.conta.id !== s.destinoId) { var o2 = { resposta: '', acoes: [] }; agMontaAporte(o2, {}, dados, s.valor, destino, ct.conta, s.data); return { resposta: o2.resposta, acoes: o2.acoes, humor: 'confirmando' }; }
    return { pendente: p, resposta: 'Não identifiquei a conta. Responda com o nome de uma conta sua ou "só registrar".', sugestoes: (dados.contas || []).map(function (c) { return c.nome; }).concat(['Só registrar']) };
  }
  return null;
}
function agFechaLanc(s, cat, dados) {
  var conta = (dados.contas || []).filter(function (c) { return c.id === s.contaId; })[0] || (dados.contas || [])[0];
  var lan = { tipo: s.tipo, valor: s.valor, data: s.data, contaId: conta.id, categoriaId: cat.id, descricao: s.descricao || cat.nome };
  var chave = (s.tokensDesc || []).slice(0, 3).join(' ');
  var acoes = [{ op: 'lancar', dados: lan, ultimo: { descricao: lan.descricao, chaveDesc: chave, resumo: (s.tipo === 'despesa' ? 'despesa' : 'receita') + ' de ' + agBrl(s.valor) } }];
  if (chave) acoes.push({ op: 'aprender', itens: [{ tipo: 'desc', chave: chave, conteudo: cat.nome }] });
  return { resposta: agRespostaLanc(lan, cat, conta) + (chave ? ' Vou lembrar que "' + chave + '" é ' + cat.nome + '.' : ''), acoes: acoes, humor: 'confirmando' };
}
// mensagens de banco / comprovantes colados ou encaminhados
function agParseNotificacao(texto, dados) {
  var tk = agTokens(texto), t = tk.join(' '), v = agValor(tk, []);
  if (!v) return null;
  var tipo = /pix recebido|recebeu|credito|transferencia recebida|deposito|recebimento/.test(t) ? 'receita' : 'despesa';
  var d = agData(tk, dados.hoje), mm = null, est = '';
  var padroes = [/\bem\s+(?!r\$|\d|valor)([A-Za-zÀ-ú0-9*&.' -]{3,40}?)(?:[.,;]|\s+(?:no valor|dia|às|as|hoje|ontem|r\$)|$)/i, /\b(?:na|no|para|de)\s+(?!r\$|\d|valor|aprovad)([A-Za-zÀ-ú0-9*&.' -]{3,40}?)(?:[.,;]|\s+(?:no valor|dia|às|as|hoje|ontem|r\$)|$)/i];
  for (var pi = 0; pi < padroes.length && !est; pi++) { mm = texto.match(padroes[pi]); if (mm) est = mm[1].trim(); }
  var estToks = agTokens(est).filter(function (w) { return !AG_STOP[w]; });
  var cat = agCategoria(estToks, tk, tipo, dados) || null, conta = agContaDe(tk, dados);
  return { tipo: tipo, valor: v.valor, data: d.data, dataExplicita: d.explicita, descricao: agCap(est || 'Compra'), tokensDesc: estToks, categoria: cat, conta: conta, temVerbo: true, ntk: tk.length };
}
/* ===== FIM DO NÚCLEO ===== */
// NLU>>

// <<AGENTE
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
// AGENTE>>

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
