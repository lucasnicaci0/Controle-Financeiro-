# Rumo — controle de finanças

Site estático (GitHub Pages) + back-end em Google Apps Script com Google Planilhas como banco.

- `index.html`, `manifest.json`, `sw.js`, `icon*` — o site (PWA). Publicado pelo GitHub Pages.
- `apps-script/Code.gs` — back-end: cole no Apps Script da planilha "Financas DB".
- `apps-script/teste_gs1.js` — testes do back-end em Node (`node apps-script/teste_gs1.js apps-script/Code.gs`).

Para ver o visual sem configurar nada, abra o site com `?demo` no final do endereço.

## Configuração
1. No Apps Script, troque `CONFIG.CLIENT_ID` pelo ID do cliente OAuth, rode `autorizar` e implante como App da Web
   (Executar como: Eu · Acesso: Qualquer pessoa).
2. No `index.html`, preencha `API_URL` (URL que termina em `/exec`) e `CLIENT_ID`.
3. Sempre que mudar o `Code.gs`, publique uma nova versão da implantação.

Nunca coloque senhas ou chaves secretas neste repositório: ele é público.
