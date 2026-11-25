/* Voz do Rumi: ouvir (reconhecimento de fala do navegador) e falar (síntese de voz do navegador). Nada é gravado pelo app. */
(function (g) {
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;
  let rec = null;
  const ouvirOk = () => !!SR, falarOk = () => !!(g.speechSynthesis && g.SpeechSynthesisUtterance);
  // cb: { parcial(txt), final(txt), fim(), erro(codigo) }
  function ouvir(cb) {
    if (!SR) { cb.erro && cb.erro('nao_suportado'); return null; }
    parar();
    rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    let ultimo = '', enviado = false;
    rec.onresult = ev => { let txt = '', fim = false; for (let i = ev.resultIndex; i < ev.results.length; i++) { txt += ev.results[i][0].transcript; if (ev.results[i].isFinal) fim = true; } ultimo = txt; if (fim) { enviado = true; cb.final && cb.final(txt.trim()); } else cb.parcial && cb.parcial(txt); };
    rec.onerror = ev => { cb.erro && cb.erro(ev.error || 'erro'); };
    rec.onend = () => { rec = null; if (!enviado && ultimo.trim()) cb.final && cb.final(ultimo.trim()); cb.fim && cb.fim(); };
    try { rec.start(); } catch (e) { cb.erro && cb.erro('erro'); }
    return rec;
  }
  function parar() { if (rec) { try { rec.stop(); } catch (e) { /* já parado */ } } }
  // tira símbolos que soam estranhos ao ler em voz alta
  const limpa = t => String(t).replace(/R\$\s?/g, '').replace(/[•·→⚠✔🎙️]/g, ' ').replace(/\s+/g, ' ').replace(/(\d)\.(\d{3})/g, '$1$2').replace(/(\d+),(\d{2})\b/g, '$1 vírgula $2').trim();
  function falar(texto) {
    if (!falarOk()) return false;
    try { g.speechSynthesis.cancel(); const u = new g.SpeechSynthesisUtterance(limpa(texto).slice(0, 600)); u.lang = 'pt-BR'; u.rate = 1.02; const v = g.speechSynthesis.getVoices().find(x => /^pt(-|_)BR/i.test(x.lang)); if (v) u.voice = v; g.speechSynthesis.speak(u); return true; } catch (e) { return false; }
  }
  const calar = () => { try { g.speechSynthesis && g.speechSynthesis.cancel(); } catch (e) { /* sem síntese */ } };
  g.RumiVoz = { ouvirOk, falarOk, ouvir, parar, falar, calar };
})(window);
