/* Leitura da folha a partir de uma foto ou de um quadro da câmera.
   1) acha os 4 quadrados pretos, 2) calcula a perspectiva (homografia),
   3) lê o QR code na posição esperada, 4) nas folhas novas, acerta a posição de cada coluna pelos
   quadradinhos dela, 5) mede o preenchimento de cada bolinha. */

class ErroLeitura extends Error {
  constructor(codigo, msg) { super(msg); this.codigo = codigo; }
}

function cinza(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

function reduzir(g, w, h, maxLado) {
  const k = Math.min(1, maxLado / Math.max(w, h));
  if (k === 1) return { g, w, h, k };
  const W = Math.round(w * k), H = Math.round(h * k), out = new Uint8ClampedArray(W * H);
  const inv = 1 / k;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * inv), y1 = Math.min(h, Math.floor((y + 1) * inv));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * inv), x1 = Math.min(w, Math.floor((x + 1) * inv));
      let s = 0, n = 0;
      for (let yy = y0; yy < Math.max(y1, y0 + 1); yy++) for (let xx = x0; xx < Math.max(x1, x0 + 1); xx++) { s += g[yy * w + xx]; n++; }
      out[y * W + x] = s / n;
    }
  }
  return { g: out, w: W, h: H, k };
}

const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
/* Encontra os 4 quadrados dos cantos. Devolve os centros na ordem horária a partir do mais acima-à-esquerda. */
function acharMarcas(g, w, h) {
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let lin = 0;
    for (let x = 0; x < w; x++) { lin += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + lin; }
  }
  const R = Math.max(10, Math.round(Math.max(w, h) / 12));
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - R), yb = Math.min(h, y + R + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - R), xb = Math.min(w, x + R + 1);
      const soma = I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa];
      const media = soma / ((yb - ya) * (xb - xa));
      const v = g[y * w + x];
      if (v < media * 0.68 && v < 150) bin[y * w + x] = 1;
    }
  }
  // componentes conectados
  const lab = new Int32Array(w * h), pilha = new Int32Array(w * h);
  const cands = [];
  let id = 0;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || lab[i]) continue;
    id++;
    let sp = 0; pilha[sp++] = i; lab[i] = id;
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    // pontos extremos em 8 direções: num quadrado (girado ou não) alguns deles caem perto dos cantos
    const ext = new Float64Array(8).fill(-Infinity), extP = new Int32Array(8);
    while (sp) {
      const p = pilha[--sp], x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let d = 0; d < 8; d++) { const v = x * DIR8[d][0] + y * DIR8[d][1]; if (v > ext[d]) { ext[d] = v; extP[d] = p; } }
      if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = id; pilha[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = id; pilha[sp++] = p + 1; }
      if (y > 0 && bin[p - w] && !lab[p - w]) { lab[p - w] = id; pilha[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !lab[p + w]) { lab[p + w] = id; pilha[sp++] = p + w; }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (bw < 6 || bh < 6) continue;
    const ar = bw / bh;
    if (ar < 0.5 || ar > 2) continue;
    const cheio = area / (bw * bh);
    if (cheio < 0.5) continue;
    if (bw > w * 0.2 || bh > h * 0.2) continue;
    // "quadradice": (distância do centro ao ponto mais afastado)² / área. Quadrado: ~0,5; círculo (bolinha pintada): ~0,32
    const cx = sx / area, cy = sy / area;
    let d2 = 0;
    for (let d = 0; d < 8; d++) { const px = extP[d] % w, py = (extP[d] - px) / w; d2 = Math.max(d2, (px + 0.5 - cx - 0.5) ** 2 + (py + 0.5 - cy - 0.5) ** 2); }
    const quina = d2 / area;
    if (quina < 0.38) continue;
    cands.push({ x: cx, y: cy, area, cheio, quina });
  }
  cands.sort((a, b) => b.area - a.area);
  const top = cands.slice(0, 12);
  // candidatos mais "quadrados pretos" para mostrar na câmera mesmo quando ainda faltam cantos
  const solidos = cands;
  acharMarcas.ultimos = solidos.filter((c) => c.area >= (solidos[0] ? solidos[0].area : 0) * 0.55).slice(0, 4);
  let melhor = null, melhorScore = 0;
  const n = top.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const q = [top[a], top[b], top[c], top[d]];
    const areas = q.map((p) => p.area), mx = Math.max(...areas), mn = Math.min(...areas);
    if (mn < mx * 0.3) continue;
    const ord = ordenarHorario(q);
    if (!convexo(ord)) continue;
    const aq = areaPoligono(ord);
    if (aq < w * h * 0.03) continue;
    // lados opostos com tamanhos parecidos (folha retangular, perspectiva moderada)
    const L = [0, 1, 2, 3].map((i) => dist(ord[i], ord[(i + 1) % 4]));
    if (Math.min(L[0], L[2]) / Math.max(L[0], L[2]) < 0.6 || Math.min(L[1], L[3]) / Math.max(L[1], L[3]) < 0.6) continue;
    // a moldura é mais larga que alta (a altura muda com o número de questões; a largura é sempre a mesma)
    const largo = (L[0] + L[2]) / 2, alto = (L[1] + L[3]) / 2, comprido = Math.max(largo, alto), curto = Math.min(largo, alto);
    if (curto / comprido < 0.15) continue;
    // o tamanho dos quadrados tem de combinar com a largura da moldura que eles formam
    const ladoEsperado2 = ((comprido / (MARCAS.centros[1][0] - MARCAS.centros[0][0])) * MARCAS.lado) ** 2;
    if (mn < ladoEsperado2 * 0.3 || mx > ladoEsperado2 * 3) continue;
    const score = aq * Math.sqrt(mn / mx);
    if (score > melhorScore) { melhorScore = score; melhor = ord; }
  }
  return melhor;
}
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
function ordenarHorario(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ord = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // começa pelo mais acima-à-esquerda
  let k = 0, best = Infinity;
  ord.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; k = i; } });
  return ord.slice(k).concat(ord.slice(0, k));
}
function convexo(p) {
  let sinal = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const s = Math.sign(z);
    if (!s) return false;
    if (sinal && s !== sinal) return false;
    sinal = s;
  }
  return true;
}
function areaPoligono(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/* Homografia que leva (X,Y) em mm para (x,y) em pixels */
function homografia(src, dst) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = src[i], { x, y } = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); B.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); B.push(y);
  }
  const h = resolver(A, B);
  if (!h) return null;
  return (X, Y) => {
    const d = h[6] * X + h[7] * Y + 1;
    return [(h[0] * X + h[1] * Y + h[2]) / d, (h[3] * X + h[4] * Y + h[5]) / d];
  };
}
function resolver(A, B) {
  const n = B.length, M = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function amostrador(g, w, h, H) {
  return (X, Y) => {
    const [x, y] = H(X, Y);
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
  };
}

/* Recorta a região do QR já "endireitada" e tenta decodificar */
function lerQRRetificado(g, w, h, H) {
  const s = 9, x0 = QR.x - 5, y0 = QR.y - 5, lado = QR.lado + 10, n = lado * s;
  const amostra = amostrador(g, w, h, H);
  const rgba = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = amostra(x0 + (i + 0.5) / s, y0 + (j + 0.5) / s), k = (j * n + i) * 4;
    rgba[k] = rgba[k + 1] = rgba[k + 2] = v; rgba[k + 3] = 255;
  }
  const r = jsQR(rgba, n, n, { inversionAttempts: "dontInvert" });
  return r && r.data;
}

function mediaDisco(amostra, cx, cy, raio) {
  let s = 0, n = 0;
  const passo = Math.max(0.25, raio / 3);
  for (let dy = -raio; dy <= raio + 1e-9; dy += passo) for (let dx = -raio; dx <= raio + 1e-9; dx += passo) {
    if (dx * dx + dy * dy > raio * raio) continue;
    s += amostra(cx + dx, cy + dy); n++;
  }
  return s / n;
}

/* Decide a marcação de um grupo de bolinhas: índice marcado, -1 (branco) ou -2 (mais de uma) */
function decidir(f) {
  const ord = f.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const [m1, i1] = ord[0], m2 = ord[1] ? ord[1][0] : 0;
  if (m1 < 0.35) return -1;
  if (m2 >= 0.35 && m2 > m1 * 0.6) return -2;
  return i1;
}

/* Preenchimento (0 a 1) de uma bolinha de raio r em (cx, cy) */
function preenchimento(amostra, cx, cy, r, branco, faixa) {
  let max = 0;
  const off = r * 0.3;
  for (const dy of [-off, 0, off]) for (const dx of [-off, 0, off]) {
    const v = (branco - mediaDisco(amostra, cx + dx, cy + dy, r * 0.55)) / faixa;
    if (v > max) max = v;
  }
  return Math.min(1, max);
}

/* Referência de preto: interior dos quadrados dos cantos */
function pretoDe(amostra, geo) {
  return geo.marcas.map(([x, y]) => mediaDisco(amostra, x, y, 2.5)).sort((a, b) => a - b)[1];
}

/* Moldura (TL, TR, BR, BL em mm) com a altura dada, para ler o QR antes de saber o tamanho exato */
const molduraComAltura = (alt) => { const [[x0, y0], [x1]] = MARCAS.centros; return [[x0, y0], [x1, y0], [x1, y0 + alt], [x0, y0 + alt]]; };
/* Alturas prováveis da moldura (mm) vendo os 4 cantos na ordem TL, TR, BR, BL: pela proporção dos lados
   (a perspectiva distorce um pouco, por isso vai também a altura da folha antiga como alternativa) */
function alturasProvaveis(d) {
  const larg = MARCAS.centros[1][0] - MARCAS.centros[0][0];
  const alt = (larg * (dist(d[0], d[3]) + dist(d[1], d[2]))) / (dist(d[0], d[1]) + dist(d[3], d[2]));
  if (alt < 25 || alt > 175) return [];
  const antiga = MARCAS.centros[2][1] - MARCAS.centros[0][1];
  return Math.abs(alt - antiga) < 6 ? [antiga, alt] : [alt, antiga];
}

/* Acha o centro (em mm) do quadradinho preto perto de (X, Y), procurando numa janela de ±6 mm na imagem
   já endireitada pela homografia geral. Devolve null se não achar um quadrado do tamanho certo. */
function acharMarcaLocal(amostra, X, Y, lado, preto) {
  const s = 4, R = 6, n = 2 * R * s + 1, v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = amostra(X - R + i / s, Y - R + j / s);
  const ord = Array.from(v).sort((a, b) => b - a), branco = ord[Math.floor(n * n * 0.2)];
  if (branco - preto < 40) return null;
  const lim = (branco + preto) / 2, esperado = (lado * s) ** 2;
  // entre as manchas escuras do tamanho de um quadradinho (e bem "cheias"), a mais perto do ponto previsto
  const vis = new Uint8Array(n * n);
  let melhor = null, dMelhor = Infinity;
  for (let ini = 0; ini < n * n; ini++) {
    if (vis[ini] || v[ini] >= lim) continue;
    const pilha = [ini];
    vis[ini] = 1;
    let area = 0, sx = 0, sy = 0, toca = false, i0 = n, i1 = 0, j0 = n, j1 = 0;
    while (pilha.length) {
      const p = pilha.pop(), i = p % n, j = (p - i) / n;
      area++; sx += i; sy += j;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) toca = true;
      if (i > 0 && !vis[p - 1] && v[p - 1] < lim) { vis[p - 1] = 1; pilha.push(p - 1); }
      if (i < n - 1 && !vis[p + 1] && v[p + 1] < lim) { vis[p + 1] = 1; pilha.push(p + 1); }
      if (j > 0 && !vis[p - n] && v[p - n] < lim) { vis[p - n] = 1; pilha.push(p - n); }
      if (j < n - 1 && !vis[p + n] && v[p + n] < lim) { vis[p + n] = 1; pilha.push(p + n); }
    }
    if (toca || area < esperado * 0.45 || area > esperado * 2) continue;
    const bw = i1 - i0 + 1, bh = j1 - j0 + 1;
    if (area / (bw * bh) < 0.6 || bw / bh < 0.6 || bw / bh > 1.67) continue;
    const cx = sx / area, cy = sy / area, d = (cx - R * s) ** 2 + (cy - R * s) ** 2;
    if (d < dMelhor) { dMelhor = d; melhor = [X - R + cx / s, Y - R + cy / s]; }
  }
  return melhor;
}

/* Homografias por coluna a partir dos quadradinhos de cada coluna (folhas novas).
   Coluna em que algum quadradinho não foi achado fica com a homografia geral. */
function homografiasDasColunas(g, w, h, H, geo) {
  const out = [];
  if (!geo.marcasCol || !geo.marcasCol.length) return out;
  const amostra = amostrador(g, w, h, H), preto = pretoDe(amostra, geo);
  for (const col of geo.marcasCol) {
    const achados = col.pts.map(([X, Y]) => acharMarcaLocal(amostra, X, Y, MARCA_COL.lado, preto));
    if (achados.some((p) => !p)) continue;
    const Hc = homografia(col.pts, achados.map(([X, Y]) => { const [x, y] = H(X, Y); return { x, y }; }));
    if (Hc) out[col.c] = Hc;
  }
  return out;
}

/* Lê as bolinhas. Devolve string de respostas: letra (A–E ou C/E), "-" (branco) ou "*" (mais de uma). */
function lerBolinhas(amostraGeral, geo, amostrasCol) {
  const preto = pretoDe(amostraGeral, geo);
  let resp = "";
  const fills = [];
  for (let q = 0; q < geo.nQ; q++) {
    const amostra = (amostrasCol && amostrasCol[geo.colDe(q)]) || amostraGeral;
    const letras = geo.letras(q);
    // referência de branco: vãos entre as bolinhas da mesma linha
    const brancos = [];
    for (let a = 0; a < letras.length; a++) {
      const [cx, cy] = geo.pos(q, a);
      brancos.push(mediaDisco(amostra, cx + geo.px / 2, cy, 0.25));
      if (a === 0) brancos.push(mediaDisco(amostra, cx - geo.px / 2, cy, 0.25));
    }
    brancos.sort((a, b) => b - a);
    const branco = brancos[Math.floor(brancos.length / 3)];
    const faixa = Math.max(40, branco - preto);
    const f = [];
    for (let a = 0; a < letras.length; a++) { const [cx, cy] = geo.pos(q, a); f.push(preenchimento(amostra, cx, cy, geo.r, branco, faixa)); }
    fills.push(f);
    const d = decidir(f);
    resp += d === -1 ? "-" : d === -2 ? "*" : letras[d];
  }
  const amostra = amostraGeral;
  // grade do Nº de chamada
  let numero = null;
  if (geo.num) {
    const dig = [];
    for (let lin = 0; lin < 2; lin++) {
      const brancos = [];
      for (let d = 0; d < 10; d++) { const [cx, cy] = geo.numPos(lin, d); brancos.push(mediaDisco(amostra, cx + 3.6, cy, 0.25)); }
      brancos.sort((a, b) => b - a);
      const branco = brancos[Math.floor(brancos.length / 3)], faixa = Math.max(40, branco - preto);
      const f = [];
      for (let d = 0; d < 10; d++) { const [cx, cy] = geo.numPos(lin, d); f.push(preenchimento(amostra, cx, cy, 2.3, branco, faixa)); }
      dig.push(decidir(f));
    }
    if (dig[0] >= 0 && dig[1] >= 0) numero = dig[0] * 10 + dig[1];
    else if (dig[0] === -1 && dig[1] >= 0) numero = dig[1];
  }
  // língua estrangeira: "Inglês", "Espanhol", "" (em branco) ou "*" (as duas marcadas)
  let lingua = null;
  if (geo.lingua) {
    const [x0, y0] = geo.linguaPos(0), [, y1] = geo.linguaPos(1), c = LINGUA.caixa;
    const brancos = [mediaDisco(amostra, x0, (y0 + y1) / 2, 0.25), mediaDisco(amostra, c.x + c.w - 3, y0, 0.25), mediaDisco(amostra, c.x + c.w - 3, y1, 0.25), mediaDisco(amostra, x0 - 4, (y0 + y1) / 2, 0.25)];
    brancos.sort((a, b) => b - a);
    const branco = brancos[1], faixa = Math.max(40, branco - preto);
    const d = decidir(LINGUAS.map((_, i) => { const [cx, cy] = geo.linguaPos(i); return preenchimento(amostra, cx, cy, LINGUA.r, branco, faixa); }));
    lingua = d === -1 ? "" : d === -2 ? "*" : LINGUAS[d];
  }
  return { resp, fills, numero, lingua };
}

/* Entrada: um canvas (foto ou quadro de vídeo). Saída: { codigo, info, resp, fills, numero, lingua, H, geo, pts }.
   Em caso de erro, ErroLeitura traz .marcas (quadrados encontrados, em pixels do canvas) para a câmera mostrar. */
function lerFolha(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const g = cinza(rgba, w, h);
  const red = reduzir(g, w, h, 900);
  const marcas = acharMarcas(red.g, red.w, red.h);
  const paraCanvas = (p) => ({ x: (p.x + 0.5) / red.k - 0.5, y: (p.y + 0.5) / red.k - 0.5 });
  const vistos = (acharMarcas.ultimos || []).map(paraCanvas);
  const erro = (codigo, msg, pts) => { const e = new ErroLeitura(codigo, msg); e.marcas = pts || vistos; return e; };
  if (!marcas) {
    const antigo = jsQR(rgba, w, h, { inversionAttempts: "dontInvert" });
    if (antigo && ehCodigoAntigo(antigo.data)) throw erro("antiga", "Esta folha foi impressa no modelo antigo. Gere e imprima as folhas de novo na aba Folhas.");
    throw erro("cantos", "Não encontrei os 4 quadrados pretos em volta do gabarito. Enquadre o gabarito inteiro, de cima, com boa luz.");
  }
  const pts = marcas.map(paraCanvas);

  // tenta as 4 orientações; a certa é a que tem o QR code junto ao quadrado superior esquerdo
  // a altura da moldura muda com o número de questões: primeiro uma estimativa (para achar o QR);
  // depois de ler o QR, a altura exata sai do layout
  let codigo = null, dstOk = null;
  tentativas: for (const k of [0, 1, 3, 2]) {
    const dst = [0, 1, 2, 3].map((i) => pts[(i + k) % 4]);
    for (const alt of alturasProvaveis(dst)) {
      const Hk = homografia(molduraComAltura(alt), dst);
      if (!Hk) continue;
      const txt = lerQRRetificado(g, w, h, Hk);
      if (txt && lerCodigoQR(txt)) { codigo = txt; dstOk = dst; break tentativas; }
    }
  }
  if (!codigo) {
    const r = jsQR(rgba, w, h, { inversionAttempts: "dontInvert" });
    if (r && ehCodigoAntigo(r.data)) throw erro("antiga", "Esta folha foi impressa no modelo antigo. Gere e imprima as folhas de novo na aba Folhas.", pts);
    if (r && lerCodigoQR(r.data)) {
      codigo = r.data;
      const c = r.location;
      const qc = { x: (c.topLeftCorner.x + c.bottomRightCorner.x) / 2, y: (c.topLeftCorner.y + c.bottomRightCorner.y) / 2 };
      let j = 0, best = Infinity;
      pts.forEach((p, i) => { const d = dist(p, qc); if (d < best) { best = d; j = i; } });
      // o quadrado mais perto do QR é o superior esquerdo
      dstOk = [0, 1, 2, 3].map((i) => pts[(i + j) % 4]);
    }
  }
  if (!codigo) throw erro("qr", "Achei os 4 quadrados, mas não consegui ler o QR code. Aproxime um pouco o celular e evite sombra ou reflexo.", pts);
  const info = lerCodigoQR(codigo);
  const geo = geometria(info.L);
  const H = homografia(geo.marcas, dstOk);
  if (!H) throw erro("cantos", "Não consegui calcular a posição do gabarito. Tente de novo, de cima e com boa luz.", pts);
  const Hcol = homografiasDasColunas(g, w, h, H, geo);
  const amostrasCol = Hcol.map((Hc) => Hc && amostrador(g, w, h, Hc));
  const { resp, fills, numero, lingua } = lerBolinhas(amostrador(g, w, h, H), geo, amostrasCol);
  return { codigo, info, resp, fills, numero, lingua, H, Hcol, geo, pts };
}

/* Desenha uma prévia reduzida com as marcações reconhecidas */
function previaLeitura(canvas, leitura, gabarito, largura = 520) {
  const k = largura / canvas.width;
  const cv = document.createElement("canvas");
  cv.width = largura; cv.height = Math.round(canvas.height * k);
  const ctx = cv.getContext("2d");
  ctx.drawImage(canvas, 0, 0, cv.width, cv.height);
  const { H, geo, resp } = leitura;
  const esp = Math.max(1, largura / 600);
  ctx.lineWidth = 2 * esp;
  ctx.strokeStyle = "#2f6fed";
  ctx.beginPath();
  geo.marcas.forEach(([X, Y], i) => { const [x, y] = H(X, Y); i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k); });
  ctx.closePath(); ctx.stroke();
  for (let q = 0; q < geo.nQ; q++) {
    const r = resp[q];
    const gab = gabarito ? gabarito[q] : null;
    const letras = geo.letras(q);
    for (let a = 0; a < letras.length; a++) {
      const L = letras[a];
      const marcada = r === L || (r === "*" && leitura.fills[q][a] >= 0.35);
      const correta = gab === L;
      if (!marcada && !correta) continue;
      const [X, Y] = geo.pos(q, a);
      const Hq = (leitura.Hcol && leitura.Hcol[geo.colDe(q)]) || H;
      const [x, y] = Hq(X, Y);
      const [x2] = Hq(X + geo.r, Y);
      const rad = Math.max(3 * esp, Math.abs(x2 - x) * k + 1.5 * esp);
      ctx.beginPath(); ctx.arc(x * k, y * k, rad, 0, Math.PI * 2);
      if (marcada) { ctx.strokeStyle = r === "*" || gab === "?" ? "#e08a00" : correta || !gab || gab === "X" ? "#16a34a" : "#dc2626"; ctx.lineWidth = 2.5 * esp; }
      else { ctx.strokeStyle = "rgba(22,163,74,.6)"; ctx.lineWidth = 1.2 * esp; ctx.setLineDash([3 * esp, 2 * esp]); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // língua escolhida, em azul
  const iL = LINGUAS.indexOf(leitura.lingua);
  if (geo.lingua && iL >= 0) {
    const [X, Y] = geo.linguaPos(iL), [x, y] = H(X, Y), [x2] = H(X + LINGUA.r, Y);
    ctx.beginPath(); ctx.arc(x * k, y * k, Math.max(3 * esp, Math.abs(x2 - x) * k + 1.5 * esp), 0, Math.PI * 2);
    ctx.strokeStyle = "#2f6fed"; ctx.lineWidth = 2.5 * esp; ctx.stroke();
  }
  return cv;
}

/* Imagem da folha corrigida para conferir depois: recorta a região do gabarito (com folga) e reduz */
function imagemCorrigida(canvas, leitura, gabarito, largMax = 900) {
  const cheia = previaLeitura(canvas, leitura, gabarito, canvas.width);
  const xs = leitura.pts.map((p) => p.x), ys = leitura.pts.map((p) => p.y);
  const fx = (Math.max(...xs) - Math.min(...xs)) * 0.05, fy = (Math.max(...ys) - Math.min(...ys)) * 0.05;
  const x0 = Math.max(0, Math.min(...xs) - fx), y0 = Math.max(0, Math.min(...ys) - fy);
  const x1 = Math.min(canvas.width, Math.max(...xs) + fx), y1 = Math.min(canvas.height, Math.max(...ys) + fy);
  const k = Math.min(1, largMax / (x1 - x0));
  const cv = document.createElement("canvas");
  cv.width = Math.round((x1 - x0) * k); cv.height = Math.round((y1 - y0) * k);
  cv.getContext("2d").drawImage(cheia, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.62);
}

function arquivoParaCanvas(file, maxLado = 2200) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, maxLado / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new ErroLeitura("arquivo", "Não consegui abrir esta imagem.")); };
    im.src = url;
  });
}
