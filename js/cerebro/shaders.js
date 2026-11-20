// Todos os shaders (GLSL ES 3.00). Fresnel, pulsos, partículas, nebulosa e pós-processamento.
const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
const REG = `
#define NREG 9
uniform vec4 uRegA[NREG];   // xyz = centro da região, w = raio
uniform vec3 uRegC[NREG];   // cor da região
uniform float uRegS[NREG];  // ativação 0..1
`;
const GRAD = `
uniform vec3 uCA; uniform vec3 uCB; uniform vec3 uCC; uniform float uAng; uniform float uTime;
vec3 grad3(float g){ g = clamp(g,0.,1.); return g < .5 ? mix(uCA,uCB,g*2.) : mix(uCB,uCC,(g-.5)*2.); }
float gradT(vec3 p){ vec2 d = vec2(cos(uAng),sin(uAng)); return .5+.5*sin(dot(p.xy*1.15 + p.z*.55, d)*2.3 + uTime*.22); }
`;

/* ---------- malha (vidro/gel com fresnel) ---------- */
export const MESH_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in float aRidge;
uniform mat4 uVP; uniform float uTime; uniform float uBreath;
out vec3 vN; out vec3 vP; out float vR;
void main(){
  float k = 1.0 + uBreath*0.012*sin(uTime*.9 + aPos.y*1.5 + aPos.z);
  vec3 p = aPos*k + aNor*(0.004*sin(uTime*1.3 + aPos.x*3. + aPos.z*2.))*uBreath;
  vP = p; vN = aNor; vR = aRidge;
  gl_Position = uVP*vec4(p,1.);
}`;
export const MESH_FS = HEAD + REG + GRAD + `
in vec3 vN; in vec3 vP; in float vR;
uniform vec3 uCam; uniform float uGlow; uniform float uRim; uniform float uDim; uniform float uAssemble; uniform float uBoost; uniform float uGain;
out vec4 o;
void main(){
  vec3 N = normalize(vN); float front = gl_FrontFacing ? 1.0 : 0.0; if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vP);
  float nv = clamp(dot(N,V),0.,1.);
  float fres = pow(1.-nv, 2.3);
  vec3 g = grad3(gradT(vP));
  vec3 L1 = normalize(vec3(.6,.8,.5)), L2 = normalize(vec3(-.7,-.3,.4));
  float d1 = max(dot(N,L1),0.), d2 = max(dot(N,L2),0.);
  float ridge = vR;
  vec3 col = vec3(.050,.018,.110)*(.35+.65*ridge);
  col += uCA*d1*.20*(.35+.65*ridge)*front + uCC*d2*.13*ridge*front;
  float sss = pow(clamp(dot(V, -normalize(N + L1*.6)),0.,1.), 2.);                // subsurface falso
  col += uCB*sss*.16*front;
  col += g*fres*uRim*(.55+.45*ridge);                                              // borda luminosa em degradê
  col.r += fres*fres*.10; col.b += fres*.06;                                       // dispersão leve (refração falsa)
  col *= (.55 + .6*ridge);                                                         // sulcos escuros
  float rim = 0.;
  for(int i=0;i<NREG;i++){
    float d = distance(vP,uRegA[i].xyz);
    float m = smoothstep(uRegA[i].w,0.,d)*uRegS[i];
    col += uRegC[i]*m*(.5+fres*1.6+ridge*.5)*uBoost; rim += m;
  }
  col *= uGlow*uDim*uGain*smoothstep(.65,1.,uAssemble);
  o = vec4(col,1.);
}`;

/* ---------- partículas ---------- */
export const PART_VS = HEAD + REG + GRAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aRnd;
uniform mat4 uVP; uniform float uAssemble; uniform float uPx; uniform float uFocus; uniform float uBokeh; uniform float uWarp;
out vec3 vCol; out float vA;
void main(){
  float seed = aRnd.x, ph = aRnd.z*6.2831;
  float e = clamp(uAssemble*1.75 - seed*.75, 0., 1.); e = 1. - pow(1.-e, 3.);
  vec3 dir = normalize(vec3(sin(seed*91.7+1.), cos(seed*53.1), sin(seed*17.3)*cos(seed*7.7)) + .001);
  float rad = 2.6 + fract(seed*13.7)*6.5;
  float ang = uTime*.35 + seed*6.28;
  vec3 start = dir*rad + vec3(cos(ang), 0., sin(ang))*.6*(1.-e);
  vec3 p = mix(start, aPos, e);
  p += vec3(sin(uTime*.7+ph), cos(uTime*.6+ph*1.3), sin(uTime*.5+ph*.7))*.014*e;
  p *= 1. + .012*sin(uTime*.9 + aPos.y*1.5 + aPos.z);
  vec4 c = uVP*vec4(p,1.);
  gl_Position = c;
  float dist = max(c.w, .05);
  float coc = abs(dist - uFocus);
  float act = 0.;
  vec3 tint = vec3(0.);
  for(int i=0;i<NREG;i++){
    float m = smoothstep(uRegA[i].w, 0., distance(p, uRegA[i].xyz))*uRegS[i];
    tint += uRegC[i]*m; act += m;
  }
  float size = aRnd.y*(1. + coc*uBokeh*.9)*(1.+act*.9);
  gl_PointSize = clamp(size*uPx*(2.4/dist)*1.5, 1.5, 22.*uPx);
  vec3 g = grad3(gradT(p));
  vCol = g*(.7 + .3*sin(uTime*1.5+ph)) + tint*1.7;
  vA = (.55 + act*.9) / (1. + coc*uBokeh*.7) * (.4 + .6*e);
}`;
export const PART_FS = HEAD + `
in vec3 vCol; in float vA;
uniform float uGlow; uniform float uDim;
out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5)*2.;
  float a = smoothstep(1.,0.,d); a *= a;
  o = vec4(vCol*a*vA*uGlow*uDim*.9, 1.);
}`;

/* ---------- sinapses (faixas com borda suavizada: sem serrilhado, em qualquer DPR) ---------- */
export const LINE_VS = HEAD + REG + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aOther; layout(location=2) in vec4 aMeta; layout(location=3) in vec2 aSide;
uniform mat4 uVP; uniform vec2 uRes; uniform float uLineW;
out float vU; out float vSeed; out float vAct; out vec3 vRC; out float vAcross;
void main(){
  int r = int(aMeta.z + .5);
  vAct = uRegS[r]; vRC = uRegC[r]; vU = aMeta.x; vSeed = aMeta.y; vAcross = aSide.x;
  vec4 a = uVP*vec4(aPos,1.), b = uVP*vec4(aOther,1.);
  vec2 sa = a.xy/max(a.w,.02)*uRes*.5, sb = b.xy/max(b.w,.02)*uRes*.5;
  vec2 d = sb - sa; float l = length(d); d = l > 1e-4 ? d/l : vec2(1.,0.);
  d *= aSide.y;
  vec2 n = vec2(-d.y, d.x);
  vec2 off = n*aSide.x*(uLineW*.5 + .75) ;
  gl_Position = vec4((sa + off)/(uRes*.5)*a.w, a.z, a.w);
}`;
export const LINE_FS = HEAD + GRAD + `
in float vU; in float vSeed; in float vAct; in vec3 vRC; in float vAcross;
uniform float uGlow; uniform float uDim; uniform float uAssemble; uniform float uLineW;
out vec4 o;
void main(){
  float half_ = uLineW*.5 + .75;
  float dist = abs(vAcross)*half_;                       // distância ao centro, em pixels
  float aa = clamp(uLineW*.5 + .5 - dist, 0., 1.);        // borda de 1 px suave
  float speed = .20 + vSeed*.25 + vAct*1.0;
  float head = fract(uTime*speed + vSeed*7.31);
  float d = abs(vU - head); d = min(d, 1.-d);
  float pulse = smoothstep(.11, 0., d);
  float base = .11 + vAct*.32;
  vec3 col = mix(grad3(fract(vSeed*3.7 + vU*.4)), vRC, clamp(vAct,0.,1.)*.7);
  float inten = (base + pulse*(1.0 + vAct*1.8)) * uGlow * uDim * smoothstep(.55,1.,uAssemble);
  o = vec4(col*inten*aa, 1.);
}`;

/* ---------- artefatos voadores (orbes, anéis e faíscas que flutuam ao redor do cérebro) ---------- */
export const FLOAT_VS = HEAD + GRAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aRnd;
uniform mat4 uVP; uniform float uPx; uniform float uFocus; uniform float uBokeh; uniform float uSize; uniform float uAssemble;
out vec3 vCol; out float vA; flat out float vKind; out float vSpin;
void main(){
  float seed = aRnd.x, ph = aRnd.z*6.2831;
  float w = (.05 + seed*.09)*(aRnd.w < .5 ? 1. : -1.);
  float ang = uTime*w + ph, c = cos(ang), s = sin(ang);
  vec3 p = vec3(aPos.x*c - aPos.z*s, aPos.y, aPos.x*s + aPos.z*c);
  p.y += sin(uTime*(.2 + seed*.3) + ph)*.35; p.x += sin(uTime*.13 + ph*2.)*.2;
  vec4 cl = uVP*vec4(p,1.); gl_Position = cl;
  float dist = max(cl.w, .05), coc = abs(dist - uFocus);
  float size = aRnd.y*uSize*(1. + coc*uBokeh*.5);
  gl_PointSize = clamp(size*uPx*(3.2/dist), 4., 72.*uPx);
  vCol = grad3(fract(seed*3. + uTime*.015))*(.8 + .4*sin(uTime*1.3 + ph));
  vA = (.30 + .55*seed)/(1. + coc*uBokeh*.6)*smoothstep(.3, 1., uAssemble);
  vKind = floor(aRnd.w*3.); vSpin = ang*2.;
}`;
export const FLOAT_FS = HEAD + `
in vec3 vCol; in float vA; flat in float vKind; in float vSpin;
uniform float uGlow; uniform float uDim;
out vec4 o;
void main(){
  vec2 q = (gl_PointCoord - .5)*2.; float d = length(q), a;
  if(vKind < .5) a = exp(-d*d*4.5) + exp(-d*d*30.)*.6;                                        // orbe
  else if(vKind < 1.5) a = smoothstep(.14, 0., abs(d - .62))*.9 + exp(-d*d*7.)*.25;          // anel
  else { float cs = cos(vSpin), sn = sin(vSpin); vec2 r = vec2(q.x*cs - q.y*sn, q.x*sn + q.y*cs);
    a = exp(-abs(r.x)*16.)*exp(-abs(r.y)*2.6) + exp(-abs(r.y)*16.)*exp(-abs(r.x)*2.6) + exp(-d*d*10.)*.5; } // faísca
  a *= smoothstep(1., .75, d);
  o = vec4(vCol*a*vA*uGlow*uDim*.85, 1.);
}`;

/* ---------- nós (sinapses) ---------- */
export const NODE_VS = HEAD + REG + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aMeta;
uniform mat4 uVP; uniform float uTime; uniform float uPx;
out vec3 vCol; out float vA;
void main(){
  vec4 c = uVP*vec4(aPos,1.);
  gl_Position = c;
  float reg = aMeta.y; float act = 0.; vec3 col = vec3(.55,.35,1.);
  if(reg > -.5){ int r = int(reg + .5); act = uRegS[r]; col = uRegC[r]; }
  float pulse = .72 + .28*sin(uTime*2.1 + aMeta.z*6.28);
  float size = aMeta.x*(1. + act*1.3)*pulse;
  gl_PointSize = clamp(size*uPx*(2.6/max(c.w,.05)), 2., 56.*uPx);
  vCol = col*(.6 + act*1.2 + aMeta.w*.5);
  vA = 1.;
}`;
export const NODE_FS = HEAD + `
in vec3 vCol; in float vA;
uniform float uGlow; uniform float uDim; uniform float uAssemble;
out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5)*2.;
  float a = smoothstep(1.,0.,d); float core = smoothstep(.35,0.,d);
  o = vec4((vCol*a*a*.9 + vec3(1.)*core*.35)*uGlow*uDim*smoothstep(.5,1.,uAssemble), 1.);
}`;

/* ---------- fundo: nebulosa volumétrica + campo estelar ---------- */
export const FULL_VS = HEAD + `
out vec2 vUv; out vec2 vNdc;
void main(){
  vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));
  vUv = p; vNdc = p*2.-1.;
  gl_Position = vec4(vNdc, 0., 1.);
}`;
export const BG_FS = HEAD + `
in vec2 vNdc;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform vec3 uEye; uniform float uTan; uniform float uAspect; uniform float uTime;
uniform vec3 uBg0; uniform vec3 uBg1; uniform vec3 uCA; uniform vec3 uCB; uniform vec3 uCC; uniform float uDim; uniform float uUni;
out vec4 o;
float hash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= .5; } return s; }

// Paralaxe: o olho se desloca; camadas mais próximas (D menor) deslocam mais que as distantes.
vec3 par(vec3 v, float D){ return normalize(v*D + uEye*.9); }

vec3 stars(vec3 v, float D, float scale, float density, float size, float bright, float seed){
  vec3 sp = par(v, D)*scale, id = floor(sp), f = fract(sp) - .5;
  float h = hash(id + seed);
  if(h < 1. - density) return vec3(0.);
  float hh = (h - (1. - density))/density;
  vec3 jit = (vec3(hash(id+7.1), hash(id+13.7), hash(id+3.3)) - .5)*.55;
  float d = length(f - jit);
  float tw = .78 + .22*sin(uTime*(.5 + hh*2.) + hh*50.);
  float s = size*(.55 + hh);
  float core = smoothstep(s, 0., d);
  vec3 tint = mix(vec3(.74,.82,1.), vec3(1.,.86,.72), fract(hh*7.3));
  return tint*core*core*bright*(.35 + hh)*tw;
}
vec3 bokeh(vec3 v){
  vec3 sp = par(v, 26.)*8., id = floor(sp), f = fract(sp) - .5;
  float h = hash(id + 41.);
  if(h < .86) return vec3(0.);
  vec3 jit = (vec3(hash(id+1.7), hash(id+9.1), hash(id+5.3)) - .5)*.5;
  float d = length(f - jit), r = .2 + .12*hash(id+2.2);
  float disc = smoothstep(r, r*.5, d)*.04 + smoothstep(r*1.02, r*.9, d)*smoothstep(r*.82, r, d)*.025;
  vec3 c = h > .95 ? uCB : (h > .91 ? uCC : uCA);
  return c*disc;
}
vec3 galaxy(vec3 v0, vec3 g, float rot, float size, vec3 colA, vec3 colB, float tilt){
  vec3 v = par(v0, 120.); float dg = dot(v, g); if(dg < .25) return vec3(0.);
  vec3 t = normalize(cross(g, vec3(.01,1.,.02))), b = cross(g, t);
  vec2 p = vec2(dot(v,t), dot(v,b))/dg/size;
  float c = cos(rot), s = sin(rot); p = mat2(c,-s,s,c)*p; p.y /= tilt;
  float r = length(p), th = atan(p.y, p.x);
  float arms = .5 + .5*cos(2.*th - 4.2*log(r + .05) + uTime*.008);
  float n = fbm(vec3(p*2.4, 1.7));
  vec3 col = mix(colB, colA, clamp(r*.9, 0., 1.))*exp(-r*1.7)*(.25 + .75*arms)*(.55 + .9*n);
  col += vec3(1.,.93,.82)*exp(-r*r*16.)*.85;
  return col*smoothstep(1.7, .9, r);
}
vec4 planet(vec3 v0, vec3 dir, float R, vec3 base, vec3 band, float ring){
  vec3 v = par(v0, 70.); float dg = dot(v, dir); if(dg < .5) return vec4(0.);
  vec3 t = normalize(cross(dir, vec3(.01,1.,.02))), b = cross(dir, t);
  vec2 p = vec2(dot(v,t), dot(v,b))/dg/R;
  float r = length(p); vec3 col = vec3(0.); float a = 0.;
  if(r < 1.2){
    float edge = smoothstep(1., .9, r);                                  // borda levemente desfocada (distante)
    float z = sqrt(max(1. - r*r, 0.)); vec3 n = vec3(p, z);
    float l = clamp(dot(n, normalize(vec3(.6,.45,.7))), 0., 1.);
    float bands = .5 + .5*sin(n.y*9. + fbm(vec3(n.xy*2., 1.))*3.);
    col = mix(base, band, bands)*(.05 + .95*l)*edge;
    col += uCC*pow(1. - z, 3.)*.4*(.25 + l)*smoothstep(1.2, 1., r);
    a = edge;
  }
  if(ring > 0.){
    float rr = length(vec2(p.x, p.y/.3));
    float rg = smoothstep(2.3, 2.15, rr)*smoothstep(1.4, 1.55, rr);
    col += base*rg*.5*(.65 + .35*sin(rr*38.))*(1. - a*step(p.y, 0.));
    a = max(a, rg*.5*step(0., p.y));
  }
  return vec4(col, a);
}
void main(){
  vec3 dir = normalize(uFwd + uRight*vNdc.x*uAspect*uTan + uUp*vNdc.y*uTan);
  vec3 col = mix(uBg0, uBg1, vNdc.y*.5 + .5);
  if(uUni > .001){
    vec3 u = vec3(0.);
    float n1 = fbm(par(dir, 150.)*2.1 + vec3(0., 0., uTime*.010));
    float n2 = fbm(par(dir, 150.)*4.3 + 7.1 - vec3(uTime*.007));
    u += uCA*pow(n1, 3.)*.22 + uCB*pow(n2, 3.4)*.11 + uCC*pow(n1*n2, 5.)*.32;
    u += galaxy(dir, normalize(vec3(.87,-.12,.50)), .5, .17, uCA, uCC, .38)*.55;
    u += galaxy(dir, normalize(vec3(-.71,-.20,.67)), 2.2, .12, uCB, uCA, .55)*.40;
    u += stars(dir, 130., 150., .060, .15, 1.00, 0.) + stars(dir, 55., 78., .050, .19, .90, 11.) + stars(dir, 22., 36., .032, .27, .85, 29.);
    u += bokeh(dir);
    vec4 p1 = planet(dir, normalize(vec3(.30,-.14,.94)), .016, vec3(.55,.40,.30), vec3(.80,.62,.45), 0.);
    vec4 p2 = planet(dir, normalize(vec3(-.55,-.05,-.72)), .024, vec3(.40,.45,.60), vec3(.62,.58,.80), 1.);
    vec4 p3 = planet(dir, normalize(vec3(.78,-.30,-.57)), .012, vec3(.35,.55,.50), vec3(.55,.75,.65), 0.);
    u *= (1. - p1.a)*(1. - p2.a)*(1. - p3.a);
    u += (p1.rgb + p2.rgb + p3.rgb)*.85;
    col += u*uUni;
  }
  o = vec4(col*uDim, 1.);
}`;

/* ---------- pós-processamento ---------- */
export const BRIGHT_FS = HEAD + `
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr;
out vec4 o;
void main(){
  vec3 c = (texture(uTex,vUv+uTexel*vec2(-.5,-.5)).rgb + texture(uTex,vUv+uTexel*vec2(.5,-.5)).rgb + texture(uTex,vUv+uTexel*vec2(-.5,.5)).rgb + texture(uTex,vUv+uTexel*vec2(.5,.5)).rgb)*.25;
  float br = max(c.r, max(c.g, c.b));
  c *= max(br - uThr, 0.)/max(br, 1e-4);
  o = vec4(c,1.);
}`;
export const COPY_FS = HEAD + `
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;
out vec4 o;
void main(){
  o = vec4((texture(uTex,vUv+uTexel*vec2(-.5,-.5)).rgb + texture(uTex,vUv+uTexel*vec2(.5,-.5)).rgb + texture(uTex,vUv+uTexel*vec2(-.5,.5)).rgb + texture(uTex,vUv+uTexel*vec2(.5,.5)).rgb)*.25, 1.);
}`;
export const BLUR_FS = HEAD + `
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main(){
  vec3 s = texture(uTex,vUv).rgb*.227027;
  s += (texture(uTex,vUv+uDir*1.3846).rgb + texture(uTex,vUv-uDir*1.3846).rgb)*.3162162;
  s += (texture(uTex,vUv+uDir*3.2308).rgb + texture(uTex,vUv-uDir*3.2308).rgb)*.0702703;
  o = vec4(s,1.);
}`;
export const COMPOSITE_FS = HEAD + `
in vec2 vUv;
uniform sampler2D uScene; uniform sampler2D uB0; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uB3;
uniform vec4 uBW; uniform float uBloom; uniform float uWarp; uniform float uAberr; uniform float uGrain; uniform float uVig;
uniform float uExposure; uniform float uTime; uniform vec2 uRes;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
vec3 scene(vec2 uv){
  if(uWarp < .004) return texture(uScene, uv).rgb;
  vec2 c = uv - .5; vec3 a = vec3(0.);
  for(int i=0;i<10;i++){ float t = float(i)/10.; a += texture(uScene, .5 + c*(1. - uWarp*.2*t)).rgb; }
  return a/10.;
}
void main(){
  vec2 c = vUv - .5; float r2 = dot(c,c);
  float ab = uAberr*(1.+uWarp*4.)*r2*4.;
  vec3 col;
  col.r = scene(vUv + c*ab).r; col.g = scene(vUv).g; col.b = scene(vUv - c*ab).b;
  vec3 bl = texture(uB0,vUv).rgb*uBW.x + texture(uB1,vUv).rgb*uBW.y + texture(uB2,vUv).rgb*uBW.z + texture(uB3,vUv).rgb*uBW.w;
  col += bl*uBloom;
  col *= uExposure;
  col = aces(col);
  col = pow(col, vec3(1./2.2));
  col *= 1. - uVig*smoothstep(.15,.75,r2*1.9);
  col += (hash12(vUv*uRes + fract(uTime)*91.7) - .5)*uGrain;
  o = vec4(col, 1.);
}`;

export const FXAA_FS = HEAD + `
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;
out vec4 o;
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
void main(){
  vec3 M = texture(uTex, vUv).rgb;
  vec3 NW = texture(uTex, vUv + uTexel*vec2(-1.,-1.)).rgb, NE = texture(uTex, vUv + uTexel*vec2(1.,-1.)).rgb;
  vec3 SW = texture(uTex, vUv + uTexel*vec2(-1.,1.)).rgb, SE = texture(uTex, vUv + uTexel*vec2(1.,1.)).rgb;
  float lM = lum(M), lNW = lum(NW), lNE = lum(NE), lSW = lum(SW), lSE = lum(SE);
  float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE))), lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE)*.25*(1./8.), 1./128.);
  float rcp = 1./(min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir*rcp, -8., 8.)*uTexel;
  vec3 A = .5*(texture(uTex, vUv + dir*(1./3. - .5)).rgb + texture(uTex, vUv + dir*(2./3. - .5)).rgb);
  vec3 B = A*.5 + .25*(texture(uTex, vUv + dir*-.5).rgb + texture(uTex, vUv + dir*.5).rgb);
  float lB = lum(B);
  o = vec4((lB < lMin || lB > lMax) ? A : B, 1.);
}`;
