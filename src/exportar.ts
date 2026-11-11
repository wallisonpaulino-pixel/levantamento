// Exportações: DXF, PDF de croqui, relatório fotográfico, pacote completo e backup.
import type { Elemento, FotoReg, ID, Modo, Obra, Pavimento, Pt } from './types'
import { NOME_TIPO } from './types'
import { CAMADAS, camadaBase, limitesPrims, primsPavimento, type Prim } from './prims'
import { areaLajeM2, dataBR, dist, fmt, fmtNivel, nomeArquivo, pontoRef, secaoPilar, uid } from './util'
import { fotosDaObra, lerObra, salvarFoto, salvarObra } from './db'
import { rotulos } from './modos'
import { renderFoto } from './fotos'

// ---------------------------------------------------------------- DXF (R12, unidades em cm)
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out[i] = c < 256 ? c : c === 0x2248 ? 126 : c === 0x2212 ? 45 : 63
  }
  return out
}
const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

export function gerarDXF(pav: Pavimento): Blob {
  const prims = primsPavimento(pav)
  const camadas = [...new Set(prims.map((p) => p.camada))].sort()
  const L: (string | number)[] = []
  const par = (c: number, v: string | number) => { L.push(c, v) }
  const lim = limitesPrims(prims) ?? { minx: 0, miny: 0, maxx: 100, maxy: 100 }

  par(0, 'SECTION'); par(2, 'HEADER')
  par(9, '$ACADVER'); par(1, 'AC1009')
  par(9, '$EXTMIN'); par(10, n(lim.minx)); par(20, n(lim.miny)); par(30, '0.0')
  par(9, '$EXTMAX'); par(10, n(lim.maxx)); par(20, n(lim.maxy)); par(30, '0.0')
  par(0, 'ENDSEC')

  par(0, 'SECTION'); par(2, 'TABLES')
  par(0, 'TABLE'); par(2, 'LTYPE'); par(70, 1)
  par(0, 'LTYPE'); par(2, 'CONTINUOUS'); par(70, 64); par(3, 'Solid line'); par(72, 65); par(73, 0); par(40, '0.0')
  par(0, 'ENDTAB')
  par(0, 'TABLE'); par(2, 'LAYER'); par(70, camadas.length + 1)
  par(0, 'LAYER'); par(2, '0'); par(70, 0); par(62, 7); par(6, 'CONTINUOUS')
  for (const c of camadas) { par(0, 'LAYER'); par(2, c); par(70, 0); par(62, CAMADAS[camadaBase(c)].aci); par(6, 'CONTINUOUS') }
  par(0, 'ENDTAB')
  par(0, 'TABLE'); par(2, 'STYLE'); par(70, 1)
  par(0, 'STYLE'); par(2, 'STANDARD'); par(70, 0); par(40, '0.0'); par(41, '1.0'); par(50, '0.0'); par(71, 0); par(42, '10.0'); par(3, 'txt'); par(4, '')
  par(0, 'ENDTAB')
  par(0, 'ENDSEC')

  par(0, 'SECTION'); par(2, 'ENTITIES')
  for (const p of prims) {
    if (p.k === 'linha') {
      par(0, 'LINE'); par(8, p.camada); par(10, n(p.a.x)); par(20, n(p.a.y)); par(30, '0.0'); par(11, n(p.b.x)); par(21, n(p.b.y)); par(31, '0.0')
    } else if (p.k === 'poli') {
      par(0, 'POLYLINE'); par(8, p.camada); par(66, 1); par(10, '0.0'); par(20, '0.0'); par(30, '0.0'); par(70, p.fechado ? 1 : 0)
      for (const q of p.pts) { par(0, 'VERTEX'); par(8, p.camada); par(10, n(q.x)); par(20, n(q.y)); par(30, '0.0') }
      par(0, 'SEQEND'); par(8, p.camada)
    } else if (p.k === 'circ') {
      par(0, 'CIRCLE'); par(8, p.camada); par(10, n(p.c.x)); par(20, n(p.c.y)); par(30, '0.0'); par(40, n(p.r))
    } else {
      const al = p.alinh === 'c' ? 1 : p.alinh === 'd' ? 2 : 0
      par(0, 'TEXT'); par(8, p.camada); par(10, n(p.p.x)); par(20, n(p.p.y)); par(30, '0.0'); par(40, n(p.h)); par(1, p.t.replace(/[\r\n]+/g, ' '))
      if (p.rot) par(50, n(p.rot))
      par(7, 'STANDARD')
      if (al) { par(72, al); par(11, n(p.p.x)); par(21, n(p.p.y)); par(31, '0.0') }
    }
  }
  par(0, 'ENDSEC'); par(0, 'EOF')

  let s = ''
  for (let i = 0; i < L.length; i += 2) s += L[i] + '\r\n' + L[i + 1] + '\r\n'
  return new Blob([latin1(s) as BlobPart], { type: 'application/dxf' })
}

// ---------------------------------------------------------------- fotos numeradas
export interface FotoNum { n: number; fotoId: ID; pavId: ID | null; pavNome: string; el: Elemento | null }
/** Numeração única das fotos da obra: a mesma na planta-chave e nas legendas. */
export function numerarFotos(obra: Obra): FotoNum[] {
  const out: FotoNum[] = []
  for (const pav of obra.pavimentos)
    for (const el of pav.elementos)
      for (const fotoId of el.fotos) out.push({ n: out.length + 1, fotoId, pavId: pav.id, pavNome: pav.nome, el })
  for (const fotoId of obra.fotosGerais) out.push({ n: out.length + 1, fotoId, pavId: null, pavNome: '', el: null })
  return out
}
function faixas(nums: number[]): string {
  const s = [...nums].sort((a, b) => a - b), out: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i]}-${s[j]}` : String(s[i]))
    i = j
  }
  return out.join(',')
}

// ---------------------------------------------------------------- PDF
type Doc = import('jspdf').jsPDF
const ESCALAS = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 5000]

/** Desenha as primitivas dentro da área (mm) na maior escala padrão que couber. Devolve o denominador. */
function plantaPDF(doc: Doc, prims: Prim[], area: { x: number; y: number; w: number; h: number }): number | null {
  const lim = limitesPrims(prims)
  if (!lim) return null
  const lw = Math.max(lim.maxx - lim.minx, 1), lh = Math.max(lim.maxy - lim.miny, 1)
  const den = ESCALAS.find((d) => (lw * 10) / d <= area.w && (lh * 10) / d <= area.h) ?? Math.ceil(Math.max((lw * 10) / area.w, (lh * 10) / area.h))
  const k = 10 / den // mm por cm
  const ox = area.x + (area.w - lw * k) / 2, oy = area.y + (area.h - lh * k) / 2
  const T = (p: Pt) => ({ x: ox + (p.x - lim.minx) * k, y: oy + (lim.maxy - p.y) * k })
  for (const p of prims) {
    const base = camadaBase(p.camada), [r, g, b] = CAMADAS[base].rgb
    doc.setDrawColor(r, g, b); doc.setTextColor(r, g, b); doc.setLineWidth(base === 'COTAS' ? 0.12 : 0.25)
    if (p.k === 'linha') {
      const a = T(p.a), c = T(p.b)
      doc.line(a.x, a.y, c.x, c.y)
    } else if (p.k === 'poli') {
      const pts = p.pts.map(T)
      const rel = pts.slice(1).map((q, i) => [q.x - pts[i].x, q.y - pts[i].y] as [number, number])
      if (p.preench) { doc.setFillColor(r, g, b); doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'FD', p.fechado) }
      else if (base === 'PAREDES') { doc.setFillColor(225, 227, 231); doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'FD', p.fechado) }
      else doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'S', p.fechado)
    } else if (p.k === 'circ') {
      const c = T(p.c)
      if (p.preench) { doc.setFillColor(r, g, b); doc.circle(c.x, c.y, Math.max(p.r * k, 0.3), 'FD') }
      else doc.circle(c.x, c.y, Math.max(p.r * k, 0.3), 'S')
    } else {
      const hmm = Math.max(1.5, Math.min(3.2, p.h * k))
      doc.setFont('helvetica', p.negrito ? 'bold' : 'normal'); doc.setFontSize(hmm * 3.6)
      const t = T(p.p), w = doc.getTextWidth(p.t), a = (p.rot * Math.PI) / 180
      const d = p.alinh === 'c' ? w / 2 : p.alinh === 'd' ? w : 0
      doc.text(p.t, t.x - d * Math.cos(a), t.y + d * Math.sin(a), { angle: p.rot })
    }
  }
  return den
}

function cabecalho(doc: Doc, obra: Obra, titulo: string) {
  const W = doc.internal.pageSize.getWidth()
  doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(titulo, 10, 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99)
  doc.text([obra.nome, obra.endereco].filter(Boolean).join(' · '), 10, 16)
  doc.text(dataBR(obra.data), W - 10, 11, { align: 'right' })
  if (obra.responsavel) doc.text(obra.responsavel, W - 10, 16, { align: 'right' })
  doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.3); doc.line(10, 19, W - 10, 19)
}

/** Tabela simples com quebra de linha nas células e quebra de página. Devolve o y final. */
function tabela(doc: Doc, obra: Obra, titPag: string, titulo: string, cols: { t: string; w: number }[], linhas: string[][], y: number): number {
  if (!linhas.length) return y
  const H = doc.internal.pageSize.getHeight(), x0 = 10, alt = 4
  const total = cols.reduce((s, c) => s + c.w, 0), util = doc.internal.pageSize.getWidth() - 20
  const larg = cols.map((c) => (c.w / total) * util)
  const topo = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(17, 24, 39)
    doc.setFillColor(243, 244, 246); doc.rect(x0, y, util, 6, 'F')
    let x = x0
    cols.forEach((c, i) => { doc.text(c.t, x + 1.5, y + 4.2); x += larg[i] })
    y += 6
  }
  if (y > H - 40) { doc.addPage(); cabecalho(doc, obra, titPag); y = 26 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 24, 39)
  doc.text(titulo, x0, y + 4); y += 7
  topo()
  for (const lin of linhas) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    const cel = lin.map((t, i) => doc.splitTextToSize(t || '', larg[i] - 3) as string[])
    const h = Math.max(...cel.map((c) => c.length)) * alt + 2
    if (y + h > H - 12) { doc.addPage(); cabecalho(doc, obra, titPag); y = 26; topo(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8) }
    doc.setTextColor(31, 41, 55)
    let x = x0
    cel.forEach((c, i) => { doc.text(c, x + 1.5, y + 4); x += larg[i] })
    y += h
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.15); doc.line(x0, y, x0 + util, y)
  }
  return y + 6
}

function dados(el: Elemento, rot: Map<string, { label: string; unidade?: string }>): string {
  return Object.entries(el.campos)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => {
      const r = rot.get(k)
      const val = typeof v === 'boolean' ? (v ? 'sim' : 'não') : typeof v === 'number' ? fmt(v, 2) + (r?.unidade ? ' ' + r.unidade : '') : v
      return `${r?.label ?? k}: ${val}`
    })
    .join('; ')
}

export async function gerarPDFCroqui(obra: Obra, modos: Modo[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const rot = rotulos(modos), fotos = numerarFotos(obra)
  const numDe = (el: Elemento) => faixas(fotos.filter((f) => f.el?.id === el.id).map((f) => f.n))
  let primeira = true
  for (const pav of obra.pavimentos) {
    if (!primeira) doc.addPage()
    primeira = false
    const tit = `CROQUI DE LEVANTAMENTO — ${pav.nome}`
    cabecalho(doc, obra, tit)
    const den = plantaPDF(doc, primsPavimento(pav), { x: 12, y: 24, w: W - 24, h: H - 24 - 16 })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99)
    const rodape = [
      `Piso em ${fmtNivel(pav.nivel)} m`, pav.peDireito ? `Pé-direito ${fmt(pav.peDireito)} cm` : '',
      den ? `Escala 1:${den}` : 'Sem elementos desenhados', 'Medidas em cm; níveis em m', 'Cotas com "~" foram tiradas do desenho, sem medida de campo',
    ].filter(Boolean).join('   ·   ')
    doc.text(rodape, 10, H - 7)

    const els = pav.elementos
    const pil = els.filter((e) => e.tipo === 'pilar'), vig = els.filter((e) => e.tipo === 'viga'), laj = els.filter((e) => e.tipo === 'laje')
    const niv = els.filter((e) => e.tipo === 'nivel'), pat = els.filter((e) => e.tipo === 'patologia'), cot = els.filter((e) => e.tipo === 'cota')
    const par = els.filter((e) => e.tipo === 'parede'), nts = els.filter((e) => e.tipo === 'nota' || e.tipo === 'foto')
    if (!(pil.length + vig.length + laj.length + niv.length + pat.length + cot.length + par.length + nts.length)) continue
    doc.addPage()
    const tt = `TABELAS — ${pav.nome}`
    cabecalho(doc, obra, tt)
    let y = 26
    y = tabela(doc, obra, tt, 'Pilares', [{ t: 'Nome', w: 12 }, { t: 'Seção (cm)', w: 16 }, { t: 'X (cm)', w: 14 }, { t: 'Y (cm)', w: 14 }, { t: 'Giro', w: 9 }, { t: 'Dados', w: 60 }, { t: 'Observação', w: 50 }, { t: 'Fotos', w: 12 }],
      pil.map((e) => e.tipo === 'pilar' ? [e.nome, secaoPilar(e), fmt(e.pos.x), fmt(e.pos.y), e.rot ? fmt(e.rot) + '°' : '', dados(e, rot), e.obs, numDe(e)] : []), y)
    y = tabela(doc, obra, tt, 'Vigas', [{ t: 'Nome', w: 12 }, { t: 'Seção bw×h (cm)', w: 22 }, { t: 'Comprimento (cm)', w: 22 }, { t: 'Dados', w: 60 }, { t: 'Observação', w: 55 }, { t: 'Fotos', w: 12 }],
      vig.map((e) => e.tipo === 'viga' ? [e.nome, `${fmt(e.bw)}×${fmt(e.h)}`, fmt(dist(e.a, e.b)), dados(e, rot), e.obs, numDe(e)] : []), y)
    y = tabela(doc, obra, tt, 'Lajes', [{ t: 'Nome', w: 12 }, { t: 'Espessura (cm)', w: 22 }, { t: 'Área (m²)', w: 22 }, { t: 'Dados', w: 60 }, { t: 'Observação', w: 55 }, { t: 'Fotos', w: 12 }],
      laj.map((e) => e.tipo === 'laje' ? [e.nome, fmt(e.esp), fmt(areaLajeM2(e), 2), dados(e, rot), e.obs, numDe(e)] : []), y)
    y = tabela(doc, obra, tt, 'Paredes', [{ t: 'Nome', w: 14 }, { t: 'Espessura (cm)', w: 22 }, { t: 'Comprimento (cm)', w: 22 }, { t: 'Observação', w: 100 }, { t: 'Fotos', w: 12 }],
      par.map((e) => e.tipo === 'parede' ? [e.nome, fmt(e.esp), fmt(dist(e.a, e.b)), e.obs, numDe(e)] : []), y)
    y = tabela(doc, obra, tt, 'Níveis', [{ t: 'Nome', w: 12 }, { t: 'Referência', w: 30 }, { t: 'Acima do piso (cm)', w: 26 }, { t: 'Nível (m)', w: 18 }, { t: 'Observação', w: 80 }, { t: 'Fotos', w: 12 }],
      niv.map((e) => e.tipo === 'nivel' ? [e.nome, e.ref, fmt(e.valor), fmtNivel(pav.nivel + e.valor), e.obs, numDe(e)] : []), y)
    y = tabela(doc, obra, tt, 'Cotas', [{ t: 'Nº', w: 10 }, { t: 'Medida em campo (cm)', w: 30 }, { t: 'No desenho (cm)', w: 26 }, { t: 'Diferença (cm)', w: 24 }, { t: 'Origem', w: 24 }, { t: 'Observação', w: 70 }],
      cot.map((e) => e.tipo === 'cota' ? [e.nome, e.valor != null ? fmt(e.valor) : 'não medida', fmt(dist(e.a, e.b)), e.valor != null ? fmt(e.valor - dist(e.a, e.b)) : '', e.origem === 'laser' ? 'Trena laser' : e.origem === 'ar' ? 'Scan / AR' : 'Trena', e.obs] : []), y)
    y = tabela(doc, obra, tt, 'Patologias', [{ t: 'Nome', w: 14 }, { t: 'Dados', w: 80 }, { t: 'Observação', w: 70 }, { t: 'Fotos', w: 12 }],
      pat.map((e) => [e.nome, dados(e, rot), e.obs, numDe(e)]), y)
    tabela(doc, obra, tt, 'Notas e pontos de foto', [{ t: 'Nome', w: 14 }, { t: 'Tipo', w: 16 }, { t: 'Texto / observação', w: 130 }, { t: 'Fotos', w: 12 }],
      nts.map((e) => [e.nome, NOME_TIPO[e.tipo], e.tipo === 'nota' ? [e.texto, e.obs].filter(Boolean).join(' — ') : e.obs, numDe(e)]), y)
  }
  if (primeira) { cabecalho(doc, obra, 'CROQUI DE LEVANTAMENTO'); doc.text('Obra sem pavimentos.', 10, 30) }
  return doc.output('blob')
}

export async function gerarRelatorioFotos(obra: Obra): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const fotos = numerarFotos(obra)
  const TIT = 'RELATÓRIO FOTOGRÁFICO'
  cabecalho(doc, obra, TIT)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55)
  let y = 28
  for (const [r, v] of [['Obra', obra.nome], ['Endereço', obra.endereco], ['Cliente', obra.cliente], ['Responsável', obra.responsavel], ['Data do levantamento', dataBR(obra.data)], ['Total de fotos', String(fotos.length)]] as const) {
    if (!v) continue
    doc.setFont('helvetica', 'bold'); doc.text(r + ':', 10, y)
    doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(v, W - 65) as string[], 55, y)
    y += 6
  }
  if (obra.obs) { y += 2; const l = doc.splitTextToSize(obra.obs, W - 20) as string[]; doc.text(l, 10, y); y += l.length * 5 }

  // planta-chave por pavimento: onde cada foto foi tirada
  let rosto = true
  for (const pav of obra.pavimentos) {
    const doPav = fotos.filter((f) => f.pavId === pav.id)
    if (!doPav.length) continue
    let topo = 26
    if (rosto && y < 110) {
      topo = y + 12
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 24, 39)
      doc.text(`Planta-chave das fotos — ${pav.nome}`, 10, y + 6)
    } else {
      doc.addPage()
      cabecalho(doc, obra, `PLANTA-CHAVE DAS FOTOS — ${pav.nome}`)
    }
    rosto = false
    const prims = primsPavimento(pav)
    const porEl = new Map<ID, number[]>()
    for (const f of doPav) if (f.el) porEl.set(f.el.id, [...(porEl.get(f.el.id) ?? []), f.n])
    for (const el of pav.elementos) {
      const ns = porEl.get(el.id)
      if (!ns) continue
      const c = pontoRef(el)
      prims.push({ k: 'circ', c: { x: c.x - 18, y: c.y - 18 }, r: 11, camada: 'FOTOS' })
      prims.push({ k: 'texto', p: { x: c.x - 18, y: c.y - 22 }, t: faixas(ns), h: 11, camada: 'TXT_FOTOS', alinh: 'c', rot: 0, negrito: true })
    }
    plantaPDF(doc, prims, { x: 12, y: topo, w: W - 24, h: H - topo - 18 })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99)
    doc.text('Os números nos círculos indicam as fotos de cada elemento.', 10, H - 8)
  }

  // duas fotos por página
  const aw = W - 20, ah = 108
  let pos = 2
  for (const f of fotos) {
    const r = await renderFoto(f.fotoId, 1600)
    if (!r) continue
    if (pos >= 2) { doc.addPage(); cabecalho(doc, obra, TIT); pos = 0 }
    const y0 = 24 + pos * 134
    const esc = Math.min(aw / r.canvas.width, ah / r.canvas.height)
    const w = r.canvas.width * esc, h = r.canvas.height * esc
    doc.addImage(r.canvas.toDataURL('image/jpeg', 0.82), 'JPEG', 10 + (aw - w) / 2, y0, w, h)
    const onde = f.el ? `${f.pavNome} — ${NOME_TIPO[f.el.tipo]} ${f.el.nome}` : 'Vista geral'
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(17, 24, 39)
    doc.text(`Foto ${f.n} — ${onde}`, 10, y0 + ah + 6)
    if (r.foto.legenda) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81)
      doc.text((doc.splitTextToSize(r.foto.legenda, aw) as string[]).slice(0, 3), 10, y0 + ah + 11)
    }
    pos++
  }
  if (!fotos.length) { doc.setFontSize(10); doc.text('Nenhuma foto registrada nesta obra.', 10, y + 8) }
  return doc.output('blob')
}

// ---------------------------------------------------------------- backup e pacote completo
type MetaFoto = Omit<FotoReg, 'dados'>

async function arquivosBackup(obra: Obra): Promise<Record<string, Uint8Array>> {
  const { strToU8 } = await import('fflate')
  const fotos = await fotosDaObra(obra.id)
  const usadas = new Set(idsUsados(obra))
  const arqs: Record<string, Uint8Array> = {}
  const meta: MetaFoto[] = []
  for (const f of fotos) {
    if (!usadas.has(f.id)) continue
    const { dados, ...m } = f
    meta.push(m)
    arqs[`fotos/${f.id}.jpg`] = new Uint8Array(dados)
  }
  arqs['obra.json'] = strToU8(JSON.stringify({ formato: 'levantamento-estrutural', versao: 1, obra, fotos: meta }))
  return arqs
}
export function idsUsados(obra: Obra): ID[] {
  const ids = [...obra.fotosGerais]
  for (const pav of obra.pavimentos) {
    if (pav.fundo) ids.push(pav.fundo.fotoId)
    for (const el of pav.elementos) ids.push(...el.fotos)
  }
  return ids
}

export async function gerarBackup(obra: Obra): Promise<Blob> {
  const { zipSync } = await import('fflate')
  return new Blob([zipSync(await arquivosBackup(obra), { level: 0 }) as BlobPart], { type: 'application/zip' })
}

/** ZIP com tudo: croqui, relatório, DXF de cada pavimento, fotos anotadas e o backup. */
export async function gerarPacote(obra: Obra, modos: Modo[]): Promise<Blob> {
  const { zipSync } = await import('fflate')
  const arqs: Record<string, Uint8Array> = {}
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
  arqs['croqui.pdf'] = await bytes(await gerarPDFCroqui(obra, modos))
  arqs['relatorio-fotografico.pdf'] = await bytes(await gerarRelatorioFotos(obra))
  for (const pav of obra.pavimentos) arqs[`dxf/${nomeArquivo(pav.nome)}.dxf`] = await bytes(gerarDXF(pav))
  for (const f of numerarFotos(obra)) {
    const r = await renderFoto(f.fotoId, 2000)
    if (!r) continue
    const blob = await new Promise<Blob | null>((ok) => r.canvas.toBlob(ok, 'image/jpeg', 0.88))
    if (blob) arqs[`fotos/Foto_${String(f.n).padStart(3, '0')}${f.el ? '_' + nomeArquivo(f.el.nome) : ''}.jpg`] = await bytes(blob)
  }
  for (const [k, v] of Object.entries(await arquivosBackup(obra))) arqs['backup/' + k] = v
  return new Blob([zipSync(arqs, { level: 0 }) as BlobPart], { type: 'application/zip' })
}

/** Restaura uma obra a partir do ZIP de backup (ou do pacote completo). Devolve o id da obra. */
export async function importarBackup(arq: Blob, substituir: (nome: string) => Promise<boolean>): Promise<ID | null> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await arq.arrayBuffer()))
  const pre = zip['obra.json'] ? '' : zip['backup/obra.json'] ? 'backup/' : null
  if (pre == null) throw new Error('Este arquivo não é um backup do Levantamento Estrutural.')
  const j = JSON.parse(strFromU8(zip[pre + 'obra.json'])) as { formato?: string; obra: Obra; fotos: MetaFoto[] }
  if (j.formato !== 'levantamento-estrutural' || !j.obra?.id) throw new Error('Backup em formato desconhecido.')
  const obra = j.obra
  if (await lerObra(obra.id)) {
    if (!(await substituir(obra.nome))) {
      // importa como cópia, com ids novos para não misturar as fotos
      const mapa = new Map<ID, ID>()
      for (const m of j.fotos) mapa.set(m.id, uid())
      const tr = (id: ID) => mapa.get(id) ?? id
      obra.id = uid(); obra.nome += ' (cópia)'
      obra.fotosGerais = obra.fotosGerais.map(tr)
      for (const pav of obra.pavimentos) {
        if (pav.fundo) pav.fundo.fotoId = tr(pav.fundo.fotoId)
        for (const el of pav.elementos) el.fotos = el.fotos.map(tr)
      }
      for (const m of j.fotos) { const d = zip[`${pre}fotos/${m.id}.jpg`]; (m as MetaFoto & { _d?: Uint8Array })._d = d; m.id = tr(m.id) }
    }
  }
  for (const m of j.fotos) {
    const mm = m as MetaFoto & { _d?: Uint8Array }
    const d = mm._d ?? zip[`${pre}fotos/${m.id}.jpg`]
    if (!d) continue
    delete mm._d
    await salvarFoto({ ...m, obraId: obra.id, dados: d.slice().buffer as ArrayBuffer })
  }
  obra.atualizadoEm = Date.now()
  await salvarObra(obra)
  return obra.id
}
