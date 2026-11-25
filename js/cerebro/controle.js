/** CAMADA DE CONTROLE (visual) — liga o botão "Cérebro 3D" do cabeçalho ao BrainState. Não conhece o 3D nem os dados. */
import { BrainState } from './estado.js';

export function initControle() {
  const b = document.getElementById('cb-toggle'); if (!b) return;
  const sinc = on => { b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.title = on ? 'Desativar o cérebro 3D' : 'Ativar o cérebro 3D'; };
  sinc(BrainState.ativo); BrainState.subscribe(sinc);
  b.addEventListener('click', () => BrainState.toggle());
}
