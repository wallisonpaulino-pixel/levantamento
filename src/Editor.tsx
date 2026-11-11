// Editor de planta: desenho em escala com toque (um dedo move, dois dedos dão zoom).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Elemento, ID, Modo, Obra, Pavimento, Pilar, Pt, Tipo } from './types'
import { NOME_TIPO } from './types'
import { CAMADAS, camadaBase, emOrdem, pontosCota, primsElemento, type Prim } from './prims'
import { arred, cantosPilar, clonar, dentroPoligono, dist, distSeg, fmt, fmtNivel, limites, meio, parseNum, pontoRef, proximoNome, transladar, uid } from './util'
import { imagemDaFoto, novaFoto } from './db'
import { Barra, CampoOpcao, Folha, avisar, comEspera, confirmar, pedirTexto } from './ui'
import { Ficha, resumoElemento } from './Ficha'

type Ferr = 'sel' | Tipo
interface Vista { cx: number; cy: number; esc: number } // esc = pixels por cm
type Tela = { x: number; y: number }
type SemBase<E> = E extends Elemento ? Omit<E, 'id' | 'nome' | 'campos' | 'fotos' | 'obs'> : never
type Novo = SemBase<Elemento>

const FERR: Record<Ferr, [string, string]> = {
  sel: ['☝', 'Selecionar'], pilar: ['■', 'Pilar'], viga: ['▬', 'Viga'], laje: ['▱', 'Laje'], parede: ['▯', 'Parede'],
  cota: ['↔', 'Cota'], nivel: ['▽', 'Nível'], patologia: ['⊗', 'Patologia'], foto: ['◉', 'Foto'], nota: ['T', 'Nota'],
}
const ABRE_FICHA: Tipo[] = ['cota', 'nivel', 'patologia', 'foto', 'nota']
const PRIORIDADE: Tipo[] = ['nivel', 'patologia', 'foto', 'nota', 'pilar', 'cota', 'viga', 'parede', 'laje']
const DESTAQUE = '#f97316'

function acertaEl(e: Elemento, w: Pt, tol: number): boolean {
  switch (e.tipo) {
    case 'pilar': {
      if (e.forma === 'circ') return dist(w, e.pos) <= e.b / 2 + tol
      const a = (-e.rot * Math.PI) / 180, dx = w.x - e.pos.x, dy = w.y - e.pos.y
      const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a)
      return Math.abs(x) <= e.b / 2 + tol && Math.abs(y) <= e.h / 2 + tol
    }
    case 'viga': return distSeg(w, e.a, e.b) <= Math.max(e.bw / 2, tol)
    case 'parede': return distSeg(w, e.a, e.b) <= Math.max(e.esp / 2, tol)
    case 'cota': { const g = pontosCota(e); return !!g && distSeg(w, g.a2, g.b2) <= tol }
    case 'laje': return dentroPoligono(w, e.pts)
    default: return dist(w, e.pos) <= tol * 1.4
  }
}
/** Pontos que podem ser arrastados um a um no elemento selecionado. */
function alcas(e: Elemento): Pt[] {
  if (e.tipo === 'viga' || e.tipo === 'parede' || e.tipo === 'cota') return [e.a, e.b]
  if (e.tipo === 'laje') return e.pts
  return []
}
function comAlca(e: Elemento, i: number, q: Pt): Elemento {
  const n = clonar(e)
  if (n.tipo === 'viga' || n.tipo === 'parede' || n.tipo === 'cota') { if (i === 0) n.a = q; else n.b = q }
  else if (n.tipo === 'laje') n.pts[i] = q
  return n
}
function imasPilar(e: Pilar): Pt[] {
  if (e.forma === 'ret') {
    const c = cantosPilar(e)
    return [e.pos, ...c, ...c.map((p, i) => meio(p, c[(i + 1) % 4]))]
  }
  return [e.pos, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({ x: e.pos.x + (x * e.b) / 2, y: e.pos.y + (y * e.b) / 2 }))]
}
/** Vigas, paredes, cotas e lajes presas ao pilar acompanham quando ele muda de lugar ou de seção. */
function religar(pv: Pavimento, antigo: Pilar, novo: Pilar) {
  const A = imasPilar(antigo), B = imasPilar(novo)
  if (A.length !== B.length) return
  const tr = (q: Pt): Pt => {
    const i = A.findIndex((a) => Math.abs(a.x - q.x) < 0.01 && Math.abs(a.y - q.y) < 0.01)
    return i >= 0 ? { ...B[i] } : q
  }
  for (const e of pv.elementos) {
    if (e.id === novo.id) continue
    if (e.tipo === 'viga' || e.tipo === 'parede' || e.tipo === 'cota') { e.a = tr(e.a); e.b = tr(e.b) }
    else if (e.tipo === 'laje') e.pts = e.pts.map(tr)
  }
}
/** Pontos de encaixe: centros, cantos e meios de face dos pilares, extremidades de vigas etc. */
function imas(pav: Pavimento, fora?: ID): Pt[] {
  const out: Pt[] = []
  for (const e of pav.elementos) {
    if (e.id === fora) continue
    if (e.tipo === 'pilar') out.push(...imasPilar(e))
    else if (e.tipo === 'viga' || e.tipo === 'parede' || e.tipo === 'cota') out.push(e.a, e.b)
    else if (e.tipo === 'laje') out.push(...e.pts)
  }
  return out
}

export function Editor(p: { obra: Obra; pav: Pavimento; modo: Modo; mutar: (fn: (o: Obra) => void) => void; voltar: () => void; exportarDxf: () => void }) {
  const { pav, modo } = p
  const cvRef = useRef<HTMLCanvasElement>(null)
  const vista = useRef<Vista>({ cx: 0, cy: 0, esc: 0.5 })
  const [ferr, setFerr] = useState<Ferr>('sel')
  const [sel, setSel] = useState<ID | null>(null)
  const [pend, setPend] = useState<Pt[]>([])
  const [ficha, setFicha] = useState(false)
  const [grade, setGrade] = useState(5)
  const [menu, setMenu] = useState(false)
  const [calib, setCalib] = useState<Pt[] | null>(null)
  const [fundoImg, setFundoImg] = useState<HTMLImageElement | null>(null)
  const [nUndo, setNUndo] = useState(0)
  const pilha = useRef<string[]>([])
  const ultimoUndo = useRef({ id: '', t: 0 })
  const arrasto = useRef<Elemento | null>(null)
  const ultimo = useRef({ pilar: { b: 20, h: 40 }, viga: { bw: 15, h: 40 }, laje: 10, parede: 15 })
  const fundoRef = useRef<HTMLInputElement>(null)
  const selEl = pav.elementos.find((e) => e.id === sel) ?? null

  // ---------- alterações com desfazer ----------
  const mutarPav = (fn: (pv: Pavimento) => void, undo = true) => {
    if (undo) {
      pilha.current.push(JSON.stringify(pav.elementos))
      if (pilha.current.length > 60) pilha.current.shift()
      setNUndo(pilha.current.length)
    }
    p.mutar((o) => { const pv = o.pavimentos.find((x) => x.id === pav.id); if (pv) fn(pv) })
  }
  const desfazer = () => {
    const s = pilha.current.pop()
    setNUndo(pilha.current.length)
    if (s) mutarPav((pv) => { pv.elementos = JSON.parse(s) }, false)
    setPend([])
  }
  const mudarEl = (id: ID, fn: (e: Elemento) => void) => {
    const agora = Date.now()
    const junta = ultimoUndo.current.id === id && agora - ultimoUndo.current.t < 4000
    ultimoUndo.current = { id, t: agora }
    mutarPav((pv) => {
      const e = pv.elementos.find((x) => x.id === id)
      if (!e) return
      const antes = e.tipo === 'pilar' ? clonar(e) : null
      fn(e)
      if (e.tipo === 'pilar' && antes) religar(pv, antes, e)
      if (e.tipo === 'pilar') ultimo.current.pilar = { b: e.b, h: e.h }
      else if (e.tipo === 'viga') ultimo.current.viga = { bw: e.bw, h: e.h }
      else if (e.tipo === 'laje') ultimo.current.laje = e.esp
      else if (e.tipo === 'parede') ultimo.current.parede = e.esp
    }, !junta)
  }
  const criar = (parcial: Novo) => {
    const el = { id: uid(), nome: proximoNome(pav, parcial.tipo), campos: {}, fotos: [], obs: '', ...parcial } as Elemento
    mutarPav((pv) => { pv.elementos.push(el) })
    setSel(el.id)
    if (ABRE_FICHA.includes(el.tipo)) setFicha(true)
    return el
  }
  const excluirSel = async () => {
    if (!selEl) return
    const temFotos = selEl.fotos.length > 0
    if (temFotos && !(await confirmar(`Excluir ${selEl.nome}?`, `As ${selEl.fotos.length} foto(s) deste elemento saem junto.`, { perigo: true, ok: 'Excluir' }))) return
    const id = selEl.id
    setFicha(false); setSel(null)
    mutarPav((pv) => { pv.elementos = pv.elementos.filter((e) => e.id !== id) })
  }

  // ---------- coordenadas ----------
  const tam = () => { const cv = cvRef.current!; return { W: cv.clientWidth, H: cv.clientHeight } }
  const paraTela = (w: Pt): Tela => { const { W, H } = tam(), v = vista.current; return { x: W / 2 + (w.x - v.cx) * v.esc, y: H / 2 - (w.y - v.cy) * v.esc } }
  const paraMundo = (s: Tela): Pt => { const { W, H } = tam(), v = vista.current; return { x: v.cx + (s.x - W / 2) / v.esc, y: v.cy - (s.y - H / 2) / v.esc } }

  const ajustar = (w: Pt, comImas = true, fora?: ID): Pt => {
    if (comImas) {
      let melhor: Pt | null = null, bd = 16 / vista.current.esc
      for (const q of imas(pav, fora)) { const d = dist(w, q); if (d < bd) { bd = d; melhor = q } }
      if (melhor) return { ...melhor }
    }
    return { x: arred(w.x, grade), y: arred(w.y, grade) }
  }
  /** Pilares encaixam na grade e se alinham com os pilares vizinhos. */
  const ajustarPilar = (w: Pt, fora?: ID): Pt => {
    const tol = 12 / vista.current.esc
    let x = arred(w.x, grade), y = arred(w.y, grade), bx = tol, by = tol
    for (const e of pav.elementos) {
      if (e.tipo !== 'pilar' || e.id === fora) continue
      const dx = Math.abs(e.pos.x - w.x), dy = Math.abs(e.pos.y - w.y)
      if (dx < bx) { bx = dx; x = e.pos.x }
      if (dy < by) { by = dy; y = e.pos.y }
    }
    return { x, y }
  }
  const acertar = (w: Pt): Elemento | null => {
    const tol = 14 / vista.current.esc
    for (const t of PRIORIDADE)
      for (let i = pav.elementos.length - 1; i >= 0; i--) {
        const e = pav.elementos[i]
        if (e.tipo === t && acertaEl(e, w, tol)) return e
      }
    return null
  }

  // ---------- desenho ----------
  const desenhar = () => {
    const cv = cvRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1, { W, H } = tam(), v = vista.current
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr) }
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)

    // grade
    const passo = [5, 10, 50, 100, 500, 1000, 5000].find((g) => g * v.esc >= 14) ?? 10000
    const m0 = paraMundo({ x: 0, y: H }), m1 = paraMundo({ x: W, y: 0 })
    ctx.lineWidth = 1
    for (let x = Math.floor(m0.x / passo) * passo; x <= m1.x; x += passo) {
      const forte = Math.round(x / passo) % 5 === 0
      ctx.strokeStyle = forte ? '#d9dee5' : '#eef0f3'
      const sx = Math.round(paraTela({ x, y: 0 }).x) + 0.5
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke()
    }
    for (let y = Math.floor(m0.y / passo) * passo; y <= m1.y; y += passo) {
      const forte = Math.round(y / passo) % 5 === 0
      ctx.strokeStyle = forte ? '#d9dee5' : '#eef0f3'
      const sy = Math.round(paraTela({ x: 0, y }).y) + 0.5
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke()
    }
    const o = paraTela({ x: 0, y: 0 })
    ctx.strokeStyle = '#9ca3af'
    ctx.beginPath(); ctx.moveTo(o.x - 8, o.y); ctx.lineTo(o.x + 8, o.y); ctx.moveTo(o.x, o.y - 8); ctx.lineTo(o.x, o.y + 8); ctx.stroke()

    // planta de fundo
    if (pav.fundo && fundoImg) {
      const f = pav.fundo, tl = paraTela({ x: f.x, y: f.y })
      ctx.globalAlpha = f.opac
      ctx.drawImage(fundoImg, tl.x, tl.y, f.w * f.cmPorPx * v.esc, f.h * f.cmPorPx * v.esc)
      ctx.globalAlpha = 1
    }

    const arr = arrasto.current
    const els = emOrdem(pav.elementos.map((e) => (arr && arr.id === e.id ? arr : e)))
    for (const e of els) {
      pintar(ctx, primsElemento(e, pav), v.esc, paraTela, e.id === sel)
      if (e.fotos.length) {
        const r = paraTela(pontoRef(e))
        ctx.fillStyle = '#0e7490'
        ctx.beginPath(); ctx.arc(r.x - 13, r.y - 13, 8, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(e.fotos.length), r.x - 13, r.y - 12.5)
        ctx.textBaseline = 'alphabetic'
      }
    }

    // guias de alinhamento ao arrastar pilar
    if (arr && arr.tipo === 'pilar') {
      ctx.strokeStyle = DESTAQUE; ctx.setLineDash([5, 5]); ctx.lineWidth = 1
      for (const e of pav.elementos) {
        if (e.tipo !== 'pilar' || e.id === arr.id) continue
        const a = paraTela(arr.pos)
        if (Math.abs(e.pos.x - arr.pos.x) < 0.01) { ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, H); ctx.stroke() }
        if (Math.abs(e.pos.y - arr.pos.y) < 0.01) { ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(W, a.y); ctx.stroke() }
      }
      ctx.setLineDash([])
    }

    // alças do selecionado
    const s = arr && arr.id === sel ? arr : selEl
    if (s && ferr === 'sel') {
      for (const h of alcas(s)) {
        const t = paraTela(h)
        ctx.fillStyle = '#fff'; ctx.strokeStyle = DESTAQUE; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }

    // pontos já marcados pela ferramenta atual
    const marcas = calib ?? pend
    if (marcas.length) {
      ctx.strokeStyle = DESTAQUE; ctx.fillStyle = DESTAQUE; ctx.lineWidth = 2
      ctx.beginPath()
      marcas.forEach((q, i) => { const t = paraTela(q); if (i) ctx.lineTo(t.x, t.y); else ctx.moveTo(t.x, t.y) })
      ctx.stroke()
      for (const q of marcas) { const t = paraTela(q); ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, Math.PI * 2); ctx.fill() }
    }

    // barra de escala
    const alvo = 90 / v.esc
    const comp = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((c) => c >= alvo * 0.6) ?? 10000
    const px = comp * v.esc, bx = 12, by = H - 14
    ctx.strokeStyle = '#374151'; ctx.fillStyle = '#374151'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + px, by); ctx.lineTo(bx + px, by - 4); ctx.stroke()
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(comp >= 100 ? `${fmt(comp / 100)} m` : `${comp} cm`, bx + 4, by - 5)
  }
  const desenharRef = useRef(desenhar)
  desenharRef.current = desenhar
  const quadro = useRef(0)
  const pedirDesenho = () => {
    if (quadro.current) return
    quadro.current = requestAnimationFrame(() => { quadro.current = 0; desenharRef.current() })
  }
  useEffect(() => { desenhar() })

  const enquadrar = () => {
    const cv = cvRef.current
    if (!cv) return
    const l = limites(pav), { W, H } = tam()
    if (!l || !W || !H) { vista.current = { cx: 0, cy: 0, esc: 0.5 }; pedirDesenho(); return }
    const lw = Math.max(l.maxx - l.minx, 100), lh = Math.max(l.maxy - l.miny, 100)
    const esc = Math.min((W - 90) / lw, (H - 90) / lh, 4)
    vista.current = { cx: (l.minx + l.maxx) / 2, cy: (l.miny + l.maxy) / 2, esc: Math.max(esc, 0.01) }
    pedirDesenho()
  }
  useLayoutEffect(() => {
    enquadrar()
    const cv = cvRef.current!
    const ro = new ResizeObserver(() => pedirDesenho())
    ro.observe(cv)
    const roda = (e: WheelEvent) => {
      e.preventDefault()
      const r = cv.getBoundingClientRect(), s = { x: e.clientX - r.left, y: e.clientY - r.top }
      const antes = paraMundo(s), v = vista.current
      const esc = Math.max(0.01, Math.min(40, v.esc * Math.exp(-e.deltaY * 0.0015)))
      const { W, H } = tam()
      vista.current = { esc, cx: antes.x - (s.x - W / 2) / esc, cy: antes.y + (s.y - H / 2) / esc }
      pedirDesenho()
    }
    cv.addEventListener('wheel', roda, { passive: false })
    return () => { ro.disconnect(); cv.removeEventListener('wheel', roda); cancelAnimationFrame(quadro.current); quadro.current = 0 }
  }, [pav.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true
    setFundoImg(null)
    if (pav.fundo) imagemDaFoto(pav.fundo.fotoId).then((i) => vivo && setFundoImg(i))
    return () => { vivo = false }
  }, [pav.fundo?.fotoId])

  // ---------- toque ----------
  const concluirLaje = (pts: Pt[]) => {
    setPend([])
    if (pts.length >= 3) criar({ tipo: 'laje', pts, esp: ultimo.current.laje })
  }
  const toque = async (s: Tela) => {
    const w = paraMundo(s)
    if (calib) {
      const pts = [...calib, w]
      if (pts.length < 2) { setCalib(pts); return }
      setCalib(null)
      const d = dist(pts[0], pts[1])
      const t = await pedirTexto('Distância real entre os dois pontos', '', { rotulo: 'Distância (cm)', numero: true })
      const real = t ? parseNum(t) : null
      if (!real || real <= 0 || d <= 0) { await avisar('Escala não alterada', 'Informe uma distância maior que zero para calibrar a planta de fundo.'); return }
      const k = real / d
      p.mutar((o) => {
        const f = o.pavimentos.find((x) => x.id === pav.id)?.fundo
        if (!f) return
        f.cmPorPx *= k
        f.x = pts[0].x + (f.x - pts[0].x) * k
        f.y = pts[0].y + (f.y - pts[0].y) * k
      })
      setTimeout(enquadrarRef.current, 50)
      return
    }
    const livre = { x: arred(w.x, 1), y: arred(w.y, 1) }
    switch (ferr) {
      case 'sel': { const e = acertar(w); setSel(e?.id ?? null); break }
      case 'pilar': criar({ tipo: 'pilar', pos: ajustarPilar(w), forma: 'ret', ...ultimo.current.pilar, rot: 0 }); break
      case 'viga': case 'parede': case 'cota': {
        const q = ajustar(w)
        if (!pend.length) { setPend([q]); setSel(null); break }
        const a = pend[0]
        if (dist(a, q) < 1) break
        setPend([])
        if (ferr === 'viga') criar({ tipo: 'viga', a, b: q, ...ultimo.current.viga })
        else if (ferr === 'parede') criar({ tipo: 'parede', a, b: q, esp: ultimo.current.parede })
        else {
          // a linha de cota vai para o lado de fora do conjunto de pilares
          const l = limites({ ...pav, fundo: null })
          const c = l ? { x: (l.minx + l.maxx) / 2, y: (l.miny + l.maxy) / 2 } : a
          const m = meio(a, q), n = { x: -(q.y - a.y), y: q.x - a.x }
          const lado = (m.x - c.x) * n.x + (m.y - c.y) * n.y >= 0 ? 1 : -1
          criar({ tipo: 'cota', a, b: q, valor: null, origem: 'manual', afast: 50 * lado })
        }
        break
      }
      case 'laje': {
        if (pend.length >= 3) { const t0 = paraTela(pend[0]); if (Math.hypot(t0.x - s.x, t0.y - s.y) < 18) { concluirLaje(pend); break } }
        setSel(null); setPend([...pend, ajustar(w)])
        break
      }
      case 'nivel': criar({ tipo: 'nivel', pos: livre, valor: 0, ref: 'Piso acabado' }); break
      case 'patologia': criar({ tipo: 'patologia', pos: livre }); break
      case 'foto': criar({ tipo: 'foto', pos: livre }); break
      case 'nota': criar({ tipo: 'nota', pos: livre, texto: '' }); break
    }
  }
  const enquadrarRef = useRef(enquadrar)
  enquadrarRef.current = enquadrar

  const ptrs = useRef(new Map<number, Tela>())
  const g = useRef<{ tipo: 'nada' | 'toque' | 'pan' | 'pinca' | 'mover' | 'alca'; ini: Tela; v0: Vista; orig?: Elemento; alca?: number; d0?: number; c0?: Tela }>({ tipo: 'nada', ini: { x: 0, y: 0 }, v0: vista.current })
  const posTela = (e: React.PointerEvent): Tela => { const r = cvRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const baixo = (e: React.PointerEvent) => {
    const s = posTela(e)
    ptrs.current.set(e.pointerId, s)
    try { cvRef.current!.setPointerCapture(e.pointerId) } catch { /* ponteiro já solto */ }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      arrasto.current = null
      g.current = { tipo: 'pinca', ini: s, v0: { ...vista.current }, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      return
    }
    if (ptrs.current.size > 2) return
    const novo: typeof g.current = { tipo: 'toque', ini: s, v0: { ...vista.current } }
    if (ferr === 'sel' && selEl && !calib) {
      const w = paraMundo(s), tol = 18 / vista.current.esc
      const i = alcas(selEl).findIndex((h) => dist(h, w) < tol)
      if (i >= 0) { novo.alca = i; novo.orig = selEl }
      else if (acertaEl(selEl, w, 14 / vista.current.esc)) novo.orig = selEl
    }
    g.current = novo
  }
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    const s = posTela(e)
    ptrs.current.set(e.pointerId, s)
    const G = g.current, { W, H } = tam()
    if (G.tipo === 'pinca') {
      if (ptrs.current.size < 2) return
      const [a, b] = [...ptrs.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const esc = Math.max(0.01, Math.min(40, (G.v0.esc * d) / G.d0!))
      const wx = G.v0.cx + (G.c0!.x - W / 2) / G.v0.esc, wy = G.v0.cy - (G.c0!.y - H / 2) / G.v0.esc
      vista.current = { esc, cx: wx - (c.x - W / 2) / esc, cy: wy + (c.y - H / 2) / esc }
      pedirDesenho()
      return
    }
    const dx = s.x - G.ini.x, dy = s.y - G.ini.y
    if (G.tipo === 'toque' && Math.hypot(dx, dy) > 8) G.tipo = G.alca != null ? 'alca' : G.orig ? 'mover' : 'pan'
    if (G.tipo === 'pan') {
      vista.current = { esc: G.v0.esc, cx: G.v0.cx - dx / G.v0.esc, cy: G.v0.cy + dy / G.v0.esc }
      pedirDesenho()
    } else if (G.tipo === 'mover' && G.orig) {
      const o = G.orig, mx = dx / vista.current.esc, my = -dy / vista.current.esc
      if (o.tipo === 'pilar') { const q = ajustarPilar({ x: o.pos.x + mx, y: o.pos.y + my }, o.id); arrasto.current = { ...o, pos: q } }
      else if (o.tipo === 'viga' || o.tipo === 'parede' || o.tipo === 'cota' || o.tipo === 'laje') arrasto.current = transladar(o, arred(mx, grade), arred(my, grade))
      else arrasto.current = transladar(o, arred(mx, 1), arred(my, 1))
      pedirDesenho()
    } else if (G.tipo === 'alca' && G.orig) {
      arrasto.current = comAlca(G.orig, G.alca!, ajustar(paraMundo(s), true, G.orig.id))
      pedirDesenho()
    }
  }
  const cima = (e: React.PointerEvent) => {
    if (!ptrs.current.delete(e.pointerId)) return
    const G = g.current
    g.current = { tipo: 'nada', ini: G.ini, v0: G.v0 }
    if (G.tipo === 'pinca') return
    if (e.type === 'pointercancel') { arrasto.current = null; pedirDesenho(); return }
    if (G.tipo === 'toque') void toque(G.ini)
    else if ((G.tipo === 'mover' || G.tipo === 'alca') && arrasto.current) {
      const novo = arrasto.current
      arrasto.current = null
      mutarPav((pv) => {
        const i = pv.elementos.findIndex((x) => x.id === novo.id)
        if (i < 0) return
        const antes = pv.elementos[i]
        pv.elementos[i] = novo
        if (antes.tipo === 'pilar' && novo.tipo === 'pilar') religar(pv, antes, novo)
      })
    }
  }

  // ---------- planta de fundo ----------
  const escolherFundo = async (arq: File | undefined) => {
    if (!arq) return
    const reg = await comEspera('Carregando planta…', () => novaFoto(p.obra.id, arq, 3000))
    if (!reg) return
    const v = vista.current
    p.mutar((o) => {
      const pv = o.pavimentos.find((x) => x.id === pav.id)
      if (pv) pv.fundo = { fotoId: reg.id, cmPorPx: 1, x: v.cx - reg.w / 2, y: v.cy + reg.h / 2, opac: 0.5, w: reg.w, h: reg.h }
    })
    setMenu(false); setFerr('sel'); setSel(null); setPend([])
    setTimeout(() => { enquadrarRef.current(); setCalib([]) }, 80)
  }
  const mudarFundo = (fn: (f: NonNullable<Pavimento['fundo']>) => void) =>
    p.mutar((o) => { const f = o.pavimentos.find((x) => x.id === pav.id)?.fundo; if (f) fn(f) })

  const trocarFerr = (f: Ferr) => { setFerr(f); setPend([]); setCalib(null); if (f !== 'sel') setSel(null) }
  const ferramentas: Ferr[] = ['sel', ...modo.ferramentas]

  let dica = ''
  if (calib) dica = calib.length === 0 ? 'Calibrar escala: toque no 1º ponto de uma medida conhecida' : 'Agora toque no 2º ponto'
  else if (ferr === 'sel') dica = 'Toque num elemento para selecionar. Arraste o fundo para mover a planta.'
  else if (ferr === 'pilar') dica = `Toque para colocar pilar ${fmt(ultimo.current.pilar.b)}×${fmt(ultimo.current.pilar.h)}`
  else if (ferr === 'viga' || ferr === 'parede' || ferr === 'cota') dica = pend.length ? `Toque no ponto final da ${NOME_TIPO[ferr].toLowerCase()}` : `Toque no ponto inicial da ${NOME_TIPO[ferr].toLowerCase()}`
  else if (ferr === 'laje') dica = pend.length < 3 ? `Toque nos cantos da laje (${pend.length} marcado${pend.length === 1 ? '' : 's'})` : 'Toque no 1º canto ou em Concluir'
  else dica = `Toque no local para marcar: ${NOME_TIPO[ferr].toLowerCase()}`

  return (
    <div className="editor">
      <Barra titulo={pav.nome} sub={`${p.obra.nome} · piso ${fmtNivel(pav.nivel)} m`} voltar={p.voltar}>
        <button className="icone" aria-label="Desfazer" disabled={!nUndo} onClick={desfazer}>↶</button>
        <button className="icone" aria-label="Enquadrar" onClick={enquadrar}>⛶</button>
        <button className="icone" aria-label="Opções" onClick={() => setMenu(true)}>⋯</button>
      </Barra>

      <div className="tela-desenho">
        <canvas ref={cvRef} onPointerDown={baixo} onPointerMove={move} onPointerUp={cima} onPointerCancel={cima} />
      </div>

      <div className="status">
        {selEl && ferr === 'sel' && !calib ? (
          <>
            <div className="status-txt"><strong>{selEl.tipo === 'cota' ? 'Cota' : selEl.nome}</strong> <span>{resumoElemento(selEl)}</span></div>
            <button className="bt pequeno primario" onClick={() => setFicha(true)}>Ficha</button>
            <button className="bt pequeno perigo" aria-label="Excluir elemento" onClick={excluirSel}>🗑</button>
          </>
        ) : (
          <>
            <div className="status-txt"><span>{dica}</span></div>
            {ferr === 'laje' && pend.length >= 3 && <button className="bt pequeno primario" onClick={() => concluirLaje(pend)}>Concluir</button>}
            {(pend.length > 0 || calib) && <button className="bt pequeno" onClick={() => { setPend([]); setCalib(null) }}>Cancelar</button>}
            {selEl && ferr !== 'sel' && !pend.length && <button className="bt pequeno primario" onClick={() => setFicha(true)}>Ficha {selEl.nome}</button>}
          </>
        )}
      </div>

      <nav className="ferramentas">
        {ferramentas.map((f) => (
          <button key={f} className={ferr === f ? 'ativo' : ''} onClick={() => trocarFerr(f)}>
            <b>{FERR[f][0]}</b><small>{FERR[f][1]}</small>
          </button>
        ))}
      </nav>

      {ficha && selEl && (
        <Ficha
          el={selEl} pav={pav} modo={modo} obraId={p.obra.id}
          mudar={(fn) => mudarEl(selEl.id, fn)}
          fechar={() => setFicha(false)}
          excluir={excluirSel}
          novoPilarDeslocado={(base: Pilar, dx, dy) => {
            criar({ tipo: 'pilar', pos: { x: base.pos.x + dx, y: base.pos.y + dy }, forma: base.forma, b: base.b, h: base.h, rot: base.rot })
            setTimeout(enquadrarRef.current, 50)
          }}
        />
      )}

      {menu && (
        <Folha titulo="Opções do desenho" fechar={() => setMenu(false)}>
          <CampoOpcao rotulo="Encaixe na grade" valor={String(grade)} opcoes={[{ v: '1', t: '1 cm' }, { v: '5', t: '5 cm' }, { v: '10', t: '10 cm' }, { v: '25', t: '25 cm' }]} onChange={(v) => setGrade(Number(v))} />
          <h4>Planta de fundo</h4>
          {pav.fundo ? (
            <>
              <p className="nota">Escala atual: 1 pixel = {fmt(pav.fundo.cmPorPx, 3)} cm.</p>
              <label className="campo">
                <span>Opacidade ({Math.round(pav.fundo.opac * 100)}%)</span>
                <input type="range" min={10} max={100} step={5} value={Math.round(pav.fundo.opac * 100)} onChange={(e) => mudarFundo((f) => { f.opac = Number(e.target.value) / 100 })} />
              </label>
              <div className="pilha">
                <button className="bt" onClick={() => { setMenu(false); trocarFerr('sel'); setCalib([]) }}>Calibrar escala de novo</button>
                <button className="bt" onClick={() => fundoRef.current?.click()}>Trocar imagem</button>
                <button className="bt perigo" onClick={async () => {
                  if (await confirmar('Remover a planta de fundo?', 'Os elementos desenhados continuam.', { perigo: true, ok: 'Remover' }))
                    p.mutar((o) => { const pv = o.pavimentos.find((x) => x.id === pav.id); if (pv) pv.fundo = null })
                }}>Remover planta de fundo</button>
              </div>
            </>
          ) : (
            <>
              <p className="nota">Use a planta exportada do Polycam ou do Magicplan (imagem), ou a foto de uma planta impressa. Depois de escolher, toque em dois pontos de distância conhecida para acertar a escala.</p>
              <button className="bt" onClick={() => fundoRef.current?.click()}>Escolher imagem</button>
            </>
          )}
          <h4>Exportar</h4>
          <button className="bt" onClick={() => { setMenu(false); p.exportarDxf() }}>DXF deste pavimento</button>
          <input ref={fundoRef} type="file" accept="image/*" hidden onChange={(e) => { void escolherFundo(e.target.files?.[0]); e.target.value = '' }} />
        </Folha>
      )}
    </div>
  )
}

function pintar(ctx: CanvasRenderingContext2D, prims: Prim[], esc: number, T: (p: Pt) => Tela, destaque: boolean) {
  for (const pr of prims) {
    const base = camadaBase(pr.camada)
    const cor = destaque ? DESTAQUE : CAMADAS[base].cor
    ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = destaque ? 2.5 : 1.5
    if (pr.k === 'linha') {
      const a = T(pr.a), b = T(pr.b)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    } else if (pr.k === 'poli') {
      ctx.beginPath()
      pr.pts.forEach((q, i) => { const t = T(q); if (i) ctx.lineTo(t.x, t.y); else ctx.moveTo(t.x, t.y) })
      if (pr.fechado) ctx.closePath()
      if (pr.preench) ctx.fill()
      else if (pr.fechado) { ctx.globalAlpha = base === 'LAJES' ? 0.08 : base === 'PAREDES' ? 0.3 : 0.15; ctx.fill(); ctx.globalAlpha = 1 }
      ctx.stroke()
    } else if (pr.k === 'circ') {
      const c = T(pr.c)
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(pr.r * esc, 1.5), 0, Math.PI * 2)
      if (pr.preench) ctx.fill()
      ctx.stroke()
    } else {
      // com o desenho muito afastado ficam só os nomes; os demais textos voltam ao aproximar
      if (pr.h * esc < (pr.negrito ? 2.5 : 4.5)) continue
      const px = Math.max(9.5, Math.min(18, pr.h * esc)), t = T(pr.p)
      ctx.font = `${pr.negrito ? '700' : '500'} ${px}px system-ui, sans-serif`
      ctx.textAlign = pr.alinh === 'c' ? 'center' : pr.alinh === 'd' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate((-pr.rot * Math.PI) / 180)
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineJoin = 'round'
      ctx.strokeText(pr.t, 0, 0); ctx.fillText(pr.t, 0, 0)
      ctx.restore()
    }
  }
}
