// Monta o agente: injeta o núcleo e o servidor no Code.gs e gera o espelho para o navegador (js/servicos/agente-core.js).
// Edite o núcleo em agente_core.js e o servidor em agente_servidor.js; nunca direto no Code.gs entre os marcadores.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(__dirname, 'agente_core.js'), 'utf8').trimEnd();
const serv = fs.readFileSync(path.join(__dirname, 'agente_servidor.js'), 'utf8').trimEnd();
function injeta(src, ini, fim, corpo, antesDe) {
  const bloco = '// <<' + ini + '\n' + corpo + '\n// ' + fim + '>>';
  const re = new RegExp('// <<' + ini + '[\\s\\S]*?// ' + fim + '>>');
  if (re.test(src)) return src.replace(re, () => bloco);
  const i = src.indexOf(antesDe);
  if (i < 0) throw new Error('âncora não encontrada: ' + antesDe);
  return src.slice(0, i) + bloco + '\n\n' + src.slice(i);
}
function gerar() {
  const arq = path.join(__dirname, 'Code.gs');
  let src = fs.readFileSync(arq, 'utf8');
  const ancora = '/* ======================= AUTORIZAÇÃO';
  src = injeta(src, 'NLU', 'NLU', core, ancora);
  src = injeta(src, 'AGENTE', 'AGENTE', serv, ancora);
  fs.writeFileSync(arq, src);
  const espelho = '/* GERADO por apps-script/montar.js a partir de apps-script/agente_core.js — não edite aqui. */\n(function (g) {\n' + core +
    '\n  g.AgenteCore = { turno: agTurno, contador: agContador, analise: agAnalise, parseLancamento: agParseLancamento, brl: agBrl, nome: AG_NOME, sugestoes: AG_SUGESTOES };\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.mkdirSync(path.join(raiz, 'js/servicos'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'js/servicos/agente-core.js'), espelho);
}
if (require.main === module) { gerar(); console.log('montado'); }
module.exports = { gerar, core, serv };
