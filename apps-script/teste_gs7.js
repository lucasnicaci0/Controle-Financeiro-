// Open Finance (back-end, Pluggy simulada): consentimento, vínculo seguro, importação, categorização, duplicados, revogação. Uso: node teste_gs7.js
const { novoContexto, token, chamar, confere, resultado, formatDate, FUSO } = require('./mock_google.js');
const hoje = formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const dia = n => formatDate(new Date(Date.now() - n * 864e5), FUSO, 'yyyy-MM-dd');
const ctx = novoContexto(); ctx.autorizar();
const A = token('ana@teste.com', 'Ana'), B = token('bia@teste.com', 'Bia');
const R = (a, tk, d) => chamar(ctx, a, tk, d || {});
R('iniciar', A); R('iniciar', B);
let chamadas = [], itens = {}, fora = false, auths = 0;
const txs = [
  { id: 't1', description: 'IFOOD *RESTAURANTE', amount: -45.9, type: 'DEBIT', date: dia(3) + 'T10:00:00Z', category: 'Eating out' },
  { id: 't2', description: 'UBER *TRIP', amount: -22, type: 'DEBIT', date: dia(2) + 'T10:00:00Z' },
  { id: 't3', description: 'SALARIO EMPRESA XYZ', amount: 5000, type: 'CREDIT', date: dia(5) + 'T10:00:00Z' },
  { id: 't4', description: 'LOJA DESCONHECIDA', amount: -80, type: 'DEBIT', date: dia(4) + 'T10:00:00Z' },
  { id: 't5', description: 'PAGAMENTO DE FATURA', amount: -1200, type: 'DEBIT', date: dia(1) + 'T10:00:00Z' },
  { id: 't6', description: 'Mercado do Zé', amount: -100, type: 'DEBIT', date: dia(6) + 'T10:00:00Z' }
];
ctx.pluggy = (url, op) => {
  chamadas.push({ url, op });
  if (fora) return { codigo: 503, corpo: {} };
  if (/\/auth$/.test(url)) { auths++; return { codigo: 200, corpo: { apiKey: 'KEY' + auths } }; }
  if (/\/connect_token$/.test(url)) return { codigo: 200, corpo: { accessToken: 'CT-' + JSON.parse(op.payload).options.clientUserId } };
  let m = url.match(/\/items\/([^/?]+)$/);
  if (m && op.method === 'get') return itens[m[1]] ? { codigo: 200, corpo: itens[m[1]] } : { codigo: 404, corpo: {} };
  if (m && op.method === 'delete') { delete itens[m[1]]; return { codigo: 200, corpo: {} }; }
  if (/\/accounts\?/.test(url)) return { codigo: 200, corpo: { results: [
    { id: 'ac1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Corrente', balance: 3000, currencyCode: 'BRL' },
    { id: 'ac2', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão Gold', balance: 800, creditData: { creditLimit: 5000, balanceCloseDate: '2026-11-10', balanceDueDate: '2026-11-17' } }] } };
  if (/\/transactions\?accountId=ac1/.test(url)) return { codigo: 200, corpo: { results: txs } };
  if (/\/transactions\?accountId=ac2/.test(url)) return { codigo: 200, corpo: { results: [{ id: 'c1', description: 'AMAZON MARKETPLACE', amount: 150, type: 'DEBIT', date: dia(2) }, { id: 'c2', description: 'PAGAMENTO RECEBIDO', amount: 1200, type: 'CREDIT', date: dia(1) }] } };
  return { codigo: 404, corpo: {} };
};
const cuid = email => 'rumo-' + require('crypto').createHash('sha256').update(email).digest('base64url').slice(0, 24);

console.log('Configuração e consentimento');
let st = R('of_status', A).dados;
confere('sem credenciais: não configurado, sem conexões, com texto de consentimento', st.configurado === false && st.conexoes.length === 0 && st.consentimento.texto.length >= 4 && /senha/.test(st.consentimento.texto.join(' ')), st);
confere('sem credenciais, conectar falha com mensagem clara', R('of_token', A, { consentimento: true }).erro === 'of_nao_configurado');
ctx.props = { PLUGGY_CLIENT_ID: 'cid', PLUGGY_CLIENT_SECRET: 'sec' };
confere('com credenciais: configurado', R('of_status', A).dados.configurado === true);
confere('sem aceitar o consentimento não gera token', R('of_token', A, {}).erro === 'sem_consentimento' && R('of_token', A, { consentimento: 'true' }).erro === 'sem_consentimento');
const tk = R('of_token', A, { consentimento: true }).dados;
confere('gera token do widget amarrado ao usuário (sem expor segredo)', /^CT-rumo-/.test(tk.connectToken) && !JSON.stringify(tk).includes('sec'), tk);
confere('credenciais vão só ao /auth e nunca ao navegador', chamadas.filter(c => /\/auth$/.test(c.url)).length === 1 && !JSON.stringify(R('of_status', A)).includes('"sec"'));
confere('chave da API é reaproveitada (cache) entre chamadas', (() => { R('of_token', A, { consentimento: true }); return auths === 1; })());

console.log('Vínculo seguro');
itens.item1234567 = { id: 'item1234567', status: 'UPDATED', clientUserId: cuid('ana@teste.com'), connector: { name: 'Banco Teste' } };
itens.itemDaBia1 = { id: 'itemDaBia1', status: 'UPDATED', clientUserId: cuid('bia@teste.com'), connector: { name: 'Outro' } };
confere('exige consentimento para conectar', R('of_conectar', A, { itemId: 'item1234567' }).erro === 'sem_consentimento');
confere('itemId com formato estranho é recusado', R('of_conectar', A, { itemId: '../x?y=1', consentimento: true }).erro === 'item_invalido');
confere('item de outro usuário não pode ser reivindicado', R('of_conectar', A, { itemId: 'itemDaBia1', consentimento: true }).erro === 'item_invalido');
confere('item inexistente é recusado', R('of_conectar', A, { itemId: 'naoexiste123', consentimento: true }).erro === 'item_invalido');
itens.itemErro123 = { id: 'itemErro123', status: 'LOGIN_ERROR', clientUserId: cuid('ana@teste.com'), connector: { name: 'X' } };
confere('login recusado pelo banco gera erro amigável', R('of_conectar', A, { itemId: 'itemErro123', consentimento: true }).erro === 'of_login');

console.log('Importação');
// lançamento manual igual ao t1 (mesmo valor, 1 dia de diferença) para testar duplicidade
const conta0 = R('listar_contas', A).dados[0];
R('salvar_lancamento', A, { tipo: 'despesa', valor: 45.9, data: dia(4), contaId: conta0.id, descricao: 'ifood manual' });
const ncontasAntes = R('listar_contas', A).dados.length;
const r = R('of_conectar', A, { itemId: 'item1234567', consentimento: true });
confere('conecta e importa', r.ok && r.dados.resultado.novasContas === 2, r);
const res = r.dados.resultado;
// ac1: t1 duplicado do manual, t2,t3,t4,t6 importados, t5 (fatura) ignorada; ac2: c1 importada, c2 (pagamento recebido) ignorada
confere('importadas 5 (t2,t3,t4,t6,c1)', res.importadas === 5, res);
confere('duplicado de lançamento manual detectado (t1)', res.duplicadas === 1, res);
confere('pagamento de fatura não conta duas vezes (2 ignoradas)', res.ignoradas === 2, res);
confere('uma transação sem categoria identificável', res.semCategoria === 1 && res.importadas === 5, res);
const contas = R('listar_contas', A).dados;
confere('cria a conta corrente e o cartão com limite e dias', contas.length === ncontasAntes + 2 && contas.some(c => c.tipo === 'cartao' && c.limite === 5000 && c.diaFechamento === 10 && c.diaVencimento === 17), contas);
const cc = contas.find(c => /Conta Corrente/.test(c.nome)), cart = contas.find(c => c.tipo === 'cartao');
confere('saldo da conta bate com o do banco (3000)', Math.abs(cc.saldo - 3000) < 0.01, cc);
confere('saldo do cartão = fatura em aberto (-800)', Math.abs(cart.saldo + 800) < 0.01, cart);
const cats = R('listar_categorias', A).dados, nomeCat = id => (cats.find(c => c.id === id) || {}).nome || '';
const lanc = R('listar_lancamentos', A, { mes: dia(2).slice(0, 7) }).dados;
const todos = ['0', '1'].flatMap(() => []).concat(R('listar_lancamentos', A, { mes: hoje.slice(0, 7) }).dados, R('listar_lancamentos', A, { mes: dia(6).slice(0, 7) }).dados);
const porDesc = d => todos.find(l => (l.descricao || '').indexOf(d) >= 0);
confere('categoriza automático: iFood → Restaurantes? (duplicado, não importado) e Uber → Transporte', nomeCat(porDesc('UBER').categoriaId) === 'Transporte');
confere('categoriza: salário → Salário; mercado → Mercado; Amazon → Compras', nomeCat(porDesc('SALARIO').categoriaId) === 'Salário' && nomeCat(porDesc('Mercado do').categoriaId) === 'Mercado' && nomeCat(porDesc('AMAZON').categoriaId) === 'Compras');
confere('sem regra: fica sem categoria (para o usuário decidir)', porDesc('LOJA DESCONHECIDA').categoriaId === '');
confere('lançamentos importados têm tipo e valor corretos', porDesc('SALARIO').tipo === 'receita' && porDesc('SALARIO').valor === 5000 && porDesc('UBER').tipo === 'despesa' && porDesc('UBER').valor === 22);
confere('o manual não foi alterado nem duplicado', [...new Set(todos.filter(l => l.valor === 45.9).map(l => l.id))].length === 1);
st = R('of_status', A).dados;
confere('status lista a conexão com banco, consentimento datado e nº de contas', st.conexoes.length === 1 && st.conexoes[0].banco === 'Banco Teste' && /v2026-11/.test(st.conexoes[0].consentimento) && st.conexoes[0].contas === 2, st);
confere('o ItemId nunca vai para o navegador', !JSON.stringify(st).includes('item1234567'));
confere('exportar dados também não inclui o ItemId', !JSON.stringify(R('exportar_dados', A).dados).includes('item1234567'));

console.log('Sincronizar de novo');
const r2 = R('of_sincronizar', A, { id: st.conexoes[0].id });
confere('segunda sincronização não duplica nada', r2.ok && r2.dados.importadas === 0 && r2.dados.novasContas === 0, r2);
txs.push({ id: 't7', description: 'NETFLIX.COM', amount: -39.9, type: 'DEBIT', date: dia(0) + 'T08:00:00Z' });
const r3 = R('of_sincronizar', A, { id: st.conexoes[0].id });
confere('transação nova entra e vira Assinaturas', r3.dados.importadas === 1 && nomeCat(R('listar_lancamentos', A, { mes: hoje.slice(0, 7) }).dados.find(l => /NETFLIX/.test(l.descricao)).categoriaId) === 'Assinaturas', r3);
confere('outro usuário não sincroniza a conexão alheia', R('of_sincronizar', B, { id: st.conexoes[0].id }).erro === 'nao_encontrado');
confere('outro usuário não vê a conexão', R('of_status', B).dados.conexoes.length === 0);
confere('provedor fora do ar: erro amigável sem quebrar', (() => { fora = true; const e = R('of_sincronizar', A, { id: st.conexoes[0].id }); fora = false; return e.erro === 'of_indisponivel' || e.erro === 'of_indisponivel'; })());

console.log('Revogação (LGPD)');
const d1 = R('of_desconectar', A, { id: st.conexoes[0].id });
confere('desconectar encerra no provedor e some da lista', d1.ok && d1.dados.revogadaNoProvedor === true && !itens.item1234567 && R('of_status', A).dados.conexoes.length === 0, d1);
confere('por padrão mantém o que já foi importado', R('listar_lancamentos', A, { mes: hoje.slice(0, 7) }).dados.some(l => /NETFLIX/.test(l.descricao)));
itens.itemNovo1234 = { id: 'itemNovo1234', status: 'UPDATED', clientUserId: cuid('ana@teste.com'), connector: { name: 'Banco Teste' } };
const r4 = R('of_conectar', A, { itemId: 'itemNovo1234', consentimento: true });
confere('reconectar reaproveita as contas e não duplica lançamentos (já existentes)', r4.ok && r4.dados.resultado.importadas === 0 && r4.dados.resultado.novasContas === 0, r4.dados && r4.dados.resultado);
const d2 = R('of_desconectar', A, { id: R('of_status', A).dados.conexoes[0].id, removerDados: true });
confere('removerDados apaga só o que veio do banco, não os lançamentos manuais', d2.dados.lancamentosRemovidos >= 1 && R('listar_lancamentos', A, { mes: dia(4).slice(0, 7) }).dados.some(l => l.descricao === 'ifood manual'), d2);
confere('limite de 5 conexões', (() => { let e; for (let i = 0; i < 6; i++) { itens['itemLim000' + i] = { id: 'itemLim000' + i, status: 'UPDATED', clientUserId: cuid('ana@teste.com'), connector: { name: 'B' } }; e = R('of_conectar', A, { itemId: 'itemLim000' + i, consentimento: true }); } return R('of_token', A, { consentimento: true }).erro === 'limite'; })());
confere('apagar conta do usuário revoga todas as conexões no provedor', (() => { const antes = Object.keys(itens).length; R('apagar_conta_usuario', A, { confirmar: 'APAGAR' }); return Object.keys(itens).filter(k => /itemLim/.test(k)).length === 0 && Object.keys(itens).length < antes; })());

const f = resultado(); console.log(f.ok + ' ok, ' + f.falhas + ' FALHA(S)'); process.exit(f.falhas ? 1 : 0);
