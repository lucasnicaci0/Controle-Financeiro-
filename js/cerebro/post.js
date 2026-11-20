/**
 * PÓS-PROCESSAMENTO — bloom em várias escalas (seletivo: só o que passa do limiar de brilho, ou seja, energia e linhas),
 * desfoque radial de movimento (warp), aberração cromática nas bordas, grão, vinheta e tone mapping ACES.
 * A profundidade de campo (bokeh) é feita nas partículas, onde ela aparece de verdade.
 */
import { createProgram, createTarget } from './gl.js';
import { FULL_VS, BRIGHT_FS, COPY_FS, BLUR_FS, COMPOSITE_FS, FXAA_FS } from './shaders.js';
import { THEME } from './theme.js';

export class Post {
  constructor(gl) {
    this.gl = gl;
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.progBright = createProgram(gl, FULL_VS, BRIGHT_FS, 'bright');
    this.progCopy = createProgram(gl, FULL_VS, COPY_FS, 'copy');
    this.progBlur = createProgram(gl, FULL_VS, BLUR_FS, 'blur');
    this.progComp = createProgram(gl, FULL_VS, COMPOSITE_FS, 'composite');
    this.progFxaa = createProgram(gl, FULL_VS, FXAA_FS, 'fxaa');
    this.fxaa = true;
    this.vao = gl.createVertexArray();
    this.levels = 4; this.targets = null; this.w = 0; this.h = 0;
    const black = createTarget(gl, 1, 1, false);
    this.black = black;
  }

  resize(w, h, levels) {
    const gl = this.gl;
    this.w = w; this.h = h; this.levels = levels;
    if (this.targets) this.targets.all.forEach(t => t && t.destroy());
    const mk = (ww, hh) => createTarget(gl, Math.max(2, ww | 0), Math.max(2, hh | 0), this.hdr) || createTarget(gl, Math.max(2, ww | 0), Math.max(2, hh | 0), false);
    const scene = mk(w, h), A = [], B = [];
    for (let l = 0; l < 4; l++) { const f = 2 << l; A.push(mk(w / f, h / f)); B.push(mk(w / f, h / f)); }
    const ldr = mk(w, h);
    this.targets = { scene, A, B, ldr, all: [scene, ldr, ...A, ...B] };
  }

  beginScene() {
    const gl = this.gl, t = this.targets.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
  }

  pass(prog, target, inputs, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
    prog.use();
    inputs.forEach((tx, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); });
    if (setup) setup(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(p) {
    const gl = this.gl, T = this.targets, L = this.levels;
    gl.disable(gl.BLEND); gl.bindVertexArray(this.vao);
    const texel = t => [1 / t.w, 1 / t.h];
    this.pass(this.progBright, T.A[0], [T.scene.tex], pr => { gl.uniform1i(pr.u('uTex'), 0); gl.uniform2fv(pr.u('uTexel'), texel(T.scene)); gl.uniform1f(pr.u('uThr'), THEME.glow.bloomThreshold); });
    for (let l = 0; l < L; l++) {
      if (l > 0) this.pass(this.progCopy, T.A[l], [T.A[l - 1].tex], pr => { gl.uniform1i(pr.u('uTex'), 0); gl.uniform2fv(pr.u('uTexel'), texel(T.A[l - 1])); });
      this.pass(this.progBlur, T.B[l], [T.A[l].tex], pr => { gl.uniform1i(pr.u('uTex'), 0); gl.uniform2f(pr.u('uDir'), 1 / T.A[l].w, 0); });
      this.pass(this.progBlur, T.A[l], [T.B[l].tex], pr => { gl.uniform1i(pr.u('uTex'), 0); gl.uniform2f(pr.u('uDir'), 0, 1 / T.A[l].h); });
    }
    const wts = [.55, .75, 1.0, 1.25].map((w, i) => (i < L ? w : 0)), sum = wts.reduce((a, b) => a + b, 0) || 1;
    const tex = [T.scene.tex, ...[0, 1, 2, 3].map(i => (i < L ? T.A[i].tex : this.black.tex))];
    this.pass(this.progComp, this.fxaa ? T.ldr : null, tex, pr => {
      ['uScene', 'uB0', 'uB1', 'uB2', 'uB3'].forEach((n, i) => gl.uniform1i(pr.u(n), i));
      gl.uniform4f(pr.u('uBW'), wts[0] / sum * 1.9, wts[1] / sum * 1.9, wts[2] / sum * 1.9, wts[3] / sum * 1.9);
      gl.uniform1f(pr.u('uBloom'), THEME.glow.bloom * p.bloom);
      gl.uniform1f(pr.u('uWarp'), p.warp);
      gl.uniform1f(pr.u('uAberr'), THEME.post.aberration * p.aberr);
      gl.uniform1f(pr.u('uGrain'), THEME.post.grain * p.grain);
      gl.uniform1f(pr.u('uVig'), THEME.post.vignette);
      gl.uniform1f(pr.u('uExposure'), THEME.post.exposure);
      gl.uniform1f(pr.u('uTime'), p.time);
      gl.uniform2f(pr.u('uRes'), this.w, this.h);
    });
    if (this.fxaa) this.pass(this.progFxaa, null, [T.ldr.tex], pr => { gl.uniform1i(pr.u('uTex'), 0); gl.uniform2f(pr.u('uTexel'), 1 / this.w, 1 / this.h); });
    gl.bindVertexArray(null);
  }
}
