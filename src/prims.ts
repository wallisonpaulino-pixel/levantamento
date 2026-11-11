// Converte os elementos em primitivas de desenho (linha, polígono, círculo, texto).
// A mesma lista alimenta a tela, o PDF e o DXF, para os três baterem.
import type { Cota, Elemento, Pavimento, Pt } from './types'
import { cantosPilar, centroide, dist, faixa, fmt, fmtNivel, meio, secaoPilar } from './util'

export type Prim =
  | { k: 'linha'; a: Pt; b: Pt; camada: string }
  | { k: 'poli'; pts: Pt[]; fechado: boolean; camada: string; preench?: boolean }
  | { k: 'circ'; c: Pt; r: number; camada: string; preench?: boolean }
  | { k: 'texto'; p: Pt; t: string; h: number; camada: string; alinh: 'e' | 'c' | 'd'; rot: number; negrito?: boolean }

/** cor na tela, cor no PDF (RGB) e cor no DXF (índice AutoCAD). */
export const CAMADAS: Record<string, { cor: string; rgb: [number, number, number]; aci: number }> = {
  PILARES: { cor: '#111827', rgb: [17, 24, 39], aci: 7 },
  VIGAS: { cor: '#1d4ed8', rgb: [29, 78, 216], aci: 5 },
  LAJES: { cor: '#047857', rgb: [4, 120, 87], aci: 3 },
  PAREDES: { cor: '#6b7280', rgb: [107, 114, 128], aci: 8 },
  COTAS: { cor: '#b45309', rgb: [180, 83, 9], aci: 30 },
  NIVEIS: { cor: '#7c3aed', rgb: [124, 58, 237], aci: 6 },
  PATOLOGIAS: { cor: '#dc2626', rgb: [220, 38, 38], aci: 1 },
  FOTOS: { cor: '#0e7490', rgb: [14, 116, 144], aci: 4 },
  NOTAS: { cor: '#374151', rgb: [55, 65, 81], aci: 9 },
}
export const camadaBase = (c: string) => c.replace(/^TXT_/, '')

const H_TXT = 12 // altura de texto no desenho, em cm
const H_COTA = 10

/** Ângulo (graus) para o texto ficar legível ao longo de a→b. */
function anguloLegivel(a: Pt, b: Pt): number {
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (ang > 90.01 || ang <= -89.99) ang += 180
  if (ang > 180) ang -= 360
  return ang
}
function acima(p: Pt, angGraus: number, d: number): Pt {
  const r = (angGraus * Math.PI) / 180
  return { x: p.x - Math.sin(r) * d, y: p.y + Math.cos(r) * d }
}

export function pontosCota(c: Cota): { a2: Pt; b2: Pt; n: Pt; u: Pt } | null {
  const d = dist(c.a, c.b)
  if (d < 0.01) return null
  const u = { x: (c.b.x - c.a.x) / d, y: (c.b.y - c.a.y) / d }
  const n = { x: -u.y, y: u.x }
  return {
    a2: { x: c.a.x + n.x * c.afast, y: c.a.y + n.y * c.afast },
    b2: { x: c.b.x + n.x * c.afast, y: c.b.y + n.y * c.afast },
    n, u,
  }
}
export const textoCota = (c: Cota) => (c.valor != null ? fmt(c.valor) : '~' + fmt(dist(c.a, c.b)))

export function primsElemento(el: Elemento, pav: Pavimento): Prim[] {
  const out: Prim[] = []
  switch (el.tipo) {
    case 'pilar': {
      if (el.forma === 'circ') out.push({ k: 'circ', c: el.pos, r: el.b / 2, camada: 'PILARES', preench: true })
      else out.push({ k: 'poli', pts: cantosPilar(el), fechado: true, camada: 'PILARES', preench: true })
      const pts = el.forma === 'circ' ? [{ x: el.pos.x + el.b / 2, y: el.pos.y + el.b / 2 }] : cantosPilar(el)
      const mx = Math.max(...pts.map((p) => p.x)), my = Math.max(...pts.map((p) => p.y))
      out.push({ k: 'texto', p: { x: mx + 4, y: my + 4 }, t: el.nome, h: H_TXT, camada: 'TXT_PILARES', alinh: 'e', rot: 0, negrito: true })
      out.push({ k: 'texto', p: { x: mx + 4, y: my + 4 - H_TXT * 1.25 }, t: secaoPilar(el), h: H_TXT * 0.85, camada: 'TXT_PILARES', alinh: 'e', rot: 0 })
      break
    }
    case 'viga': {
      out.push({ k: 'poli', pts: faixa(el.a, el.b, el.bw), fechado: true, camada: 'VIGAS' })
      const ang = anguloLegivel(el.a, el.b)
      out.push({ k: 'texto', p: acima(meio(el.a, el.b), ang, el.bw / 2 + 4), t: `${el.nome} ${fmt(el.bw)}×${fmt(el.h)}`, h: H_TXT, camada: 'TXT_VIGAS', alinh: 'c', rot: ang })
      break
    }
    case 'parede': {
      out.push({ k: 'poli', pts: faixa(el.a, el.b, el.esp), fechado: true, camada: 'PAREDES' })
      break
    }
    case 'laje': {
      out.push({ k: 'poli', pts: el.pts, fechado: true, camada: 'LAJES' })
      const c = centroide(el.pts)
      out.push({ k: 'texto', p: { x: c.x, y: c.y + 3 }, t: el.nome, h: H_TXT * 1.2, camada: 'TXT_LAJES', alinh: 'c', rot: 0, negrito: true })
      out.push({ k: 'texto', p: { x: c.x, y: c.y - H_TXT * 1.2 }, t: `h=${fmt(el.esp)}`, h: H_TXT, camada: 'TXT_LAJES', alinh: 'c', rot: 0 })
      break
    }
    case 'cota': {
      const g = pontosCota(el)
      if (!g) break
      const { a2, b2, n, u } = g
      const s = el.afast >= 0 ? 1 : -1
      // linhas de chamada, linha de cota e traços a 45°
      out.push({ k: 'linha', a: { x: el.a.x + n.x * s * 3, y: el.a.y + n.y * s * 3 }, b: { x: a2.x + n.x * s * 5, y: a2.y + n.y * s * 5 }, camada: 'COTAS' })
      out.push({ k: 'linha', a: { x: el.b.x + n.x * s * 3, y: el.b.y + n.y * s * 3 }, b: { x: b2.x + n.x * s * 5, y: b2.y + n.y * s * 5 }, camada: 'COTAS' })
      out.push({ k: 'linha', a: { x: a2.x - u.x * 5, y: a2.y - u.y * 5 }, b: { x: b2.x + u.x * 5, y: b2.y + u.y * 5 }, camada: 'COTAS' })
      const t = { x: (u.x + n.x) * 4, y: (u.y + n.y) * 4 }
      for (const p of [a2, b2]) out.push({ k: 'linha', a: { x: p.x - t.x, y: p.y - t.y }, b: { x: p.x + t.x, y: p.y + t.y }, camada: 'COTAS' })
      const ang = anguloLegivel(a2, b2)
      out.push({ k: 'texto', p: acima(meio(a2, b2), ang, 3), t: textoCota(el), h: H_COTA, camada: 'TXT_COTAS', alinh: 'c', rot: ang })
      break
    }
    case 'nivel': {
      const p = el.pos, r = 7
      out.push({ k: 'poli', pts: [p, { x: p.x - r, y: p.y + r * 1.4 }, { x: p.x + r, y: p.y + r * 1.4 }], fechado: true, camada: 'NIVEIS', preench: true })
      out.push({ k: 'linha', a: { x: p.x - r, y: p.y + r * 1.4 }, b: { x: p.x + 60, y: p.y + r * 1.4 }, camada: 'NIVEIS' })
      out.push({ k: 'texto', p: { x: p.x + r + 3, y: p.y + r * 1.4 + 3 }, t: fmtNivel(pav.nivel + el.valor), h: H_TXT, camada: 'TXT_NIVEIS', alinh: 'e', rot: 0, negrito: true })
      if (el.ref) out.push({ k: 'texto', p: { x: p.x + r + 3, y: p.y + r * 1.4 - H_TXT * 0.9 - 2 }, t: el.ref, h: H_TXT * 0.75, camada: 'TXT_NIVEIS', alinh: 'e', rot: 0 })
      break
    }
    case 'patologia': {
      const p = el.pos, r = 8, d = r * 0.7
      out.push({ k: 'circ', c: p, r, camada: 'PATOLOGIAS' })
      out.push({ k: 'linha', a: { x: p.x - d, y: p.y - d }, b: { x: p.x + d, y: p.y + d }, camada: 'PATOLOGIAS' })
      out.push({ k: 'linha', a: { x: p.x - d, y: p.y + d }, b: { x: p.x + d, y: p.y - d }, camada: 'PATOLOGIAS' })
      out.push({ k: 'texto', p: { x: p.x + r + 3, y: p.y - H_TXT / 2 }, t: el.nome, h: H_TXT, camada: 'TXT_PATOLOGIAS', alinh: 'e', rot: 0, negrito: true })
      break
    }
    case 'foto': {
      const p = el.pos, r = 9
      out.push({ k: 'circ', c: p, r, camada: 'FOTOS' })
      out.push({ k: 'circ', c: p, r: r * 0.4, camada: 'FOTOS', preench: true })
      out.push({ k: 'texto', p: { x: p.x + r + 3, y: p.y - H_TXT / 2 }, t: el.nome, h: H_TXT, camada: 'TXT_FOTOS', alinh: 'e', rot: 0 })
      break
    }
    case 'nota': {
      out.push({ k: 'circ', c: el.pos, r: 2, camada: 'NOTAS', preench: true })
      out.push({ k: 'texto', p: { x: el.pos.x + 5, y: el.pos.y - H_TXT / 2 }, t: el.texto || el.nome, h: H_TXT, camada: 'TXT_NOTAS', alinh: 'e', rot: 0 })
      break
    }
  }
  return out
}

/** Ordem de desenho: lajes por baixo, marcações por cima. */
const ORDEM: Record<string, number> = { laje: 0, parede: 1, viga: 2, pilar: 3, cota: 4, nivel: 5, patologia: 6, foto: 7, nota: 8 }
export const emOrdem = (els: Elemento[]) => [...els].sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo])

export function primsPavimento(pav: Pavimento): Prim[] {
  return emOrdem(pav.elementos).flatMap((e) => primsElemento(e, pav))
}

export function limitesPrims(prims: Prim[]): { minx: number; miny: number; maxx: number; maxy: number } | null {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  const inc = (p: Pt, m = 0) => {
    minx = Math.min(minx, p.x - m); miny = Math.min(miny, p.y - m)
    maxx = Math.max(maxx, p.x + m); maxy = Math.max(maxy, p.y + m)
  }
  for (const p of prims) {
    if (p.k === 'linha') { inc(p.a); inc(p.b) }
    else if (p.k === 'poli') p.pts.forEach((q) => inc(q))
    else if (p.k === 'circ') inc(p.c, p.r)
    else inc(p.p, p.h * 2)
  }
  return isFinite(minx) ? { minx, miny, maxx, maxy } : null
}
