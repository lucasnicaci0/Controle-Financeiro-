/* Gerador mínimo de .xlsx (sem bibliotecas): ZIP "armazenado" + XML do Office Open XML.
 * RumoXlsx.criar([{ nome, colunas:[{titulo, largura, tipo}], linhas:[[...]] , filtro:true }]) -> Uint8Array
 * tipos de célula: 'texto' | 'numero' | 'data' (AAAA-MM-DD) | 'moeda' | 'pct'. Linhas com {total:true} ficam em negrito. */
(function (raiz) {
  const enc = new TextEncoder();
  const T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const esc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const serial = iso => { const p = String(iso).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 864e5 + 25569; };
  // estilos: 0 padrão, 1 cabeçalho, 2 data, 3 moeda, 4 moeda negrito, 5 texto negrito, 6 pct, 7 pct negrito
  const ESTILO = { texto: 0, data: 2, moeda: 3, numero: 0, pct: 6 };

  function aba(a) {
    const nc = a.colunas.length, nl = a.linhas.length + 1;
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + col(nc - 1) + nl + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      a.colunas.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.largura || 16) + '" customWidth="1"/>').join('') + '</cols><sheetData>';
    x += '<row r="1">' + a.colunas.map((c, i) => '<c r="' + col(i) + '1" s="1" t="inlineStr"><is><t>' + esc(c.titulo) + '</t></is></c>').join('') + '</row>';
    a.linhas.forEach((l, r) => {
      const total = l.total, vals = l.valores || l;
      x += '<row r="' + (r + 2) + '">' + vals.map((v, i) => {
        const ref = col(i) + (r + 2), tp = a.colunas[i].tipo || 'texto';
        if (v === '' || v == null) return '';
        let s = ESTILO[tp]; if (total) s = tp === 'moeda' ? 4 : tp === 'pct' ? 7 : 5;
        if (tp === 'texto') return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        const n = tp === 'data' ? serial(v) : Number(v);
        return isFinite(n) ? '<c r="' + ref + '" s="' + s + '"><v>' + n + '</v></c>' : '';
      }).join('') + '</row>';
    });
    x += '</sheetData>' + (a.filtro && a.linhas.length ? '<autoFilter ref="A1:' + col(nc - 1) + nl + '"/>' : '') + '</worksheet>';
    return x;
  }

  function zip(arqs) {
    const partes = [], central = []; let pos = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    arqs.forEach(f => {
      const nome = enc.encode(f.nome), dados = enc.encode(f.conteudo), crc = crc32(dados);
      const cab = [0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), 0, 0];
      partes.push(Uint8Array.from(cab), nome, dados);
      central.push(Uint8Array.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(pos)]), nome);
      pos += cab.length + nome.length + dados.length;
    });
    const tamC = central.reduce((s, p) => s + p.length, 0);
    const fim = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(arqs.length), ...u16(arqs.length), ...u32(tamC), ...u32(pos), 0, 0]);
    const tudo = [...partes, ...central, fim], out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0)); let o = 0;
    tudo.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }

  function criar(abas) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const nomes = abas.map(a => esc(a.nome.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31)));
    return zip([
      { nome: '[Content_Types].xml', conteudo: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + abas.map((a, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
      { nome: '_rels/.rels', conteudo: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nome: 'xl/workbook.xml', conteudo: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + nomes.map((n, i) => '<sheet name="' + n + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
      { nome: 'xl/_rels/workbook.xml.rels', conteudo: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + abas.map((a, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nome: 'xl/styles.xml', conteudo: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9E3FF"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      ...abas.map((a, i) => ({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', conteudo: aba(a) }))
    ]);
  }

  // Monta as 3 abas a partir das linhas do back-end (exportar_lancamentos).
  function abasDeLancamentos(rows) {
    const r2 = n => Math.round(n * 100) / 100, soma = a => r2(a.reduce((s, x) => s + x, 0));
    const lanc = { nome: 'Lançamentos', filtro: true, colunas: [{ titulo: 'Data', tipo: 'data', largura: 12 }, { titulo: 'Tipo', largura: 11 }, { titulo: 'Descrição', largura: 34 }, { titulo: 'Categoria', largura: 22 }, { titulo: 'Conta', largura: 20 }, { titulo: 'Tags', largura: 20 }, { titulo: 'Valor (R$)', tipo: 'moeda', largura: 16 }],
      linhas: rows.map(l => [l.data, l.tipo === 'receita' ? 'Receita' : 'Despesa', l.descricao, l.categoria, l.conta, l.tags, l.tipo === 'receita' ? l.valor : -l.valor]) };
    const por = (chave) => { const m = {}; rows.forEach(l => { const k = chave(l); (m[k] = m[k] || []).push(l); }); return m; };
    const cat = por(l => l.tipo + '|' + l.categoria), totTipo = { receita: soma(rows.filter(l => l.tipo === 'receita').map(l => l.valor)), despesa: soma(rows.filter(l => l.tipo === 'despesa').map(l => l.valor)) };
    const linhasCat = Object.keys(cat).map(k => { const [t, n] = k.split('|'), tot = soma(cat[k].map(l => l.valor)); return { t, n, q: cat[k].length, tot }; })
      .sort((a, b) => (a.t === b.t ? b.tot - a.tot : a.t < b.t ? 1 : -1)).map(c => [c.n, c.t === 'receita' ? 'Receita' : 'Despesa', c.q, c.tot, totTipo[c.t] ? c.tot / totTipo[c.t] : 0]);
    linhasCat.push({ total: true, valores: ['Total de receitas', 'Receita', rows.filter(l => l.tipo === 'receita').length, totTipo.receita, ''] }, { total: true, valores: ['Total de despesas', 'Despesa', rows.filter(l => l.tipo === 'despesa').length, totTipo.despesa, ''] });
    const rc = { nome: 'Resumo por categoria', colunas: [{ titulo: 'Categoria', largura: 26 }, { titulo: 'Tipo', largura: 11 }, { titulo: 'Qtd.', tipo: 'numero', largura: 8 }, { titulo: 'Total (R$)', tipo: 'moeda', largura: 16 }, { titulo: '% do tipo', tipo: 'pct', largura: 11 }], linhas: linhasCat };
    const cc = por(l => l.conta);
    const linhasConta = Object.keys(cc).sort().map(n => { const r = soma(cc[n].filter(l => l.tipo === 'receita').map(l => l.valor)), d = soma(cc[n].filter(l => l.tipo === 'despesa').map(l => l.valor)); return [n, r, d, r2(r - d)]; });
    linhasConta.push({ total: true, valores: ['Total', totTipo.receita, totTipo.despesa, r2(totTipo.receita - totTipo.despesa)] });
    const rco = { nome: 'Resumo por conta', colunas: [{ titulo: 'Conta', largura: 26 }, { titulo: 'Receitas (R$)', tipo: 'moeda', largura: 16 }, { titulo: 'Despesas (R$)', tipo: 'moeda', largura: 16 }, { titulo: 'Resultado (R$)', tipo: 'moeda', largura: 16 }], linhas: linhasConta };
    return [lanc, rc, rco];
  }
  raiz.RumoXlsx = { criar, abasDeLancamentos, crc32 };
  if (typeof module !== 'undefined') module.exports = raiz.RumoXlsx;
})(typeof window !== 'undefined' ? window : globalThis);
