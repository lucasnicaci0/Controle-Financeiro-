/**
 * Mapa cérebro → finanças. Posições em coordenadas do modelo (x direita, y cima, z frente).
 * `cam` é onde a câmera fica ao "voar" até a região; as regiões profundas (hipocampo, amígdala, estriado)
 * ficam com a câmera DENTRO da malha, como pede o roteiro.
 * `tab` é a tela do app que a região abre.
 */
export const REGIONS = [
  { id: 'prefrontal', nome: 'Córtex pré-frontal', modulo: 'Planejamento, metas e orçamento', tab: 'orc', cor: '#8B5CF6',
    pos: [0.38, 0.22, 0.80], cam: [1.25, 0.45, 1.62], fov: 50,
    alt: 'Parte da frente do cérebro, responsável por planejar. Aqui ficam seus orçamentos e metas.' },
  { id: 'amigdala', nome: 'Amígdala', modulo: 'Gastos por impulso e alertas de risco', tab: 'cons', cor: '#FF4DA6',
    pos: [0.34, -0.22, 0.38], cam: [0.02, -0.04, 0.80], fov: 58,
    alt: 'Região das emoções e do alerta. Aqui aparecem os avisos do consultor sobre gastos de risco.' },
  { id: 'hipocampo', nome: 'Hipocampo', modulo: 'Histórico e extrato de transações', tab: 'lanc', cor: '#3B82F6',
    pos: [0.36, -0.12, -0.16], cam: [0.02, 0.14, 0.46], fov: 58,
    alt: 'Região da memória. Aqui fica o histórico das suas transações.' },
  { id: 'estriado', nome: 'Corpo estriado', modulo: 'Investimentos e rentabilidade', tab: 'contas', cor: '#EC4899',
    pos: [0.17, 0.05, 0.22], cam: [-0.40, 0.36, -0.22], fov: 58,
    alt: 'Centro da recompensa. Aqui ficam suas contas de investimento.' },
  { id: 'cerebelo', nome: 'Cerebelo', modulo: 'Contas recorrentes e automações', tab: 'cons', cor: '#22D3EE',
    pos: [0.22, -0.50, -0.68], cam: [1.25, -0.86, -1.38], fov: 50,
    alt: 'Região da rotina e dos hábitos. Aqui aparecem as assinaturas e cobranças que se repetem.' },
  { id: 'parietal', nome: 'Lobo parietal', modulo: 'Números, saldos e cálculos', tab: 'painel', cor: '#A78BFA',
    pos: [0.45, 0.52, -0.12], cam: [1.22, 1.28, 0.58], fov: 50,
    alt: 'Região dos números e do cálculo. Aqui ficam seus saldos, receitas e despesas.' },
  { id: 'occipital', nome: 'Lobo occipital', modulo: 'Gráficos e relatórios', tab: 'painel', cor: '#60A5FA',
    pos: [0.30, 0.10, -0.90], cam: [1.2, 0.52, -1.78], fov: 50,
    alt: 'Região da visão. Aqui ficam os gráficos e relatórios.' },
  { id: 'temporal', nome: 'Lobo temporal', modulo: 'Categorias e insights em linguagem natural', tab: 'cons', cor: '#D946EF',
    pos: [0.64, -0.20, 0.15], cam: [1.58, -0.26, 0.92], fov: 50,
    alt: 'Região da linguagem. Aqui o consultor explica seus números em palavras simples.' },
  { id: 'tronco', nome: 'Tronco encefálico', modulo: 'Reserva de emergência', tab: 'contas', cor: '#F472B6',
    pos: [0.04, -0.80, -0.30], cam: [0.98, -1.22, 0.26], fov: 50,
    alt: 'A base que mantém tudo funcionando. Aqui fica a sua reserva de emergência.' }
];
export const ORDER = REGIONS.map(r => r.id);
export const byId = id => REGIONS.find(r => r.id === id);
export const indexOf = id => REGIONS.findIndex(r => r.id === id);
export const REGION_RADIUS = 0.42;
