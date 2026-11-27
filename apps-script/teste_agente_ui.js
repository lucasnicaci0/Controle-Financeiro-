// Rumi flutuante (modo demo): personagem, painel, permissões, tutorial, navegação por conversa e valores. Uso: node teste_agente_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8097);
  let falhas = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const ctx = await b.newContext({ viewport: vp, reducedMotion: 'reduce' }); const pg = await ctx.newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    const url = extra => 'http://localhost:8097/index.html?q=1&demo' + (extra || '');
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(700));
    const abre = async () => { await pg.locator('#rumi-fab').click(); await pg.waitForTimeout(300); };
    const diz = async t => { await pg.fill('input[aria-label="Mensagem para o Rumi"]', t); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500); return pg.locator('.rm-linha.agente .rm-msg').last().innerText(); };

    // ---- 1) primeiro acesso: permissões e tutorial ----
    await pg.goto(url()); await pg.waitForSelector('.rm-modal [data-perm]', { timeout: 25000 }).catch(() => {});
    ok('1º acesso: etapa de permissões aparece uma vez', await pg.locator('.rm-modal [data-perm]').count() === 4);
    ok('nenhuma permissão vem marcada', await pg.locator('.rm-modal input[type=checkbox]:checked').count() === 0);
    ok('cada permissão explica o motivo e o que acontece se negar', (await pg.locator('.rm-modal').innerText()).split('Se você não permitir').length === 5);
    ok('sem resposta ainda: o Rumi não age (privacidade não concedida)', await pg.evaluate(async () => (await demoDB.agente.perm.privacidade) === undefined));
    await pg.locator('.rm-modal [data-perm=privacidade] .sw').click(); await pg.locator('.rm-modal [data-perm=memoria] .sw').click();
    await pg.locator('[data-perm-salvar]').click(); await pg.waitForTimeout(900);
    ok('escolhas salvas na conta (privacidade e memória sim; whatsapp e voz não)', await pg.evaluate(() => { const p = demoDB.agente.perm; return p.privacidade.estado === 'concedida' && p.memoria.estado === 'concedida' && p.whatsapp.estado === 'negada' && p.voz.estado === 'negada'; }));
    ok('após responder, o tutorial inicia sozinho no passo 1 de 10', /Passo 1 de 9|Passo 1 de 10/.test(await pg.locator('.rm-tut-card').innerText()), await pg.locator('.rm-tut-card').innerText().catch(() => ''));
    const total = Number((await pg.locator('[data-tut-pos]').innerText()).match(/de (\d+)/)[1]);
    ok('destaque visual sobre elemento real', await pg.locator('.rm-tut-luz').evaluate(e => getComputedStyle(e).display === 'block'));
    ok('progresso, voltar desabilitado no 1º passo, pular e pausar existem', await pg.locator('[role=progressbar]').count() === 1 && await pg.locator('[data-tut=voltar]').isDisabled() && await pg.locator('[data-tut=pular]').count() === 1 && await pg.locator('[data-tut=pausar]').count() === 1);
    await pg.locator('[data-tut=proximo]').click(); await pg.waitForTimeout(900); await pg.locator('[data-tut=proximo]').click(); await pg.waitForTimeout(1200);
    ok('avançou 2 passos e navegou até o Painel', /Passo 3 de/.test(await pg.locator('[data-tut-pos]').innerText()) && await pg.evaluate(() => S.view) === 'painel');
    ok('progresso salvo na conta (passo 3)', await pg.evaluate(() => demoDB.agente.onb.estado === 'em_andamento' && demoDB.agente.onb.passo === 3));
    await pg.locator('[data-tut=voltar]').click(); await pg.waitForTimeout(900);
    ok('voltar funciona', /Passo 2 de/.test(await pg.locator('[data-tut-pos]').innerText()));
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    ok('pausar: tutorial some, estado em andamento preservado', await pg.locator('.rm-tut').count() === 0 && await pg.evaluate(() => demoDB.agente.onb.estado === 'em_andamento' && demoDB.agente.onb.passo === 2));
    await pg.evaluate(() => RumiTutorial.encerrar());

    // ---- 2) personagem flutuante ----
    await pg.goto(url('&semintro')); await pg.waitForSelector('#rumi-fab', { timeout: 25000 }).catch(() => {});
    await pg.evaluate(() => api('permissoes_salvar', { itens: { privacidade: 'concedida', memoria: 'concedida', whatsapp: 'negada', voz: 'negada' } }));
    ok('não existe mais aba/menu "Rumi"', await pg.locator('#nav button[data-v=agente]').count() === 0 && !/^Rumi$/m.test(await pg.locator('#nav').innerText()));
    ok('personagem flutuante visível, acessível e dentro da tela', await pg.locator('#rumi-fab').isVisible() && !!(await pg.locator('#rumi-fab').getAttribute('aria-label')) && await pg.locator('#rumi-fab').evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    // não cobre a barra de navegação nem botões fixos
    const sobrepoe = await pg.evaluate(() => { const f = document.getElementById('rumi-fab').getBoundingClientRect(), n = document.getElementById('nav').getBoundingClientRect(); return !(f.right < n.left || f.left > n.right || f.bottom < n.top || f.top > n.bottom); });
    ok('posição padrão não cobre a barra de navegação', !sobrepoe);
    await nav('lanc'); const antesTxt = await pg.locator('#view').innerText();
    await abre();
    ok('painel abre como diálogo sem trocar de tela', await pg.locator('.rm-pnl[role=dialog]').isVisible() && await pg.evaluate(() => S.view) === 'lanc');
    ok('saudação e campo de mensagem no painel', /Eu sou o Rumi/.test(await pg.locator('.rm-log').innerText()) && await pg.locator('input[aria-label="Mensagem para o Rumi"]').isVisible());
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
    ok('Esc fecha e volta para a mesma tela, com o mesmo conteúdo', !(await pg.locator('.rm-pnl').isVisible().catch(() => false)) && await pg.evaluate(() => S.view) === 'lanc' && (await pg.locator('#view').innerText()) === antesTxt);
    ok('foco volta ao personagem', await pg.evaluate(() => document.activeElement.id) === 'rumi-fab');
    await abre(); await pg.locator('[data-rumi-fechar]').click(); await pg.waitForTimeout(300);
    ok('botão fechar funciona', !(await pg.locator('.rm-pnl').isVisible().catch(() => false)));
    // arrastar
    const bx = await pg.locator('#rumi-fab').boundingBox();
    await pg.mouse.move(bx.x + 20, bx.y + 20); await pg.mouse.down(); await pg.mouse.move(bx.x - 120, bx.y - 100, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(200);
    const bx2 = await pg.locator('#rumi-fab').boundingBox();
    ok('arrastar muda de lugar sem abrir o painel', Math.abs(bx2.x - bx.x) > 60 && !(await pg.locator('.rm-pnl').isVisible().catch(() => false)));
    ok('posição fica salva', await pg.evaluate(() => !!localStorage.getItem('rumo_rumi_pos')));
    await pg.evaluate(() => localStorage.removeItem('rumo_rumi_pos'));

    // ---- 3) conversa: valores, navegação, copiloto ----
    await abre();
    const antes = await pg.evaluate(() => demoDB.lanc.length);
    const casos = [['gastei R$ 3.000,00 no mercado', 3000], ['gastei 3k no mercado', 3000], ['gastei 3 mil reais no mercado', 3000], ['gastei 2,5k no mercado', 2500], ['gastei 2.500,50 no mercado', 2500.5], ['gastei 1500 reais no mercado', 1500], ['gastei R$ 3000 no mercado', 3000], ['gastei 3000 no mercado', 3000], ['gastei 1,5 milhão no mercado', 1500000]];
    for (const [t, v] of casos) { await diz(t); await pg.waitForTimeout(150); const l = await pg.evaluate(() => demoDB.lanc[demoDB.lanc.length - 1]); ok('valor "' + t + '" → ' + v + ' (gravado ' + l.valor + ')', l.valor === v, l.valor); }
    ok('nenhum lançamento com R$ 1,00 indevido', await pg.evaluate(() => demoDB.lanc.filter(l => l.valor === 1 && /mercado/i.test(l.descricao)).length) === 0);
    const r3 = await diz('gastei 3,000 no mercado'); ok('"3,000" é ambíguo: pergunta antes de gravar', /Está certo/.test(r3) && (await pg.evaluate(() => demoDB.lanc.length)) === antes + casos.length);
    await diz('não');
    const rn = await diz('abrir metas'); await pg.waitForTimeout(900);
    ok('"abrir metas" navega e fecha o painel', /Abrindo Metas/.test(rn) && await pg.evaluate(() => S.view) === 'metas' && !(await pg.locator('.rm-pnl').isVisible().catch(() => false)));
    await abre(); const rg = await diz('como cadastro uma meta?');
    ok('guia explica passo a passo e oferece abrir', /Metas/.test(rg) && /1\./.test(rg) && await pg.locator('[data-abrir=metas]').count() >= 1);
    const rt = await diz('explique esta tela'); ok('explica a tela atual', /Você está em Metas/.test(rt), rt);
    const ri = await diz('o que é taxa de poupança'); ok('explica indicador', /Taxa de poupança/.test(ri));
    const nM = await pg.evaluate(() => demoDB.metas.length); const rm = await diz('criar meta Viagem de 5 mil');
    ok('cria meta com valor correto', /Meta criada: Viagem/.test(rm) && await pg.evaluate(() => demoDB.metas.length) === nM + 1 && await pg.evaluate(() => demoDB.metas[demoDB.metas.length - 1].valorAlvo) === 5000);
    await diz('desfazer'); ok('desfazer remove a meta criada', await pg.evaluate(() => demoDB.metas.length) === nM);
    const rc = await diz('criar categoria Pets'); ok('cria categoria', /Categoria criada: Pets/.test(rc) && await pg.evaluate(() => demoDB.cats.some(c => c.nome === 'Pets')));
    const rv = await diz('verificar meus dados'); ok('verifica inconsistências (R$ 1,00 / sem categoria / etc.) com ressalva', /ponto|não encontrei/i.test(rv), rv);
    const rq = await diz('quanto gastei com mercado este mês'); const rq2 = await diz('e no mês passado?'); ok('contexto de conversa: follow-up reutiliza a categoria', /mercado/i.test(rq2) && /mês passado/.test(rq2), rq2);
    await diz('iniciar tutorial'); await pg.waitForTimeout(1500);
    ok('"iniciar tutorial" fecha o painel e abre o tutorial', await pg.locator('.rm-tut-card').isVisible() && !(await pg.locator('.rm-pnl').isVisible().catch(() => false)));
    await pg.locator('[data-tut=pular]').click(); await pg.waitForTimeout(500);
    ok('pular dispensa e salva', await pg.locator('.rm-tut').count() === 0 && await pg.evaluate(() => demoDB.agente.onb.estado) === 'pulado');

    // ---- 4) tutorial completo ----
    await pg.evaluate(() => RumiTutorial.iniciar({ api, el, toast, brl, S, atualizar: carregarBase, ir }, {})); await pg.waitForTimeout(900);
    let passos = 0; const titulos = [];
    for (let i = 0; i < 12; i++) { titulos.push(await pg.locator('.rm-tut-card h3').innerText()); passos++; const t = await pg.locator('[data-tut=proximo]').innerText(); await pg.locator('[data-tut=proximo]').click(); await pg.waitForTimeout(1000); if (t === 'Concluir') break; }
    ok('tutorial percorre os 10 passos e conclui (' + passos + ')', passos === 10, titulos);
    ok('concluído e salvo', await pg.evaluate(() => demoDB.agente.onb.estado === 'concluido') && await pg.locator('.rm-tut').count() === 0);
    ok('concluído: não reinicia automaticamente', await pg.evaluate(async () => (await api('onboarding_estado')).automatico) === false);
    await nav('opcoes');
    ok('Opções mostra permissões, Rumi e tutorial', await pg.locator('#opt-perm').count() === 1 && await pg.locator('#opt-rumi').count() === 1 && await pg.locator('#opt-tutorial').count() === 1);
    ok('permissões visíveis com estado e data', /Concedida/.test(await pg.locator('#opt-perm').innerText()));
    await pg.locator('#op-perm-voz').check({ force: true }); await pg.waitForTimeout(500);
    ok('alterar permissão nas Opções salva', await pg.evaluate(() => demoDB.agente.perm.voz.estado) === 'concedida');
    await pg.locator('#op-perm-privacidade').uncheck({ force: true }); await pg.waitForTimeout(500);
    await pg.locator('#rumi-fab').click(); await pg.waitForTimeout(300); const rp = await diz('qual meu saldo');
    ok('sem privacidade o Rumi não lê dados, mas o app segue funcionando', /permissão de privacidade/.test(rp) && (await pg.evaluate(() => { document.querySelector('[data-rumi-fechar]').click(); return S.view; })) === 'opcoes');
    await nav('painel'); ok('app continua funcionando com permissões negadas', /saldo/i.test(await pg.locator('#view').innerText()));
    await pg.screenshot({ path: '/tmp/rumi-' + nome + '.png' });
    ok('sem erros de JS', erros.length === 0, erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
