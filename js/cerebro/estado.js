/**
 * CAMADA DE CONTROLE — estado de ativação do cérebro 3D.
 * Independente dos dados e das telas do app: guarda só um booleano (localStorage) e avisa quem assinou.
 * Também fica em window.CerebroEstado para o script clássico (tela Opções) usar o mesmo estado.
 */
const CHAVE = 'rumo_cerebro3d';
const lido = () => { try { return localStorage.getItem(CHAVE) !== 'off'; } catch (e) { return true; } };

export const BrainState = (() => {
  let ativo = lido(); const subs = new Set();
  const grava = () => { try { localStorage.setItem(CHAVE, ativo ? 'on' : 'off'); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } };
  const api = {
    get ativo() { return ativo; },
    set(v) { v = !!v; if (v === ativo) return; ativo = v; grava(); subs.forEach(f => { try { f(ativo); } catch (e) { console.warn(e); } }); },
    toggle() { api.set(!ativo); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); }
  };
  return api;
})();
window.CerebroEstado = BrainState;
