import type { Elemento, Laje, Pavimento, Pilar, Pt, Tipo } from './types'
import { PREFIXO } from './types'

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
export const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '' || t === '-' || t === '+') return null
  const n = Number(t)
  return isFinite(n) ? n : null
}
/** Número com vírgula decimal, sem zeros à direita. */
export function fmt(n: number, dec = 1): string {
  const s = n.toFixed(dec)
  return (dec > 0 ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace(/^-0$/, '0')
}
/** Nível em metros a partir de cm: +2,80 */
export function fmtNivel(cm: number): string {
  const m = cm / 100
  return (m < 0 ? '-' : '+') + Math.abs(m).toFixed(2).replace('.', ',')
}
export const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)
export const nomeArquivo = (s: string) =>
  (s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().replace(/\s+/g, '_') || 'arquivo')

// ---------- geometria ----------
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const meio = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const arred = (v: number, passo: number) => (passo > 0 ? Math.round(v / passo) * passo : v)

export function cantosPilar(p: Pilar): Pt[] {
  const a = (p.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const hx = p.b / 2, hy = p.h / 2
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => ({ x: p.pos.x + x * c - y * s, y: p.pos.y + x * s + y * c }))
}
/** Retângulo de largura `larg` em torno do eixo a–b. */
export function faixa(a: Pt, b: Pt, larg: number): Pt[] {
  const d = dist(a, b) || 1
  const nx = (-(b.y - a.y) / d) * (larg / 2), ny = ((b.x - a.x) / d) * (larg / 2)
  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }]
}
export function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  if (l2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}
export function dentroPoligono(p: Pt, pts: Pt[]): boolean {
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}
/** Área com sinal (cm²). */
export function areaPoligono(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}
export function centroide(pts: Pt[]): Pt {
  const A = areaPoligono(pts)
  if (Math.abs(A) < 1e-6) {
    const n = pts.length || 1
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], f = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * f; cy += (a.y + b.y) * f
  }
  return { x: cx / (6 * A), y: cy / (6 * A) }
}

/** Ponto de referência do elemento (para marcadores de foto, seleção etc.). */
export function pontoRef(el: Elemento): Pt {
  switch (el.tipo) {
    case 'viga': case 'parede': case 'cota': return meio(el.a, el.b)
    case 'laje': return centroide(el.pts)
    default: return el.pos
  }
}
/** Todos os pontos que definem o elemento. */
export function pontosDe(el: Elemento): Pt[] {
  switch (el.tipo) {
    case 'pilar': return el.forma === 'circ'
      ? [{ x: el.pos.x - el.b / 2, y: el.pos.y - el.b / 2 }, { x: el.pos.x + el.b / 2, y: el.pos.y + el.b / 2 }]
      : cantosPilar(el)
    case 'viga': return faixa(el.a, el.b, el.bw)
    case 'parede': return faixa(el.a, el.b, el.esp)
    case 'cota': return [el.a, el.b]
    case 'laje': return el.pts
    default: return [el.pos]
  }
}
export function limites(pav: Pavimento): { minx: number; miny: number; maxx: number; maxy: number } | null {
  const pts: Pt[] = pav.elementos.flatMap(pontosDe)
  if (pav.fundo) {
    const f = pav.fundo
    pts.push({ x: f.x, y: f.y }, { x: f.x + f.w * f.cmPorPx, y: f.y - f.h * f.cmPorPx })
  }
  if (!pts.length) return null
  return {
    minx: Math.min(...pts.map((p) => p.x)), miny: Math.min(...pts.map((p) => p.y)),
    maxx: Math.max(...pts.map((p) => p.x)), maxy: Math.max(...pts.map((p) => p.y)),
  }
}
export function transladar<T extends Elemento>(el: T, dx: number, dy: number): T {
  const m = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy })
  const e = clonar(el) as Elemento
  switch (e.tipo) {
    case 'viga': case 'parede': case 'cota': e.a = m(e.a); e.b = m(e.b); break
    case 'laje': e.pts = e.pts.map(m); break
    default: e.pos = m(e.pos)
  }
  return e as T
}

export function proximoNome(pav: Pavimento, tipo: Tipo): string {
  const pre = PREFIXO[tipo]
  const re = new RegExp('^' + pre + '(\\d+)$')
  let max = 0
  for (const e of pav.elementos) {
    if (e.tipo !== tipo) continue
    const m = re.exec(e.nome)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return pre + (max + 1)
}

export const secaoPilar = (p: Pilar) => (p.forma === 'circ' ? `Ø${fmt(p.b)}` : `${fmt(p.b)}×${fmt(p.h)}`)
export const areaLajeM2 = (l: Laje) => Math.abs(areaPoligono(l.pts)) / 1e4
