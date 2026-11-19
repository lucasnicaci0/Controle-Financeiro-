/**
 * TEMA — todas as cores, tempos e intensidades do "Cérebro Financeiro" num só lugar.
 * Mexa aqui para ajustar o visual; nenhum outro arquivo tem número "mágico" de estilo.
 *
 * Atalhos (também aceitos na URL, para testar sem editar código):
 *   ?glow=1.4      brilho geral              (THEME.glow.intensity)
 *   ?speed=0.7     velocidade da câmera      (THEME.camera.speed)
 *   ?particles=20000  quantidade de partículas (THEME.particles.override)
 *   ?q=0|1|2       força a qualidade (0 baixa, 1 média, 2 alta)
 */
export const THEME = {
  colors: {
    bg0: '#05020A', bg1: '#0B0618',               // fundo preto-violeta (topo → base)
    purple: ['#6D28D9', '#8B5CF6'],
    pink: ['#EC4899', '#FF4DA6'],
    blue: ['#3B82F6', '#22D3EE'],                  // azul só para realces
    text: '#F5F3FF',
    textSoft: '#A78BFA'                            // usado a 80% (70% não passa AA de contraste)
  },

  glow: {
    intensity: 1.0,        // brilho geral de tudo que é energia (malha, linhas, nós, partículas)
    rim: 1.35,             // força da borda luminosa (fresnel) do cérebro
    bloom: 0.9,            // intensidade do bloom
    bloomThreshold: 0.5,   // a partir de quanto brilho entra no bloom
    regionBoost: 1.25      // força do acendimento de uma região
  },

  camera: {
    speed: 1.0,            // multiplicador global da velocidade da câmera (1 = padrão)
    follow: 5.5,           // suavização do seguimento do scroll (maior = mais colado)
    parallax: 0.07,        // quanto a câmera segue o mouse
    hold: 0.2,             // fração de cada trecho do scroll em que a câmera "descansa"
    fovIntro: 40, fovRegion: 52, fovOverview: 38, fovEnter: 64,
    introDistance: 4.5,
    flyDuration: 1.9,      // segundos de um voo até a região (clique) — easing power3.inOut
    orbitSpeed: 0.055      // rotação lenta em repouso (rad/s)
  },

  particles: {
    high: 36000, mid: 20000, low: 8000,
    override: 0            // >0 força um número fixo
  },

  timing: {
    assemble: 4.6,         // s para as partículas formarem o cérebro
    warp: 0.95,            // s do "warp" de zoom entre telas
    lineDraw: 0.9,         // s para a linha cérebro→cartão se desenhar
    cardFade: 0.5
  },

  gradient: { angleDeg: 135, spin: 0.12 },        // degradê roxo→rosa→azul, ângulo animado

  post: {
    grain: 0.05, vignette: 0.6, aberration: 0.0042, exposure: 1.1
  },

  dim: { login: 0.5, journey: 1.0, app: 0.5 }     // brilho do cérebro em cada modo
};

export const srgbToLin = c => Math.pow(c, 2.2);
export function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function hexLin(h) { return hex(h).map(srgbToLin); }

// ajustes via URL (somente números válidos)
(function lerUrl() {
  try {
    const q = new URLSearchParams(location.search), n = k => (q.has(k) && isFinite(+q.get(k)) ? +q.get(k) : null);
    if (n('glow') != null) THEME.glow.intensity = n('glow');
    if (n('speed') != null) THEME.camera.speed = n('speed');
    if (n('particles') != null) THEME.particles.override = n('particles');
  } catch (e) { /* sem URL */ }
})();
