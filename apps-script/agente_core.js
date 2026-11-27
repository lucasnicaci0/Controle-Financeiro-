/* ===== NÚCLEO DO AGENTE (fonte única) =====
 * Funções puras: nenhuma chama rede, planilha ou DOM. Quem chama (app ou webhook do WhatsApp) entrega os dados
 * em `dados`, recebe de volta o texto da resposta e a lista de ações; as ações são executadas por
 * agente_executar (validação, permissão, idempotência e auditoria). Este trecho é copiado para o Code.gs e para
 * js/servicos/agente-core.js por apps-script/montar.js — edite SOMENTE aqui.
 */
var AG_NOME = 'Rumi';

function agNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$%,.\/\s+-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function agBrl(n) { var neg = n < 0, p = Math.abs(Number(n) || 0).toFixed(2).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (neg ? '-' : '') + 'R$ ' + p[0] + ',' + p[1]; }
function agArr2(n) { return n < 10 ? '0' + n : String(n); }
function agDataBR(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : ''; }
function agSomaDias(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function agDiasNoMes(ym) { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
function agMesAnt(ym, n) { var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - (n === undefined ? 1 : n); while (m < 1) { m += 12; a--; } return a + '-' + agArr2(m); }
function agDiaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
function agCap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function agDist1(a, b) {   // distância de edição ≤ 1 (erro de digitação)
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/* ---------- números por extenso e valores ---------- */
var AG_UNID = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };
var AG_MULT = { mil: 1000, k: 1000, milhao: 1000000, milhoes: 1000000 };
var AG_VALOR_MAX = 1000000000;
function agPorExtenso(tokens) {   // tokens normalizados -> [{valor, de, ate}] (sequências de palavras numéricas)
  var out = [], i = 0;
  while (i < tokens.length) {
    var t = tokens[i];
    if (AG_UNID[t] !== undefined || ((t === 'mil' || t === 'milhao' || t === 'milhoes') && false)) {
      var j = i, total = 0, cur = 0, ult = i;
      while (j < tokens.length) {
        var w = tokens[j];
        if (AG_UNID[w] !== undefined) { cur += AG_UNID[w]; ult = j; }
        else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; ult = j; }
        else if (w === 'milhao' || w === 'milhoes') { total += (cur || 1) * 1000000; cur = 0; ult = j; }
        else if (w === 'e' && j + 1 < tokens.length && (AG_UNID[tokens[j + 1]] !== undefined || tokens[j + 1] === 'mil')) { /* conector */ }
        else break;
        j++;
      }
      out.push({ valor: total + cur, de: i, ate: ult }); i = ult + 1;
    } else i++;
  }
  return out;
}
var AG_MOEDA_PAL = /^(reais|real|conto|contos|pila|pilas|paus|pau|r\$)$/;
// Um token numérico (sem R$ nem sinal) no padrão brasileiro -> { v, amb, motivo, suf } ou null. Nunca devolve valor "padrão".
function agNumTok(s) {
  var m, r;
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)(k|mil|milhao|milhoes)$/))) { r = agNumTok(m[1]); return r && r.v > 0 ? { v: r.v * AG_MULT[m[2]], suf: true } : null; }   // 3k · 2,5k · 3mil
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) return { v: parseFloat(s.replace(/\./g, '').replace(',', '.')) };   // 2.500,50
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return { v: parseInt(s.replace(/\./g, ''), 10) };                           // 3.000
  if (/^\d+,\d{1,2}$/.test(s)) return { v: parseFloat(s.replace(',', '.')) };                                      // 12,5
  if (/^\d+,\d{3}$/.test(s)) return { v: parseInt(s.replace(',', ''), 10), amb: true, motivo: 'a vírgula em "' + s + '" pode ser separador de milhar ou decimal' };
  if (/^\d+\.\d{1,2}$/.test(s)) return { v: parseFloat(s), amb: true, motivo: 'o ponto em "' + s + '" pode ser decimal' };
  if (/^\d+$/.test(s)) return { v: parseInt(s, 10) };                                                              // 3000
  return null;
}
// devolve { valor, de, ate, marc, sinal, ambiguo, motivo } (índices de token) ou null. Prefere números marcados como dinheiro.
function agValor(tokens, ignorar) {
  var cand = [], n = tokens.length, i, ign = {};
  (ignorar || []).forEach(function (k) { ign[k] = 1; });
  for (i = 0; i < n; i++) {
    if (ign[i]) continue;
    var t = tokens[i], marc = false, sinal = '', de = i;
    if (t === 'r$') { if (tokens[i + 1] && /^[+-]?\d/.test(tokens[i + 1]) && !ign[i + 1]) { marc = true; de = i; i++; t = tokens[i]; } else continue; }
    var m = t.match(/^([+-]?)(r\$)?(.+)$/); if (!m) continue;
    sinal = m[1]; if (m[2]) marc = true;
    var nt = agNumTok(m[3]); if (!nt) continue;
    var v = nt.v, ate = i, amb = !!nt.amb, motivo = nt.motivo || '';
    if (!nt.suf) {
      var mult = AG_MULT[tokens[i + 1]];
      if (mult && !ign[i + 1] && tokens[i + 1] !== 'k') { v *= mult; ate = i + 1; amb = false; motivo = ''; }
      else if (tokens[i + 1] === 'k') { v *= 1000; ate = i + 1; amb = false; motivo = ''; }
      if (ate > i && AG_MULT[tokens[ate]] === 1000 && tokens[ate + 1] === 'e') {   // "3 mil e 500" · "2 mil e quinhentos"
        var rest = tokens.slice(ate + 2), mr = null, ex = agPorExtenso(rest)[0];
        if (rest[0] && /^\d{1,3}$/.test(rest[0])) mr = { v: parseInt(rest[0], 10), len: 1 };
        else if (ex && ex.de === 0 && ex.valor < 1000) mr = { v: ex.valor, len: ex.ate + 1 };
        if (mr) { v += mr.v; ate = ate + 1 + mr.len; }
      }
    } else if (tokens[i + 1] === 'e' && false) { /* sem uso */ }
    if (tokens[ate + 1] && AG_MOEDA_PAL.test(tokens[ate + 1])) { marc = true; ate++; }
    if (!isFinite(v) || v <= 0 || v >= AG_VALOR_MAX) continue;
    cand.push({ valor: Math.round(v * 100) / 100, de: de, ate: ate, marc: marc, sinal: sinal, ambiguo: amb, motivo: motivo });
    i = ate;
  }
  agPorExtenso(tokens).forEach(function (e) {
    var k, bloq = false; for (k = e.de; k <= e.ate; k++) if (ign[k]) bloq = true;
    if (bloq || !(e.valor > 0) || e.valor >= AG_VALOR_MAX) return;
    if (cand.some(function (c) { return c.de <= e.ate && e.de <= c.ate; })) return;   // já lido como número
    var ate = e.ate, marc = false;
    if (tokens[ate + 1] && AG_MOEDA_PAL.test(tokens[ate + 1])) { marc = true; ate++; }
    cand.push({ valor: e.valor, de: e.de, ate: ate, marc: marc, sinal: '', ambiguo: false, motivo: '' });
  });
  if (!cand.length) return null;
  cand.sort(function (a, b) { return (b.marc ? 1 : 0) - (a.marc ? 1 : 0) || a.de - b.de; });
  var esc = cand[0], outros = cand.filter(function (c) { return c !== esc && !c.marc; });
  if (!esc.marc && outros.length) { esc.ambiguo = true; esc.motivo = esc.motivo || 'há mais de um número na frase'; }
  return esc;
}
// Texto inteiro de um campo de valor ("R$ 3.000,00", "3k", "1,5 milhão") -> { ok, valor, ambiguo, motivo }. Para formulários e servidor.
function agParseValorTexto(txt) {
  var t = agNorm(String(txt == null ? '' : txt)).replace(/^r\$\s*/, 'r$').replace(/\s+/g, ' ').trim(), sinal = '';
  if (!t) return { ok: false, valor: NaN, ambiguo: false, motivo: 'vazio' };
  if (/^[+-]?(r\$)?\s*0+([.,]0+)?$/.test(t)) return { ok: true, valor: 0, ambiguo: false, motivo: '' };
  if (/^-/.test(t)) { sinal = '-'; t = t.slice(1).trim(); }
  var tk = t.split(' '), v = agValor(tk, []);
  if (!v || v.de !== 0 || v.ate !== tk.length - 1) {
    var ex = agPorExtenso(tk)[0]; if (ex && ex.de === 0 && ex.ate === tk.length - 1 && ex.valor > 0) return { ok: true, valor: sinal === '-' ? -ex.valor : ex.valor, ambiguo: false, motivo: '' };
    return { ok: false, valor: NaN, ambiguo: false, motivo: 'formato não reconhecido' };
  }
  return { ok: true, valor: sinal === '-' ? -v.valor : v.valor, ambiguo: v.ambiguo, motivo: v.motivo };
}

/* ---------- datas e períodos ---------- */
var AG_DIAS_SEM = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
var AG_MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
// { data, explicita, usados:[índices] }
function agData(tokens, hoje) {
  var usados = [], data = hoje, expl = false;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i], m;
    if (t === 'hoje') { usados.push(i); expl = true; data = hoje; }
    else if (t === 'ontem') { usados.push(i); expl = true; data = agSomaDias(hoje, -1); }
    else if (t === 'anteontem') { usados.push(i); expl = true; data = agSomaDias(hoje, -2); }
    else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      var a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(hoje.slice(0, 4)), mm = Number(m[2]), dd = Number(m[1]);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) { var iso = a + '-' + agArr2(mm) + '-' + agArr2(dd); if (!m[3] && iso > hoje) iso = (a - 1) + iso.slice(4); data = iso; usados.push(i); expl = true; }
    } else if (t === 'dia' && tokens[i + 1] && /^\d{1,2}$/.test(tokens[i + 1])) {
      var d2 = Number(tokens[i + 1]), ym = hoje.slice(0, 7);
      if (d2 >= 1 && d2 <= 31) { if (agArr2(d2) > hoje.slice(8, 10)) ym = agMesAnt(ym); if (d2 > agDiasNoMes(ym)) d2 = agDiasNoMes(ym); data = ym + '-' + agArr2(d2); usados.push(i, i + 1); expl = true; }
    } else if (AG_DIAS_SEM[t] !== undefined || AG_DIAS_SEM[t.replace(/-feira$/, '')] !== undefined) {
      var alvo = AG_DIAS_SEM[t] !== undefined ? AG_DIAS_SEM[t] : AG_DIAS_SEM[t.replace(/-feira$/, '')], dif = (agDiaSemana(hoje) - alvo + 7) % 7;
      data = agSomaDias(hoje, -(dif === 0 ? 7 : dif)); usados.push(i); expl = true;
      if (tokens[i + 1] === 'passada' || tokens[i + 1] === 'passado') usados.push(i + 1);
    }
  }
  return { data: data, explicita: expl, usados: usados };
}
// { de, ate, rotulo, explicito }
function agPeriodo(texto, hoje) {
  var t = agNorm(texto), ym = hoje.slice(0, 7), m;
  if (/\bhoje\b/.test(t)) return { de: hoje, ate: hoje, rotulo: 'hoje', explicito: true };
  if (/\bontem\b/.test(t)) { var o = agSomaDias(hoje, -1); return { de: o, ate: o, rotulo: 'ontem', explicito: true }; }
  if ((m = t.match(/ultimos? (\d{1,3}) dias/))) return { de: agSomaDias(hoje, -(Number(m[1]) - 1)), ate: hoje, rotulo: 'nos últimos ' + m[1] + ' dias', explicito: true };
  if (/\b(essa|esta) semana\b|\bna semana\b/.test(t)) { var dow = agDiaSemana(hoje), ini = agSomaDias(hoje, -((dow + 6) % 7)); return { de: ini, ate: hoje, rotulo: 'nesta semana', explicito: true }; }
  if (/mes passado|mes anterior|ultimo mes/.test(t)) { var p = agMesAnt(ym); return { de: p + '-01', ate: p + '-' + agDiasNoMes(p), rotulo: 'no mês passado', explicito: true, mes: p }; }
  if (/\b(este|esse|neste|nesse) ano\b|\bno ano\b/.test(t)) return { de: hoje.slice(0, 4) + '-01-01', ate: hoje, rotulo: 'neste ano', explicito: true };
  for (var nome in AG_MESES) if (new RegExp('\\b(em |de |no mes de )?' + nome + '\\b').test(t)) {
    var a = Number(hoje.slice(0, 4)), mm = AG_MESES[nome]; if (mm > Number(hoje.slice(5, 7))) a--;
    var k = a + '-' + agArr2(mm); return { de: k + '-01', ate: k + '-' + agDiasNoMes(k), rotulo: 'em ' + nome, explicito: true, mes: k };
  }
  return { de: ym + '-01', ate: hoje, rotulo: 'neste mês', explicito: false, mes: ym };
}

/* ---------- vocabulário ---------- */
var AG_V_DESP = ['gastei', 'gasto', 'gastando', 'paguei', 'pago', 'pagando', 'comprei', 'compra', 'abasteci', 'torrei', 'desembolsei', 'saiu', 'perdi', 'debitou', 'debitaram', 'investi', 'doei', 'pedi', 'tomei', 'almocei', 'jantei', 'lanchei'];
var AG_V_REC = ['recebi', 'ganhei', 'entrou', 'caiu', 'depositaram', 'vendi', 'pingou', 'rendeu', 'receber', 'creditou'];
var AG_STOP = { de: 1, do: 1, da: 1, dos: 1, das: 1, no: 1, na: 1, nos: 1, nas: 1, em: 1, com: 1, para: 1, pra: 1, pro: 1, o: 1, a: 1, os: 1, as: 1, um: 1, uma: 1, meu: 1, minha: 1, meus: 1, minhas: 1, por: 1, e: 1, que: 1, foi: 1, era: 1, mais: 1, la: 1, ai: 1, ali: 1, hoje: 1, ontem: 1, anteontem: 1, reais: 1, real: 1, conto: 1, contos: 1, pila: 1, pilas: 1, paus: 1, 'r$': 1, ate: 1, agora: 1, acabei: 1, ja: 1, so: 1, aqui: 1, ao: 1, aos: 1, num: 1, numa: 1 };
// palavra-chave -> categoria (nome), por tipo
var AG_KW = [
  ['Restaurantes', 'despesa', 'almoco jantar restaurante lanche lanchonete pizza pizzaria hamburguer burger ifood rappi sushi cafe cafeteria padaria bar boteco churrasco marmita sorvete acai delivery petisco'],
  ['Mercado', 'despesa', 'mercado supermercado feira hortifruti sacolao atacado atacadao acougue compras-do-mes'],
  ['Transporte', 'despesa', 'combustivel gasolina etanol diesel abastecendo abastecer abasteci posto uber 99 taxi onibus metro trem passagem estacionamento pedagio bilhete carro moto'],
  ['Manutenção de veículo', 'despesa', 'mecanico oficina pneu revisao lavagem borracharia'],
  ['Contas de consumo', 'despesa', 'energia luz agua internet telefone celular gas conta-de-luz esgoto wifi'],
  ['Moradia/Aluguel', 'despesa', 'aluguel condominio iptu moradia'],
  ['Saúde', 'despesa', 'farmacia remedio medico dentista consulta exame hospital plano-de-saude psicologo terapia academia'],
  ['Assinaturas', 'despesa', 'netflix spotify assinatura disney hbo prime youtube deezer globoplay'],
  ['Lazer e Hobbies', 'despesa', 'cinema show teatro jogo game steam playstation lazer festa balada ingresso'],
  ['Roupas', 'despesa', 'roupa roupas camisa tenis sapato calca vestido'],
  ['Educação', 'despesa', 'curso faculdade escola mensalidade livro udemy aula'],
  ['Viagens', 'despesa', 'viagem hotel passagem-aerea hospedagem airbnb'],
  ['Pets', 'despesa', 'pet racao veterinario cachorro gato banho-e-tosa'],
  ['Presentes e Doações', 'despesa', 'presente doacao dizimo vaquinha'],
  ['Cuidados pessoais', 'despesa', 'cabelo barbeiro salao manicure perfume cosmetico'],
  ['Compras', 'despesa', 'amazon shopee mercadolivre magalu shein compra eletronico'],
  ['Investimento', 'despesa', 'investimento aporte cdb tesouro acoes'],
  ['Salário', 'receita', 'salario pagamento holerite folha ordenado'],
  ['Investimentos', 'receita', 'rendimento dividendo dividendos juros resgate'],
  ['Outras receitas', 'receita', 'freela freelance venda bonus premio reembolso extra pix mesada']
];
var AG_GRUPOS = { alimentacao: ['Alimentação', 'Mercado', 'Restaurantes'], comida: ['Alimentação', 'Mercado', 'Restaurantes'], comer: ['Alimentação', 'Mercado', 'Restaurantes'], lazer: ['Lazer e Hobbies'], carro: ['Transporte', 'Manutenção de veículo'], casa: ['Casa', 'Moradia/Aluguel', 'Contas de consumo'], transporte: ['Transporte', 'Manutenção de veículo'] };

function agCatPorNome(dados, nome, tipo) {
  var n = agNorm(nome), r = null;
  (dados.categorias || []).forEach(function (c) { if (!r && !c.arquivada && (!tipo || c.tipo === tipo) && agNorm(c.nome) === n) r = c; });
  return r;
}
function agMem(dados, tipo, chave) { var r = null; (dados.memoria || []).forEach(function (m) { if (m.tipo === tipo && agNorm(m.chave) === chave) r = m; }); return r; }
// escolhe categoria para uma descrição: memória aprendida > nome citado > palavra-chave
function agCategoria(tokensDesc, tokensTexto, tipo, dados) {
  var chaveDesc = tokensDesc.join(' '), i, n;
  var m = agMem(dados, 'desc', chaveDesc);
  if (m) { var c0 = agCatPorNome(dados, m.conteudo, tipo); if (c0) return { cat: c0, origem: 'memoria' }; }
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokensTexto.length; i++) {
    var fr = tokensTexto.slice(i, i + n).join(' '), mm = agMem(dados, 'desc', fr);
    if (mm) { var c1 = agCatPorNome(dados, mm.conteudo, tipo); if (c1) return { cat: c1, origem: 'memoria' }; }
  }
  var cats = dados.categorias || [], k;
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokensTexto.length; i++) {   // categoria citada pelo nome
    var f2 = tokensTexto.slice(i, i + n).join(' ');
    for (k = 0; k < cats.length; k++) if (!cats[k].arquivada && cats[k].tipo === tipo && agNorm(cats[k].nome) === f2) return { cat: cats[k], origem: 'nome' };
  }
  for (k = 0; k < AG_KW.length; k++) {
    if (AG_KW[k][1] !== tipo) continue;
    var pal = AG_KW[k][2].split(' ');
    for (i = 0; i < tokensTexto.length; i++) if (pal.indexOf(tokensTexto[i]) >= 0 || (tokensTexto[i].length > 4 && pal.some(function (p) { return p.length > 4 && agDist1(p, tokensTexto[i]); }))) {
      var c2 = agCatPorNome(dados, AG_KW[k][0], tipo); if (c2) return { cat: c2, origem: 'palavra' };
    }
  }
  return null;
}
function agContaDe(tokens, dados) {   // { conta, explicita }
  var contas = dados.contas || [], t = ' ' + tokens.join(' ') + ' ', i;
  if (!contas.length) return null;
  for (i = 0; i < contas.length; i++) { var nm = agNorm(contas[i].nome); if (nm.length >= 3 && t.indexOf(' ' + nm + ' ') >= 0) return { conta: contas[i], explicita: true }; }
  var porTipo = [['cartao', 'cartao'], ['investimento', 'investimento'], ['investimentos', 'investimento'], ['poupanca', 'poupanca'], ['carteira', 'dinheiro'], ['dinheiro', 'dinheiro'], ['corrente', 'corrente'], ['reserva', 'reserva']];
  for (i = 0; i < porTipo.length; i++) if (t.indexOf(' ' + porTipo[i][0] + ' ') >= 0) { var c = contas.filter(function (x) { return x.tipo === porTipo[i][1]; })[0]; if (c) return { conta: c, explicita: true }; }
  var pad = agMem(dados, 'conta_padrao', 'padrao');
  if (pad) { var cp = contas.filter(function (x) { return agNorm(x.nome) === agNorm(pad.conteudo); })[0]; if (cp) return { conta: cp, explicita: false }; }
  var uso = {}, lim = agSomaDias(dados.hoje, -90); (dados.lancamentos || []).forEach(function (l) { if (l.data >= lim) uso[l.contaId] = (uso[l.contaId] || 0) + 1; });
  var cand = contas.filter(function (x) { return x.tipo !== 'cartao'; }); if (!cand.length) cand = contas;
  cand.sort(function (a, b) { return (uso[b.id] || 0) - (uso[a.id] || 0); });
  return { conta: cand[0], explicita: false };
}
function agTokens(texto) { return agNorm(texto).split(' ').filter(Boolean); }
function agOriginais(texto) { return String(texto).replace(/\s+/g, ' ').trim().split(' '); }
function agEhVerbo(tok, lista) { for (var i = 0; i < lista.length; i++) if (tok === lista[i] || (tok.length >= 5 && agDist1(tok, lista[i]))) return lista[i]; return null; }

/* ---------- interpretação de um lançamento a partir do texto ---------- */
function agParseLancamento(texto, dados) {
  var orig = agOriginais(texto), tk = orig.map(agNorm).map(function (x) { return x.replace(/[,.]+$/, ''); });
  var d = agData(tk, dados.hoje), v = agValor(tk, d.usados);
  var tipo = null, verbo = null, i;
  for (i = 0; i < tk.length; i++) {
    if (agEhVerbo(tk[i], AG_V_REC)) { tipo = 'receita'; verbo = i; break; }
    if (agEhVerbo(tk[i], AG_V_DESP)) { tipo = 'despesa'; verbo = i; break; }
  }
  if (/^\+/.test(tk[0] || '')) tipo = tipo || 'receita';
  if (v && v.sinal === '-') tipo = tipo || 'despesa'; else if (v && v.sinal === '+') tipo = tipo || 'receita';
  var usados = {}; d.usados.forEach(function (k) { usados[k] = 1; });
  if (v) for (i = v.de; i <= v.ate; i++) usados[i] = 1;
  if (verbo !== null) usados[verbo] = 1;
  var resto = [], restoN = [];
  tk.forEach(function (t, k) { if (usados[k]) return; var n = t.replace(/^[+-]/, ''); if (AG_STOP[n] || !n || /^(r\$)$/.test(n)) return; if (agEhVerbo(n, AG_V_DESP.concat(AG_V_REC))) return; resto.push(orig[k].replace(/[,.;!?]+$/, '')); restoN.push(n); });
  var desc = resto.join(' ');
  // tipo implícito: "almoço 45" -> despesa; "salário 2800" -> receita
  if (!tipo && v) { var cr = agCategoria(restoN, tk, 'receita', dados), cd = agCategoria(restoN, tk, 'despesa', dados); if (cr && !cd) tipo = 'receita'; else if (cd) tipo = 'despesa'; }
  var cat = tipo ? agCategoria(restoN, tk, tipo, dados) : null;
  var conta = agContaDe(tk, dados);
  // tira o nome da conta da descrição
  if (conta && conta.explicita) { var nc = agNorm(conta.conta.nome).split(' '); restoN = restoN.filter(function (x) { return nc.indexOf(x) < 0; }); resto = resto.filter(function (x) { return nc.indexOf(agNorm(x)) < 0; }); desc = resto.join(' '); }
  return { tipo: tipo, valor: v ? v.valor : null, valorAmbiguo: !!(v && v.ambiguo), motivoValor: v ? v.motivo : '', data: d.data, dataExplicita: d.explicita, descricao: agCap(desc), tokensDesc: restoN, categoria: cat, conta: conta, temVerbo: verbo !== null, ntk: tk.length };
}

/* ---------- consulta de lançamentos ---------- */
function agNomesGrupo(chave) { return AG_GRUPOS[chave] || null; }
function agLancEm(dados, de, ate) { return (dados.lancamentos || []).filter(function (l) { return l.data >= de && l.data <= ate; }); }
function agCatId(dados, id) { var r = null; (dados.categorias || []).forEach(function (c) { if (c.id === id) r = c; }); return r; }
function agSoma(ls, tipo) { var s = 0; ls.forEach(function (l) { if (l.tipo === tipo) s += l.valor; }); return Math.round(s * 100) / 100; }
function agAcharCategoriaNaFrase(tokens, dados) {   // { ids:[], nome }
  var i, n, cats = dados.categorias || [];
  for (i = 0; i < tokens.length; i++) { var g = agNomesGrupo(tokens[i]); if (g) { var ids = []; g.forEach(function (nm) { var c = agCatPorNome(dados, nm); if (c) ids.push(c.id); }); if (ids.length) return { ids: ids, nome: agCap(tokens[i] === 'alimentacao' ? 'alimentação' : tokens[i]) }; } }
  for (n = 3; n >= 1; n--) for (i = 0; i + n <= tokens.length; i++) { var f = tokens.slice(i, i + n).join(' '); for (var k = 0; k < cats.length; k++) if (agNorm(cats[k].nome) === f) return { ids: [cats[k].id], nome: cats[k].nome }; }
  var m = null;
  for (i = 0; i < tokens.length && !m; i++) { var mm = agMem(dados, 'desc', tokens[i]); if (mm) { var c = agCatPorNome(dados, mm.conteudo); if (c) m = { ids: [c.id], nome: c.nome }; } }
  if (m) return m;
  for (var j = 0; j < AG_KW.length; j++) { var pal = AG_KW[j][2].split(' '); for (i = 0; i < tokens.length; i++) if (pal.indexOf(tokens[i]) >= 0) { var cc = agCatPorNome(dados, AG_KW[j][0]); if (cc) return { ids: [cc.id], nome: cc.nome }; } }
  return null;
}

/* ---------- MODO CONTADOR ---------- */
function agRecorrentes(dados) {
  var ym = dados.hoje.slice(0, 7), meses = [1, 2, 3, 4].map(function (n) { return agMesAnt(ym, n); }), grupos = {};
  (dados.lancamentos || []).forEach(function (l) {
    if (l.tipo !== 'despesa' || meses.indexOf(l.data.slice(0, 7)) < 0) return;
    var chave = agNorm(l.descricao).replace(/[0-9]+/g, '').split(' ').filter(function (w) { return w.length > 2 && !AG_STOP[w]; }).slice(0, 2).join(' ');
    if (!chave) return;
    var g = grupos[chave] = grupos[chave] || { chave: chave, nome: l.descricao, meses: {}, valores: [] };
    g.meses[l.data.slice(0, 7)] = 1; g.valores.push(l.valor);
  });
  var out = [];
  Object.keys(grupos).forEach(function (k) {
    var g = grupos[k], nm = Object.keys(g.meses).length, mn = Math.min.apply(null, g.valores), mx = Math.max.apply(null, g.valores);
    if (nm >= 3 && mx <= mn * 1.5) { var media = g.valores.reduce(function (a, b) { return a + b; }, 0) / g.valores.length; out.push({ nome: g.nome, media: Math.round(media * 100) / 100, meses: nm, lancadoNoMes: !!(dados.lancamentos || []).some(function (l) { return l.data.slice(0, 7) === ym && agNorm(l.descricao).replace(/[0-9]+/g, '').indexOf(k) === 0; }) }); }
  });
  out.sort(function (a, b) { return b.media - a.media; });
  return out;
}
function agAnalise(dados) {
  var hoje = dados.hoje, ym = hoje.slice(0, 7), dia = Number(hoje.slice(8, 10)), dim = agDiasNoMes(ym), r = { ym: ym, dia: dia, dim: dim };
  var meses = []; for (var i = 0; i < 6; i++) meses.push(agMesAnt(ym, i));
  r.serie = meses.map(function (m) { var ls = (dados.lancamentos || []).filter(function (l) { return l.data.slice(0, 7) === m; }); return { mes: m, rec: agSoma(ls, 'receita'), des: agSoma(ls, 'despesa'), n: ls.length }; }).reverse();
  var cur = r.serie[r.serie.length - 1], ant = r.serie[r.serie.length - 2];
  r.rec = cur.rec; r.des = cur.des; r.saldoMes = Math.round((cur.rec - cur.des) * 100) / 100; r.antRec = ant.rec; r.antDes = ant.des;
  r.totalLanc = (dados.lancamentos || []).length;
  var completos = r.serie.slice(0, -1).filter(function (s) { return s.n > 0; }).slice(-3);
  r.mesesBase = completos.length;
  r.mediaDes = completos.length ? Math.round(completos.reduce(function (a, s) { return a + s.des; }, 0) / completos.length * 100) / 100 : null;
  r.mediaRec = completos.length ? Math.round(completos.reduce(function (a, s) { return a + s.rec; }, 0) / completos.length * 100) / 100 : null;
  var contas = dados.contas || [];
  r.saldoLiquido = Math.round(contas.filter(function (c) { return c.tipo !== 'cartao'; }).reduce(function (a, c) { return a + c.saldo; }, 0) * 100) / 100;
  r.faturas = Math.round(contas.filter(function (c) { return c.tipo === 'cartao'; }).reduce(function (a, c) { return a + Math.min(0, c.saldo); }, 0) * 100) / 100;
  r.recorrentes = agRecorrentes(dados);
  r.fixosPendentes = Math.round(r.recorrentes.filter(function (x) { return !x.lancadoNoMes; }).reduce(function (a, x) { return a + x.media; }, 0) * 100) / 100;
  r.agendaPendente = Math.round(((dados.agendaPendentes || []).reduce(function (a, p) { return a + (p.tipo === 'receita' ? 0 : (p.valor || 0)); }, 0)) * 100) / 100;
  r.compromissos = Math.max(r.fixosPendentes, r.agendaPendente);   // não soma os dois: a agenda costuma repetir os fixos
  r.disponivel = Math.round((r.saldoLiquido + r.faturas - r.compromissos) * 100) / 100;
  r.diasRestantes = dim - dia;
  r.porDia = r.diasRestantes > 0 ? Math.round(Math.max(0, r.disponivel) / r.diasRestantes * 100) / 100 : r.disponivel;
  r.projDes = dia >= 5 ? Math.round((cur.des + cur.des / dia * (dim - dia)) * 100) / 100 : (r.mediaDes !== null ? r.mediaDes : null);
  r.projBasis = dia >= 5 ? 'ritmo de gastos deste mês' : 'média dos meses anteriores';
  // categorias
  var porCat = function (mes) { var m = {}; (dados.lancamentos || []).forEach(function (l) { if (l.tipo === 'despesa' && l.data.slice(0, 7) === mes) { var c = agCatId(dados, l.categoriaId), nm = c ? c.nome : 'Sem categoria'; m[nm] = (m[nm] || 0) + l.valor; } }); return m; };
  var mc = porCat(ym), ma = porCat(agMesAnt(ym));
  r.cats = Object.keys(mc).map(function (n) { return { nome: n, valor: Math.round(mc[n] * 100) / 100, ant: Math.round((ma[n] || 0) * 100) / 100 }; }).sort(function (a, b) { return b.valor - a.valor; });
  r.cats.forEach(function (c) { c.pct = r.des ? Math.round(c.valor / r.des * 100) : 0; c.var = c.ant >= 50 ? Math.round((c.valor - c.ant) / c.ant * 100) : null; });
  r.altas = r.cats.filter(function (c) { return c.var !== null && c.var >= 20 && c.valor - c.ant >= 50; });
  // possíveis desperdícios (sempre apresentados como "possível")
  r.desperdicios = [];
  var lsMes = agLancEm(dados, ym + '-01', hoje).filter(function (l) { return l.tipo === 'despesa'; });
  var ass = r.cats.filter(function (c) { return c.nome === 'Assinaturas'; })[0]; if (ass && ass.valor >= 50) r.desperdicios.push('Assinaturas somam ' + agBrl(ass.valor) + ' no mês. Vale revisar o que você realmente usa.');
  var rest = lsMes.filter(function (l) { var c = agCatId(dados, l.categoriaId); return c && c.nome === 'Restaurantes'; });
  if (rest.length >= 8) r.desperdicios.push(rest.length + ' gastos em restaurantes/delivery (' + agBrl(rest.reduce(function (a, l) { return a + l.valor; }, 0)) + ') neste mês.');
  var peq = lsMes.filter(function (l) { return l.valor < 30; }); var somaPeq = peq.reduce(function (a, l) { return a + l.valor; }, 0);
  if (peq.length >= 10 && somaPeq >= 150) r.desperdicios.push(peq.length + ' compras pequenas (abaixo de R$ 30) somam ' + agBrl(somaPeq) + '.');
  // riscos
  r.riscos = [];
  if (r.rec > 0 && r.des > r.rec) r.riscos.push('Neste mês você já gastou mais do que recebeu (' + agBrl(r.des) + ' contra ' + agBrl(r.rec) + ').');
  var ult3 = r.serie.slice(-4, -1).filter(function (s) { return s.rec > 0 || s.des > 0; }), neg = ult3.filter(function (s) { return s.des > s.rec; }).length;
  if (ult3.length >= 2 && neg >= 2) r.riscos.push('Em ' + neg + ' dos últimos ' + ult3.length + ' meses os gastos superaram as receitas.');
  if (r.saldoLiquido < 0) r.riscos.push('O saldo das suas contas está negativo (' + agBrl(r.saldoLiquido) + ').');
  if (r.faturas < 0 && r.saldoLiquido + r.faturas < 0) r.riscos.push('O saldo não cobre as faturas de cartão em aberto (' + agBrl(-r.faturas) + ').');
  if (r.projDes !== null && r.rec > 0 && r.projDes > Math.max(r.rec, r.mediaRec || 0) && dia >= 5) r.riscos.push('No ritmo atual, os gastos do mês chegariam a cerca de ' + agBrl(r.projDes) + ', acima das receitas já registradas.');
  (dados.limites || []).forEach(function (l) { if (l.pct >= 100) r.riscos.push('Limite estourado: ' + l.nome + ' (' + l.pct + '%).'); });
  var base = r.mediaRec || r.rec; if (base > 0 && r.recorrentes.length) { var fx = r.recorrentes.reduce(function (a, x) { return a + x.media; }, 0); if (fx / base > 0.5) r.riscos.push('Contas fixas consomem cerca de ' + Math.round(fx / base * 100) + '% da sua renda média.'); }
  // economia
  r.taxaPoup = r.rec > 0 ? Math.round((r.rec - r.des) / r.rec * 100) : null;
  var sv = r.serie.filter(function (s) { return s.n > 0; }).map(function (s) { return s.rec - s.des; });
  if (sv.length >= 4) { var h = Math.floor(sv.length / 2), a1 = sv.slice(0, h).reduce(function (a, b) { return a + b; }, 0) / h, a2 = sv.slice(h).reduce(function (a, b) { return a + b; }, 0) / (sv.length - h); r.tendencia = a2 > a1 + 50 ? 'melhorando' : (a2 < a1 - 50 ? 'piorando' : 'estável'); } else r.tendencia = null;
  r.metas = (dados.metas || []).map(function (m) { return { nome: m.nome, pct: m.valorAlvo ? Math.round(m.valorAtual / m.valorAlvo * 100) : 0 }; });
  // estratégias
  r.estrategias = [];
  if (r.altas.length) { var al = r.altas[0], lim = Math.ceil(Math.max(al.ant, (r.mediaDes ? al.ant : al.ant)) * 1.1 / 10) * 10; r.estrategias.push('Defina um limite mensal para ' + al.nome + ' (sugestão: ' + agBrl(lim) + ', o valor do mês passado + 10%). Dá para criar na aba Limites.'); }
  else if (r.cats.length && r.cats[0].pct >= 35) r.estrategias.push('Seu maior peso é ' + r.cats[0].nome + ' (' + r.cats[0].pct + '% dos gastos). Um limite mensal ajuda a acompanhar.');
  if (ass && ass.valor >= 50) r.estrategias.push('Revise as assinaturas: cancelar as que não usa libera ' + agBrl(ass.valor) + ' por mês, no máximo.');
  if (r.taxaPoup !== null && r.taxaPoup < 10 && r.rec > 0) r.estrategias.push('Tente reservar pelo menos 10% da renda no começo do mês (' + agBrl(r.rec * 0.1) + ' com a renda atual), em vez de guardar só o que sobra.');
  if (r.mediaDes && r.saldoLiquido < r.mediaDes * 3) r.estrategias.push('Monte uma reserva de emergência: três meses de gastos seriam cerca de ' + agBrl(r.mediaDes * 3) + '.');
  if (!r.estrategias.length) r.estrategias.push('Seus números estão equilibrados. Mantenha os registros em dia para eu continuar acompanhando.');
  return r;
}
var AG_RODAPE = 'Análise educativa, baseada nos lançamentos registrados; estimativas não são valores confirmados.';
function agPoucosDados(a) { return a.totalLanc < 5 || (a.rec === 0 && a.des === 0); }
function agContador(dados, foco, extra) {
  var a = agAnalise(dados), L = [], mes = a.ym.slice(5, 7) + '/' + a.ym.slice(0, 4);
  if (agPoucosDados(a) && foco !== 'ajuda') return { texto: 'Ainda tenho poucos lançamentos para analisar (' + a.totalLanc + '). Registre mais alguns gastos e receitas e volto com um diagnóstico de verdade.', analise: a };
  var pct = function (n) { return (n > 0 ? '+' : '') + n + '%'; };
  if (foco === 'gastando_mais') {
    if (a.rec === 0) L.push('Neste mês ainda não há receitas registradas; já saíram ' + agBrl(a.des) + '.');
    else if (a.des > a.rec) L.push('Sim: neste mês você gastou ' + agBrl(a.des) + ' e recebeu ' + agBrl(a.rec) + ' (faltam ' + agBrl(a.des - a.rec) + ').');
    else L.push('Até agora, não: você recebeu ' + agBrl(a.rec) + ' e gastou ' + agBrl(a.des) + ', sobrando ' + agBrl(a.rec - a.des) + (a.taxaPoup !== null ? ' (' + a.taxaPoup + '% da renda).' : '.'));
    if (a.projDes !== null && a.dia >= 5) L.push('Estimativa: se o ritmo continuar, os gastos do mês fecham perto de ' + agBrl(a.projDes) + '.');
    if (a.mediaRec !== null) L.push('Nos últimos ' + a.mesesBase + ' meses a média foi de ' + agBrl(a.mediaRec) + ' de receita e ' + agBrl(a.mediaDes) + ' de gastos.');
  } else if (foco === 'quanto_posso') {
    L.push('Com base no saldo das contas (' + agBrl(a.saldoLiquido) + ')' + (a.faturas < 0 ? ', as faturas em aberto (' + agBrl(-a.faturas) + ')' : '') + (a.compromissos > 0 ? ' e as contas fixas que ainda não apareceram neste mês (' + agBrl(a.compromissos) + ')' : '') + ', estimo que você pode gastar cerca de ' + agBrl(Math.max(0, a.disponivel)) + ' até o fim do mês' + (a.diasRestantes > 0 ? ', ou ' + agBrl(a.porDia) + ' por dia nos ' + a.diasRestantes + ' dias que restam.' : '.'));
    if (a.disponivel <= 0) L.push('Atenção: o saldo disponível já está comprometido.');
    L.push('É uma estimativa: não considera receitas que ainda vão entrar nem gastos imprevistos.');
  } else if (foco === 'posso_comprar') {
    var x = extra && extra.valor;
    if (!x) return { texto: 'Qual é o valor da compra? Por exemplo: "consigo comprar algo de R$ 500?"', analise: a };
    var reserva = a.mediaDes ? Math.round(a.mediaDes * 0.1) : 0, sobra = Math.round((a.disponivel - x) * 100) / 100;
    if (sobra < 0) L.push('Eu não recomendaria agora: pelas minhas contas, o disponível estimado é ' + agBrl(Math.max(0, a.disponivel)) + ' e a compra de ' + agBrl(x) + ' passaria dele em ' + agBrl(-sobra) + '.');
    else if (sobra < reserva) L.push('Dá, mas fica apertado: depois de ' + agBrl(x) + ' restariam cerca de ' + agBrl(sobra) + ', abaixo de uma folga de ' + agBrl(reserva) + ' (10% dos seus gastos médios).');
    else L.push('Parece possível: depois de ' + agBrl(x) + ' ainda restariam cerca de ' + agBrl(sobra) + ' até o fim do mês, considerando saldo atual menos contas fixas pendentes.');
    L.push('É uma estimativa com os dados registrados; não inclui receitas futuras nem imprevistos.');
  } else if (foco === 'onde_gasto') {
    if (!a.cats.length) L.push('Ainda não há despesas registradas neste mês.');
    else { L.push('Seus maiores gastos em ' + mes + ':'); a.cats.slice(0, 5).forEach(function (c) { L.push('• ' + c.nome + ': ' + agBrl(c.valor) + ' (' + c.pct + '%)' + (c.var !== null ? ', ' + pct(c.var) + ' vs. mês passado' : '')); }); }
  } else if (foco === 'recorrentes') {
    if (!a.recorrentes.length) L.push('Ainda não identifiquei despesas recorrentes (preciso de pelo menos 3 meses de histórico com valores parecidos).');
    else { L.push('Despesas que se repetem todo mês:'); a.recorrentes.slice(0, 8).forEach(function (x) { L.push('• ' + x.nome + ': cerca de ' + agBrl(x.media) + (x.lancadoNoMes ? '' : ' (ainda não lançada neste mês)')); }); }
  } else if (foco === 'economias') {
    L.push('Neste mês o saldo entre receitas e despesas é de ' + agBrl(a.saldoMes) + (a.taxaPoup !== null ? ' (' + a.taxaPoup + '% da renda).' : '.'));
    if (a.tendencia) L.push('A evolução dos últimos meses está ' + a.tendencia + '.');
    a.metas.slice(0, 3).forEach(function (m) { L.push('• Meta ' + m.nome + ': ' + m.pct + '% concluída.'); });
    L.push('Série: ' + a.serie.filter(function (s) { return s.n > 0; }).map(function (s) { return s.mes.slice(5) + '/' + s.mes.slice(2, 4) + ' ' + agBrl(s.rec - s.des); }).join(' · '));
  } else if (foco === 'desperdicio') {
    if (!a.desperdicios.length) L.push('Não vi padrões claros de desperdício neste mês. Compras pequenas e assinaturas dentro do normal.');
    else { L.push('Possíveis pontos de atenção (são indícios, só você sabe o que valeu a pena):'); a.desperdicios.forEach(function (d) { L.push('• ' + d); }); }
  } else if (foco === 'projecao') {
    L.push(a.projDes !== null ? 'Estimativa de gastos para fechar ' + mes + ': cerca de ' + agBrl(a.projDes) + ' (base: ' + a.projBasis + ').' : 'Preciso de mais dias de lançamentos para projetar.');
    if (a.projDes !== null) L.push('Receitas registradas até agora: ' + agBrl(a.rec) + (a.mediaRec ? '; média dos meses anteriores: ' + agBrl(a.mediaRec) + '.' : '.'));
  } else {   // situacao / relatorio
    L.push('Panorama de ' + mes + ' (' + AG_NOME + ', modo contador):');
    L.push('• Receitas: ' + agBrl(a.rec) + (a.antRec ? ' (' + pct(Math.round((a.rec - a.antRec) / a.antRec * 100)) + ' vs. mês passado)' : ''));
    L.push('• Despesas: ' + agBrl(a.des) + (a.antDes ? ' (' + pct(Math.round((a.des - a.antDes) / a.antDes * 100)) + ' vs. mês passado)' : ''));
    L.push('• Saldo do mês: ' + agBrl(a.saldoMes) + ' · saldo nas contas: ' + agBrl(a.saldoLiquido));
    if (a.cats[0]) L.push('• Maior categoria: ' + a.cats[0].nome + ' (' + a.cats[0].pct + '% dos gastos)');
    a.altas.slice(0, 2).forEach(function (c) { L.push('• Atenção: ' + c.nome + ' subiu ' + c.var + '% em relação ao mês passado.'); });
    if (a.projDes !== null && a.dia >= 5) L.push('• Estimativa: gastos do mês perto de ' + agBrl(a.projDes) + '.');
    if (a.riscos.length) { L.push('Riscos que vejo:'); a.riscos.slice(0, 4).forEach(function (x) { L.push('• ' + x); }); } else L.push('Não identifiquei riscos de desequilíbrio no momento.');
    if (foco === 'relatorio') { if (a.recorrentes.length) L.push('Fixos que se repetem: ' + a.recorrentes.slice(0, 4).map(function (x) { return x.nome + ' ' + agBrl(x.media); }).join(', ') + '.'); a.desperdicios.slice(0, 3).forEach(function (d) { L.push('• ' + d); }); if (a.tendencia) L.push('Evolução das economias: ' + a.tendencia + '.'); }
    L.push('O que eu faria:'); a.estrategias.slice(0, foco === 'relatorio' ? 4 : 2).forEach(function (s) { L.push('• ' + s); });
  }
  L.push(AG_RODAPE);
  return { texto: L.join('\n'), analise: a };
}

/* ---------- respostas e utilidades de conversa ---------- */
var AG_SUGESTOES = ['Como está minha situação financeira?', 'Quanto gastei este mês?', 'Onde estou gastando mais?', 'Quanto posso gastar até o fim do mês?'];
function agAjuda(apelido) {
  return ['Posso ajudar com:', '• Registrar: "gastei 45 no almoço", "recebi 2.800 de salário", "paguei 120 de energia ontem"', '• Consultar: "quanto gastei com alimentação este mês?", "qual meu saldo?"', '• Alterar ou apagar (sempre com sua confirmação): "altere a internet para 110", "apague o lançamento do almoço"', '• Modo Contador: "como está minha situação?", "posso comprar algo de R$ 500?"', '• Aprender: "quando eu disser mercadinho, é Mercado", "me chame de ' + (apelido || 'Ana') + '"', '• Corrigir: "desfazer" ou "não, é transporte" logo depois de um registro.'].join('\n');
}
function agMsgAguardo(p) { return p.tipo === 'confirmar' ? 'Responda "sim" para confirmar ou "não" para cancelar.' : ''; }
function agRespostaLanc(t, cat, conta, explicitaConta, usouPalavra) {
  var s = (t.tipo === 'despesa' ? 'Despesa' : 'Receita') + ' de ' + agBrl(t.valor) + ' registrada: ' + (t.descricao || (cat ? cat.nome : 'sem descrição')) + ' · ' + (cat ? cat.nome : 'sem categoria') + ' · ' + agDataBR(t.data) + ' · ' + conta.nome + '.';
  return s;
}
function agSimNao(t) {
  if (/^(sim|s|ss|yes|claro|pode|pode sim|confirmo|confirmar|isso|isso mesmo|ok|okay|beleza|manda|bora|certo|positivo|fechado|vai)$/.test(t)) return 'sim';
  if (/^(nao|n|nope|cancela|cancelar|cancele|deixa|deixa pra la|esquece|negativo|para|melhor nao)$/.test(t)) return 'nao';
  return null;
}
function agAcharLanc(dados, tokensAlvo, tipo, valorHint) {
  var lim = agSomaDias(dados.hoje, -150), alvo = tokensAlvo.filter(function (w) { return w.length > 2 && !AG_STOP[w]; }), melhor = null, mScore = 0;
  (dados.lancamentos || []).forEach(function (l) {
    if (l.data < lim || (tipo && l.tipo !== tipo)) return;
    var c = agCatId(dados, l.categoriaId), alvoTxt = agNorm(l.descricao + ' ' + (c ? c.nome : '')).split(' '), s = 0;
    alvo.forEach(function (w) { if (alvoTxt.some(function (x) { return x === w || (w.length >= 4 && (x.indexOf(w.slice(0, 4)) === 0 || w.indexOf(x.slice(0, 4)) === 0) && x.length >= 4); })) s++; });
    if (valorHint && Math.abs(l.valor - valorHint) < 0.005) s += 2;
    if (s > mScore || (s === mScore && s > 0 && melhor && l.data > melhor.data)) { mScore = s; melhor = l; }
  });
  return mScore > 0 ? melhor : null;
}
function agDescLanc(dados, l) { var c = agCatId(dados, l.categoriaId); return (l.descricao || 'Sem descrição') + ' — ' + agBrl(l.valor) + ' (' + (l.tipo === 'despesa' ? 'despesa' : 'receita') + ', ' + agDataBR(l.data) + (c ? ', ' + c.nome : '') + ')'; }

/* ---------- COPILOTO: guia do app, glossário, consultas, inconsistências ---------- */
var AG_GUIA = [
  { tela: 'jornada', rotulo: 'Jornada', nomes: 'jornada cerebro inicio home', desc: 'visão geral em 3D: cada região do cérebro representa uma parte do seu dinheiro.', como: ['Toque numa região para ver o resumo dela.', 'Use o botão do cérebro para ligar ou desligar o 3D.'] },
  { tela: 'painel', rotulo: 'Painel', nomes: 'painel dashboard indicadores graficos resumo relatorio relatorios', desc: 'saldo nas contas, receitas, despesas do mês e o gráfico dos últimos 6 meses.', como: ['Troque o mês nas setas do topo.', 'Os cartões mostram saldo, receitas e despesas; o gráfico compara os últimos 6 meses.'] },
  { tela: 'lanc', rotulo: 'Lançamentos', nomes: 'lancamento lancamentos transacao transacoes movimentacao movimentacoes extrato gasto gastos despesa despesas receita receitas registrar lancar', desc: 'onde você registra e consulta receitas e despesas.', como: ['Escolha Despesa ou Receita.', 'Informe valor, data, conta e categoria (a descrição é opcional).', 'Toque em Salvar. Dá para editar ou excluir na lista.', 'Atalho: diga ao Rumi "gastei 45 no almoço".'] },
  { tela: 'orc', rotulo: 'Orçamentos', nomes: 'orcamento orcamentos planejamento planejar', desc: 'limite mensal por categoria e acompanhamento do planejado contra o realizado.', como: ['Escolha a categoria e o limite do mês.', 'Toque em Definir limite.', 'Use "Copiar do mês anterior" para repetir o planejamento.'] },
  { tela: 'metas', rotulo: 'Metas', nomes: 'meta metas objetivo objetivos sonho', desc: 'objetivos de poupança com valor alvo, prazo e quanto você já guardou.', como: ['Em "Nova meta", informe o nome (ex.: Viagem) e o valor alvo.', 'Opcional: quanto já guardou e o prazo.', 'Toque em Criar meta. Depois dá para registrar aportes.', 'Atalho: diga ao Rumi "criar meta Viagem de 5 mil".'] },
  { tela: 'contas', rotulo: 'Contas', nomes: 'conta contas carteira banco saldo inicial', desc: 'suas contas e carteiras, com o saldo de cada uma.', como: ['Informe o nome (ex.: Banco principal), o tipo e o saldo inicial.', 'Toque em Adicionar conta.'] },
  { tela: 'cats', rotulo: 'Categorias', nomes: 'categoria categorias classificar', desc: 'as categorias de despesas e receitas.', como: ['Em "Nova categoria", informe o nome e o tipo.', 'Toque em Adicionar categoria. Dá para arquivar ou excluir (movendo os lançamentos).', 'Atalho: diga ao Rumi "criar categoria Pets".'] },
  { tela: 'cambio', rotulo: 'Câmbio', nomes: 'cambio moeda moedas dolar euro cotacao conversor', desc: 'cotações e conversor de moedas.', como: ['Busque a moeda e toque na estrela para favoritar.', 'Use o conversor para calcular valores.'] },
  { tela: 'cartoes', rotulo: 'Cartões', nomes: 'cartao cartoes fatura credito', desc: 'cartões de crédito, fatura atual, limite disponível e datas de fechamento.', como: ['Em "Novo cartão", informe nome, limite e os dias de fechamento e vencimento.', 'Lance as compras na conta do tipo cartão para ver a fatura.'] },
  { tela: 'invest', rotulo: 'Investimentos', nomes: 'investimento investimentos ativo ativos acao acoes carteira', desc: 'seus ativos, quantidade, preço médio e a distribuição por classe.', como: ['Em "Novo ativo", informe nome, código, quantidade e preço médio.', 'Toque em Adicionar ativo.'] },
  { tela: 'agenda', rotulo: 'Agenda', nomes: 'agenda lembrete lembretes vencimento vencimentos conta-a-pagar agendar', desc: 'contas a pagar e a receber, com lembretes.', como: ['Em "Novo item na agenda", informe descrição, valor e data.', 'Marque como concluído quando pagar.'] },
  { tela: 'limites', rotulo: 'Limites', nomes: 'limite limites alerta alertas teto', desc: 'limites de gasto por categoria, conta ou geral, com alertas quando chegar perto.', como: ['Em "Novo limite de gastos", escolha o escopo e o valor.', 'Toque em Salvar limite. Os alertas aparecem no histórico.'] },
  { tela: 'conexoes', rotulo: 'Conexões', nomes: 'conexao conexoes banco open-finance importar', desc: 'conexão bancária (Open Finance) para importar suas transações.', como: ['Leia e aceite o consentimento.', 'Toque em Conectar meu banco e siga o fluxo seguro.'] },
  { tela: 'cons', rotulo: 'Consultor', nomes: 'consultor analise dicas', desc: 'análise automática do seu mês, com avisos e dicas.', como: ['Abra a tela para ver a análise do mês selecionado.', 'Toque em Reanalisar para atualizar.'] },
  { tela: 'opcoes', rotulo: 'Opções', nomes: 'opcoes configuracao configuracoes ajustes tema preferencias permissoes privacidade', desc: 'aparência, permissões, memória e WhatsApp do Rumi, tutorial.', como: ['Troque tema, cores e tamanho do texto.', 'Em Permissões e privacidade você consulta e altera o que autorizou.', 'Aqui também ficam a memória do Rumi, o registro de ações e o WhatsApp.'] },
  { tela: 'perfil', rotulo: 'Perfil', nomes: 'perfil conta-google foto apelido', desc: 'seus dados, foto e apelido.', como: ['Edite o apelido e a data de nascimento e toque em Salvar.'] },
  { tela: 'ajuda', rotulo: 'Ajuda', nomes: 'ajuda suporte duvida duvidas faq contato', desc: 'perguntas frequentes e contato com o suporte.', como: ['Busque sua dúvida na caixa de pesquisa.', 'Se não achar, envie uma mensagem pelo app.'] }
];
var AG_GLOSS = [
  ['saldo nas contas', 'a soma do saldo de todas as suas contas (cartões de crédito não entram: eles têm a fatura).', 'saldoLiquido'],
  ['saldo do mês', 'receitas do mês menos despesas do mês. Positivo = sobrou dinheiro; negativo = gastou mais do que entrou.', 'saldoMes'],
  ['saldo disponivel', 'estimativa de quanto você ainda pode gastar até o fim do mês: saldo das contas, menos faturas em aberto e menos contas fixas que ainda não apareceram.', 'disponivel'],
  ['taxa de poupanca', 'a parte da renda do mês que sobrou: (receitas − despesas) ÷ receitas.', 'taxaPoup'],
  ['limite', 'um teto de gastos (geral, por categoria ou por conta). O app avisa quando você chega perto ou passa.'],
  ['orcamento', 'o valor que você planejou gastar por categoria no mês, comparado com o que realmente gastou.'],
  ['meta', 'um objetivo de poupança com valor alvo e, se quiser, prazo. A barra mostra quanto já foi guardado.'],
  ['fatura', 'o que você já gastou no cartão e ainda vai pagar. Fica como saldo negativo na conta do tipo cartão.'],
  ['despesa recorrente', 'um gasto que se repete todo mês com valor parecido (internet, assinaturas). O Rumi identifica olhando 3 ou mais meses.'],
  ['recorrente', 'um gasto que se repete todo mês com valor parecido (internet, assinaturas). O Rumi identifica olhando 3 ou mais meses.'],
  ['projecao', 'uma estimativa de como o mês vai fechar, mantendo o ritmo atual de gastos. É uma estimativa, não um valor confirmado.'],
  ['modo contador', 'a análise do Rumi sobre seus números reais: panorama, riscos, categorias que subiram e o que fazer. Sempre educativa.'],
  ['cotacao', 'o preço de uma moeda em reais no dia. Nos lançamentos em moeda estrangeira, é a taxa usada na conversão.'],
  ['open finance', 'sistema do Banco Central que permite importar suas transações do banco, com o seu consentimento.']
];
function agAchaGuia(t, dados) {   // texto normalizado -> item do guia (o de maior pontuação)
  var tk = t.split(' '), melhor = null, ms = 0;
  AG_GUIA.forEach(function (g) {
    var pal = g.nomes.split(' '), sc = 0;
    tk.forEach(function (w) { if (w.length >= 3 && pal.some(function (p) { return p === w || (w.length >= 5 && agDist1(p, w)); })) sc++; });
    if (sc > ms) { ms = sc; melhor = g; }
  });
  return melhor;
}
function agTextoGuia(g, dados) {
  return g.rotulo + ': ' + g.desc + '\n' + g.como.map(function (c, i) { return (i + 1) + '. ' + c; }).join('\n');
}
function agMetasTxt(dados) {
  var ms = dados.metas || []; if (!ms.length) return 'Você ainda não tem metas. Diga "criar meta Viagem de 5 mil" ou abra Metas.';
  return 'Suas metas:\n' + ms.slice(0, 8).map(function (m) { var pc = m.valorAlvo ? Math.round(m.valorAtual / m.valorAlvo * 100) : 0; return '• ' + m.nome + ': ' + agBrl(m.valorAtual) + ' de ' + agBrl(m.valorAlvo) + ' (' + pc + '%)' + (m.valorAlvo > m.valorAtual ? ', faltam ' + agBrl(m.valorAlvo - m.valorAtual) : ', concluída'); }).join('\n');
}
// Possíveis inconsistências nos dados (sempre "possíveis": só o usuário sabe o que está certo)
function agInconsistencias(dados) {
  var ls = dados.lancamentos || [], out = [], hoje = dados.hoje, i;
  var vistos = {}, dup = [];
  ls.forEach(function (l) { var k = [l.data, l.tipo, l.valor, l.contaId, agNorm(l.descricao)].join('|'); if (vistos[k]) dup.push(l); else vistos[k] = l; });
  if (dup.length) out.push({ tipo: 'duplicados', n: dup.length, txt: dup.length + ' possível(is) duplicado(s) (mesma data, valor, conta e descrição): ' + dup.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor) + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var semCat = ls.filter(function (l) { return !l.categoriaId || !agCatId(dados, l.categoriaId); });
  if (semCat.length) out.push({ tipo: 'sem_categoria', n: semCat.length, txt: semCat.length + ' lançamento(s) sem categoria: ' + semCat.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor); }).join('; ') + '.' });
  var fut = ls.filter(function (l) { return l.data > hoje; }); if (fut.length) out.push({ tipo: 'futuros', n: fut.length, txt: fut.length + ' lançamento(s) com data futura: ' + fut.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var um = ls.filter(function (l) { return l.valor === 1; }); if (um.length) out.push({ tipo: 'valor_um', n: um.length, txt: um.length + ' lançamento(s) de exatamente R$ 1,00 (pode ser valor digitado errado): ' + um.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var porCat = {}; ls.forEach(function (l) { if (l.tipo === 'despesa' && l.categoriaId) (porCat[l.categoriaId] = porCat[l.categoriaId] || []).push(l); });
  var alt = []; Object.keys(porCat).forEach(function (k) { var v = porCat[k]; if (v.length < 5) return; var ord = v.map(function (x) { return x.valor; }).sort(function (a, b) { return a - b; }), med = ord[Math.floor(ord.length / 2)]; v.forEach(function (l) { if (med > 0 && l.valor >= med * 8 && l.valor >= 200) alt.push(l); }); });
  if (alt.length) out.push({ tipo: 'valor_alto', n: alt.length, txt: alt.length + ' valor(es) muito acima do normal da categoria: ' + alt.slice(0, 3).map(function (l) { return (l.descricao || 'sem descrição') + ' ' + agBrl(l.valor) + ' em ' + agDataBR(l.data); }).join('; ') + '.' });
  var neg = (dados.contas || []).filter(function (c) { return c.tipo !== 'cartao' && c.saldo < 0; }); if (neg.length) out.push({ tipo: 'saldo_negativo', n: neg.length, txt: 'Conta(s) com saldo negativo: ' + neg.map(function (c) { return c.nome + ' ' + agBrl(c.saldo); }).join('; ') + ' (confira o saldo inicial ou lançamentos faltando).' });
  var cats = dados.categorias || [], usadas = {}; ls.forEach(function (l) { usadas[l.categoriaId] = 1; });
  return out;
}
function agRespondeGasto(dados, tipoC, catF, per) {
  var lsq = agLancEm(dados, per.de, per.ate).filter(function (l) { return l.tipo === tipoC && (!catF || catF.ids.indexOf(l.categoriaId) >= 0); });
  var soma = Math.round(lsq.reduce(function (a, l) { return a + l.valor; }, 0) * 100) / 100;
  return (tipoC === 'receita' ? 'Você recebeu ' : 'Você gastou ') + agBrl(soma) + (catF ? ' com ' + catF.nome.toLowerCase() : '') + ' ' + per.rotulo + ' (' + lsq.length + ' lançamento' + (lsq.length === 1 ? '' : 's') + ').';
}

/* ---------- o turno de conversa ---------- */
// estado: { pendente, ultimo }  ->  { resposta, acoes, estado, sugestoes, humor, relatorio }
function agTurno(estado, texto, dados) {
  estado = JSON.parse(JSON.stringify(estado || {}));
  var orig = String(texto || '').trim().slice(0, 500);
  var t = agNorm(orig), tk = t.split(' ').filter(Boolean).map(function (x) { return x.replace(/[,.]+$/, ''); }), perm = dados.permissoes || { criar: true, editar: true, excluir: true };
  var out = { resposta: '', acoes: [], estado: estado, sugestoes: [], humor: 'ok', relatorio: null };
  var finaliza = function (resp, humor, sug) { out.resposta = resp; if (humor) out.humor = humor; if (sug) out.sugestoes = sug; return out; };
  if (!t) return finaliza('Pode falar: o que você quer registrar ou consultar?', 'espera', AG_SUGESTOES);
  var chamado = dados.apelido ? ', ' + dados.apelido : '';
  var temContas = (dados.contas || []).length > 0;

  /* 1) pendências (pergunta feita antes ou confirmação) */
  var p = estado.pendente;
  if (p && p.expira && dados.agora && p.expira < dados.agora) { estado.pendente = null; p = null; }
  if (p) {
    if (p.tipo === 'confirmar') {
      var sn = agSimNao(t);
      if (sn === 'sim') { estado.pendente = null; out.acoes = p.acoes; out.humor = 'executando'; return finaliza(p.respostaOk || 'Feito!', 'confirmando'); }
      if (sn === 'nao') { estado.pendente = null; return finaliza('Tudo bem, não fiz nada.', 'ok', AG_SUGESTOES); }
      estado.pendente = null;   // outra frase: descarta a pendência e trata como comando novo
      out.aviso = 'Descartei a confirmação anterior.';
    } else if (p.tipo === 'confirmar_valor') {
      var sv = agSimNao(t); estado.pendente = null;
      if (sv === 'sim') return agTurno(estado, p.texto, Object.assign({}, dados, { valorConfirmado: p.valor }));
      if (sv === 'nao') return finaliza('Ok, não registrei nada. Diga o valor de novo, por exemplo: "gastei R$ 3.000,00 no mercado".', 'ok', AG_SUGESTOES);
    } else if (p.tipo === 'perguntar') {
      var r = agResponderPergunta(p, orig, t, tk, dados);
      if (r) { if (r.pendente) { estado.pendente = r.pendente; return finaliza(r.resposta, 'espera', r.sugestoes); } estado.pendente = null; if (r.acoes) { out.acoes = r.acoes; } return finaliza(r.resposta, r.humor || 'confirmando', r.sugestoes); }
      estado.pendente = null;
    }
  }

  /* 2) meta-intenções */
  if (/^(oi|ola|opa|e ai|eae|bom dia|boa tarde|boa noite|hey|hello|salve)( .*)?$/.test(t) && tk.length <= 4) return finaliza('Olá' + chamado + '! Eu sou o ' + AG_NOME + ', seu assistente financeiro. ' + (dados.resumoRapido || 'Me diga o que gastou ou recebeu, ou pergunte sobre suas finanças.'), 'ok', AG_SUGESTOES);
  if (/^(obrigad|valeu|brigad|thanks|show|legal|perfeito|top|boa|massa)/.test(t) && tk.length <= 4) return finaliza('Por nada' + chamado + '! Estou por aqui.', 'ok');
  if (/^(ajuda|help|o que voce faz|o que voce sabe fazer|comandos|como funciona|menu)/.test(t) || /o que (voce|vc) (faz|pode)/.test(t)) return finaliza(agAjuda(dados.apelido), 'ok', AG_SUGESTOES);
  var m;
  if (/^(desfaz|desfazer|desfaca|volta|voltar|cancela o ultimo|apaga o ultimo|errei)/.test(t) || /^(desfa[cz]|anula)/.test(t)) {
    if (!estado.ultimo || !estado.ultimo.auditId) return finaliza('Não encontrei nada recente para desfazer. Se quiser, apague um lançamento específico dizendo "apague o lançamento de ..."; eu peço confirmação.', 'problema');
    if (!perm.editar && !perm.excluir && !perm.criar) return finaliza('Você desativou minhas permissões de alteração.', 'problema');
    out.acoes = [{ op: 'desfazer', auditId: estado.ultimo.auditId }]; var desfeito = estado.ultimo; estado.ultimo = null;
    return finaliza('Desfeito: ' + (desfeito.resumo || 'a última operação') + '. Se mudar de ideia, é só registrar de novo.', 'confirmando');
  }
  if ((m = t.match(/^(nao|errado|na verdade|errei|corrige|corrija)[, ]+(?:e|foi|era|a categoria e|eh|seria)?\s*(.+)$/)) && estado.ultimo && estado.ultimo.lancId && !/\d/.test(m[2])) {
    var cn = agAcharCategoriaNaFrase(agTokens(m[2]), dados);
    if (cn && cn.ids.length) { var cc = (dados.categorias || []).filter(function (c) { return c.id === cn.ids[0]; })[0];
      if (!perm.editar) return finaliza('Você desativou minha permissão de editar lançamentos.', 'problema');
      out.acoes = [{ op: 'alterar', id: estado.ultimo.lancId, mudancas: { categoriaId: cc.id } }];
      var ap = estado.ultimo.chaveDesc ? [{ tipo: 'desc', chave: estado.ultimo.chaveDesc, conteudo: cc.nome }] : [];
      if (ap.length) out.acoes.push({ op: 'aprender', itens: ap });
      return finaliza('Corrigido: "' + (estado.ultimo.descricao || 'o lançamento') + '" agora está em ' + cc.nome + '.' + (ap.length ? ' Vou lembrar disso da próxima vez.' : ''), 'confirmando');
    }
  }
  if ((m = t.match(/^(?:aprenda|aprende|lembre|lembra|guarde|anote)(?: que| disso)?[: ]+(?:quando eu (?:falar|disser|escrever) )?(.+?) (?:e|eh|=|sao|significa|vai para|vai pra|conta como)\s+(?:da categoria |categoria |de |do |a |o )?(.+)$/)) || (m = t.match(/^quando eu (?:falar|disser|escrever|digitar) (.+?),? (?:e|eh|=|considere|use|lance como|vai para|vai pra)\s+(?:da categoria |categoria |de |do |a |o )?(.+)$/)) || (m = t.match(/^(?:chame|chamar|trate|considere) (.+?) de (?:categoria )?(.+)$/))) {
    var cat2 = agAcharCategoriaNaFrase(agTokens(m[2]), dados), termo = agNorm(m[1]).replace(/^(o|a|os|as) /, '');
    if (cat2 && cat2.ids.length && termo && termo.length >= 2) { var cx = (dados.categorias || []).filter(function (c) { return c.id === cat2.ids[0]; })[0];
      out.acoes = [{ op: 'aprender', itens: [{ tipo: 'desc', chave: termo, conteudo: cx.nome }] }];
      return finaliza('Combinado: quando você falar "' + termo + '", vou classificar em ' + cx.nome + '.', 'confirmando'); }
    return finaliza('Entendi que "' + m[1] + '" tem um significado especial, mas não achei a categoria "' + m[2] + '". Diga o nome de uma categoria que você já tem (por exemplo Mercado, Transporte, Lazer e Hobbies).', 'problema');
  }
  if ((m = t.match(/^(?:me chame|pode me chamar|meu apelido e|meu nome e|pode chamar de|me chama) (?:de )?(.+)$/))) { var nome = agCap(orig.replace(/^.*?(?:de |e )\s*/i, '').replace(/[.!]+$/, '').trim().slice(0, 30)); if (nome.length >= 2) { out.acoes = [{ op: 'aprender', itens: [{ tipo: 'preferencia', chave: 'apelido', conteudo: nome }] }]; return finaliza('Prazer, ' + nome + '! Vou te chamar assim.', 'confirmando'); } }
  if ((m = t.match(/^(?:minha conta (?:principal|padrao) e|use (?:sempre )?a conta|conta padrao)(?: e| a)? (.+)$/))) { var ct = agContaDe(agTokens(m[1]), { contas: dados.contas, hoje: dados.hoje, lancamentos: [], memoria: [] }); if (ct && ct.explicita) { out.acoes = [{ op: 'aprender', itens: [{ tipo: 'conta_padrao', chave: 'padrao', conteudo: ct.conta.nome }] }]; return finaliza('Certo, vou usar "' + ct.conta.nome + '" quando você não disser a conta.', 'confirmando'); } return finaliza('Não achei essa conta. Suas contas: ' + (dados.contas || []).map(function (c) { return c.nome; }).join(', ') + '.', 'problema'); }
  if ((m = t.match(/^(?:esqueca|esquece|apague da memoria|remova da memoria)(?: que| o que| sobre)?\s+(.+)$/)) && !/lancamento|despesa|receita|gasto/.test(t)) { var chave = agNorm(m[1]); var item = (dados.memoria || []).filter(function (x) { return agNorm(x.chave) === chave || agNorm(x.conteudo) === chave; })[0]; if (item) { out.acoes = [{ op: 'esquecer', tipo: item.tipo, chave: item.chave }]; return finaliza('Esqueci: "' + m[1] + '".', 'confirmando'); } return finaliza('Não tenho nada guardado sobre "' + m[1] + '". Para ver o que sei, diga "o que você sabe sobre mim?".', 'ok'); }
  if (/(o que|oque) (voce )?(sabe|lembra|aprendeu)|minha memoria|o que (voce )?guardou/.test(t)) {
    var itens = (dados.memoria || []).filter(function (x) { return x.tipo === 'desc' || x.tipo === 'conta_padrao' || x.tipo === 'preferencia' || x.tipo === 'fato'; });
    if (!itens.length) return finaliza('Ainda não aprendi nada específico sobre você. Conforme você usa, vou lembrando como você chama cada gasto. Também dá para ensinar: "quando eu disser mercadinho, é Mercado".', 'ok');
    return finaliza('Isso é o que eu sei (você pode corrigir ou apagar em Configurações › Memória):\n' + itens.slice(0, 12).map(function (x) { return '• ' + (x.tipo === 'desc' ? '"' + x.chave + '" → ' + x.conteudo : x.tipo === 'conta_padrao' ? 'conta padrão: ' + x.conteudo : x.chave + ': ' + x.conteudo); }).join('\n'), 'ok');
  }

  /* 2b) copiloto do app: navegação, como fazer, explicar tela/indicadores, tutorial */
  if (/\b(tutorial|tour|primeiros passos|me mostra o app|me ensina a usar o app|como usar o app)\b/.test(t) && !/gast|receb/.test(t)) {
    var ret = /continu|retom/.test(t); out.abrir = { tutorial: ret ? 'retomar' : 'iniciar', rotulo: ret ? 'Continuar o tutorial' : 'Iniciar o tutorial', auto: true };
    return finaliza(ret ? 'Vamos continuar de onde você parou.' : 'Vou te mostrar o app passo a passo. Dá para pausar quando quiser.', 'apresentando');
  }
  if ((m = t.match(/^(?:abra|abrir|abre|ir para|ir pra|va para|vai para|vai pra|me leva(?:r)?(?: para| pra| ate)?|leve-me(?: para| ate)?|mostre|mostra|quero ver|quero abrir)\s+(?:a |o |as |os |minha |minhas |meu |meus |na |no |nas |nos )?(.+)$/)) && !/\d/.test(m[1])) {
    var gd = agAchaGuia(agNorm(m[1]), dados);
    if (gd) { out.abrir = { tela: gd.tela, rotulo: 'Abrir ' + gd.rotulo, auto: true }; return finaliza('Abrindo ' + gd.rotulo + '.', 'executando'); }
  }
  if (/(explica|explique|como (eu )?uso|pra que serve|para que serve|o que (e|faz|posso fazer)|me ajuda com|como funciona)\b.*\b(esta|essa|aqui|tela|pagina)\b|^(como uso (isso|aqui)|onde estou|o que posso fazer aqui)/.test(t) && dados.tela) {
    var gt = AG_GUIA.filter(function (x) { return x.tela === dados.tela; })[0];
    if (gt) return finaliza('Você está em ' + agTextoGuia(gt, dados), 'apresentando', ['Como lanço um gasto?', 'Como crio uma meta?', 'Verificar meus dados']);
  }
  if ((m = t.match(/^(?:o que (?:e|significa|quer dizer)|oque e|explique|explica|me explica|defina)\s+(?:o |a |os |as |um |uma )?(.+)$/)) && !/gast|receb|lanc/.test(m[1].split(' ')[0])) {
    var termo = m[1].replace(/\?+$/, '').trim(), gl = AG_GLOSS.filter(function (x) { return termo.indexOf(x[0]) >= 0 || x[0].indexOf(termo) >= 0 && termo.length >= 4; })[0];
    if (gl) { var extra = ''; if (gl[2]) { var an = agAnalise(dados), v = an[gl[2]]; if (v !== null && v !== undefined && !agPoucosDados(an)) extra = ' No seu caso, agora: ' + (gl[2] === 'taxaPoup' ? v + '%.' : agBrl(v) + '.'); } return finaliza(agCap(gl[0].replace('saldo disponivel', 'saldo disponível').replace('taxa de poupanca', 'taxa de poupança').replace('orcamento', 'orçamento').replace('projecao', 'projeção').replace('cotacao', 'cotação')) + ' é ' + gl[1] + extra, 'apresentando'); }
    var gg = agAchaGuia(agNorm(termo), dados); if (gg && !/^(o|a)$/.test(termo)) return finaliza(agTextoGuia(gg, dados), 'apresentando');
  }
  if (/\b(como|onde|aonde|qual)\b.*\b(faco|fazer|crio|criar|cadastro|cadastrar|adiciono|adicionar|registro|registrar|lanco|lancar|uso|usar|configuro|configurar|defino|definir|vejo|ver|encontro|encontrar|acho|achar|fica|ficam|esta|estao|edito|editar|excluo|excluir|apago|apagar|conecto|conectar)\b|^(onde|como)\b|me ensina|me explica como/.test(t) && !/\d/.test(t) && !/(quanto|gastei|recebi|paguei)/.test(t)) {
    var gc = agAchaGuia(t.replace(/\b(como|onde|eu|faco|fazer|crio|criar|cadastro|cadastrar|uso|usar|vejo|ver|fica|esta|um|uma|o|a|os|as|de|do|da|no|na|meu|minha|meus|minhas)\b/g, ' ').replace(/\s+/g, ' ').trim(), dados);
    if (gc) { out.abrir = { tela: gc.tela, rotulo: 'Abrir ' + gc.rotulo, auto: false }; return finaliza('Em ' + agTextoGuia(gc, dados), 'apresentando', ['Abrir ' + gc.rotulo, 'Verificar meus dados']); }
    if (/\b(app|aplicativo|sistema|rumo)\b/.test(t)) return finaliza('Posso explicar qualquer parte do app: Painel, Lançamentos, Orçamentos, Metas, Contas, Categorias, Cartões, Investimentos, Agenda, Limites, Câmbio, Conexões, Consultor e Opções. Diga, por exemplo, "como cadastro uma meta?" ou "onde vejo meus cartões?".', 'apresentando', ['Como crio uma meta?', 'Onde vejo meus cartões?', 'Iniciar tutorial']);
  }
  if (/verific(ar|a|que)|revis(ar|e)|confer(ir|e)|inconsistenc|(tem|ha) (algum )?erro|dados (estao )?(certos|corretos)|auditar/.test(t) && /(dados|lancamentos|contas|inconsistenc|erro|tudo)/.test(t)) {
    var inc = agInconsistencias(dados);
    if (!(dados.lancamentos || []).length) return finaliza('Ainda não há lançamentos para verificar.', 'ok');
    if (!inc.length) return finaliza('Verifiquei seus lançamentos e contas e não encontrei duplicados, valores suspeitos, datas futuras ou lançamentos sem categoria. 👍', 'confirmando');
    return finaliza('Encontrei ' + inc.length + ' ponto(s) para você conferir (são só indícios; você decide o que está certo):\n' + inc.map(function (x) { return '• ' + x.txt; }).join('\n') + '\nPara corrigir, diga por exemplo "altere o valor do mercado para 80" ou "apague o lançamento do almoço" (eu peço sua confirmação).', 'analisando');
  }
  /* 2c) consultas ao app: metas, limites, contas, categorias, agenda */
  if (/\b(minhas?|meus?|quais|como estao|como esta|ver)\b.*\bmetas?\b|\bmetas?\b.*(andamento|progresso|quanto falta)/.test(t) && !/crie|criar|nova|cadastr|adicion/.test(t)) return finaliza(agMetasTxt(dados), 'analisando');
  if (/\b(meus?|quais|como estao|ver)\b.*\blimites?\b/.test(t) && !/crie|criar|novo/.test(t)) { var lm = dados.limites || []; return finaliza(lm.length ? 'Seus limites neste mês:\n' + lm.slice(0, 8).map(function (x) { return '• ' + x.nome + ': ' + agBrl(x.gasto || 0) + ' de ' + agBrl(x.limite || 0) + (x.pct !== undefined ? ' (' + x.pct + '%)' : ''); }).join('\n') : 'Você ainda não definiu limites. Abra Limites para criar o primeiro.', 'analisando', lm.length ? [] : ['Abrir Limites']); }
  if (/\b(minhas|quais|listar|liste)\b.*\bcontas\b|\bcontas (que )?(eu )?tenho\b/.test(t) && !/\d|compr|pagar|comprometer/.test(t)) return finaliza((dados.contas || []).length ? 'Suas contas:\n' + dados.contas.map(function (c) { return '• ' + c.nome + ' (' + c.tipo + '): ' + agBrl(c.saldo); }).join('\n') : 'Você ainda não tem contas.', 'analisando');
  if (/\b(minhas|quais|listar|liste)\b.*\bcategorias\b/.test(t)) { var cs = (dados.categorias || []).filter(function (c) { return !c.arquivada; }); return finaliza('Categorias de despesa: ' + cs.filter(function (c) { return c.tipo === 'despesa'; }).map(function (c) { return c.nome; }).join(', ') + '.\nCategorias de receita: ' + cs.filter(function (c) { return c.tipo === 'receita'; }).map(function (c) { return c.nome; }).join(', ') + '.', 'analisando'); }
  if (/(proximos?|pendentes?|a pagar|vencimentos?|agenda)/.test(t) && /(contas|pagar|vencimento|agenda|proximos|pendente)/.test(t) && !/crie|adicione|lance/.test(t)) { var ag = dados.agendaPendentes || []; return finaliza(ag.length ? 'Pendências na agenda:\n' + ag.slice(0, 8).map(function (x) { return '• ' + (x.data ? agDataBR(x.data) + ' ' : '') + (x.descricao || '(sem descrição)') + ': ' + agBrl(x.valor || 0); }).join('\n') : 'Nada pendente na agenda.', 'analisando'); }
  /* 2d) criar meta / categoria (ferramentas validadas, com auditoria e desfazer) */
  if ((m = t.match(/^(?:crie|criar|cria|nova|novo|quero criar|quero uma|cadastre|cadastrar|adicione|adicionar|adiciona)\s+(?:uma |a )?meta(?:\s+(?:de|para|chamada|chamado|:))?\s*(.*)$/))) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar. Dá para reativar em Opções › Rumi.', 'problema');
    var vm = agValor(tk, []), nomeTk = [], resto = m[1] ? agOriginais(m[1]) : [];
    var usadosM = {}; if (vm) { for (i = vm.de; i <= vm.ate; i++) usadosM[i] = 1; }
    var tkAll = tk, pos = tkAll.indexOf('meta');
    resto = tkAll.map(function (w, ix) { return { w: w, ix: ix }; }).filter(function (o) { return o.ix > pos && !usadosM[o.ix] && !AG_STOP[o.w] && o.w !== 'meta' && o.w !== 'valor' && o.w !== 'chamada'; }).map(function (o) { return agOriginais(orig)[o.ix].replace(/[,.;!?]+$/, ''); });
    var nomeM = agCap(resto.join(' ').slice(0, 60));
    if (vm && vm.ambiguo && dados.valorConfirmado !== vm.valor) { estado.pendente = { tipo: 'confirmar_valor', texto: orig, valor: vm.valor, expira: dados.expira }; return finaliza('Entendi o valor ' + agBrl(vm.valor) + ' (' + (vm.motivo || 'formato ambíguo') + '). Está certo? (sim/não)', 'identificando', ['Sim', 'Não']); }
    if (!nomeM) { estado.pendente = { tipo: 'perguntar', falta: 'meta_nome', slots: { valor: vm ? vm.valor : null }, expira: dados.expira }; return finaliza('Qual é o nome da meta? (ex.: Viagem, Reserva de emergência)', 'espera'); }
    if (!vm) { estado.pendente = { tipo: 'perguntar', falta: 'meta_valor', slots: { nome: nomeM }, expira: dados.expira }; return finaliza('Qual é o valor alvo da meta "' + nomeM + '"?', 'espera'); }
    if ((dados.metas || []).some(function (x) { return agNorm(x.nome) === agNorm(nomeM); })) return finaliza('Já existe uma meta chamada "' + nomeM + '". Escolha outro nome ou abra Metas para editar.', 'problema');
    out.acoes = [{ op: 'criar_meta', dados: { nome: nomeM, valorAlvo: vm.valor } }];
    return finaliza('Meta criada: ' + nomeM + ', alvo de ' + agBrl(vm.valor) + '. Você pode registrar aportes na aba Metas.', 'confirmando');
  }
  if ((m = t.match(/^(?:crie|criar|cria|nova|novo|cadastre|cadastrar|adicione|adicionar|adiciona)\s+(?:uma |a )?categoria\s+(?:de |para |chamada |:)?\s*(.+)$/))) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar. Dá para reativar em Opções › Rumi.', 'problema');
    var recC = /\b(receita|entrada)\b/.test(m[1]), nomeC = agCap(agOriginais(orig).slice(agTokens(orig).indexOf('categoria') + 1).filter(function (w) { var n = agNorm(w); return !AG_STOP[n] && n !== 'categoria' && n !== 'receita' && n !== 'despesa' && n !== 'chamada'; }).join(' ').replace(/[,.;!?]+$/, '').slice(0, 40));
    if (!nomeC) return finaliza('Qual é o nome da categoria? Ex.: "criar categoria Pets".', 'espera');
    var tpC = recC ? 'receita' : 'despesa';
    if (agCatPorNome(dados, nomeC, tpC)) return finaliza('Já existe a categoria "' + nomeC + '" de ' + tpC + '.', 'problema');
    out.acoes = [{ op: 'criar_categoria', dados: { nome: nomeC, tipo: tpC } }];
    return finaliza('Categoria criada: ' + nomeC + ' (' + tpC + ').' + (recC ? '' : ' Se for de receita, diga "criar categoria ' + nomeC + ' de receita".'), 'confirmando');
  }

  /* 3) Modo Contador */
  var foco = null;
  if (/modo contador|relatorio|analise completa|diagnostico|me de um panorama|resumo financeiro/.test(t)) foco = 'relatorio';
  else if (/situacao (financeira|das minhas financas)|como (estao|esta) (minhas|as minhas|minha|a minha) (financas|situacao|vida financeira)|como estou (de dinheiro|financeiramente)|minhas financas/.test(t)) foco = 'situacao';
  else if (/(gastando|gasto|gastei) mais (do )?que (ganho|recebo|recebi|ganhei)|gastando demais|no vermelho|fechando no negativo/.test(t)) foco = 'gastando_mais';
  else if (/quanto (eu )?(posso|dá pra|da pra|consigo) gastar|quanto (me )?(resta|sobra|falta)|quanto tenho (livre|disponivel|pra gastar)|posso gastar quanto/.test(t)) foco = 'quanto_posso';
  else if (/(consigo|posso|da pra|da para|cabe|dá pra) (comprar|pagar|gastar|parcelar)|compro algo|devo comprar/.test(t) && /\d|mil|reais|conto|cem|duzent|quinhent/.test(t)) foco = 'posso_comprar';
  else if (/onde (eu )?(estou|to|tou) gastando|(maiores|principais) (gastos|despesas)|que categoria(s)? (mais )?(gasto|pesa|consome)|em que (eu )?gasto mais|para onde (vai|foi) (meu|o) dinheiro/.test(t)) foco = 'onde_gasto';
  else if (/(despesas|gastos|contas) (fixas|recorrentes)|recorrente|assinaturas que|o que se repete/.test(t) && !/lance|registr/.test(t)) foco = 'recorrentes';
  else if (/desperdic|gastos? (a toa|desnecessario|inutil)|onde (posso|da pra) economizar|onde cortar|como economizar/.test(t)) foco = 'desperdicio';
  else if (/evolucao (das|de) (minhas )?economias|minhas economias|quanto (estou |to )?(guardando|economizando)|taxa de poupanca/.test(t)) foco = 'economias';
  else if (/projecao|previsao|como (vou|vai) fechar|vou fechar o mes|fim do mes.*(gastos|fechar)/.test(t)) foco = 'projecao';
  if (foco) {
    var ex = {}; if (foco === 'posso_comprar') { var vv = agValor(tk, []); ex.valor = vv ? vv.valor : null; }
    var rc = agContador(dados, foco, ex); out.relatorio = rc.analise; return finaliza(rc.texto, foco === 'situacao' || foco === 'relatorio' ? 'apresentando' : 'analisando', foco === 'situacao' || foco === 'relatorio' ? ['Onde estou gastando mais?', 'Quanto posso gastar até o fim do mês?', 'Onde posso economizar?'] : AG_SUGESTOES);
  }

  /* 4) consultas simples */
  if (/qual (e )?(o )?(meu )?saldo|quanto (eu )?tenho( na conta| em conta| de saldo)?$|saldo( total| das contas| atual)?$|^saldo\b/.test(t) && !/gast|receb/.test(t)) {
    if (!temContas) return finaliza('Você ainda não tem contas cadastradas.', 'problema');
    var tot = (dados.contas || []).reduce(function (a, c) { return a + c.saldo; }, 0);
    return finaliza('Saldo total: ' + agBrl(tot) + '.\n' + (dados.contas || []).map(function (c) { return '• ' + c.nome + ': ' + agBrl(c.saldo); }).join('\n'), 'analisando');
  }
  if (/(ultimos|ultimas|recentes) (lancamentos|gastos|movimentacoes|compras)|extrato|ultimas movimentacoes/.test(t)) {
    var ls = (dados.lancamentos || []).slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 6);
    return finaliza(ls.length ? 'Últimos lançamentos:\n' + ls.map(function (l) { return '• ' + agDataBR(l.data) + ' ' + (l.descricao || '(sem descrição)') + ': ' + (l.tipo === 'despesa' ? '−' : '+') + agBrl(l.valor); }).join('\n') : 'Ainda não há lançamentos.', 'analisando');
  }
  var fu = estado.ctx && estado.ctx.gasto ? t.match(/^(?:e|e o|e a|e os|e as|e no|e na|e em|e com|e de)\s+(.+)$/) : null;
  if (fu && tk.length <= 6) {   // "e no mês passado?" / "e com mercado?" reaproveita a última consulta
    var perF = agPeriodo(fu[1], dados.hoje), catN = agAcharCategoriaNaFrase(agTokens(fu[1]).filter(function (w) { return !AG_MESES[w] && ['mes', 'passado', 'hoje', 'ontem', 'semana'].indexOf(w) < 0; }), dados), g0 = estado.ctx.gasto;
    if (perF.explicito || catN) { var per2 = perF.explicito ? perF : { de: g0.de, ate: g0.ate, rotulo: g0.rotulo }, cat2c = catN || (g0.catIds ? { ids: g0.catIds, nome: g0.catNome } : null); estado.ctx.gasto = { tipo: g0.tipo, de: per2.de, ate: per2.ate, rotulo: per2.rotulo, catIds: cat2c ? cat2c.ids : null, catNome: cat2c ? cat2c.nome : '' }; return finaliza(agRespondeGasto(dados, g0.tipo, cat2c, per2), 'analisando', AG_SUGESTOES); }
  }
  if (/quanto (eu )?(gastei|gastamos|gasto|recebi|ganhei|entrou|paguei|sai[ur])|total de (gastos|despesas|receitas)|(minhas )?(despesas|receitas|gastos) (de|do|da|em|neste|este|esse|no)\b/.test(t) && !/lance|registr|adicione/.test(t)) {
    var per = agPeriodo(t, dados.hoje), rec = /recebi|ganhei|entrou|receita/.test(t) && !/gast|despesa|paguei/.test(t), tipoC = rec ? 'receita' : 'despesa';
    var tokensSemPer = tk.filter(function (w) { return !AG_MESES[w]; }), catF = agAcharCategoriaNaFrase(tokensSemPer.filter(function (w) { return ['mes', 'passado', 'hoje', 'ontem', 'semana'].indexOf(w) < 0; }), dados);
    estado.ctx = Object.assign({}, estado.ctx, { gasto: { tipo: tipoC, de: per.de, ate: per.ate, rotulo: per.rotulo, catIds: catF ? catF.ids : null, catNome: catF ? catF.nome : '' } });
    return finaliza(agRespondeGasto(dados, tipoC, catF, per), 'analisando', AG_SUGESTOES);
  }

  /* 5) alterar / excluir */
  var vAlt = /^(altere|alterar|altera|mude|muda|mudar|corrija|corrigir|troque|trocar|atualize|atualizar|edite|editar|modifique)\b/.test(t), vExc = /^(exclua|excluir|apague|apagar|remova|remover|delete|deletar|tire|retire)\b/.test(t);
  if ((vAlt || vExc) && !/^(apague|exclua|remova|delete).*(memoria|conversa|historico)/.test(t)) {
    var tipoF = /\breceita\b|\bentrada\b/.test(t) ? 'receita' : (/\bdespesa\b|\bgasto\b|\bsaida\b/.test(t) ? 'despesa' : null);
    var vl = agValor(tk, []), campo = /categoria/.test(t) ? 'categoria' : (/\bdata\b/.test(t) ? 'data' : (/descricao|\bnome\b/.test(t) ? 'descricao' : 'valor'));
    var iPara = tk.indexOf('para') >= 0 ? tk.indexOf('para') : (tk.indexOf('pra') >= 0 ? tk.indexOf('pra') : -1), antes = iPara >= 0 ? tk.slice(0, iPara) : tk, depois = iPara >= 0 ? tk.slice(iPara + 1) : [];
    var ignore = { altere: 1, alterar: 1, altera: 1, mude: 1, muda: 1, mudar: 1, corrija: 1, corrigir: 1, troque: 1, trocar: 1, atualize: 1, atualizar: 1, edite: 1, editar: 1, modifique: 1, exclua: 1, excluir: 1, apague: 1, apagar: 1, remova: 1, remover: 1, delete: 1, deletar: 1, tire: 1, retire: 1, valor: 1, categoria: 1, data: 1, descricao: 1, nome: 1, despesa: 1, receita: 1, gasto: 1, lancamento: 1, entrada: 1, saida: 1, ultimo: 1, ultima: 1 };
    var alvoTk = antes.filter(function (w) { return !ignore[w] && !/^\d/.test(w) && !AG_STOP[w]; });
    var vAlvo = vExc ? (vl ? vl.valor : null) : null;
    var alvo = null;
    if (!alvoTk.length && /ultimo|ultima/.test(t) && estado.ultimo && estado.ultimo.lancId) alvo = (dados.lancamentos || []).filter(function (l) { return l.id === estado.ultimo.lancId; })[0] || null;
    else alvo = agAcharLanc(dados, alvoTk, tipoF, vAlvo);
    if (!alvo) return finaliza('Não encontrei um lançamento parecido com "' + (alvoTk.join(' ') || '...') + '" nos últimos 5 meses. Diga o nome como aparece na lista (por exemplo "internet") e, se quiser, o valor.', 'problema');
    if (vExc) {
      if (!perm.excluir) return finaliza('Você desativou minha permissão de excluir lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
      estado.pendente = { tipo: 'confirmar', acoes: [{ op: 'excluir', id: alvo.id }], respostaOk: 'Excluído: ' + agDescLanc(dados, alvo) + '. Se foi engano, diga "desfazer".', expira: dados.expira };
      return finaliza('Vou excluir: ' + agDescLanc(dados, alvo) + '.\nConfirma? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    if (!perm.editar) return finaliza('Você desativou minha permissão de editar lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
    var mud = {}, resumoMud = '';
    if (campo === 'valor') { var nv = agValor(depois.length ? depois : tk.filter(function (_, i) { return true; }), []); if (!nv || !(nv.valor > 0)) return finaliza('Para qual valor devo alterar? Por exemplo: "altere a internet para R$ 110".', 'problema'); mud.valor = nv.valor; resumoMud = 'valor ' + agBrl(alvo.valor) + ' → ' + agBrl(nv.valor); }
    else if (campo === 'categoria') { var cn2 = agAcharCategoriaNaFrase(depois, dados); if (!cn2 || !cn2.ids.length) return finaliza('Para qual categoria? Diga o nome de uma categoria sua (por exemplo Mercado, Transporte).', 'problema'); var cobj = (dados.categorias || []).filter(function (c) { return c.id === cn2.ids[0]; })[0]; if (cobj.tipo !== alvo.tipo) return finaliza('A categoria ' + cobj.nome + ' é de ' + cobj.tipo + ' e o lançamento é de ' + alvo.tipo + '.', 'problema'); mud.categoriaId = cobj.id; resumoMud = 'categoria → ' + cobj.nome; }
    else if (campo === 'data') { var dd = agData(depois, dados.hoje); if (!dd.explicita) return finaliza('Para qual data? Por exemplo: "altere a data da internet para dia 10".', 'problema'); mud.data = dd.data; resumoMud = 'data ' + agDataBR(alvo.data) + ' → ' + agDataBR(dd.data); }
    else { var nd = agOriginais(orig); var pos = nd.findIndex(function (w) { return /^(para|pra)$/i.test(w); }); var novaD = pos >= 0 ? agCap(nd.slice(pos + 1).join(' ').replace(/[.!]+$/, '')) : ''; if (!novaD) return finaliza('Qual deve ser a nova descrição?', 'problema'); mud.descricao = novaD.slice(0, 200); resumoMud = 'descrição → "' + mud.descricao + '"'; }
    var depoisL = Object.assign({}, alvo, mud, mud.categoriaId ? { categoriaId: mud.categoriaId } : {});
    estado.pendente = { tipo: 'confirmar', acoes: [{ op: 'alterar', id: alvo.id, mudancas: mud }], respostaOk: 'Alterado: ' + agDescLanc(dados, depoisL) + '.', expira: dados.expira };
    return finaliza('Vou alterar ' + agDescLanc(dados, alvo) + ':\n• ' + resumoMud + '\nConfirma? (sim/não)', 'identificando', ['Sim', 'Não']);
  }

  /* 6) aporte (mover dinheiro para uma conta de investimentos) */
  if ((m = t.match(/^(adicione|adicionar|adiciona|coloque|colocar|deposite|depositar|transfira|transferir|aporte|aportar|invista|investir|guarde|guardar|ponha)\b/)) && /(na|em|para|pra|no) (minha )?(conta|carteira|investiment|poupanca|reserva)|conta de (investimento|poupanca)/.test(t)) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar lançamentos.', 'problema');
    var va = agValor(tk, []); if (!va) return finaliza('Qual o valor do aporte?', 'espera');
    var cdest = agContaDe(tk, dados);
    var invest = (dados.contas || []).filter(function (c) { return c.tipo === 'investimento' || c.tipo === 'poupanca' || c.tipo === 'reserva'; });
    var destino = cdest && cdest.explicita ? cdest.conta : (invest.length === 1 ? invest[0] : null);
    if (!destino) return finaliza('Em qual conta devo registrar o aporte? Suas contas: ' + (dados.contas || []).map(function (c) { return c.nome; }).join(', ') + '.', 'espera');
    var origemT = null, mO = t.match(/\b(?:de|da|do|usando|saindo d[aeo]) (?:minha )?(?:conta )?(.+)$/), origC = mO ? agContaDe(agTokens(mO[1]), dados) : null; if (origC && origC.explicita && origC.conta.id !== destino.id) origemT = origC.conta;
    if (!origemT) { estado.pendente = { tipo: 'perguntar', falta: 'conta_origem', slots: { valor: va.valor, destinoId: destino.id, data: agData(tk, dados.hoje).data }, expira: dados.expira }; return finaliza('Aporte de ' + agBrl(va.valor) + ' em ' + destino.nome + '. De qual conta o dinheiro saiu? (' + (dados.contas || []).filter(function (c) { return c.id !== destino.id; }).map(function (c) { return c.nome; }).join(', ') + ') Se não saiu de nenhuma conta do app, responda "só registrar".', 'espera', (dados.contas || []).filter(function (c) { return c.id !== destino.id; }).map(function (c) { return c.nome; }).concat(['Só registrar'])); }
    return agMontaAporte(out, estado, dados, va.valor, destino, origemT, agData(tk, dados.hoje).data);
  }

  /* 7) lançamento (gastei / recebi / "almoço 45") */
  var L = agParseLancamento(orig, dados);
  var ehLanc = L.valor && (L.temVerbo || (L.tipo && L.ntk <= 7 && !/\?/.test(orig)) || /^[+-]/.test(tk[0] || ''));
  var ehNotificacao = L.valor && /(compra aprovada|compra no cartao|pix (enviado|recebido)|transferencia (enviada|recebida)|pagamento (de|da|do|realizado|efetuado)|debito|voce (pagou|recebeu|transferiu))|\bcompra\b.*r\$/.test(t);
  if (ehNotificacao) { L = agParseNotificacao(orig, dados) || L; ehLanc = !!L.valor; }
  if (ehLanc) {
    if (!perm.criar) return finaliza('Você desativou minha permissão de criar lançamentos. Dá para reativar em Configurações › Permissões.', 'problema');
    if (!temContas) return finaliza('Você ainda não tem nenhuma conta. Crie uma na aba Contas e eu registro daí em diante.', 'problema');
    if (!L.tipo) { estado.pendente = { tipo: 'perguntar', falta: 'tipo', slots: { valor: L.valor, data: L.data, descricao: L.descricao, contaId: L.conta.conta.id }, expira: dados.expira }; return finaliza('Foi uma despesa (saiu dinheiro) ou uma receita (entrou)? Valor: ' + agBrl(L.valor) + '.', 'espera', ['Despesa', 'Receita']); }
    if (!isFinite(L.valor) || L.valor <= 0) return finaliza('Não consegui entender o valor. Diga, por exemplo, "R$ 3.000,00", "3k" ou "3 mil reais".', 'problema');
    if (L.valor > 100000000) return finaliza('Esse valor parece alto demais; confirme o número e tente de novo.', 'problema');
    if (L.valorAmbiguo && dados.valorConfirmado !== L.valor) {   // nunca registra valor duvidoso sem confirmação
      estado.pendente = { tipo: 'confirmar_valor', texto: orig, valor: L.valor, expira: dados.expira };
      return finaliza('Entendi o valor ' + agBrl(L.valor) + ' (' + (L.motivoValor || 'o formato é ambíguo') + '). Está certo? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    if (L.data > dados.hoje) return finaliza('Essa data está no futuro. Para compromissos futuros use a Agenda; para registrar, diga a data do gasto.', 'problema');
    if (!L.categoria) { estado.pendente = { tipo: 'perguntar', falta: 'categoria', slots: { tipo: L.tipo, valor: L.valor, data: L.data, descricao: L.descricao, contaId: L.conta.conta.id, tokensDesc: L.tokensDesc, origem: dados.origem }, expira: dados.expira };
      var opcoes = (dados.categorias || []).filter(function (c) { return !c.arquivada && c.tipo === L.tipo; }).map(function (c) { return c.nome; });
      return finaliza('Entendi ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' (' + L.descricao + ')' : '') + '. Em qual categoria registro?', 'espera', opcoes.slice(0, 8)); }
    var lan = { tipo: L.tipo, valor: L.valor, data: L.data, contaId: L.conta.conta.id, categoriaId: L.categoria.cat.id, descricao: L.descricao || L.categoria.cat.nome };
    var ap2 = L.tokensDesc.length && L.categoria.origem !== 'memoria' ? [{ tipo: 'desc', chave: L.tokensDesc.slice(0, 3).join(' '), conteudo: L.categoria.cat.nome }] : (L.tokensDesc.length ? [{ tipo: 'desc', chave: L.tokensDesc.slice(0, 3).join(' '), conteudo: L.categoria.cat.nome }] : []);
    var txt = agRespostaLanc(lan, L.categoria.cat, L.conta.conta);
    var resumoUlt = (L.tipo === 'despesa' ? 'despesa' : 'receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' (' + L.descricao + ')' : '');
    var cont = { op: 'lancar', dados: lan, ultimo: { descricao: lan.descricao, chaveDesc: L.tokensDesc.slice(0, 3).join(' '), resumo: resumoUlt } };
    var dica = L.categoria.origem === 'palavra' ? ' Não era ' + L.categoria.cat.nome + '? Se estiver errado, diga "não, é lazer" (ou outra categoria) que eu corrijo e aprendo.' : '';
    // origem WhatsApp/notificação encaminhada: sempre pede confirmação antes de registrar
    if (dados.origem === 'whatsapp' && (dados.encaminhada || ehNotificacao)) {
      estado.pendente = { tipo: 'confirmar', acoes: [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []), respostaOk: txt, expira: dados.expira };
      return finaliza('Encontrei ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' em "' + L.descricao + '"' : '') + ' (' + L.categoria.cat.nome + ', ' + agDataBR(L.data) + ', ' + L.conta.conta.nome + '). Registro no app? Responda sim ou não.', 'identificando', ['Sim', 'Não']);
    }
    if (ehNotificacao) {   // no app: mostra o que entendeu e pede confirmação
      estado.pendente = { tipo: 'confirmar', acoes: [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []), respostaOk: txt, expira: dados.expira };
      return finaliza('Li esta mensagem como ' + (L.tipo === 'despesa' ? 'uma despesa' : 'uma receita') + ' de ' + agBrl(L.valor) + (L.descricao ? ' em "' + L.descricao + '"' : '') + ' (' + L.categoria.cat.nome + ', ' + agDataBR(L.data) + ', ' + L.conta.conta.nome + '). Registro? (sim/não)', 'identificando', ['Sim', 'Não']);
    }
    out.acoes = [cont].concat(ap2.length ? [{ op: 'aprender', itens: ap2 }] : []);
    return finaliza(txt + dica, 'confirmando');
  }

  /* 8) não entendi */
  if (L.valor && !L.tipo) { estado.pendente = { tipo: 'perguntar', falta: 'tipo', slots: { valor: L.valor, data: L.data, descricao: L.descricao, contaId: temContas ? L.conta.conta.id : '' }, expira: dados.expira }; return finaliza('Vi o valor ' + agBrl(L.valor) + '. Foi uma despesa ou uma receita?', 'espera', ['Despesa', 'Receita']); }
  return finaliza('Não entendi bem' + chamado + '. Você pode dizer, por exemplo: "gastei 45 no almoço", "quanto gastei com mercado este mês?" ou "como está minha situação financeira?".', 'problema', AG_SUGESTOES);
}

function agMontaAporte(out, estado, dados, valor, destino, origem, data) {
  var catD = agCatPorNome(dados, 'Investimentos', 'receita'), catO = agCatPorNome(dados, 'Investimento', 'despesa'), ac = [];
  var desc = 'Aporte em ' + destino.nome;
  if (origem) ac.push({ op: 'lancar', dados: { tipo: 'despesa', valor: valor, data: data, contaId: origem.id, categoriaId: catO ? catO.id : '', descricao: desc } });
  ac.push({ op: 'lancar', dados: { tipo: 'receita', valor: valor, data: data, contaId: destino.id, categoriaId: catD ? catD.id : '', descricao: desc }, ultimo: { descricao: desc, chaveDesc: '', resumo: 'aporte de ' + agBrl(valor) } });
  out.acoes = ac; out.resposta = 'Aporte de ' + agBrl(valor) + ' registrado em ' + destino.nome + (origem ? ', com a saída correspondente em ' + origem.name : ' (sem saída em outra conta)') + '.'; if (origem) out.resposta = out.resposta.replace(origem.name, origem.nome);
  out.humor = 'confirmando'; return out;
}

// resposta a uma pergunta pendente
function agResponderPergunta(p, orig, t, tk, dados) {
  var s = p.slots || {};
  if (p.falta === 'tipo') {
    var tipo = /desp|saida|gast|paguei|saiu/.test(t) ? 'despesa' : (/rece|entrada|recebi|entrou|ganh/.test(t) ? 'receita' : null);
    if (!tipo) return null;
    var cat = agCategoria(agTokens(s.descricao || ''), agTokens(s.descricao || ''), tipo, dados);
    if (!cat) return { pendente: { tipo: 'perguntar', falta: 'categoria', slots: { tipo: tipo, valor: s.valor, data: s.data, descricao: s.descricao, contaId: s.contaId, tokensDesc: agTokens(s.descricao || '') }, expira: p.expira }, resposta: 'Em qual categoria registro?', sugestoes: (dados.categorias || []).filter(function (c) { return !c.arquivada && c.tipo === tipo; }).map(function (c) { return c.nome; }).slice(0, 8) };
    return agFechaLanc({ tipo: tipo, valor: s.valor, data: s.data, descricao: s.descricao, contaId: s.contaId, tokensDesc: agTokens(s.descricao || '') }, cat.cat, dados);
  }
  if (p.falta === 'categoria') {
    if (tk.length > 4 || /^(apague|exclua|altere|mude|desfaz|quanto|qual|como|gastei|recebi|paguei)/.test(t)) return null;   // frase nova, não a resposta à pergunta
    var cn = agAcharCategoriaNaFrase(tk, dados), c = null;
    (dados.categorias || []).forEach(function (x) { if (!c && !x.arquivada && x.tipo === s.tipo && (agNorm(x.nome) === t || (cn && cn.ids.indexOf(x.id) >= 0))) c = x; });
    if (!c) { var cand = (dados.categorias || []).filter(function (x) { return !x.arquivada && x.tipo === s.tipo && agNorm(x.nome).indexOf(t) === 0 && t.length >= 3; }); if (cand.length === 1) c = cand[0]; }
    if (!c) return { pendente: p, resposta: 'Não achei essa categoria. Escolha uma destas: ' + (dados.categorias || []).filter(function (x) { return !x.arquivada && x.tipo === s.tipo; }).map(function (x) { return x.nome; }).join(', ') + '.', sugestoes: [] };
    return agFechaLanc(s, c, dados);
  }
  if (p.falta === 'meta_nome') {
    var nm = agCap(orig.replace(/[,.;!?]+$/, '').slice(0, 60)); if (!nm || tk.length > 6) return null;
    if (s.valor) return { resposta: 'Meta criada: ' + nm + ', alvo de ' + agBrl(s.valor) + '. Você pode registrar aportes na aba Metas.', acoes: [{ op: 'criar_meta', dados: { nome: nm, valorAlvo: s.valor } }], humor: 'confirmando' };
    return { pendente: { tipo: 'perguntar', falta: 'meta_valor', slots: { nome: nm }, expira: p.expira }, resposta: 'Qual é o valor alvo da meta "' + nm + '"?' };
  }
  if (p.falta === 'meta_valor') {
    var vv = agValor(tk, []); if (!vv || tk.length > 5) return null;
    if (vv.ambiguo) return { pendente: p, resposta: 'Não tenho certeza do valor. Escreva de outro jeito, por exemplo "5.000,00" ou "5 mil".' };
    return { resposta: 'Meta criada: ' + s.nome + ', alvo de ' + agBrl(vv.valor) + '. Você pode registrar aportes na aba Metas.', acoes: [{ op: 'criar_meta', dados: { nome: s.nome, valorAlvo: vv.valor } }], humor: 'confirmando' };
  }
  if (p.falta === 'conta_origem') {
    var destino = (dados.contas || []).filter(function (x) { return x.id === s.destinoId; })[0];
    if (/so registr|apenas registr|nenhuma|sem saida|nao saiu/.test(t)) { var o = { resposta: '', acoes: [], estado: {}, humor: '' }; agMontaAporte(o, {}, dados, s.valor, destino, null, s.data); return { resposta: o.resposta, acoes: o.acoes, humor: 'confirmando' }; }
    var ct = agContaDe(tk, dados);
    if (ct && ct.explicita && ct.conta.id !== s.destinoId) { var o2 = { resposta: '', acoes: [] }; agMontaAporte(o2, {}, dados, s.valor, destino, ct.conta, s.data); return { resposta: o2.resposta, acoes: o2.acoes, humor: 'confirmando' }; }
    return { pendente: p, resposta: 'Não identifiquei a conta. Responda com o nome de uma conta sua ou "só registrar".', sugestoes: (dados.contas || []).map(function (c) { return c.nome; }).concat(['Só registrar']) };
  }
  return null;
}
function agFechaLanc(s, cat, dados) {
  var conta = (dados.contas || []).filter(function (c) { return c.id === s.contaId; })[0] || (dados.contas || [])[0];
  var lan = { tipo: s.tipo, valor: s.valor, data: s.data, contaId: conta.id, categoriaId: cat.id, descricao: s.descricao || cat.nome };
  var chave = (s.tokensDesc || []).slice(0, 3).join(' ');
  var acoes = [{ op: 'lancar', dados: lan, ultimo: { descricao: lan.descricao, chaveDesc: chave, resumo: (s.tipo === 'despesa' ? 'despesa' : 'receita') + ' de ' + agBrl(s.valor) } }];
  if (chave) acoes.push({ op: 'aprender', itens: [{ tipo: 'desc', chave: chave, conteudo: cat.nome }] });
  return { resposta: agRespostaLanc(lan, cat, conta) + (chave ? ' Vou lembrar que "' + chave + '" é ' + cat.nome + '.' : ''), acoes: acoes, humor: 'confirmando' };
}
// mensagens de banco / comprovantes colados ou encaminhados
function agParseNotificacao(texto, dados) {
  var tk = agTokens(texto), t = tk.join(' '), v = agValor(tk, []);
  if (!v) return null;
  var tipo = /pix recebido|recebeu|credito|transferencia recebida|deposito|recebimento/.test(t) ? 'receita' : 'despesa';
  var d = agData(tk, dados.hoje), mm = null, est = '';
  var padroes = [/\bem\s+(?!r\$|\d|valor)([A-Za-zÀ-ú0-9*&.' -]{3,40}?)(?:[.,;]|\s+(?:no valor|dia|às|as|hoje|ontem|r\$)|$)/i, /\b(?:na|no|para|de)\s+(?!r\$|\d|valor|aprovad)([A-Za-zÀ-ú0-9*&.' -]{3,40}?)(?:[.,;]|\s+(?:no valor|dia|às|as|hoje|ontem|r\$)|$)/i];
  for (var pi = 0; pi < padroes.length && !est; pi++) { mm = texto.match(padroes[pi]); if (mm) est = mm[1].trim(); }
  var estToks = agTokens(est).filter(function (w) { return !AG_STOP[w]; });
  var cat = agCategoria(estToks, tk, tipo, dados) || null, conta = agContaDe(tk, dados);
  return { tipo: tipo, valor: v.valor, data: d.data, dataExplicita: d.explicita, descricao: agCap(est || 'Compra'), tokensDesc: estToks, categoria: cat, conta: conta, temVerbo: true, ntk: tk.length };
}
/* ===== FIM DO NÚCLEO ===== */
