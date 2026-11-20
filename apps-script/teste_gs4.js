// Fase 3 (back-end): cartões, metas de investimento, carteira. Uso: node teste_gs4.js
const { novoContexto, token, chamar, confere, resultado, formatDate, FUSO } = require('./mock_google.js');
const hoje = formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const ctx = novoContexto(); ctx.autorizar();
const A = token('ana@teste.com', 'Ana'), B = token('bia@teste.com', 'Bia');
const R = (a, tk, d) => chamar(ctx, a, tk, d || {});
R('iniciar', A); R('iniciar', B);

console.log('Ciclo da fatura');
const cic = (h, d) => JSON.stringify(ctx.cicloFatura_(h, d));
confere('antes do fechamento: ciclo vai do mês passado até o dia', cic('2026-11-05', 10) === '{"ini":"2026-10-11","fim":"2026-11-10"}', cic('2026-11-05', 10));
confere('depois do fechamento: ciclo vai para o mês seguinte', cic('2026-11-20', 10) === '{"ini":"2026-11-11","fim":"2026-12-10"}', cic('2026-11-20', 10));
confere('no dia do fechamento ainda é a fatura que fecha hoje', cic('2026-11-10', 10) === '{"ini":"2026-10-11","fim":"2026-11-10"}');
confere('dia 31 em mês curto vira o último dia', cic('2026-02-15', 31) === '{"ini":"2026-02-01","fim":"2026-02-28"}', cic('2026-02-15', 31));

console.log('Cartões');
const semDados = R('salvar_conta', A, { nome: 'Cartão Roxo', tipo: 'cartao', saldoInicial: 0 });
let cs = R('listar_cartoes', A).dados;
confere('cartão sem dados diz o que falta (sem inventar)', cs.length === 1 && cs[0].faltando.join() === 'limite,dia de fechamento,dia de vencimento' && cs[0].disponivel === null && cs[0].faturaAtual === null, cs[0]);
const id = R('listar_contas', A).dados.find(c => c.nome === 'Cartão Roxo').id;
const ed = R('salvar_conta', A, { id, nome: 'Cartão Roxo', tipo: 'cartao', limite: 5000, diaFechamento: 10, diaVencimento: 17, marca: 'Mastercard' });
confere('editar preserva saldo inicial e grava os campos', ed.ok && ed.dados.limite === 5000 && ed.dados.marca === 'Mastercard' && ed.dados.saldoInicial === 0, ed);
confere('dia inválido recusado', R('salvar_conta', A, { id, nome: 'x', tipo: 'cartao', diaFechamento: 40 }).erro === 'dia_invalido');
const ci = ctx.cicloFatura_(hoje, 10);
const dentro = ci.ini, fora = ctx.somarDias_(ci.ini, -1);
const g = (data, v, t) => R('salvar_lancamento', A, { data, tipo: t || 'despesa', valor: v, contaId: id, descricao: 'c' + v });
g(dentro, 300); g(ci.fim, 200); g(fora, 100); g(dentro, 50, 'receita');
cs = R('listar_cartoes', A).dados[0];
confere('fatura = despesas do ciclo − estornos (300+200−50)', cs.faturaAtual === 450, cs);
confere('disponível = limite − dívida total (inclui fora do ciclo)', cs.divida === 550 && cs.disponivel === 4450 && cs.usoPct === 11, cs);
confere('fechamento e vencimento calculados', cs.fechamento === ci.fim && /^\d{4}-\d\d-17$/.test(cs.vencimento) && cs.vencimento > cs.fechamento && cs.faltando.length === 0, cs);
confere('só aparecem cartões', R('listar_cartoes', A).dados.every(c => c.nome === 'Cartão Roxo') && R('listar_cartoes', B).dados.length === 0);

console.log('Metas de investimento');
const m1 = R('salvar_meta', A, { nome: 'Aposentadoria', valorAlvo: 100000, valorAtual: 10000, prazo: '2035-01-01', tipo: 'investimento', aporte: 800 }).dados;
confere('guarda tipo e aporte mensal', m1.tipo === 'investimento' && m1.aporte === 800);
const m2 = R('salvar_meta', A, { id: m1.id, nome: 'Aposentadoria', valorAlvo: 100000, valorAtual: 11000, prazo: '2035-01-01' }).dados;
confere('aportar sem reenviar tipo não perde tipo nem aporte', m2.tipo === 'investimento' && m2.aporte === 800 && m2.valorAtual === 11000);
confere('meta comum continua "geral"', R('salvar_meta', A, { nome: 'Viagem', valorAlvo: 1000 }).dados.tipo === 'geral');
confere('aporte negativo recusado', R('salvar_meta', A, { nome: 'x', valorAlvo: 10, aporte: -1 }).erro === 'valor_invalido');

console.log('Carteira de investimentos');
const a1 = R('salvar_investimento', A, { nome: 'Petrobras', ticker: 'petr4', classe: 'acao', quantidade: 100, precoMedio: 30, precoAtual: 36 });
confere('calcula investido, atual e retorno', a1.ok && a1.dados.ticker === 'PETR4' && a1.dados.investido === 3000 && a1.dados.valorAtual === 3600 && a1.dados.retorno === 600 && a1.dados.retornoPct === 20, a1);
R('salvar_investimento', A, { nome: 'Tesouro Selic', classe: 'renda_fixa', quantidade: 1, precoMedio: 5000, precoAtual: 5250 });
R('salvar_investimento', A, { nome: 'HGLG11', ticker: 'HGLG11', classe: 'fii', quantidade: 10, precoMedio: 160 });
R('salvar_investimento', A, { nome: 'Bitcoin', classe: 'cripto', quantidade: 0.01, precoMedio: 300000, precoAtual: 250000 });
const c = R('listar_investimentos', A).dados;
confere('sem preço atual usa o preço médio (retorno 0)', c.ativos.find(x => x.ticker === 'HGLG11').retorno === 0);
confere('totais da carteira', c.investido === 3000 + 5000 + 1600 + 3000 && c.valorAtual === 3600 + 5250 + 1600 + 2500 && c.retorno === c.valorAtual - c.investido, c);
confere('distribuição por classe soma ~100%', Math.abs(c.porClasse.reduce((s, x) => s + x.pct, 0) - 100) < 0.5 && c.porClasse[0].classe === 'renda_fixa', c.porClasse);
confere('aviso obrigatório presente', /não é recomendação de investimento/.test(c.aviso));
confere('quantidade zero recusada', R('salvar_investimento', A, { nome: 'x', quantidade: 0, precoMedio: 1 }).erro === 'valor_invalido');
confere('classe inválida vira "outros"', R('salvar_investimento', A, { nome: 'Ouro', classe: 'xyz', quantidade: 1, precoMedio: 1 }).dados.classe === 'outros');
confere('cotação automática: estrutura pronta, avisa que não está ligada', /não está ligada/.test(R('atualizar_cotacoes', A).dados.motivo) && c.cotacoesAutomaticas === false);
confere('outro usuário não vê a carteira', R('listar_investimentos', B).dados.ativos.length === 0);
confere('exclui ativo', R('excluir_investimento', A, { id: a1.dados.id }).ok && R('listar_investimentos', A).dados.ativos.length === 4);

const x = resultado(); console.log('\n' + x.ok + ' ok, ' + x.falhas + ' FALHA(S)'); process.exit(x.falhas ? 1 : 0);
