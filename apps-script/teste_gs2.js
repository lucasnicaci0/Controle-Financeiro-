// Fase 1: categorias (CRUD completo), tags, migração de planilha antiga. Uso: node teste_gs2.js
const { novoContexto, token, chamar, confere, resultado, formatDate, FUSO } = require('./mock_google.js');
const hoje = formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const ctx = novoContexto(); ctx.autorizar();
const A = token('ana@teste.com', 'Ana'), B = token('bia@teste.com', 'Bia');
const R = (a, tk, d) => chamar(ctx, a, tk, d || {});
R('iniciar', A); R('iniciar', B);

console.log('Categorias padrão');
const cats = R('listar_categorias', A).dados;
const nomes = t => cats.filter(c => c.tipo === t).map(c => c.nome);
const esperadasDesp = ['Alimentação', 'Assinaturas', 'Restaurantes', 'Casa', 'Compras', 'Cuidados pessoais', 'Dívidas/Empréstimos', 'Educação', 'Família e Filhos', 'Impostos e Taxas', 'Investimento', 'Lazer e Hobbies', 'Mercado', 'Pets', 'Presentes e Doações', 'Roupas', 'Saúde', 'Trabalho', 'Transporte', 'Viagens', 'Outros'];
confere('as 21 de despesa pedidas existem', esperadasDesp.every(n => nomes('despesa').includes(n)), esperadasDesp.filter(n => !nomes('despesa').includes(n)));
confere('as 4 de receita pedidas existem', ['Empréstimos', 'Investimentos', 'Salário', 'Outras receitas'].every(n => nomes('receita').includes(n)));
confere('4 sugeridas incluídas', ['Moradia/Aluguel', 'Contas de consumo', 'Seguros', 'Manutenção de veículo'].every(n => nomes('despesa').includes(n)));
confere('toda categoria tem ícone, cor e não vem arquivada', cats.every(c => c.icone && /^#[0-9a-f]{6}$/i.test(c.cor) && c.arquivada === false));

console.log('CRUD');
const nova = R('salvar_categoria', A, { nome: 'Academia', tipo: 'despesa', cor: '#ff00aa', icone: '🏋️' }).dados;
confere('cria com ícone e cor', nova.nome === 'Academia' && nova.icone === '🏋️' && nova.cor === '#ff00aa');
confere('nome duplicado no mesmo tipo é recusado', R('salvar_categoria', A, { nome: ' academia ', tipo: 'despesa' }).erro === 'duplicada');
confere('mesmo nome em outro tipo é aceito', R('salvar_categoria', A, { nome: 'Academia', tipo: 'receita' }).ok === true);
const ed = R('salvar_categoria', A, { id: nova.id, nome: 'Academia e esportes', tipo: 'despesa', cor: '#00ffaa', icone: '🏃' }).dados;
confere('edita nome, cor e ícone', ed.nome === 'Academia e esportes' && ed.cor === '#00ffaa' && ed.icone === '🏃' && ed.id === nova.id);
confere('nome vazio é recusado', R('salvar_categoria', A, { nome: '  ', tipo: 'despesa' }).erro === 'nome_invalido');
confere('fórmula no nome é neutralizada', !/^[=+\-@]/.test(R('salvar_categoria', A, { nome: '=SOMA(A1)', tipo: 'despesa' }).dados.nome));
const arq = R('arquivar_categoria', A, { id: nova.id }).dados;
confere('arquiva', arq.arquivada === true && R('listar_categorias', A).dados.find(c => c.id === nova.id).arquivada === true);
const conta = R('listar_contas', A).dados[0];
confere('lançamento em categoria arquivada é recusado', R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 10, contaId: conta.id, categoriaId: nova.id }).erro === 'categoria_arquivada');
confere('desarquiva', R('arquivar_categoria', A, { id: nova.id, arquivada: false }).dados.arquivada === false);
confere('outro usuário não vê nem altera', R('arquivar_categoria', B, { id: nova.id }).erro === 'nao_encontrado' && !R('listar_categorias', B).dados.some(c => c.id === nova.id));

console.log('Excluir e reatribuir');
const id = n => R('listar_categorias', A).dados.find(c => c.nome === n && c.tipo === 'despesa').id;
const mercado = id('Mercado'), alim = id('Alimentação'), salario = R('listar_categorias', A).dados.find(c => c.nome === 'Salário').id;
[10, 20, 30].forEach(v => R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: v, contaId: conta.id, categoriaId: mercado, descricao: 'x' + v }));
const mes = hoje.slice(0, 7);
R('salvar_orcamento', A, { categoriaId: mercado, mes, limite: 300 }); R('salvar_orcamento', A, { categoriaId: alim, mes, limite: 500 });
const r1 = R('excluir_categoria', A, { id: mercado });
confere('categoria com lançamentos não é excluída', r1.erro === 'em_uso' && r1.detalhes && r1.detalhes.lancamentos === 3 && r1.detalhes.orcamentos === 1, r1);
confere('reatribuir para tipo diferente é recusado', R('excluir_categoria', A, { id: mercado, reatribuirPara: salario }).erro === 'categoria_invalida');
confere('reatribuir para ela mesma é recusado', R('excluir_categoria', A, { id: mercado, reatribuirPara: mercado }).erro === 'categoria_invalida');
const r2 = R('excluir_categoria', A, { id: mercado, reatribuirPara: alim });
confere('exclui reatribuindo', r2.ok && r2.dados.reatribuidos === 3);
const lanc = R('listar_lancamentos', A, { mes }).dados.filter(l => /^x\d+$/.test(l.descricao));
confere('os 3 lançamentos foram para Alimentação', lanc.length === 3 && lanc.every(l => l.categoriaId === alim));
const orc = R('listar_orcamentos', A, { mes }).dados;
confere('orçamentos somados (300 + 500 = 800) e sem duplicata', orc.length === 1 && orc[0].categoriaId === alim && orc[0].limite === 800, orc);
confere('categoria sumiu', !R('listar_categorias', A).dados.some(c => c.id === mercado));
const outra = R('salvar_categoria', A, { nome: 'Vazia', tipo: 'despesa' }).dados;
confere('categoria sem uso exclui direto', R('excluir_categoria', A, { id: outra.id }).ok === true);
const bLancs = R('listar_lancamentos', B, { mes }).dados;
confere('lançamentos de outro usuário não mudam', bLancs.length === 0);
confere('não troca o tipo de categoria com lançamentos', R('salvar_categoria', A, { id: alim, nome: 'Alimentação', tipo: 'receita' }).erro === 'em_uso');

console.log('Completar padrões (quem veio da versão 1.0)');
R('excluir_categoria', B, { id: R('listar_categorias', B).dados.find(c => c.nome === 'Pets').id });
const rest = R('restaurar_categorias_padrao', B).dados;
confere('devolve só a que faltava (Pets)', rest.adicionadas === 1 && rest.nomes[0] === 'Pets', rest);
confere('segunda chamada não duplica', R('restaurar_categorias_padrao', B).dados.adicionadas === 0);

console.log('Tags');
const t1 = R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 55, contaId: conta.id, categoriaId: alim, descricao: 'Jantar', tags: ['#Viagem', 'viagem', ' Férias ', '', '=cmd'] });
confere('salva, tira #, repetidas e vazias', t1.ok && t1.dados.tags.join('|') === 'Viagem|Férias|cmd', t1.dados && t1.dados.tags);
confere('aparece na listagem', R('listar_lancamentos', A, { mes }).dados.find(l => l.id === t1.dados.id).tags.length === 3);
const t2 = R('salvar_lancamento', A, { id: t1.dados.id, data: hoje, tipo: 'despesa', valor: 55, contaId: conta.id, categoriaId: alim, descricao: 'Jantar', tags: 'viagem, trabalho' });
confere('edita as tags (aceita texto separado por vírgula)', t2.dados.tags.join('|') === 'viagem|trabalho');
confere('máximo de 8 tags', R('salvar_lancamento', A, { data: hoje, tipo: 'despesa', valor: 1, contaId: conta.id, tags: 'a,b,c,d,e,f,g,h,i,j' }).dados.tags.length === 8);
const tg = R('listar_tags', A).dados;
confere('listar_tags conta o uso', tg.find(x => x.tag.toLowerCase() === 'viagem').total === 1 && tg.length >= 2, tg);
confere('lançamento sem tags continua válido', R('salvar_lancamento', A, { data: hoje, tipo: 'receita', valor: 5, contaId: conta.id }).dados.tags.length === 0);

console.log('Migração de planilha da versão 1.0');
const velho = novoContexto();
const sh = velho._planilha.insertSheet('Categorias'); sh.getRange(1, 1, 1, 5).setValues([['Id', 'Email', 'Nome', 'Tipo', 'Cor']]);
sh.getRange(2, 1, 1, 5).setValues([['c1', 'ana@teste.com', 'Moradia', 'despesa', '#6366f1']]);
const sl = velho._planilha.insertSheet('Lancamentos'); sl.getRange(1, 1, 1, 10).setValues([['Id', 'Email', 'Data', 'Tipo', 'Valor', 'ContaId', 'CategoriaId', 'Descricao', 'Chave', 'Criado']]);
velho.autorizar();
confere('colunas novas acrescentadas sem perder dados', sh._data[0].join(',') === 'Id,Email,Nome,Tipo,Cor,Icone,Arquivada' && sh._data[1][2] === 'Moradia' && sl._data[0][10] === 'Tags');
const Cv = token('ana@teste.com', 'Ana');
const antes = chamar(velho, 'iniciar', Cv, {}); const cv = chamar(velho, 'listar_categorias', Cv, {}).dados;
confere('migrada: ícone padrão e desarquivada', cv.find(c => c.nome === 'Moradia').icone === '🏷️' && cv.find(c => c.nome === 'Moradia').arquivada === false);
const comp = chamar(velho, 'restaurar_categorias_padrao', Cv, {}).dados;
confere('"Moradia" antiga conta como Moradia/Aluguel (não duplica)', !comp.nomes.includes('Moradia/Aluguel'), comp.nomes.slice(0, 3));

const r = resultado(); console.log('\n' + r.ok + ' ok, ' + r.falhas + ' FALHA(S)'); process.exit(r.falhas ? 1 : 0);
