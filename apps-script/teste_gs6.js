// Câmbio (back-end): cotações com cache e fallback, histórico, taxa, favoritos, alertas, lançamento em moeda estrangeira. Uso: node teste_gs6.js
const { novoContexto, token, chamar, confere, resultado, formatDate, FUSO } = require('./mock_google.js');
const hoje = formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const ctx = novoContexto(); ctx.autorizar();
const A = token('ana@teste.com', 'Ana'), B = token('bia@teste.com', 'Bia');
const R = (a, tk, d) => chamar(ctx, a, tk, d || {});
R('iniciar', A); R('iniciar', B);
const ts = () => String(Math.floor(Date.now() / 1000));
const q = (code, bid, ask, extra) => Object.assign({ code, codein: 'BRL', name: code + '/Real Brasileiro', high: String(bid + 0.1), low: String(bid - 0.1), varBid: '0.02', pctChange: '0.4', bid: String(bid), ask: String(ask), timestamp: ts() }, extra);
let chamadas = [], preco = { USD: [5.40, 5.41], EUR: [6.20, 6.22], BTC: [350000, 350500] }, fora = false;
ctx.awesome = (url, op) => {
  chamadas.push({ url, op });
  if (fora) return { codigo: 503, corpo: {} };
  const m = url.match(/json\/last\/([A-Z,\-]+)/);
  if (m) { const o = {}; m[1].split(',').forEach(p => { const c = p.split('-')[0]; if (preco[c]) o[c + 'BRL'] = q(c, preco[c][0], preco[c][1]); }); return { codigo: 200, corpo: o }; }
  const sd = url.match(/start_date=(\d{8})&end_date=(\d{8})/);
  if (sd) { const arr = []; for (let d = new Date(sd[2].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + 'T15:00:00Z'); d >= new Date(sd[1].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + 'T15:00:00Z'); d = new Date(d - 86400000)) arr.push({ bid: '5.2', timestamp: String(Math.floor(d / 1000)) }); return { codigo: 200, corpo: arr }; }
  const h = url.match(/daily\/([A-Z]+)-BRL\/(\d+)/);
  if (h) { const n = Math.min(Number(h[2]), 400), arr = []; for (let i = 0; i < n; i++) { const t = Math.floor(Date.now() / 1000) - i * 86400; arr.push({ bid: String(5 + i * 0.01), timestamp: String(t), high: '5', low: '5' }); if (i % 3 === 0) arr.push({ bid: '9', timestamp: String(t - 10) }); } return { codigo: 200, corpo: arr }; }
  return { codigo: 404, corpo: {} };
};

console.log('Cotações');
let c = R('cambio_cotacoes', A, { moedas: ['USD', 'EUR'] }).dados;
confere('devolve compra, venda, máx., mín., variação e horário', c.cotacoes.USD.compra === 5.4 && c.cotacoes.USD.venda === 5.41 && c.cotacoes.USD.max > c.cotacoes.USD.min && c.cotacoes.USD.pct === 0.4 && /^\d{4}-\d\d-\d\dT/.test(c.cotacoes.USD.atualizado), c.cotacoes.USD);
confere('traz fonte e o aviso obrigatório', /AwesomeAPI/.test(c.fonte) && /Valores de referência, podem diferir da cotação praticada por bancos e corretoras\./.test(c.aviso));
const n0 = chamadas.length; R('cambio_cotacoes', B, { moedas: ['USD', 'EUR'] });
confere('segunda consulta usa o cache (nenhuma chamada nova à API)', chamadas.length === n0);
confere('uma única chamada para várias moedas', chamadas.filter(x => /last\//.test(x.url)).length === 1 && /USD-BRL,EUR-BRL/.test(chamadas[0].url));
confere('moeda inexistente vai para "falhas" sem quebrar o resto', (() => { const r = R('cambio_cotacoes', A, { moedas: ['USD', 'XYZ'] }).dados; return r.falhas.join() === 'XYZ' && r.cotacoes.USD; })());
confere('código inválido é ignorado (sem injeção na URL)', (() => { chamadas = []; R('cambio_cotacoes', A, { moedas: ['USD/../x', 'u$d'] }); return chamadas.length === 0; })());
confere('sem chave: não envia cabeçalho de autenticação', (() => { chamadas = []; preco.GBP = [7, 7.1]; R('cambio_cotacoes', A, { moedas: ['GBP'] }); return !chamadas[0].op.headers; })());
ctx.props = { AWESOMEAPI_KEY: 'segredo123' }; preco.JPY = [0.035, 0.036];
chamadas = []; R('cambio_cotacoes', A, { moedas: ['JPY'] });
confere('com chave nas Propriedades: vai por cabeçalho e nunca na URL', chamadas[0].op.headers['x-api-key'] === 'segredo123' && !/segredo123/.test(chamadas[0].url));
confere('a chave nunca aparece na resposta', !JSON.stringify(R('cambio_cotacoes', A, { moedas: ['JPY'] })).includes('segredo123'));

console.log('API fora do ar');
ctx.props = {}; fora = true;
// expira o cache de 5 min mas mantém a última cotação (6 h)
const ctx2 = novoContexto(); ctx2.autorizar(); ctx2.awesome = ctx.awesome;
const A2 = token('ana@teste.com', 'Ana'); chamar(ctx2, 'iniciar', A2, {});
fora = false; chamar(ctx2, 'cambio_cotacoes', A2, { moedas: ['USD'] });   // grava "última boa"
fora = true;
const caches = ctx2.CacheService.getScriptCache(); caches.remove('cambio:q:USD');
const velho = chamar(ctx2, 'cambio_cotacoes', A2, { moedas: ['USD'] }).dados;
confere('mostra a última cotação marcada como desatualizada, com o horário dela', velho.cotacoes.USD && velho.cotacoes.USD.desatualizado === true && velho.cotacoes.USD.compra === 5.4 && velho.cotacoes.USD.atualizado, velho);
confere('sem nenhuma cotação guardada, devolve falha (não erro de servidor)', R('cambio_cotacoes', A, { moedas: ['BTC'] }).dados.falhas.join() === 'BTC');
fora = false;

console.log('Histórico');
const h7 = R('cambio_historico', A, { moeda: 'USD', dias: 7 }).dados, h30 = R('cambio_historico', A, { moeda: 'USD', dias: 30 }).dados;
confere('7 dias: pontos em ordem crescente de data, sem repetir dia', h7.serie.length === 7 && h7.serie.every((p, i, a) => i === 0 || a[i - 1].data < p.data), h7.serie.map(p => p.data));
confere('filtros 30/180/365 pedem a quantidade certa', [[30, 30], [180, 180], [365, 365]].every(([d, n]) => { chamadas = []; R('cambio_historico', A, { moeda: 'EUR', dias: d }); return new RegExp('EUR-BRL/' + n + '$').test(chamadas[0].url); }));
confere('prazo fora da lista vira 30', R('cambio_historico', A, { moeda: 'USD', dias: 5 }).dados.dias === 30);
confere('moeda inválida recusada', R('cambio_historico', A, { moeda: 'BRL', dias: 7 }).erro === 'moeda_invalida');
fora = true; ctx.CacheService.getScriptCache().remove('cambio:h:EUR:7');
confere('API fora e sem cópia: erro claro', R('cambio_historico', A, { moeda: 'EUR', dias: 7 }).erro === 'cambio_indisponivel'); fora = false;

console.log('Taxa para lançamentos');
const tr = R('cambio_taxa', A, { moeda: 'USD', data: hoje, tipo: 'despesa' }).dados;
confere('despesa de hoje usa a venda; receita usa a compra', tr.taxa === 5.41 && tr.base === 'venda' && R('cambio_taxa', A, { moeda: 'USD', data: hoje, tipo: 'receita' }).dados.taxa === 5.4);
const ps = R('cambio_taxa', A, { moeda: 'USD', data: '2026-01-15', tipo: 'despesa' });
confere('data passada usa fechamento do dia e manda start/end_date', ps.ok && ps.dados.base === 'fechamento do dia' && /start_date=20260110&end_date=20260115/.test(chamadas.slice(-1)[0].url), chamadas.slice(-1)[0].url);

console.log('Favoritos (por usuário)');
confere('padrão: USD, EUR, GBP, ARS, BTC', R('cambio_favoritos', A).dados.moedas.join() === 'USD,EUR,GBP,ARS,BTC');
R('cambio_favoritar', A, { moedas: ['jpy', 'USD', 'USD', 'x$x', 'BRL'] });
confere('salva sem duplicar nem aceitar lixo', R('cambio_favoritos', A).dados.moedas.join() === 'JPY,USD');
confere('outro usuário continua com o padrão', R('cambio_favoritos', B).dados.moedas.join() === 'USD,EUR,GBP,ARS,BTC');
R('cambio_favoritar', A, { moedas: [] });
confere('lista vazia é respeitada (nenhuma favorita)', R('cambio_favoritos', A).dados.moedas.length === 0);

console.log('Lançamento em moeda estrangeira');
const conta = R('listar_contas', A).dados[0];
const l = R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 54.1, contaId: conta.id, descricao: 'Livro', moeda: 'usd', valorOrig: 10, cotacao: 5.41 });
confere('guarda valor original, moeda e taxa; Valor é o total em R$', l.ok && l.dados.valor === 54.1 && l.dados.moeda === 'USD' && l.dados.valorOrig === 10 && l.dados.cotacao === 5.41, l);
confere('aparece na listagem com a moeda original', R('listar_lancamentos', A, { mes: hoje.slice(0, 7) }).dados.find(x => x.id === l.dados.id).moeda === 'USD');
confere('valor em R$ que não confere é recusado', R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 99, contaId: conta.id, moeda: 'USD', valorOrig: 10, cotacao: 5.41 }).erro === 'cambio_invalido');
confere('sem cotação é recusado', R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 54.1, contaId: conta.id, moeda: 'USD', valorOrig: 10 }).erro === 'cambio_invalido');
confere('lançamento normal continua sem moeda', R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 10, contaId: conta.id }).dados.moeda === '');
confere('saldo da conta usa o valor em R$', R('listar_contas', A).dados[0].saldo === -(54.1 + 10));
confere('exportação traz moeda original e taxa', R('exportar_lancamentos', A, {}).dados.some(x => x.moeda === 'USD' && x.valorOrig === 10 && x.cotacao === 5.41));

console.log('Alertas de cotação');
const al = R('cambio_alerta_salvar', A, { moeda: 'USD', direcao: 'acima', valor: 5.5 }).dados;
const ab = R('cambio_alerta_salvar', A, { moeda: 'EUR', direcao: 'abaixo', valor: 6.0 }).dados;
confere('cria os alertas', R('cambio_alertas', A).dados.length === 2 && R('cambio_alertas', B).dados.length === 0);
confere('valor zero recusado', R('cambio_alerta_salvar', A, { moeda: 'USD', valor: 0 }).erro === 'valor_invalido');
ctx.CacheService.getScriptCache().remove('cambio:q:USD'); ctx.CacheService.getScriptCache().remove('cambio:q:EUR');
confere('cotação ainda fora da faixa: nada dispara', R('cambio_verificar_alertas', A).dados.alertas.length === 0);
preco.USD = [5.6, 5.61]; ctx.CacheService.getScriptCache().remove('cambio:q:USD');
const disp = R('cambio_verificar_alertas', A).dados.alertas;
confere('USD passou de 5,50: dispara com mensagem em português e nível "cambio"', disp.length === 1 && disp[0].nivel === 'cambio' && /USD subiu até R\$\s?5,50 \(agora R\$\s?5,60\)/.test(disp[0].mensagem), disp);
confere('vai para o mesmo histórico de alertas dos limites', R('listar_alertas', A).dados.some(a => a.nivel === 'cambio'));
confere('dispara uma vez só (fica inativo)', R('cambio_verificar_alertas', A).dados.alertas.length === 0 && R('cambio_alertas', A).dados.find(x => x.id === al.id).ativo === false);
confere('pode reativar', R('cambio_alerta_salvar', A, { id: al.id, moeda: 'USD', direcao: 'acima', valor: 5.7 }).ok && R('cambio_alertas', A).dados.find(x => x.id === al.id).ativo === true);
confere('exclui alerta', R('cambio_alerta_excluir', A, { id: ab.id }).ok && R('cambio_alertas', A).dados.length === 1);

const x = resultado(); console.log('\n' + x.ok + ' ok, ' + x.falhas + ' FALHA(S)'); process.exit(x.falhas ? 1 : 0);
