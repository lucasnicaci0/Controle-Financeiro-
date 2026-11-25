// Serviços puros (sem DOM): leitura de notificações do banco (o WhatsApp e o assistente agora são o agente Rumi: teste_agente_core.js e teste_gs8.js). Uso: node teste_servicos.js
global.window = undefined;
require('../js/servicos/notificacoes.js');
let f = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c ? ' -> ' + JSON.stringify(x) : '')); if (!c) f++; };
const N = RumoNotificacoes;
let r = N.interpretar({ texto: 'Compra aprovada de R$ 45,90 em IFOOD', pacote: 'com.nu.production' });
ok('notificação de compra', r && r.tipo === 'despesa' && r.valor === 45.9 && r.descricao === 'IFOOD' && r.banco === 'Nubank', r);
r = N.interpretar({ texto: 'Pix recebido R$ 1.250,00 de Maria' }); ok('pix recebido = receita', r && r.tipo === 'receita' && r.valor === 1250, r);
ok('código OTP é ignorado', N.interpretar({ texto: 'Seu código é 123456' }) === null && N.interpretar({ texto: 'Promoção: ganhe R$ 10,00' }) === null);
ok('notificações: fonte indisponível sem app nativo', N.FonteNotificacoes.disponivel() === false);
console.log(f ? f + ' FALHA(S)' : 'tudo ok'); process.exit(f ? 1 : 0);
