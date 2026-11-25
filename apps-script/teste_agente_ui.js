// Rumi (interface, modo demo): chat, mascote e estados, voz (simulada), confirmações, Modo Contador, memória, permissões, auditoria e WhatsApp. Uso: node teste_agente_ui.js
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
    await pg.addInitScript(() => {
      window.__falas = [];
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      Object.defineProperty(window, 'speechSynthesis', { value: { speak: u => window.__falas.push(u.text), cancel() {}, getVoices: () => [] }, configurable: true });
      window.SpeechRecognition = window.webkitSpeechRecognition = function () { this.start = () => { setTimeout(() => { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'hoje gastei 80 reais abastecendo o carro' }], { isFinal: true })] }); this.onend(); }, 150); }; this.stop = () => {}; };
    });
    await pg.goto('http://localhost:8097/index.html?q=1&demo'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(700));
    const txt = () => pg.locator('#view').innerText();
    const diz = async t => { await pg.fill('input[aria-label="Mensagem para o Rumi"]', t); await pg.keyboard.press('Enter'); await pg.waitForTimeout(450); return pg.locator('.rm-linha.agente .rm-msg').last().innerText(); };
    const estado = () => pg.locator('.rm-head svg.rumi').getAttribute('data-e');
    ok('menu tem "Rumi" e não tem mais "Assistente"', (await pg.locator('#nav button[data-v=agente]').innerText()) === 'Rumi' && (await pg.locator('#nav button[data-v=assistente]').count()) === 0);
    await nav('agente');
    ok('área exclusiva: mascote, título, campo de texto, botão de áudio, enviar', (await pg.locator('.rm-head svg.rumi').count()) === 1 && /rumi/i.test(await pg.locator('.rm-head h3').innerText()) && await pg.locator('input[aria-label="Mensagem para o Rumi"]').isVisible() && await pg.locator('.rm-mic').isVisible() && await pg.locator('button:has-text("Enviar")').isVisible());
    ok('saudação do Rumi e atalho do Modo Contador', /Eu sou o Rumi/.test(await pg.locator('.rm-log').innerText()) && await pg.locator('[data-contador]').isVisible());
    ok('estado inicial do mascote: espera', (await estado()) === 'espera');
    // estados do mascote
    const visiveis = await pg.evaluate(() => { const r = {}; const svg = document.querySelector('.rm-head svg.rumi'); for (const e of ['espera', 'processando', 'analisando', 'executando', 'confirmando', 'problema', 'apresentando']) { RumiMascote.definir(svg, e); r[e] = [...svg.querySelectorAll('.rm-x')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('class').replace('rm-x rm-x-', '')).join(',') + '|' + [...svg.querySelectorAll('.rm-b')].filter(x => getComputedStyle(x).display !== 'none').length; } RumiMascote.definir(svg, 'espera'); return r; });
    ok('7 estados visualmente distintos (adereço e boca)', visiveis.espera === '|1' && visiveis.processando === 'proc|1' && visiveis.analisando === 'ana|1' && visiveis.executando === 'exe|1' && visiveis.confirmando === 'ok|1' && visiveis.problema === 'prob|1' && visiveis.apresentando === 'apr|1', visiveis);
    ok('mascote pequeno: ocupa só o cabeçalho (≤ 72px)', (await pg.locator('.rm-head svg.rumi').boundingBox()).width <= 72);
    // indicador de processamento
    await pg.evaluate(() => { const h = window.__h = RumiDemo.handler; RumiDemo.handler = (a, d, D) => { const r = h(a, d, D); return a === 'agente_mensagem' ? new Promise(res => setTimeout(() => r.then(res), 1500)) : r; }; });
    const antes = await pg.evaluate(() => demoDB.lanc.length);
    await pg.fill('input[aria-label="Mensagem para o Rumi"]', 'Gastei R$ 45 no almoço.'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
    const proc = [await estado(), await pg.locator('.rm-status').innerText(), await pg.locator('button:has-text("Enviar")').isDisabled()];
    ok('enquanto processa: mascote "processando", status e botão bloqueado', proc[0] === 'processando' && /Pensando/.test(proc[1]) && proc[2], proc);
    await pg.waitForTimeout(1700);
    ok('registrou o gasto e confirmou com os dados', (await pg.evaluate(() => demoDB.lanc.length)) === antes + 1 && /registrada/.test(await pg.locator('.rm-linha.agente .rm-msg').last().innerText()) && /45,00/.test(await pg.locator('.rm-linha.agente .rm-msg').last().innerText()));
    await pg.evaluate(() => { RumiDemo.handler = window.__h; });
    ok('mascote "confirmando" e cartão de ação executada com Desfazer', (await estado()) === 'confirmando' && await pg.locator('.rm-feito [data-desfazer]').last().isVisible());
    const novo = await pg.evaluate(() => demoDB.lanc[demoDB.lanc.length - 1]);
    ok('lançamento com valor, tipo, data, conta, categoria e descrição', novo.valor === 45 && novo.tipo === 'despesa' && !!novo.contaId && !!novo.categoriaId && /Almo/i.test(novo.descricao) && /^\d{4}-\d{2}-\d{2}$/.test(novo.data), novo);
    await pg.locator('.rm-feito [data-desfazer]').last().click(); await pg.waitForTimeout(400);
    ok('Desfazer remove o lançamento', (await pg.evaluate(() => demoDB.lanc.length)) === antes);
    // mesma mensagem não duplica
    // perguntar o que falta
    let r = await diz('gastei 33'); ok('sem categoria: pergunta e oferece opções', /categoria/i.test(r) && (await pg.locator('.sugestoes .chip').count()) >= 3, r);
    await pg.locator('.sugestoes .chip:has-text("Lazer")').first().click(); await pg.waitForTimeout(450);
    ok('clicar numa opção conclui o registro', (await pg.evaluate(() => demoDB.lanc.length)) === antes + 1, await pg.locator('.rm-linha.agente .rm-msg').last().innerText());
    // consulta
    r = await diz('Quanto gastei com alimentação este mês?'); ok('consulta por categoria', /Você gastou R\$/.test(r) && /alimentação/i.test(r), r);
    ok('consulta não grava nada', (await pg.evaluate(() => demoDB.lanc.length)) === antes + 1);
    // alterar com confirmação
    const idComb = await pg.evaluate(() => demoDB.lanc.find(l => /Combust/.test(l.descricao) && l.data.slice(0, 7) === new Date().toISOString().slice(0, 7)) || demoDB.lanc.find(l => /Combust/.test(l.descricao)));
    r = await diz('altere o valor do combustível para R$ 200'); ok('alteração pede confirmação antes de mudar', /Confirma/.test(r) && (await pg.evaluate(id => demoDB.lanc.find(l => l.id === id).valor, idComb.id)) === 190, r);
    ok('mascote "identificando" vira análise enquanto aguarda', ['analisando', 'espera'].includes(await estado()));
    await pg.locator('.sugestoes .chip:has-text("Sim")').click(); await pg.waitForTimeout(450);
    ok('após "Sim" altera o valor', (await pg.evaluate(id => demoDB.lanc.find(l => l.id === id).valor, idComb.id)) === 200);
    r = await diz('apague o lançamento do combustível'); ok('exclusão pede confirmação', /Vou excluir/.test(r) && (await pg.evaluate(id => !!demoDB.lanc.find(l => l.id === id), idComb.id)));
    await pg.locator('.sugestoes .chip:has-text("Não")').click(); await pg.waitForTimeout(450);
    ok('"Não" cancela sem apagar', await pg.evaluate(id => !!demoDB.lanc.find(l => l.id === id), idComb.id));
    // Modo Contador
    await pg.locator('[data-contador]').click(); await pg.waitForTimeout(500);
    r = await pg.locator('.rm-linha.agente .rm-msg').last().innerText();
    ok('Modo Contador: panorama com receitas, despesas, saldo e o que fazer', /Receitas: R\$/.test(r) && /Despesas: R\$/.test(r) && /Saldo do mês/.test(r) && /O que eu faria/.test(r), r);
    ok('Modo Contador avisa que são estimativas', /Análise educativa/.test(r));
    ok('mascote apresentando a análise', (await estado()) === 'apresentando');
    r = await diz('Consigo comprar algo de R$ 500 sem comprometer minhas contas?'); ok('pergunta natural de compra', /500,00/.test(r) && /estimativa/i.test(r), r);
    r = await diz('Onde estou gastando mais dinheiro?'); ok('maiores categorias', /maiores gastos/i.test(r) && /•/.test(r), r);
    // entendimento informal e aprendizado
    r = await diz('uber 23'); ok('comando informal e incompleto', /23,00/.test(r) && /Transporte/.test(r), r);
    r = await diz('gastei 20 no mercadinho do zé'); await pg.waitForTimeout(200);
    if (/categoria/i.test(r)) { await pg.locator('.sugestoes .chip:has-text("Alimentação")').first().click(); await pg.waitForTimeout(450); }
    ok('aprendeu o termo novo', await pg.evaluate(() => demoDB.agente.memoria.some(m => /mercadinho/.test(m.chave))));
    const n0 = await pg.evaluate(() => demoDB.lanc.length); r = await diz('gastei 15 no mercadinho do zé'); ok('na próxima usa a memória sem perguntar', (await pg.evaluate(() => demoDB.lanc.length)) === n0 + 1, r);
    r = await diz('não, é lazer'); ok('correção do último lançamento', /Corrigido/.test(r) && /lembrar/.test(r), r);
    // voz
    const nv = await pg.evaluate(() => demoDB.lanc.length);
    await pg.locator('.rm-mic').click(); await pg.waitForTimeout(700);
    ok('voz: fala transcrita vira lançamento (80, Transporte) e a bolha mostra o microfone', (await pg.evaluate(() => demoDB.lanc.length)) === nv + 1 && (await pg.evaluate(() => { const l = demoDB.lanc[demoDB.lanc.length - 1]; return l.valor === 80 && /Transporte/.test(demoDB.cats.find(c => c.id === l.categoriaId).nome); })) && (await pg.locator('.rm-msg.voz').count()) >= 1);
    // ajustes
    await pg.locator('summary:has-text("Permissões e privacidade")').click();
    await pg.locator('#rm-p-voz_resposta').evaluate(e => e.click()); await pg.waitForTimeout(300);
    await diz('qual meu saldo?'); ok('resposta em áudio (síntese de voz) quando ligada', (await pg.evaluate(() => window.__falas.length)) >= 1 && /Saldo/.test(await pg.evaluate(() => window.__falas[0])));
    await pg.locator('#rm-p-excluir').evaluate(e => e.click()); await pg.waitForTimeout(300);
    r = await diz('apague o lançamento do uber'); ok('sem permissão de excluir: recusa e explica', /desativou/.test(r), r);
    await pg.locator('#rm-p-excluir').evaluate(e => e.click()); await pg.waitForTimeout(300);
    await pg.locator('summary:has-text("O que o Rumi aprendeu")').click();
    ok('memória lista o aprendido e permite apagar', /mercadinho/.test(await pg.locator('[data-sec=mem]').innerText()));
    const nm = await pg.evaluate(() => demoDB.agente.memoria.length);
    await pg.locator('[data-sec=mem] .x').first().click(); await pg.waitForTimeout(500);
    ok('item de memória apagado', (await pg.evaluate(() => demoDB.agente.memoria.length)) === nm - 1);
    await pg.locator('summary:has-text("Registro de ações")').click();
    ok('auditoria lista as ações com opção de desfazer', (await pg.locator('.rm-aud').count()) >= 3 && (await pg.locator('.rm-aud .chip:has-text("Desfazer")').count()) >= 1);
    await pg.locator('summary:has-text("WhatsApp")').click(); await pg.locator('[data-zap-codigo]').click(); await pg.waitForTimeout(400);
    ok('WhatsApp: gera código de conexão', /DEMO42/.test(await pg.locator('.rm-codigo').innerText()));
    ok('apagar histórico limpa a conversa', await (async () => { await pg.locator('[data-limpar-hist]').click(); await pg.waitForTimeout(400); return /Eu sou o Rumi/.test(await pg.locator('.rm-log').innerText()) && (await pg.locator('.rm-linha.usuario').count()) === 0; })());
    // integração com outros módulos
    await nav('lanc'); ok('lançamentos criados pelo Rumi aparecem na aba Lançamentos', /Uber|Almo|Mercadinho|Mercado/i.test(await txt()));
    await nav('agente'); ok('a conversa continua ao voltar para o Rumi', (await pg.locator('.rm-log').count()) === 1);
    // layout
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const bx = await pg.locator('.rm-form').boundingBox(); ok('campo, microfone e Enviar visíveis e dentro da tela', bx.x >= 0 && bx.x + bx.width <= vp.width + 1);
    await pg.screenshot({ path: '/tmp/rumi-' + nome + '.png' });
    ok('sem erros de JS', erros.length === 0, erros);
    await ctx.close();
  }
  // navegador sem voz
  const c2 = await b.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
  await p2.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await p2.goto('http://localhost:8097/index.html?q=1&demo'); await p2.waitForTimeout(2500);
  await p2.evaluate(() => document.querySelector('#nav button[data-v=agente]').click()); await p2.waitForTimeout(700);
  ok('sem suporte a reconhecimento de voz: botão desabilitado com explicação', await p2.locator('.rm-mic').isDisabled() && /ditado/.test(await p2.locator('.rm-mic').getAttribute('title')));
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
