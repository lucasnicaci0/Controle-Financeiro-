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

## Cérebro Financeiro (visual 3D)

A Jornada (primeira aba) é um cérebro 3D procedural em WebGL2 puro, sem dependências nem build. Código em `js/cerebro/`:

| Arquivo | Componente |
|---|---|
| `scene.js` | Cena: contexto, qualidade por GPU, resolução adaptativa, projeção das âncoras |
| `brain.js` + `shaders.js` | Cérebro: malha com giros e sulcos, partículas, rede neural |
| `cards.js` | Cartões de vidro, linhas luminosas, hover nos dois sentidos, clique para voar |
| `camera.js` | Câmera: roteiro por scroll, voos, parallax |
| `post.js` | Pós-processamento: bloom, aberração cromática, grão, vinheta, ACES |
| `cursor.js` | Cursor com rastro, botões magnéticos, revelação de texto |
| `theme.js` | **Todas as cores, tempos e intensidades** |

### Ajustes rápidos (em `js/cerebro/theme.js`, ou pela URL para testar)

- Brilho: `THEME.glow.intensity` (ou `?glow=1.4`). Bloom em `THEME.glow.bloom`, borda em `THEME.glow.rim`.
- Velocidade da câmera: `THEME.camera.speed` (ou `?speed=0.7`).
- Partículas: `THEME.particles.high/mid/low` (ou `?particles=20000`).
- Qualidade forçada: `?q=0|1|2`.

Sem WebGL2 o app mantém o fundo 2D e a Jornada vira uma lista de cartões em texto. Com `prefers-reduced-motion` a cena fica estática e sem warp.
