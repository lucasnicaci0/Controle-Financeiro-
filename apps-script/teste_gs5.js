// Fase 4 (back-end): perfil, foto, preferências, fale conosco. Uso: node teste_gs5.js
const { novoContexto, token, chamar, confere, resultado } = require('./mock_google.js');
const ctx = novoContexto(); ctx.autorizar();
const A = token('ana@teste.com', 'Ana Google'), B = token('bia@teste.com', 'Bia');
const R = (a, tk, d) => chamar(ctx, a, tk, d || {});
R('iniciar', A); R('iniciar', B);

console.log('Perfil');
let p = R('perfil', A).dados;
confere('perfil inicial: nome do Google, plano grátis, login Google', p.nome === 'Ana Google' && p.plano === 'gratis' && p.loginGoogle === true && p.foto === '' && p.idade === null, p);
const s = R('salvar_perfil', A, { nome: 'Ana Souza', apelido: 'Aninha', nascimento: '1990-05-10' });
p = R('perfil', A).dados;
confere('edita nome, apelido e nascimento (idade calculada)', s.ok && p.nome === 'Ana Souza' && p.apelido === 'Aninha' && p.nascimento === '1990-05-10' && p.idade >= 36, p);
confere('login de novo não apaga o nome editado', (() => { R('iniciar', A); return R('perfil', A).dados.nome === 'Ana Souza'; })());
confere('nascimento no futuro recusado', R('salvar_perfil', A, { nascimento: '2999-01-01' }).erro === 'data_invalida');
confere('nascimento impossível recusado', R('salvar_perfil', A, { nascimento: '2001-02-30' }).erro === 'data_invalida');
confere('nome vazio recusado', R('salvar_perfil', A, { nome: '  ' }).erro === 'nome_invalido');
confere('limpar nascimento funciona', R('salvar_perfil', A, { nascimento: '' }).ok && R('perfil', A).dados.nascimento === '');
confere('fórmula no nome é neutralizada', !/^[=+\-@]/.test((R('salvar_perfil', A, { apelido: '=1+1' }), R('perfil', A).dados.apelido)));
confere('salvar só um campo não apaga os outros', R('perfil', A).dados.nome === 'Ana Souza');

console.log('Foto');
const jpg = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(3000)).toString('base64');
confere('salva foto jpeg pequena', R('salvar_perfil', A, { foto: jpg }).ok && R('perfil', A).dados.foto === jpg);
confere('foto não-jpeg recusada', R('salvar_perfil', A, { foto: 'data:text/html;base64,PHNjcmlwdD4=' }).erro === 'foto_invalida');
confere('foto com script recusada', R('salvar_perfil', A, { foto: 'data:image/jpeg;base64,AAA"onload="x' }).erro === 'foto_invalida');
confere('foto grande demais recusada', R('salvar_perfil', A, { foto: 'data:image/jpeg;base64,' + 'A'.repeat(41000) }).erro === 'foto_invalida');
confere('trocar foto substitui (sem duplicar linha)', (() => { R('salvar_perfil', A, { foto: jpg.slice(0, -4) + 'AAAA' }); return ctx._planilha._abas.Fotos._data.length === 2; })());
confere('remover foto', R('salvar_perfil', A, { foto: '' }).ok && R('perfil', A).dados.foto === '');
confere('foto de uma pessoa não aparece para outra', R('perfil', B).dados.foto === '');

console.log('Preferências (configurações salvas na conta)');
const prefs = { fonte: 'g', tema: 'claro', pal: 'custom', acento: '#ff8800', dens: 'compacta', raio: 'grande' };
confere('salva e devolve', R('salvar_perfil', A, { prefs }).ok && JSON.stringify(R('perfil', A).dados.prefs) === JSON.stringify(prefs));
confere('preferências de A não vazam para B', Object.keys(R('perfil', B).dados.prefs).length === 0);
confere('preferências enormes recusadas', R('salvar_perfil', A, { prefs: { x: 'y'.repeat(5000) } }).erro === 'muito_grande');

console.log('Fale conosco');
const m = R('enviar_mensagem', A, { assunto: 'Dúvida', texto: 'Como exporto para o Excel?' });
confere('mensagem salva', m.ok && m.dados.status === 'recebida');
confere('aparece na lista do usuário', R('listar_mensagens', A).dados.length === 1 && R('listar_mensagens', A).dados[0].assunto === 'Dúvida');
confere('outro usuário não vê', R('listar_mensagens', B).dados.length === 0);
confere('mensagem curta/sem assunto recusada', R('enviar_mensagem', A, { assunto: '', texto: 'oi' }).erro === 'mensagem_invalida');
[1, 2, 3, 4].forEach(i => R('enviar_mensagem', A, { assunto: 'x' + i, texto: 'mensagem número ' + i }));
confere('limite de 5 por dia', R('enviar_mensagem', A, { assunto: 'x', texto: 'mensagem sexta' }).erro === 'limite_diario');
confere('mensagem com fórmula é neutralizada', !/^[=+\-@]/.test(R('listar_mensagens', B).dados.length === 0 ? (R('enviar_mensagem', B, { assunto: '=HYPERLINK("x")', texto: '=cmd|calc' }), R('listar_mensagens', B).dados[0].assunto) : ''));

console.log('LGPD');
confere('exportar_dados inclui perfil e mensagens', 'Mensagens' in R('exportar_dados', A).dados && 'Fotos' in R('exportar_dados', A).dados);
R('apagar_conta_usuario', A, { confirmar: 'APAGAR' });
confere('apagar conta remove foto e mensagens', ctx._planilha._abas.Fotos._data.slice(1).every(l => !l || l[0] !== 'ana@teste.com') && ctx._planilha._abas.Mensagens._data.slice(1).every(l => !l || l[1] !== 'ana@teste.com'));

const x = resultado(); console.log('\n' + x.ok + ' ok, ' + x.falhas + ' FALHA(S)'); process.exit(x.falhas ? 1 : 0);
