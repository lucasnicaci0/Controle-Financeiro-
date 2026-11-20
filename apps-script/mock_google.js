// Roda o Code.gs real em Node sobre um mock do Google. Uso: node teste_gs1.js [caminho/Code.gs]
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

const CODIGO = fs.readFileSync(process.env.CODE_GS || path.join(__dirname, 'Code.gs'), 'utf8');
const CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
const FUSO = 'America/Sao_Paulo';

function formatDate(d, tz, fmt) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return fmt.replace(/'/g, '').replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

function novaPlanilha() {
  const abas = {};
  function aba(nome) {
    const data = [];
    return {
      _data: data,
      getLastRow() { for (let i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(v => v !== '' && v !== undefined)) return i + 1; return 0; },
      getMaxRows() { return 1000; },
      getLastColumn() { return data[0] ? data[0].length : 0; },
      setFrozenRows() {},
      deleteRow(n) { data.splice(n - 1, 1); },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          setValues(vals) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
          clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; return this; },
          setFontWeight() { return this; }, setNumberFormat() { return this; }
        };
      }
    };
  }
  return {
    getSheetByName: n => abas[n] || null,
    insertSheet: n => (abas[n] = aba(n)),
    _abas: abas
  };
}

const tokens = {};
function novoContexto() {
  const planilha = novaPlanilha();
  const cache = {};
  const ctx = {
    console, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'CLIENT_ID' ? CLIENT_ID : null) }) },
    UrlFetchApp: {
      fetch(url) {
        const t = decodeURIComponent(url.split('id_token=')[1]);
        const info = tokens[t];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: 'invalid' }) };
      }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    ContentService: { MimeType: { JSON: 'json', ICAL: 'ical' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) }
  };
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx);
  ctx._planilha = planilha;
  return ctx;
}

let ok = 0, falhas = 0;
function confere(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome); } else { falhas++; console.log('  FALHA ' + nome + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
}

function token(email, nome, extra) {
  const t = 'tok-' + email;
  tokens[t] = Object.assign({ aud: CLIENT_ID, iss: 'https://accounts.google.com', email, name: nome, email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600) }, extra || {});
  return t;
}

function chamar(ctx, acao, tk, dados) {
  const saida = ctx.doPost({ postData: { contents: JSON.stringify({ acao, token: tk, dados }) } });
  return JSON.parse(saida.getContent());
}

module.exports = { doGetFeed: (ctx, t) => ctx.doGet({ parameter: { feed: t } }).getContent(), novoContexto, token, chamar, confere: (n, c, x) => confere(n, c, x), resultado: () => ({ ok, falhas }), formatDate, FUSO };
