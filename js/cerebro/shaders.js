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

/* ---------- sinapses (linhas com pulsos de luz) ---------- */
export const LINE_VS = HEAD + REG + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aMeta;
uniform mat4 uVP;
out float vU; out float vSeed; out float vAct; out vec3 vRC;
void main(){
  int r = int(aMeta.z + .5);
  vAct = uRegS[r]; vRC = uRegC[r]; vU = aMeta.x; vSeed = aMeta.y;
  gl_Position = uVP*vec4(aPos,1.);
}`;
export const LINE_FS = HEAD + GRAD + `
in float vU; in float vSeed; in float vAct; in vec3 vRC;
uniform float uGlow; uniform float uDim; uniform float uAssemble;
out vec4 o;
void main(){
  float speed = .20 + vSeed*.25 + vAct*1.0;
  float head = fract(uTime*speed + vSeed*7.31);
  float d = abs(vU - head); d = min(d, 1.-d);
  float pulse = smoothstep(.11, 0., d);
  float base = .09 + vAct*.30;
  vec3 col = mix(grad3(fract(vSeed*3.7 + vU*.4)), vRC, clamp(vAct,0.,1.)*.7);
  float inten = (base + pulse*(1.0 + vAct*1.8)) * uGlow * uDim * smoothstep(.55,1.,uAssemble);
  o = vec4(col*inten, 1.);
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
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform float uTan; uniform float uAspect; uniform float uTime;
uniform vec3 uBg0; uniform vec3 uBg1; uniform vec3 uCA; uniform vec3 uCB; uniform vec3 uCC; uniform float uDim;
out vec4 o;
float hash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= .5; } return s; }
void main(){
  vec3 dir = normalize(uFwd + uRight*vNdc.x*uAspect*uTan + uUp*vNdc.y*uTan);
  vec3 col = mix(uBg0, uBg1, vNdc.y*.5+.5);
  float n1 = fbm(dir*2.1 + vec3(0., 0., uTime*.012));
  float n2 = fbm(dir*4.3 + 7.1 - vec3(uTime*.008));
  col += uCA*pow(n1,3.0)*.20 + uCB*pow(n2,3.4)*.10 + uCC*pow(n1*n2,5.)*.30;
  vec3 sp = dir*95.; vec3 id = floor(sp); vec3 f = fract(sp) - .5; float h = hash(id);
  if(h > .975){ float tw = .6 + .4*sin(uTime*(1.+h*3.) + h*60.); col += vec3(.82,.86,1.)*smoothstep(.30,0.,length(f))*(h-.975)*40.*tw; }
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
