/* Folha de respostas: geometria, desenho (PDF, canvas, Word), código de barras e QR.
   Todas as medidas em milímetros numa folha A4 em pé (210 x 297). */

const A4 = { w: 210, h: 297 };
/* Quadrados pretos (centros), na ordem TL, TR, BR, BL. Ficam só em volta da área do gabarito:
   o celular pode chegar mais perto e a leitura fica mais nítida. */
const MARCAS = { lado: 8, centros: [[15, 114], [195, 114], [195, 262], [15, 262]] };
// QR code dentro da moldura, junto ao quadrado superior esquerdo
const QR = { x: 23, y: 111.5, lado: 22 };
/* Posições do cabeçalho (mm), usadas no PDF e no Word */
const CAB = { campos: [33, 41.3, 49.6], hCampo: 6.8, conteudo: { y: 58.4, h: 8 }, metodo: { y: 68, h: 8 }, linha: { y: 77.6, h: 26 } };
const LETRAS = "ABCDE";
// Língua estrangeira: duas bolinhas no canto superior direito da moldura (Inglês em cima, Espanhol embaixo)
const LINGUAS = ["Inglês", "Espanhol"];
const LINGUA = { x: 154, y: 122.5, passo: 7, r: 2.3, caixa: { x: 148, y: 111.5, w: 41, h: 22 } };
const VERSOES = "ABCD";
// Tipos de questão: número de alternativas (2 a 5) ou C = Certo/Errado
const TIPOS = [["2", "A e B"], ["3", "A a C"], ["4", "A a D"], ["5", "A a E"], ["C", "Certo / Errado"]];
const LIMITES = { min: 5, maxEscolha: 100, maxTotal: 200 };
const letrasTipo = (t) => (t === "C" ? "CE" : LETRAS.slice(0, +t));

/* Layout da folha: seções (tipo e quantidade), quadro de transcrição e grade do Nº de chamada.
   Vai dentro do QR code, então a leitura não depende de edições feitas depois da impressão. */
function layoutDe(av) {
  return {
    secs: (av.secoes || []).map((s) => ({ t: String(s.tipo), n: +s.n })),
    trans: !!av.transcricao,
    num: av.tipo === "neutra" && !!av.numChamada,
    cols: [1, 2, 3].includes(+av.colunas) ? +av.colunas : 0,   // 0 = automático
    lingua: !!av.comLingua,
    m: true,   // modelo com quadradinhos por coluna e moldura do tamanho da prova
  };
}
const layoutStr = (L) => L.secs.map((s) => s.t + "-" + s.n).join("_") + "~" + (L.trans ? "t" : "") + (L.num ? "n" : "") + (L.lingua ? "l" : "") + (L.m ? "m" : "") + (L.cols ? L.cols : "");
function parseLayout(s) {
  const [a, f = ""] = String(s).split("~");
  const secs = a.split("_").map((x) => { const [t, n] = x.split("-"); return { t, n: +n }; });
  if (!secs.length || secs.some((x) => !/^[2-5C]$/.test(x.t) || !(x.n > 0))) return null;
  const c = /[1-3]/.exec(f);
  return { secs, trans: f.includes("t"), num: f.includes("n"), lingua: f.includes("l"), m: f.includes("m"), cols: c ? +c[0] : 0 };
}

/* Geometria das questões dentro da moldura (em mm na folha), a partir do layout */
const GRADE = { top: 145, bottom: 258.5, x0: 21, x1: 189, pitchMin: 4.5, pxMin: 4.0 };
/* Quadradinhos de cada coluna (modelo "m"): um em cada canto da coluna, logo acima da primeira linha e logo
   abaixo da última. O leitor usa os 4 de cada coluna para acertar a posição das bolinhas daquela coluna. */
const MARCA_COL = { lado: 4, folga: 2.5, alturaMin: 36 };
function geometria(L) {
  const secs = L.secs, multi = secs.length > 1;
  const slots = [], qSec = [];
  let q = 0;
  secs.forEach((s, si) => {
    if (multi) slots.push({ h: si });
    for (let i = 0; i < s.n; i++) { slots.push({ q, si }); qSec.push(si); q++; }
  });
  const nQ = q;
  const larg = GRADE.x1 - GRADE.x0, top = GRADE.top, bottom = GRADE.bottom;
  const maxAlt = Math.max(...secs.map((s) => letrasTipo(s.t).length));
  const lab = nQ >= 100 ? 9.5 : 8.5, gap = 3.5;
  const maxCols = Math.max(1, Math.floor((larg + gap) / (lab + maxAlt * GRADE.pxMin + gap)));
  // colunas escolhidas pelo professor; no automático, de preferência duas (bolinhas maiores) e mais só quando não cabe
  let cols = L.cols || Math.min(maxCols, 2);
  let rows, pitch;
  for (;;) {
    rows = Math.ceil(slots.length / cols);
    pitch = rows > 1 ? Math.min(9, (bottom - top) / (rows - 1)) : 9;
    if (L.cols || pitch >= 5.4 || cols >= maxCols) break;
    cols++;
  }
  const gapC = cols <= 2 ? 14 : cols <= 4 ? 6 : gap;
  const px = Math.min(8.5, ((larg + gapC) / cols - lab - gapC) / maxAlt);
  const r = Math.min(3, pitch * 0.36, px * 0.38);
  const colW = lab + maxAlt * px + gapC;
  const x0 = 105 - (cols * colW - gapC) / 2;
  const slotDe = [];
  slots.forEach((s, k) => { if (s.q != null) slotDe[s.q] = k; });
  const xy = (k) => [x0 + Math.floor(k / rows) * colW, top + (k % rows) * pitch];
  // modelo "m": quadradinhos nos cantos de cada coluna e quadrados de baixo logo depois da última linha
  const yTopo = top - pitch / 2 - MARCA_COL.folga, yBase = top + (rows - 1) * pitch + pitch / 2 + MARCA_COL.folga;
  const marcasCol = [];
  if (L.m) for (let c = 0; c < cols; c++) {
    if (Math.min(rows, slots.length - c * rows) <= 0) continue;
    const xa = x0 + c * colW - 1.5 + MARCA_COL.lado / 2, xb = x0 + c * colW + colW - gapC + 1.5 - MARCA_COL.lado / 2;
    marcasCol.push({ c, pts: [[xa, yTopo], [xb, yTopo], [xb, yBase], [xa, yBase]] });
  }
  const yM = MARCAS.centros[0][1], yB = L.m ? Math.max(yBase, yM + MARCA_COL.alturaMin) : MARCAS.centros[2][1];
  const marcas = L.m ? [[15, yM], [195, yM], [195, yB], [15, yB]] : MARCAS.centros;
  return {
    marcas, marcasCol,
    colDe: (q) => Math.floor(slotDe[q] / rows),
    L, slots, nQ, qSec, top, cols, rows, pitch, px, r, colW, x0, lab, gapC,
    cabe: pitch >= GRADE.pitchMin - 1e-9 && px >= GRADE.pxMin - 1e-9,
    num: !!L.num,
    letras: (q) => letrasTipo(secs[qSec[q]].t),
    xy,
    pos(q, a) { const [x, yy] = xy(slotDe[q]); return [x + lab + (a + 0.5) * px, yy]; },
    numPos(lin, d) { return [72 + d * 7.2, 118 + lin * 8.5]; },
    lingua: !!L.lingua,
    linguaPos(i) { return [LINGUA.x, LINGUA.y + i * LINGUA.passo]; },
  };
}

/* Conteúdo do QR: GB5|avaliação|turma|aluno|versão|layout (GB5 = folha com a moldura em volta do gabarito) */
function codigoQR(av, turmaId, alunoId, ver) {
  return ["GB5", av.id, turmaId || "-", alunoId || "-", ver || "A", layoutStr(layoutDe(av))].join("|");
}
function lerCodigoQR(txt) {
  const p = String(txt || "").split("|");
  if (p[0] !== "GB5" || p.length < 6) return null;
  const L = parseLayout(p[5]);
  if (!L) return null;
  return { avId: p[1], turmaId: p[2] === "-" ? null : p[2], alunoId: p[3] === "-" ? null : p[3], ver: p[4] || "A", L };
}
/* Folha impressa na versão anterior (quadrados nos cantos da página) */
const ehCodigoAntigo = (txt) => /^GB[34]\|/.test(String(txt || ""));

/* ---------- Código de barras Code 128 ---------- */
const C128 = [11011001100, 11001101100, 11001100110, 10010011000, 10010001100, 10001001100, 10011001000, 10011000100, 10001100100, 11001001000, 11001000100, 11000100100, 10110011100, 10011011100, 10011001110, 10111001100, 10011101100, 10011100110, 11001110010, 11001011100, 11001001110, 11011100100, 11001110100, 11101101110, 11101001100, 11100101100, 11100100110, 11101100100, 11100110100, 11100110010, 11011011000, 11011000110, 11000110110, 10100011000, 10001011000, 10001000110, 10110001000, 10001101000, 10001100010, 11010001000, 11000101000, 11000100010, 10110111000, 10110001110, 10001101110, 10111011000, 10111000110, 10001110110, 11101110110, 11010001110, 11000101110, 11011101000, 11011100010, 11011101110, 11101011000, 11101000110, 11100010110, 11101101000, 11101100010, 11100011010, 11101111010, 11001000010, 11110001010, 10100110000, 10100001100, 10010110000, 10010000110, 10000101100, 10000100110, 10110010000, 10110000100, 10011010000, 10011000010, 10000110100, 10000110010, 11000010010, 11001010000, 11110111010, 11000010100, 10001111010, 10100111100, 10010111100, 10010011110, 10111100100, 10011110100, 10011110010, 11110100100, 11110010100, 11110010010, 11011011110, 11011110110, 11110110110, 10101111000, 10100011110, 10001011110, 10111101000, 10111100010, 11110101000, 11110100010, 10111011110, 10111101110, 11101011110, 11110101110, 11010000100, 11010010000, 11010011100, 1100011101011];
function code128(texto) {
  const s = String(texto);
  const codes = [];
  if (/^\d+$/.test(s) && s.length % 2 === 0) {
    codes.push(105);
    for (let i = 0; i < s.length; i += 2) codes.push(+s.slice(i, i + 2));
  } else {
    codes.push(104);
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      codes.push(c >= 32 && c < 128 ? c - 32 : 31);
    }
  }
  let soma = codes[0];
  for (let i = 1; i < codes.length; i++) soma += codes[i] * i;
  codes.push(soma % 103, 106);
  return codes.map((c) => String(C128[c])).join("");   // "1" = barra, "0" = espaço
}

/* ---------- QR code ---------- */
function qrMatriz(texto) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let y = 0; y < n; y++) { const linha = []; for (let x = 0; x < n; x++) linha.push(qr.isDark(y, x)); m.push(linha); }
  return m;
}

const INSTRUCOES_PADRAO = [
  "1. Preencha os dados do cabeçalho a caneta;",
  "2. As questões devem ser preenchidas com respostas a caneta preta ou azul;",
  "3. Não serão aceitas questões rasuradas;",
  "4. Não utilizar o aparelho celular no momento da avaliação;",
  "5. Só serão consideradas as respostas preenchidas abaixo, no gabarito;",
  "6. Assinale apenas uma alternativa para cada questão; mais de uma marcação anulará a resposta;",
  "7. Não amasse, dobre ou rasure esta folha.",
];
const METODOLOGIA_PADRAO = "AULAS EXPOSITIVAS; RESOLUÇÃO DE EXERCÍCIOS; ATIVIDADES SISTEMÁTICAS;";
const metodologiaDe = (av) => (av.metodologia != null && String(av.metodologia).trim() !== "" ? av.metodologia : METODOLOGIA_PADRAO);
/* Cabeçalho da folha: campos que entram (cada um pode ser ligado ou desligado na avaliação), suas larguras
   e a posição das faixas e da linha Instruções | Exemplo | Nota, que sobe quando sobra espaço.
   A moldura do gabarito nunca muda de lugar. */
const PASSO_CAMPO = 8.3, FIM_CABECALHO = CAB.linha.y + CAB.linha.h;
function cabecalhoDe(av, turma, aluno, ver) {
  const tem = {
    instituicao: !av.semInstituicao, data: !av.semData, turma: !av.semTurma, professor: !av.semProfessor, turno: !av.semTurno,
    nascimento: !!av.comNascimento, diaProva: !!av.comDiaProva, assinatura: !!av.comAssinatura, lingua: !!av.comLingua,
  };
  const conteudo = !av.transcricao && !av.semConteudo, metodo = !av.transcricao && !av.semMetodologia;
  const turno = av.turno || (turma && turma.turno) || "";
  const linhas = [
    [{ rot: "Aluno(a):", valor: aluno ? aluno.nome : "", peso: 158, negrito: true },
      { rot: "Nº:", valor: aluno && aluno.num ? String(aluno.num).padStart(2, "0") : "", fixo: 28, negrito: true }],
    [tem.data && { rot: "Data:", valor: "____/____/" + new Date().getFullYear(), peso: 52, tam: 8.5, cinza: true },
      tem.nascimento && { rot: "Nascimento:", valor: "____/____/____", peso: 56, tam: 8.5, cinza: true },
      { rot: "Disciplina:", valor: av.componente || "", peso: 78 },
      tem.turma && { rot: "Turma:", valor: turma ? turma.nome : "", peso: 54 }],
    [tem.professor && { rot: "Professor(a):", valor: av.professor || "", peso: 118 },
      tem.turno && { rot: "Turno:", valor: turno, peso: 36 },
      tem.diaProva && { rot: "Dia de prova:", valor: av.diaProva || "", peso: 42 },
      Math.max(1, +av.versoes || 1) > 1 && { rot: "Versão:", valor: ver || "A", fixo: 30, tam: 10.5, negrito: true }],
  ].map((l) => l.filter(Boolean)).filter((l) => l.length);
  let y = CAB.campos[0] + (linhas.length - 1) * PASSO_CAMPO + CAB.hCampo + 2;
  const pos = {};
  if (av.transcricao) { pos.transY = y; y += CAB.metodo.y + CAB.metodo.h - CAB.conteudo.y + 1.6; }
  else {
    if (conteudo) { pos.conteudoY = y; y += CAB.conteudo.h + 1.6; }
    if (metodo) { pos.metodoY = y; y += CAB.metodo.h + 1.6; }
  }
  return { tem, conteudo, metodo, linhas, ...pos, linhaY: y, linhaH: Math.min(34, FIM_CABECALHO - y) };
}
/* Larguras dos campos de uma linha: os "fixo" mantêm a medida, os demais dividem o resto pelo peso */
function largurasLinha(linha, total, vao) {
  const livre = total - vao * (linha.length - 1) - linha.reduce((s, c) => s + (c.fixo || 0), 0);
  const pesos = linha.reduce((s, c) => s + (c.fixo ? 0 : c.peso), 0);
  return linha.map((c) => c.fixo || (livre * c.peso) / pesos);
}
// Linha de assinatura abaixo da moldura (baseline do texto, em mm)
const ASSINATURA = { y: 277 };
const CABECALHO_PADRAO = { instituicao: "SERVIÇO SOCIAL DA INDÚSTRIA - SESI – DR PERNAMBUCO" };

/* Valor total da prova (soma dos pontos de cada questão) */
function valorProva(av) {
  let q = 0, total = 0;
  for (const s of av.secoes || []) for (let i = 0; i < +s.n; i++, q++) {
    const p = av.pontoPorQuestao && av.pontos && av.pontos[q] != null && av.pontos[q] !== "" ? +av.pontos[q] : +s.certo || 0;
    total += p;
  }
  return Math.round(total * 100) / 100;
}

/* Instruções na maior fonte em que cabem no quadro (largura e altura em mm) */
function instrucoesQueCabem(av, larg, alt) {
  const brutas = av.instrucoes && av.instrucoes.trim() ? av.instrucoes.split("\n").filter((x) => x.trim()) : INSTRUCOES_PADRAO;
  let tam = 5.2, linhas = [];
  for (const t of [7.2, 6.8, 6.4, 6, 5.6, 5.2]) {
    linhas = brutas.flatMap((ln) => quebrarTexto(ln, t, larg));
    tam = t;
    if (6.2 + (linhas.length - 1) * t * 0.42 <= alt - 1.5) break;
  }
  const passo = tam * 0.42;
  return { linhas: linhas.slice(0, Math.floor((alt - 7.7) / passo) + 1), tam, passo, brutas };
}
/* Linha de exemplo com a bolinha B pintada (caixa de 40 x 7 mm) */
const EXEMPLO = { x: 121, dy: 11, w: 40, h: 7 };
function desenharExemplo(L, x, y) {
  L({ t: "rrect", x, y, w: EXEMPLO.w, h: EXEMPLO.h, stroke: "#b8b8b8", lw: 0.2, rx: 1 });
  L({ t: "text", s: "00", x: x + 2, y: y + 3.5, size: 7.5, color: "#333333", mid: true });
  for (let a = 0; a < 4; a++) {
    const cx = x + 10.5 + a * 7.4, cy = y + 3.5;
    if (a === 1) L({ t: "circle", x: cx, y: cy, r: 2.4, fill: "#111111" });
    else { L({ t: "circle", x: cx, y: cy, r: 2.4, stroke: "#9a9a9a", lw: 0.25 }); L({ t: "text", s: LETRAS[a], x: cx, y: cy + 0.1, size: 6, color: "#9a9a9a", align: "center", mid: true }); }
  }
}

/* Monta a lista de operações de desenho de uma folha.
   d = { av, perfil, turma, aluno (ou null para folha neutra), ver, timbrado ({ img, modo } ou null) } */
function opsFolha(d) {
  const { av, perfil = {}, turma, aluno, timbrado } = d;
  const ver = d.ver || "A";
  const g = geometria(layoutDe(av));
  const ops = [];
  const cinzaBorda = "#9a9a9a", cinzaFundo = "#efefef", tinta = "#111111", borda = "#b8b8b8";
  const L = (o) => ops.push(o);
  const X0 = 11, LARG = 188;

  // Papel timbrado ao fundo (página inteira ou faixa no topo)
  if (timbrado && timbrado.img) {
    if (timbrado.modo === "faixa") L({ t: "img", src: timbrado.img, x: 0, y: 0, w: 210, h: 17, fit: "topo" });
    else L({ t: "img", src: timbrado.img, x: 0, y: 0, w: 210, h: 297, fit: "fill" });
  }

  const campo = (x, y, w, h, rot, valor, tam, negrito, cinzaValor) => {
    L({ t: "rect", x, y, w, h, fill: "#ffffff" });
    L({ t: "rrect", x, y, w, h, stroke: borda, lw: 0.25, rx: 1.2 });
    L({ t: "text", s: rot, x: x + 1.8, y: y + h / 2 + 1.1, size: 7.5, bold: true, color: "#333333" });
    if (valor) L({ t: "text", s: valor, x: x + 1.8 + largTexto(rot, 7.5, true) + 1.5, y: y + h / 2 + 1.3, size: tam || 9.5, bold: !!negrito, color: cinzaValor ? "#9a9a9a" : tinta, maxW: w - largTexto(rot, 7.5, true) - 5 });
  };
  const caixa = (x, y, w, h, titulo) => {
    L({ t: "rect", x, y, w, h, fill: "#ffffff" });
    L({ t: "rrect", x, y, w, h, stroke: borda, lw: 0.25, rx: 1.2 });
    if (titulo) {
      L({ t: "rect", x: x + 0.15, y: y + 0.15, w: w - 0.3, h: 4.8, fill: cinzaFundo });
      L({ t: "text", s: titulo, x: x + 1.8, y: y + 3.6, size: 7, bold: true, color: "#333333", maxW: w - 3.5 });
    }
  };

  // Cabeçalho: instituição, escola e título
  const instituicao = (perfil.instituicao != null && perfil.instituicao !== "" ? perfil.instituicao : CABECALHO_PADRAO.instituicao).toUpperCase();
  const comLogo = perfil.logo && !(timbrado && timbrado.img);
  const largTit = comLogo ? 146 : LARG;
  const cab = cabecalhoDe(av, turma, aluno, ver);
  const titulos = [cab.tem.instituicao && instituicao, perfil.escola && perfil.escola.toUpperCase()].filter(Boolean);
  titulos.forEach((t, i) => L({ t: "text", s: t, x: X0, y: 30.8 - (titulos.length - i) * 4.1, size: 9, bold: true, color: "#222222", maxW: largTit }));
  L({ t: "text", s: ("FOLHA DE RESPOSTAS" + (av.titulo ? " · " + av.titulo : "")).toUpperCase(), x: X0, y: 30.8, size: 8.5, bold: true, color: "#666666", maxW: largTit });
  if (comLogo) L({ t: "img", src: perfil.logo, x: 160, y: 19, w: 39, h: 13 });

  cab.linhas.forEach((linha, li) => {
    let x = X0;
    largurasLinha(linha, LARG, 2).forEach((w, k) => { const c = linha[k]; campo(x, CAB.campos[0] + li * PASSO_CAMPO, w, CAB.hCampo, c.rot, c.valor, c.tam, c.negrito, c.cinza); x += w + 2; });
  });

  // Conteúdo vivenciado e metodologia (faixas finas) ou quadro de transcrição
  const faixa = (y, h, rot1, rot2, texto) => {
    caixa(X0, y, LARG, h);
    L({ t: "rect", x: X0 + 0.15, y: y + 0.15, w: 27.7, h: h - 0.3, fill: cinzaFundo });
    L({ t: "line", x1: X0 + 28, y1: y, x2: X0 + 28, y2: y + h, color: borda, w: 0.25 });
    L({ t: "text", s: rot1, x: X0 + 1.8, y: y + h / 2 - 0.4, size: 6.8, bold: true, color: "#333333" });
    L({ t: "text", s: rot2, x: X0 + 1.8, y: y + h / 2 + 2.5, size: 6.8, bold: true, color: "#333333" });
    if (texto) quebrarTexto(texto, 7.5, LARG - 32).slice(0, 2).forEach((ln, i, arr) => L({ t: "text", s: ln, x: X0 + 30.5, y: y + (arr.length > 1 ? h / 2 - 0.6 + i * 3.2 : h / 2 + 1.2), size: 7.5, color: tinta }));
  };
  if (g.L.trans) {
    const y = cab.transY, h = CAB.metodo.y + CAB.metodo.h - CAB.conteudo.y;
    caixa(X0, y, LARG, h);
    L({ t: "line", x1: 58, y1: y, x2: 58, y2: y + h, color: borda, w: 0.25 });
    const linhas = quebrarTexto((av.transcricaoTexto || "ATENÇÃO: TRANSCREVA AQUI, COM A SUA CALIGRAFIA USUAL, A FRASE APRESENTADA NA CAPA DO SEU CADERNO DE QUESTÕES.").toUpperCase(), 6, 44, true);
    linhas.slice(0, 6).forEach((ln, i) => L({ t: "text", s: ln, x: X0 + 1.8, y: y + 3.8 + i * 2.6, size: 6, bold: true, color: "#222222" }));
  } else {
    if (cab.conteudo) faixa(cab.conteudoY, CAB.conteudo.h, "Conteúdo", "vivenciado", av.conteudo);
    if (cab.metodo) faixa(cab.metodoY, CAB.metodo.h, "Metodologia", "aplicada", metodologiaDe(av));
  }

  // Instruções | Exemplo | Desempenho por nota
  const yLinha = cab.linhaY, hLinha = cab.linhaH;
  caixa(X0, yLinha, 104, hLinha, "INSTRUÇÕES:");
  const instr = instrucoesQueCabem(av, 100, hLinha);
  instr.linhas.forEach((ln, i) => L({ t: "text", s: ln, x: X0 + 1.8, y: yLinha + 7.4 + i * instr.passo, size: instr.tam, color: "#222222" }));
  const temCE = (av.secoes || []).some((s) => String(s.tipo) === "C");
  caixa(117, yLinha, 48, hLinha, "EXEMPLO:");
  L({ t: "text", s: "Preencha a bolinha por completo:", x: 118.8, y: yLinha + 8.6, size: 6.5, color: "#222222" });
  desenharExemplo(L, EXEMPLO.x, yLinha + EXEMPLO.dy);
  if (temCE) L({ t: "text", s: "C = Certo   E = Errado", x: 141, y: yLinha + 22.6, size: 6.5, bold: true, color: "#333333", align: "center" });
  caixa(167, yLinha, 32, hLinha, "DESEMPENHO POR NOTA");
  const valor = valorProva(av);
  if (valor) L({ t: "text", s: "Valor: " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }), x: 183, y: yLinha + hLinha - 2, size: 6.5, color: "#777777", align: "center" });

  // Moldura do gabarito: fundo branco (cobre o timbrado), borda leve e os 4 quadrados
  const [[mx0, my0], , [mx1, my1]] = g.marcas, ml = MARCAS.lado / 2;
  L({ t: "rect", x: mx0 - ml - 1, y: my0 - ml - 1, w: mx1 - mx0 + 2 * ml + 2, h: my1 - my0 + 2 * ml + 2, fill: "#ffffff" });
  L({ t: "rrect", x: mx0 - ml, y: my0 - ml, w: mx1 - mx0 + 2 * ml, h: my1 - my0 + 2 * ml, stroke: "#c8c8c8", lw: 0.3, rx: 1.5 });
  for (const [x, y] of g.marcas) L({ t: "rect", x: x - ml, y: y - ml, w: MARCAS.lado, h: MARCAS.lado, fill: "#000000" });
  const mc = MARCA_COL.lado;
  for (const col of g.marcasCol) for (const [x, y] of col.pts) L({ t: "rect", x: x - mc / 2, y: y - mc / 2, w: mc, h: mc, fill: "#000000" });

  // Faixa superior da moldura: QR code, código de barras ou grade do Nº de chamada, e lembrete
  L({ t: "qr", s: codigoQR(av, turma && turma.id, aluno && aluno.id, ver), x: QR.x, y: QR.y, size: QR.lado });
  if (g.num) {
    caixa(49, 111.5, 96, 22);
    L({ t: "text", s: "Nº DE CHAMADA", x: 50.8, y: 115.2, size: 6.5, bold: true, color: "#333333" });
    ["Dez.", "Unid."].forEach((rot, lin) => {
      const [, cy] = g.numPos(lin, 0);
      L({ t: "text", s: rot, x: 67.6, y: cy + 0.1, size: 6.5, color: "#444444", align: "right", mid: true });
      for (let dg = 0; dg < 10; dg++) {
        const [cx] = g.numPos(lin, dg);
        L({ t: "circle", x: cx, y: cy, r: 2.3, stroke: cinzaBorda, lw: 0.25 });
        L({ t: "text", s: String(dg), x: cx, y: cy + 0.1, size: 6, color: "#a5a5a5", align: "center", mid: true });
      }
    });
  } else if (aluno) {
    const cod = String(aluno.ra || aluno.id);
    const bars = code128(cod);
    const mod = Math.min(0.4, 56 / bars.length);
    const bw = bars.length * mod;
    L({ t: "bars", bars, x: 92 - bw / 2, y: 112.5, h: 15, mod });
    L({ t: "text", s: cod.split("").join(" "), x: 92, y: 132.4, size: 9, align: "center", font: "courier" });
  } else {
    L({ t: "text", s: "Folha neutra: escreva seu nome no campo Aluno(a).", x: 92, y: 123, size: 7, color: "#777777", align: "center", maxW: 80 });
  }
  if (g.lingua) {
    const c = LINGUA.caixa;
    caixa(c.x, c.y, c.w, c.h);
    L({ t: "text", s: "LÍNGUA ESTRANGEIRA", x: c.x + 1.8, y: c.y + 3.7, size: 6.5, bold: true, color: "#333333" });
    LINGUAS.forEach((nome, i) => {
      const [cx, cy] = g.linguaPos(i);
      L({ t: "circle", x: cx, y: cy, r: LINGUA.r, stroke: cinzaBorda, lw: 0.25 });
      L({ t: "text", s: nome, x: cx + 4.5, y: cy + 0.1, size: 8, color: "#333333", mid: true });
    });
  } else {
    L({ t: "text", s: "Pinte toda a bolinha com caneta", x: 169, y: 119.5, size: 7, color: "#555555", align: "center" });
    L({ t: "text", s: "preta ou azul. Uma só por questão.", x: 169, y: 123, size: 7, color: "#555555", align: "center" });
    if (temCE) L({ t: "text", s: "C = Certo   E = Errado", x: 169, y: 128, size: 7.5, bold: true, color: "#333333", align: "center" });
  }

  // Assinatura do aluno, logo abaixo da moldura
  if (cab.tem.assinatura) {
    L({ t: "rect", x: X0, y: ASSINATURA.y - 6, w: LARG, h: 9, fill: "#ffffff" });
    L({ t: "text", s: "Assinatura do(a) aluno(a):", x: X0, y: ASSINATURA.y, size: 8, bold: true, color: "#333333" });
    L({ t: "line", x1: X0 + 40, y1: ASSINATURA.y + 0.6, x2: X0 + LARG, y2: ASSINATURA.y + 0.6, color: "#555555", w: 0.3 });
  }

  // Grade de respostas
  const secoes = av.secoes || [];
  const fonteNum = Math.min(9, g.r * 3.6), fonteLetra = g.r * 2.5;
  for (let c = 0; c < g.cols; c++) {
    const xc = g.x0 + c * g.colW - 1.5, wc = g.colW - g.gapC + 3;
    const nLin = Math.min(g.rows, g.slots.length - c * g.rows);
    if (nLin <= 0) continue;
    for (let row = 0; row < nLin; row++) {
      const k = c * g.rows + row, sl = g.slots[k];
      const [, cy] = g.xy(k);
      if (sl.h != null) {
        const sec = secoes[sl.h] || {};
        const nome = (sec.nome || "Seção " + (sl.h + 1)).toUpperCase();
        L({ t: "rect", x: xc, y: cy - g.pitch / 2 + 0.25, w: wc, h: g.pitch - 0.5, fill: "#e2e2e2" });
        L({ t: "text", s: nome, x: xc + 1.5, y: cy + 0.1, size: Math.min(7.5, g.pitch * 1.25), bold: true, color: "#333333", mid: true, maxW: wc - 3 });
        continue;
      }
      const q = sl.q;
      if (row % 2 === 1) L({ t: "rect", x: xc, y: cy - g.pitch / 2 + 0.25, w: wc, h: g.pitch - 0.5, fill: "#f3f3f3" });
      L({ t: "text", s: String(q + 1).padStart(2, "0"), x: g.x0 + c * g.colW + g.lab - 2, y: cy + 0.1, size: fonteNum, color: "#444444", align: "right", mid: true });
      const letras = g.letras(q);
      for (let a = 0; a < letras.length; a++) {
        const [cx] = g.pos(q, a);
        L({ t: "circle", x: cx, y: cy, r: g.r, stroke: cinzaBorda, lw: 0.25 });
        L({ t: "text", s: letras[a], x: cx, y: cy + 0.1, size: fonteLetra, color: "#a5a5a5", align: "center", mid: true });
      }
    }
  }
  return ops;
}

function etapaDaTurma(turma) {
  if (!turma) return "";
  if (turma.etapa) return turma.etapa;
  const m = /(\d+)\s*[°º]/.exec(turma.nome || "");
  return m ? m[1] + "º ano" : "";
}

/* Medida aproximada de texto em Helvetica (mm), para posicionar e quebrar linhas */
let _ctxMed = null;
function largTexto(s, pt, bold) {
  if (!_ctxMed) _ctxMed = document.createElement("canvas").getContext("2d");
  _ctxMed.font = `${bold ? "700 " : ""}100px Helvetica, Arial, sans-serif`;
  return (_ctxMed.measureText(s).width / 100) * pt * 0.3528;
}
function quebrarTexto(s, pt, maxW, bold) {
  const out = []; let linha = "";
  for (const w of String(s).split(/\s+/)) {
    const t = linha ? linha + " " + w : w;
    if (largTexto(t, pt, bold) > maxW && linha) { out.push(linha); linha = w; } else linha = t;
  }
  if (linha) out.push(linha);
  return out;
}

/* ---------- Renderização ---------- */
function desenharPDF(doc, ops, imgs) {
  for (const o of ops) {
    switch (o.t) {
      case "rect": doc.setFillColor(o.fill); doc.rect(o.x, o.y, o.w, o.h, "F"); break;
      case "rrect": doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw); doc.roundedRect(o.x, o.y, o.w, o.h, o.rx, o.rx, "S"); break;
      case "line": doc.setDrawColor(o.color); doc.setLineWidth(o.w); doc.line(o.x1, o.y1, o.x2, o.y2); break;
      case "circle":
        if (o.fill) { doc.setFillColor(o.fill); doc.circle(o.x, o.y, o.r, "F"); }
        else { doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw); doc.circle(o.x, o.y, o.r, "S"); }
        break;
      case "text": {
        doc.setFont(o.font === "courier" ? "courier" : "helvetica", o.bold ? "bold" : "normal");
        let size = o.size;
        doc.setFontSize(size);
        if (o.maxW) while (doc.getTextWidth(o.s) > o.maxW && size > 5) doc.setFontSize((size -= 0.5));
        doc.setTextColor(o.color || "#000000");
        doc.text(String(o.s), o.x, o.y, { align: o.align || "left", baseline: o.mid ? "middle" : "alphabetic" });
        break;
      }
      case "bars": {
        doc.setFillColor("#000000");
        let i = 0;
        while (i < o.bars.length) {
          if (o.bars[i] === "1") { let j = i; while (j < o.bars.length && o.bars[j] === "1") j++; doc.rect(o.x + i * o.mod, o.y, (j - i) * o.mod, o.h, "F"); i = j; } else i++;
        }
        break;
      }
      case "qr": {
        const m = qrMatriz(o.s), n = m.length, s = o.size / n;
        doc.setFillColor("#000000");
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) doc.rect(o.x + x * s, o.y + y * s, s + 0.01, s + 0.01, "F");
        break;
      }
      case "img": {
        const im = imgs && imgs[o.src];
        if (!im) break;
        const [x, y, w, h] = caixaImagem(o, im);
        try { doc.addImage(o.src, /^data:image\/png/i.test(o.src) ? "PNG" : "JPEG", x, y, w, h, apelidoImagem(o.src), "FAST"); } catch (e) { /* imagem inválida: ignora */ }
        break;
      }
    }
  }
}

function desenharCanvas(ctx, ops, s, imgs) {
  ctx.save();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, A4.w * s, A4.h * s);
  for (const o of ops) {
    switch (o.t) {
      case "rect": ctx.fillStyle = o.fill; ctx.fillRect(o.x * s, o.y * s, o.w * s, o.h * s); break;
      case "rrect":
        ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw * s; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(o.x * s, o.y * s, o.w * s, o.h * s, o.rx * s); else ctx.rect(o.x * s, o.y * s, o.w * s, o.h * s);
        ctx.stroke(); break;
      case "line": ctx.strokeStyle = o.color; ctx.lineWidth = o.w * s; ctx.beginPath(); ctx.moveTo(o.x1 * s, o.y1 * s); ctx.lineTo(o.x2 * s, o.y2 * s); ctx.stroke(); break;
      case "circle":
        ctx.beginPath(); ctx.arc(o.x * s, o.y * s, o.r * s, 0, Math.PI * 2);
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } else { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw * s; ctx.stroke(); }
        break;
      case "text": {
        let size = o.size;
        const fam = o.font === "courier" ? "'Courier New', Courier, monospace" : "Helvetica, Arial, sans-serif";
        const setF = () => (ctx.font = `${o.bold ? "700 " : ""}${size * 0.3528 * s}px ${fam}`);
        setF();
        if (o.maxW) while (ctx.measureText(o.s).width > o.maxW * s && size > 5) { size -= 0.5; setF(); }
        ctx.fillStyle = o.color || "#000"; ctx.textAlign = o.align || "left"; ctx.textBaseline = o.mid ? "middle" : "alphabetic";
        ctx.fillText(String(o.s), o.x * s, o.y * s); break;
      }
      case "bars": {
        ctx.fillStyle = "#000";
        for (let i = 0; i < o.bars.length; i++) if (o.bars[i] === "1") ctx.fillRect((o.x + i * o.mod) * s, o.y * s, Math.ceil(o.mod * s * 1000) / 1000 + 0.3, o.h * s);
        break;
      }
      case "qr": {
        const m = qrMatriz(o.s), n = m.length, q = (o.size / n) * s;
        ctx.fillStyle = "#000";
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) ctx.fillRect(o.x * s + x * q, o.y * s + y * q, q + 0.5, q + 0.5);
        break;
      }
      case "img": {
        const im = imgs && imgs[o.src];
        if (!im) break;
        const [x, y, w, h] = caixaImagem(o, im);
        ctx.drawImage(im, x * s, y * s, w * s, h * s);
        break;
      }
    }
  }
  ctx.restore();
}

/* Posição da imagem: "fill" ocupa a caixa toda; "topo" encaixa pela largura no alto; padrão: cabe na caixa, alinhada à direita */
function caixaImagem(o, im) {
  if (o.fit === "fill") return [o.x, o.y, o.w, o.h];
  if (o.fit === "topo") { const h = Math.min(o.h, (o.w * im.height) / im.width); return [o.x, o.y, (h * im.width) / im.height, h]; }
  const k = Math.min(o.w / im.width, o.h / im.height);
  const w = im.width * k, h = im.height * k;
  return [o.x + o.w - w, o.y + (o.h - h) / 2, w, h];
}
/* Mesmo apelido para a mesma imagem: o PDF guarda o timbrado uma vez só, mesmo com muitas páginas */
const _apelidos = new Map();
function apelidoImagem(src) {
  if (!_apelidos.has(src)) _apelidos.set(src, "img" + _apelidos.size);
  return _apelidos.get(src);
}

function carregarImagens(srcs) {
  const out = {};
  return Promise.all([...new Set(srcs.filter(Boolean))].map((src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { out[src] = im; res(); };
    im.onerror = () => res();
    im.src = src;
  }))).then(() => out);
}

/* Lista de folhas a gerar. Com mais de uma versão, as versões se alternam (A, B, A, B…) pela ordem da chamada */
function folhasPara(av, turma, perfil, copiasNeutras, timbrado) {
  const nv = Math.max(1, +av.versoes || 1);
  const ver = (i) => VERSOES[i % nv];
  if (av.tipo === "neutra") return Array.from({ length: Math.max(1, copiasNeutras || 1) }, (_, i) => ({ av, perfil, turma, aluno: null, ver: ver(i), timbrado }));
  return (turma ? turma.alunos : []).map((aluno, i) => ({ av, perfil, turma, aluno, ver: ver(i), timbrado }));
}

async function gerarPDF(folhas, aoProgredir) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const imgs = await carregarImagens(folhas.flatMap((f) => [f.perfil && f.perfil.logo, f.timbrado && f.timbrado.img]));
  for (let i = 0; i < folhas.length; i++) {
    if (i) doc.addPage();
    desenharPDF(doc, opsFolha(folhas[i]), imgs);
    if (aoProgredir) aoProgredir(i + 1, folhas.length);
    if (i % 5 === 4) await new Promise((r) => setTimeout(r));
  }
  return doc.output("blob");
}

/* Word editável: cabeçalho, conteúdo, metodologia, instruções, exemplo e nota viram texto e tabelas do Word.
   A moldura do gabarito (quadrados, QR, código de barras e bolinhas) entra como imagem presa na posição exata da
   página, para a leitura pela câmera continuar funcionando mesmo depois de editar o texto. */
const twip = (mm) => Math.round(mm * 56.6929);
const emu = (mm) => Math.round(mm * 36000);
const xmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function wRun(texto, o = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.b ? "<w:b/>" : ""}<w:color w:val="${o.cor || "222222"}"/><w:sz w:val="${Math.round((o.pt || 9) * 2)}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(texto)}</w:t></w:r>`;
}
function wPar(conteudo, o = {}) {
  return `<w:p><w:pPr>${o.quebra ? "<w:pageBreakBefore/>" : ""}${o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : ""}<w:spacing w:before="0" w:after="0" w:line="${twip(o.linha || 4)}" w:lineRule="exact"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}<w:rPr><w:sz w:val="${Math.round((o.pt || 4) * 2)}"/></w:rPr></w:pPr>${conteudo}</w:p>`;
}
const wEspaco = (mm) => wPar("", { linha: mm, pt: 2 });
function wCelula(larg, conteudo, o = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${twip(larg)}" w:type="dxa"/>${o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : ""}<w:vAlign w:val="${o.alinhar || "center"}"/></w:tcPr>${conteudo || wPar("")}</w:tc>`;
}
function wTabela(larguras, celulas, alt) {
  const b = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="B8B8B8"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${twip(larguras.reduce((a, x) => a + x, 0))}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(b).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${larguras.map((l) => `<w:gridCol w:w="${twip(l)}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:trHeight w:val="${twip(alt)}" w:hRule="exact"/></w:trPr>${celulas.join("")}</w:tr></w:tbl>`;
}
const campoW = (rot, valor, o = {}) => wPar(wRun(rot + " ", { b: true, pt: 7.5, cor: "333333" }) + (valor ? wRun(valor, { b: !!o.b, pt: o.pt || 9.5, cor: o.cinza ? "9A9A9A" : "111111" }) : ""), { linha: 4.2 });
let _idDesenho = 1;
function wImagem(rid, larg, alt, o = {}) {
  const id = _idDesenho++;
  const grafico = `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(larg)}" cy="${emu(alt)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  if (!o.ancora) return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(larg)}" cy="${emu(alt)}"/><wp:docPr id="${id}" name="img${id}"/>${grafico}</wp:inline></w:drawing></w:r>`;
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${o.atras ? 1 : 251659264 + id}" behindDoc="${o.atras ? 1 : 0}" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(o.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(o.y)}</wp:posOffset></wp:positionV><wp:extent cx="${emu(larg)}" cy="${emu(alt)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="img${id}"/><wp:cNvGraphicFramePr/>${grafico}</wp:anchor></w:drawing></w:r>`;
}

async function gerarDOCX(folhas, aoProgredir) {
  const s = 8; // px por mm na imagem da moldura (~200 dpi)
  const [[mx0, my0], , [mx1, my1]] = MARCAS.centros, ml = MARCAS.lado / 2;
  const M = { x: mx0 - ml - 1, y: my0 - ml - 1, w: mx1 - mx0 + 2 * ml + 2, h: my1 - my0 + 2 * ml + 2 };
  const cv = document.createElement("canvas");
  cv.width = A4.w * s; cv.height = A4.h * s;
  const ctx = cv.getContext("2d");
  const corte = document.createElement("canvas");
  const recortar = (x, y, w, h) => {
    corte.width = Math.round(w * s); corte.height = Math.round(h * s);
    corte.getContext("2d").drawImage(cv, Math.round(x * s), Math.round(y * s), corte.width, corte.height, 0, 0, corte.width, corte.height);
    return new Promise((r) => corte.toBlob(r, "image/png"));
  };
  const imgs = await carregarImagens(folhas.flatMap((f) => [f.perfil && f.perfil.logo]));
  const zip = new JSZip();
  let corpo = "", rels = "";
  const rel = (id, alvo) => (rels += `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${alvo}"/>`);
  // timbrado e logo: um arquivo só para todas as páginas
  const t0 = folhas[0] && folhas[0].timbrado;
  if (t0 && t0.img) { zip.file("word/media/timbrado.jpg", t0.img.split(",")[1], { base64: true }); rel("rIdTimb", "timbrado.jpg"); }
  const logo = folhas[0] && folhas[0].perfil && folhas[0].perfil.logo;
  const comLogo = logo && !(t0 && t0.img) && imgs[logo];
  if (comLogo) { zip.file("word/media/logo." + (/png/.test(logo) ? "png" : "jpg"), logo.split(",")[1], { base64: true }); rel("rIdLogo", "logo." + (/png/.test(logo) ? "png" : "jpg")); }
  let exemploFeito = false;
  for (let i = 0; i < folhas.length; i++) {
    const d = folhas[i], { av, perfil = {}, turma, aluno } = d;
    const ver = d.ver || "A";
    const cab = cabecalhoDe(av, turma, aluno, ver);
    // desenha a página sem timbrado e recorta a moldura (com a assinatura, se houver) e, uma vez, a linha de exemplo
    desenharCanvas(ctx, opsFolha({ ...d, timbrado: null }), s, imgs);
    const hM = cab.tem.assinatura ? ASSINATURA.y + 3 - M.y : M.h;
    zip.file(`word/media/moldura${i + 1}.png`, await recortar(M.x, M.y, M.w, hM));
    rel(`rIdM${i + 1}`, `moldura${i + 1}.png`);
    if (!exemploFeito) { zip.file("word/media/exemplo.png", await recortar(EXEMPLO.x - 0.3, cab.linhaY + EXEMPLO.dy - 0.3, EXEMPLO.w + 0.6, EXEMPLO.h + 0.6)); rel("rIdEx", "exemplo.png"); exemploFeito = true; }

    let ancoras = "";
    if (t0 && t0.img) ancoras += t0.modo === "faixa" ? wImagem("rIdTimb", 210, Math.min(17, 210 * 0.08), { ancora: true, atras: true, x: 0, y: 0 }) : wImagem("rIdTimb", 210, 297, { ancora: true, atras: true, x: 0, y: 0 });
    if (comLogo) { const im = imgs[logo], k = Math.min(39 / im.width, 13 / im.height); ancoras += wImagem("rIdLogo", im.width * k, im.height * k, { ancora: true, x: 199 - im.width * k, y: 19 }); }
    ancoras += wImagem(`rIdM${i + 1}`, M.w, hM, { ancora: true, x: M.x, y: M.y });

    const instituicao = (perfil.instituicao != null && perfil.instituicao !== "" ? perfil.instituicao : CABECALHO_PADRAO.instituicao).toUpperCase();
    // títulos: as linhas que saem viram espaço em branco no fim, para os campos ficarem na mesma altura
    const titulos = [cab.tem.instituicao && instituicao, perfil.escola && perfil.escola.toUpperCase()].filter(Boolean);
    corpo += wPar(ancoras + wRun(titulos[0] || "", { b: true, pt: 9 }), { quebra: i > 0, linha: 4 });
    if (titulos[1]) corpo += wPar(wRun(titulos[1], { b: true, pt: 9 }), { linha: 4 });
    corpo += wPar(wRun(("FOLHA DE RESPOSTAS" + (av.titulo ? " · " + av.titulo : "")).toUpperCase(), { b: true, pt: 8.5, cor: "666666" }), { linha: 4.4 });
    corpo += wEspaco(1.6 + (titulos.length < 2 ? 4 : 0));
    cab.linhas.forEach((linha, li) => {
      const ws = largurasLinha(linha, 188, 0);
      if (li) corpo += wEspaco(PASSO_CAMPO - CAB.hCampo);
      corpo += wTabela(ws, linha.map((c, k) => wCelula(ws[k], campoW(c.rot, c.valor, { b: c.negrito, pt: c.tam, cinza: c.cinza }))), CAB.hCampo);
    });
    corpo += wEspaco(2);
    const faixaW = (r1, r2, texto, alt) => wTabela([28, 160], [wCelula(28, wPar(wRun(r1, { b: true, pt: 6.8, cor: "333333" }), { linha: 3 }) + wPar(wRun(r2, { b: true, pt: 6.8, cor: "333333" }), { linha: 3 }), { fundo: "EFEFEF" }), wCelula(160, wPar(wRun(texto || "", { pt: 7.5 }), { linha: 3.3 }))], alt);
    if (av.transcricao) {
      const alt = CAB.metodo.y + CAB.metodo.h - CAB.conteudo.y;
      corpo += wTabela([44, 144], [wCelula(44, wPar(wRun((av.transcricaoTexto || "ATENÇÃO: TRANSCREVA AQUI, COM A SUA CALIGRAFIA USUAL, A FRASE APRESENTADA NA CAPA DO SEU CADERNO DE QUESTÕES.").toUpperCase(), { b: true, pt: 6 }), { linha: 2.6 })), wCelula(144, "")], alt);
      corpo += wEspaco(1.6);
    } else {
      // cada faixa ocupa sua altura + 1,6 mm de espaço; a última fecha com o espaço até a linha das instruções
      if (cab.conteudo) corpo += faixaW("Conteúdo", "vivenciado", av.conteudo, CAB.conteudo.h) + wEspaco(1.6);
      if (cab.metodo) corpo += faixaW("Metodologia", "aplicada", metodologiaDe(av), CAB.metodo.h) + wEspaco(1.6);
    }
    const instr = instrucoesQueCabem(av, 100, cab.linhaH);
    const titulo = (t) => wPar(wRun(t, { b: true, pt: 7, cor: "333333" }), { linha: 4.6, fundo: "EFEFEF" });
    const temCE = (av.secoes || []).some((x) => String(x.tipo) === "C");
    const valor = valorProva(av);
    corpo += wTabela([104, 50, 34], [
      wCelula(104, titulo("INSTRUÇÕES:") + instr.brutas.map((ln) => wPar(wRun(ln, { pt: instr.tam }), { linha: instr.passo })).join(""), { alinhar: "top" }),
      wCelula(50, titulo("EXEMPLO:") + wPar(wRun("Preencha a bolinha por completo:", { pt: 6.5 }), { linha: 4.4 }) + wPar(wImagem("rIdEx", EXEMPLO.w + 0.6, EXEMPLO.h + 0.6), { linha: 8.4, jc: "center" }) + (temCE ? wPar(wRun("C = Certo   E = Errado", { b: true, pt: 6.5, cor: "333333" }), { linha: 4, jc: "center" }) : ""), { alinhar: "top" }),
      wCelula(34, wPar(wRun("DESEMPENHO POR NOTA", { b: true, pt: 6, cor: "333333" }), { linha: 4.6, fundo: "EFEFEF" }) + wPar("", { linha: 12.5 }) + (valor ? wPar(wRun("Valor: " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }), { pt: 6.5, cor: "777777" }), { linha: 3.5, jc: "center" }) : ""), { alinhar: "top" }),
    ], cab.linhaH);
    corpo += wEspaco(1);
    if (aoProgredir) aoProgredir(i + 1, folhas.length);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r));
  }
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${twip(19)}" w:right="${twip(11)}" w:bottom="${twip(10)}" w:left="${twip(11)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
