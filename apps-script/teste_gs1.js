// Roda o Code.gs real em Node sobre um mock do Google. Uso: node teste_gs1.js [caminho/Code.gs]
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

const CODIGO = fs.readFileSync(process.argv[2] || path.join(__dirname, 'Code.gs'), 'utf8');
const CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
const FUSO = 'America/Sao_Paulo';

function formatDate(d, tz, fmt) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return fmt.replace(/'/g, '').replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

function novaPlanilha() {
  const abas = {};
  function aba(nome) {
    const data = [];
    return {
      _data: data,
      getLastRow() { for (let i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(v => v !== '' && v !== undefined)) return i + 1; return 0; },
      getMaxRows() { return 1000; },
      getLastColumn() { return data[0] ? data[0].length : 0; },
      setFrozenRows() {},
      deleteRow(n) { data.splice(n - 1, 1); },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          setValues(vals) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
          clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; return this; },
          setFontWeight() { return this; }, setNumberFormat() { return this; }
        };
      }
    };
  }
  return {
    getSheetByName: n => abas[n] || null,
    insertSheet: n => (abas[n] = aba(n)),
    _abas: abas
  };
}

const tokens = {};
function novoContexto() {
  const planilha = novaPlanilha();
  const cache = {};
  const ctx = {
    console, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'CLIENT_ID' ? CLIENT_ID : null) }) },
    UrlFetchApp: {
      fetch(url) {
        const t = decodeURIComponent(url.split('id_token=')[1]);
        const info = tokens[t];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: 'invalid' }) };
      }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    ContentService: { MimeType: { JSON: 'json', ICAL: 'ical' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) }
  };
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx);
  ctx._planilha = planilha;
  return ctx;
}

let ok = 0, falhas = 0;
function confere(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome); } else { falhas++; console.log('  FALHA ' + nome + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
}

function token(email, nome, extra) {
  const t = 'tok-' + email;
  tokens[t] = Object.assign({ aud: CLIENT_ID, iss: 'https://accounts.google.com', email, name: nome, email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600) }, extra || {});
  return t;
}

function chamar(ctx, acao, tk, dados) {
  const saida = ctx.doPost({ postData: { contents: JSON.stringify({ acao, token: tk, dados }) } });
  return JSON.parse(saida.getContent());
}

const hoje = formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const mesAtual = hoje.slice(0, 7);
function mesRel(k) { const p = mesAtual.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1 + k, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }

(function main() {
  const ctx = novoContexto();
  const A = token('a@x.com', 'Ana');
  const B = token('b@x.com', 'Bruno');

  console.log('Login e cadastro');
  confere('GET responde versão', JSON.parse(ctx.doGet().getContent()).ok === true);
  confere('sem token é recusado', chamar(ctx, 'listar_contas', '', {}).erro === 'nao_autenticado');
  confere('token inválido é recusado', chamar(ctx, 'listar_contas', 'lixo', {}).erro === 'token_invalido');
  confere('aud errado é recusado', chamar(ctx, 'iniciar', token('c@x.com', 'C', { aud: 'outro' }), {}).erro === 'token_invalido');
  confere('token expirado é recusado', chamar(ctx, 'iniciar', token('d@x.com', 'D', { exp: String(Math.floor(Date.now() / 1000) - 10) }), {}).erro === 'token_invalido');
  confere('e-mail não verificado é recusado', chamar(ctx, 'iniciar', token('e@x.com', 'E', { email_verified: 'false' }), {}).erro === 'token_invalido');
  confere('ação desconhecida', chamar(ctx, 'xpto', A, {}).erro === 'acao_desconhecida');
  confere('sem cadastro antes de iniciar', chamar(ctx, 'listar_contas', A, {}).erro === 'sem_cadastro');
  const ini = chamar(ctx, 'iniciar', A, {});
  confere('iniciar cria usuário', ini.ok && ini.dados.novo === true);
  confere('segundo iniciar não duplica', chamar(ctx, 'iniciar', A, {}).dados.novo === false);
  chamar(ctx, 'iniciar', B, {});
  ctx.autorizar();
  confere('autorizar cria as 12 abas', Object.keys(ctx._planilha._abas).sort().join(',') === 'Agenda,Alertas,Ativos,Categorias,Consultor,Contas,Feeds,Lancamentos,Limites,Metas,Orcamentos,Usuarios', Object.keys(ctx._planilha._abas));
  const catsA = chamar(ctx, 'listar_categorias', A, {}).dados;
  confere('categorias padrão (29 = 24 de despesa + 5 de receita)', catsA.length === 29);
  const contasA = chamar(ctx, 'listar_contas', A, {}).dados;
  confere('conta Carteira criada', contasA.length === 1 && contasA[0].nome === 'Carteira');
  const nomeCat = n => catsA.find(c => c.nome === n).id;

  console.log('Contas, categorias e lançamentos');
  const cc = chamar(ctx, 'salvar_conta', A, { nome: 'Nubank', tipo: 'corrente', saldoInicial: '1.000,50' }).dados;
  confere('saldo inicial com vírgula', cc.saldoInicial === 1000.5);
  const rv = chamar(ctx, 'salvar_conta', A, { nome: 'Reserva', tipo: 'reserva', saldoInicial: 200 }).dados;
  confere('tipo inválido vira corrente', chamar(ctx, 'salvar_conta', A, { nome: 'Z', tipo: 'xx' }).dados.tipo === 'corrente');
  const d1 = (mes, dia) => mes + '-' + String(dia).padStart(2, '0');
  const primeiro = mesAtual + '-01';
  const l1 = chamar(ctx, 'salvar_lancamento', A, { data: primeiro, tipo: 'receita', valor: 3000, contaId: cc.id, categoriaId: nomeCat('Salário'), descricao: 'Salário' });
  confere('salvar receita', l1.ok && l1.dados.valor === 3000);
  confere('valor negativo recusado', chamar(ctx, 'salvar_lancamento', A, { data: primeiro, tipo: 'despesa', valor: -5, contaId: cc.id }).erro === 'valor_invalido');
  confere('data inválida recusada', chamar(ctx, 'salvar_lancamento', A, { data: '2026-02-30', tipo: 'despesa', valor: 5, contaId: cc.id }).erro === 'data_invalida');
  confere('conta de outro usuário recusada', chamar(ctx, 'salvar_lancamento', B, { data: primeiro, tipo: 'despesa', valor: 5, contaId: cc.id }).erro === 'conta_invalida');
  const inj = chamar(ctx, 'salvar_lancamento', A, { data: primeiro, tipo: 'despesa', valor: 10, contaId: cc.id, descricao: '=HYPERLINK("http://x")' });
  confere('fórmula é neutralizada', inj.ok && inj.dados.descricao.charAt(0) === "'");
  chamar(ctx, 'excluir_lancamento', A, { id: inj.dados.id });
  confere('excluir lançamento', chamar(ctx, 'listar_lancamentos', A, { mes: mesAtual }).dados.every(l => l.id !== inj.dados.id));

  console.log('Privacidade entre usuários');
  const lb = chamar(ctx, 'listar_lancamentos', B, { mes: mesAtual }).dados;
  confere('B não vê lançamentos de A', lb.length === 0);
  confere('B não vê contas de A', chamar(ctx, 'listar_contas', B, {}).dados.every(c => c.nome === 'Carteira'));
  confere('B não exclui lançamento de A', chamar(ctx, 'excluir_lancamento', B, { id: l1.dados.id }).erro === 'nao_encontrado');
  confere('B não edita conta de A', chamar(ctx, 'salvar_conta', B, { id: cc.id, nome: 'Hack' }).erro === 'nao_encontrado');
  confere('saídas não expõem e-mail', !JSON.stringify(chamar(ctx, 'listar_contas', A, {})).includes('@x.com') && !JSON.stringify(chamar(ctx, 'exportar_dados', A, {})).includes('@x.com'));

  console.log('Importação idempotente');
  const linhas = [
    { data: primeiro, tipo: 'despesa', valor: 250, descricao: 'Mercado', categoriaId: nomeCat('Alimentação') },
    { data: primeiro, tipo: 'despesa', valor: 12.5, descricao: 'Café' },
    { data: primeiro, tipo: 'despesa', valor: 12.5, descricao: 'Café' },
    { data: 'ruim', tipo: 'despesa', valor: 1, descricao: 'x' }
  ];
  const i1 = chamar(ctx, 'importar_lancamentos', A, { contaId: cc.id, linhas }).dados;
  confere('importa 3 e rejeita 1', i1.importadas === 3 && i1.invalidas.length === 1, i1);
  const i2 = chamar(ctx, 'importar_lancamentos', A, { contaId: cc.id, linhas }).dados;
  confere('reimportar não duplica', i2.importadas === 0 && i2.ignoradas === 3, i2);
  confere('muitas linhas recusadas', chamar(ctx, 'importar_lancamentos', A, { contaId: cc.id, linhas: new Array(501).fill(linhas[0]) }).erro === 'muitas_linhas');

  console.log('Orçamento, metas e consultor');
  const orc = chamar(ctx, 'salvar_orcamento', A, { categoriaId: nomeCat('Alimentação'), mes: mesAtual, limite: 200 });
  confere('salvar orçamento', orc.ok);
  chamar(ctx, 'salvar_orcamento', A, { categoriaId: nomeCat('Alimentação'), mes: mesAtual, limite: 220 });
  confere('orçamento atualiza sem duplicar', chamar(ctx, 'listar_orcamentos', A, { mes: mesAtual }).dados.length === 1);
  chamar(ctx, 'salvar_meta', A, { nome: 'Viagem', valorAlvo: 5000, valorAtual: 500, prazo: '2020-01-01' });
  chamar(ctx, 'salvar_meta', A, { nome: 'Notebook', valorAlvo: 4000, valorAtual: 0, prazo: mesRel(6) + '-15' });
  // histórico: Netflix em 3 meses anteriores
  [1, 2, 3].forEach(k => chamar(ctx, 'salvar_lancamento', A, { data: d1(mesRel(-k), 10), tipo: 'despesa', valor: 39.9, contaId: cc.id, categoriaId: nomeCat('Assinaturas'), descricao: 'Netflix' }));
  chamar(ctx, 'salvar_lancamento', A, { data: d1(mesRel(-1), 12), tipo: 'despesa', valor: 900, contaId: cc.id, categoriaId: nomeCat('Moradia/Aluguel'), descricao: 'Aluguel' });
  chamar(ctx, 'salvar_lancamento', A, { data: primeiro, tipo: 'despesa', valor: 2800, contaId: cc.id, categoriaId: nomeCat('Moradia/Aluguel'), descricao: 'Aluguel e contas' });
  const con = chamar(ctx, 'consultor', A, { mes: mesAtual }).dados;
  const titulos = con.dicas.map(x => x.titulo).join(' | ');
  confere('alerta de gastos acima da renda', con.dicas.some(x => x.nivel === 'alerta' && x.titulo === 'Gastos acima da renda'), titulos);
  confere('alerta de orçamento estourado', con.dicas.some(x => x.titulo.startsWith('Orçamento estourado')), titulos);
  confere('meta atrasada', con.dicas.some(x => x.titulo === 'Meta atrasada: Viagem'), titulos);
  confere('meta com valor mensal', con.dicas.some(x => x.titulo === 'Meta: Notebook' && /por mês/.test(x.texto)), titulos);
  confere('possível assinatura', con.dicas.some(x => x.titulo === 'Possível assinatura: Netflix'), titulos);
  confere('reserva abaixo de 3 meses', con.dicas.some(x => x.titulo === 'Reserva abaixo de 3 meses'), titulos);
  confere('alertas vêm primeiro', con.dicas[0].nivel === 'alerta');
  confere('aviso educativo presente', /Não é recomendação de investimento/.test(con.aviso));
  const res = chamar(ctx, 'resumo', A, { mes: mesAtual }).dados;
  confere('resumo: receitas', res.receitas === 3000, res);
  confere('resumo: série de 6 meses', res.serie.length === 6);
  confere('resumo: categoria líder é Moradia/Aluguel', res.porCategoria[0].nome === 'Moradia/Aluguel', res.porCategoria);
  const sc = chamar(ctx, 'listar_contas', A, {}).dados.find(c => c.id === cc.id).saldo;
  confere('saldo da conta (1000,50 + 3000 - despesas)', Math.abs(sc - (1000.5 + 3000 - 250 - 25 - 39.9 * 3 - 900 - 2800)) < 0.01, sc);
  confere('conta em uso não exclui', chamar(ctx, 'excluir_conta', A, { id: cc.id }).erro === 'em_uso');
  confere('categoria em uso não exclui', chamar(ctx, 'excluir_categoria', A, { id: nomeCat('Moradia/Aluguel') }).erro === 'em_uso');

  console.log('LGPD');
  const exp = chamar(ctx, 'exportar_dados', A, {}).dados;
  confere('exporta lançamentos', exp.Lancamentos.length > 5);
  confere('apagar exige confirmação', chamar(ctx, 'apagar_conta_usuario', A, {}).erro === 'confirmacao');
  const antesB = chamar(ctx, 'listar_contas', B, {}).dados.length;
  confere('apagar conta do usuário', chamar(ctx, 'apagar_conta_usuario', A, { confirmar: 'APAGAR' }).ok);
  confere('A fica sem cadastro', chamar(ctx, 'listar_contas', A, {}).erro === 'sem_cadastro');
  confere('dados de B intactos', chamar(ctx, 'listar_contas', B, {}).dados.length === antesB);
  const todos = JSON.stringify(Object.values(ctx._planilha._abas).map(a => a._data));
  confere('nada de A restou nas abas', !todos.includes('a@x.com'));

  console.log('\n' + ok + ' ok, ' + falhas + ' FALHA(S)');
  process.exit(falhas ? 1 : 0);
})();
