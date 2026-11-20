// Fase 5 (interface, modo demo): Conexões (consentimento, conectar, atualizar, desconectar) e Assistente. Uso: node teste_fase5_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8094);
  let falhas = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); const erros = [], externas = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    pg.on('request', r => { if (/pluggy/.test(r.url())) externas.push(r.url()); });
    await pg.goto('http://localhost:8094/index.html?q=1&demo'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(900));
    await nav('conexoes');
    const tx = await pg.locator('#view').innerText();
    ok('mostra o consentimento (dados lidos, finalidade, sem senha, revogação)', /Seu consentimento/i.test(tx) && /senha/.test(tx) && /revogar/.test(tx));
    ok('botão Conectar começa desabilitado', await pg.locator('button:has-text("Conectar meu banco")').isDisabled());
    ok('nenhum script do provedor é carregado antes do consentimento', externas.length === 0);
    ok('mostra "Em preparação": notificações e WhatsApp', /notificações/i.test(tx) && /WhatsApp/.test(tx) && /Android nativo/.test(tx));
    await pg.locator('#of-aceite').check(); await pg.waitForTimeout(100);
    ok('aceitar habilita o botão', await pg.locator('button:has-text("Conectar meu banco")').isEnabled());
    const contasAntes = await pg.evaluate(() => demoDB.contas.length);
    await pg.locator('button:has-text("Conectar meu banco")').click(); await pg.waitForTimeout(1500);
    ok('conexão criada e listada com data do consentimento', /Banco Demo/.test(await pg.locator('#view').innerText()) && /Consentimento: \d{2}\/\d{2}\/\d{4}/.test(await pg.locator('#view').innerText()));
    ok('conta e lançamentos importados', (await pg.evaluate(() => demoDB.contas.length)) === contasAntes + 1 && (await pg.evaluate(() => demoDB.lanc.filter(l => (l.chave || '').startsWith('of:')).length)) === 3);
    await nav('contas'); ok('a conta nova aparece em Contas', /Banco Demo Conta Corrente/.test(await pg.locator('#view').innerText()));
    await nav('conexoes');
    await pg.locator('button:has-text("Atualizar agora")').click(); await pg.waitForTimeout(900);
    ok('atualizar não quebra', /Banco Demo/.test(await pg.locator('#view').innerText()));
    await pg.locator('button:has-text("Desconectar")').first().click(); await pg.waitForTimeout(1200);   // diálogos aceitam: apaga também os importados
    ok('desconectar remove a conexão', /Nenhum banco conectado/.test(await pg.locator('#view').innerText()));
    ok('e os lançamentos importados (opção aceita)', (await pg.evaluate(() => demoDB.lanc.filter(l => (l.chave || '').startsWith('of:')).length)) === 0);
    // Assistente
    await nav('assistente');
    ok('assistente mostra aviso de modo simulado e saudação', /Modo simulado/.test(await pg.locator('#view').innerText()) && /Olá! Sou o assistente/.test(await pg.locator('.chat').innerText()));
    const pergunta = async t => { await pg.fill('input[aria-label="Mensagem para o assistente"]', t); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700); return pg.locator('.msg.assistente .txt').last().innerText(); };
    ok('"quanto gastei este mês?" responde com R$', /gastou R\$/.test(await pergunta('quanto gastei este mês?')));
    ok('"qual meu saldo?" lista contas', /Saldo total: R\$/.test(await pergunta('qual meu saldo?')));
    ok('"cotação do dólar" usa a cotação e traz o aviso', /USD está em R\$/.test(await pergunta('cotação do dólar')) );
    ok('"como estão meus limites" responde', /limite|Limites/.test(await pergunta('como estão meus limites?')));
    const inv = await pergunta('devo comprar ações?'); ok('não recomenda investimento', /Não faço recomendação de investimento/.test(inv), inv);
    ok('pergunta desconhecida orienta o que dá para perguntar', /não entendi/.test(await pergunta('qual a capital da França')));
    await pg.locator('button.chip:has-text("Últimos lançamentos")').click(); await pg.waitForTimeout(700);
    ok('sugestões clicáveis funcionam', /Últimos lançamentos|lançamentos/.test(await pg.locator('.msg.assistente .txt').last().innerText()));
    await pg.locator('button:has-text("Limpar conversa")').click(); ok('limpar conversa', (await pg.locator('.msg').count()) === 1);
    const lg = await pg.locator('.chat').getAttribute('role'); ok('log acessível (role=log)', lg === 'log');
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0, erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
