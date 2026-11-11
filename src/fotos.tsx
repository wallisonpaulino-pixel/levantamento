// Fotos: miniaturas, captura e anotação (seta, traço livre e texto sobre a foto).
import { useEffect, useRef, useState } from 'react'
import type { FotoReg, ID, Pt, Traco } from './types'
import { atualizarFoto, imagemDaFoto, lerFoto, novaFoto, urlFoto } from './db'
import { comEspera, confirmar, pedirTexto } from './ui'

export function desenharTracos(ctx: CanvasRenderingContext2D, tracos: Traco[], w: number, h: number) {
  const base = Math.max(w, h)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const t of tracos) {
    if (!t.pts.length) continue
    const P = t.pts.map((p) => ({ x: p.x * w, y: p.y * h }))
    ctx.strokeStyle = t.cor; ctx.fillStyle = t.cor; ctx.lineWidth = base * 0.008
    if (t.k === 'livre') {
      ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y)
      for (const p of P.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    } else if (t.k === 'seta' && P.length >= 2) {
      const a = P[0], b = P[P.length - 1], ang = Math.atan2(b.y - a.y, b.x - a.x), c = base * 0.035
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - c * Math.cos(ang - 0.45), b.y - c * Math.sin(ang - 0.45))
      ctx.lineTo(b.x - c * Math.cos(ang + 0.45), b.y - c * Math.sin(ang + 0.45))
      ctx.closePath(); ctx.fill()
    } else if (t.k === 'texto' && t.texto) {
      ctx.font = `bold ${Math.round(base * 0.04)}px system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.lineWidth = base * 0.008; ctx.strokeStyle = t.cor === '#ffffff' ? '#000' : '#fff'
      ctx.strokeText(t.texto, P[0].x, P[0].y); ctx.fillText(t.texto, P[0].x, P[0].y)
    }
  }
}

/** Foto com as anotações aplicadas, pronta para o relatório. */
export async function renderFoto(id: ID, maxDim = 1600): Promise<{ foto: FotoReg; canvas: HTMLCanvasElement } | null> {
  const foto = await lerFoto(id)
  const img = await imagemDaFoto(id)
  if (!foto || !img) return null
  const esc = Math.min(1, maxDim / Math.max(foto.w, foto.h))
  const cv = document.createElement('canvas')
  cv.width = Math.round(foto.w * esc); cv.height = Math.round(foto.h * esc)
  const ctx = cv.getContext('2d')!
  ctx.drawImage(img, 0, 0, cv.width, cv.height)
  desenharTracos(ctx, foto.tracos, cv.width, cv.height)
  return { foto, canvas: cv }
}

const CORES = ['#ef4444', '#facc15', '#ffffff', '#22d3ee']

export function FotoAnotar(p: { id: ID; fechar: () => void; excluir: () => void }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [foto, setFoto] = useState<FotoReg | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [tracos, setTracos] = useState<Traco[]>([])
  const [legenda, setLegenda] = useState('')
  const [ferr, setFerr] = useState<'seta' | 'livre' | 'texto'>('seta')
  const [cor, setCor] = useState(CORES[0])
  const atual = useRef<Traco | null>(null)
  const [, forcar] = useState(0)

  useEffect(() => {
    let vivo = true
    Promise.all([lerFoto(p.id), imagemDaFoto(p.id)]).then(([f, i]) => {
      if (!vivo || !f) return
      setFoto(f); setImg(i); setTracos(f.tracos); setLegenda(f.legenda)
    })
    return () => { vivo = false }
  }, [p.id])

  const desenhar = () => {
    const cv = cvRef.current, area = areaRef.current
    if (!cv || !area || !foto || !img) return
    const esc = Math.min(area.clientWidth / foto.w, area.clientHeight / foto.h)
    const w = Math.max(1, Math.floor(foto.w * esc)), h = Math.max(1, Math.floor(foto.h * esc))
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      cv.style.width = w + 'px'; cv.style.height = h + 'px'
    }
    const ctx = cv.getContext('2d')!
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    desenharTracos(ctx, atual.current ? [...tracos, atual.current] : tracos, cv.width, cv.height)
  }
  useEffect(desenhar)
  useEffect(() => {
    const r = () => forcar((n) => n + 1)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  const ponto = (e: React.PointerEvent): Pt => {
    const r = cvRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }
  }
  const baixo = async (e: React.PointerEvent) => {
    const pt = ponto(e)
    if (ferr === 'texto') {
      const t = await pedirTexto('Texto na foto')
      if (t && t.trim()) setTracos((ts) => [...ts, { k: 'texto', cor, pts: [pt], texto: t.trim() }])
      return
    }
    try { cvRef.current!.setPointerCapture(e.pointerId) } catch { /* ponteiro já solto */ }
    atual.current = { k: ferr, cor, pts: [pt, pt] }
    desenhar()
  }
  const move = (e: React.PointerEvent) => {
    const a = atual.current
    if (!a) return
    const pt = ponto(e)
    if (a.k === 'seta') a.pts = [a.pts[0], pt]
    else a.pts.push(pt)
    desenhar()
  }
  const cima = () => {
    const a = atual.current
    atual.current = null
    if (!a) return
    const d = Math.hypot(a.pts[a.pts.length - 1].x - a.pts[0].x, a.pts[a.pts.length - 1].y - a.pts[0].y)
    if (a.k === 'seta' && d < 0.02) { desenhar(); return }
    setTracos((ts) => [...ts, a])
  }

  const concluir = async () => {
    await atualizarFoto(p.id, { legenda: legenda.trim(), tracos })
    p.fechar()
  }
  const apagar = async () => {
    if (await confirmar('Excluir esta foto?', 'A foto e as anotações serão apagadas.', { perigo: true, ok: 'Excluir' })) p.excluir()
  }

  return (
    <div className="tela-foto">
      <div className="barra">
        <button className="icone" aria-label="Excluir foto" onClick={apagar}>🗑</button>
        <div className="titulo"><strong>Foto</strong></div>
        <button className="bt primario pequeno" onClick={concluir}>Concluir</button>
      </div>
      <div className="foto-area" ref={areaRef}>
        {foto && img
          ? <canvas ref={cvRef} onPointerDown={baixo} onPointerMove={move} onPointerUp={cima} onPointerCancel={cima} />
          : <div className="girando" />}
      </div>
      <div className="foto-ferr">
        <div className="linha">
          {(['seta', 'livre', 'texto'] as const).map((f) => (
            <button key={f} className={'bt pequeno' + (ferr === f ? ' ativo' : '')} onClick={() => setFerr(f)}>
              {f === 'seta' ? '↗ Seta' : f === 'livre' ? '✎ Traço' : 'T Texto'}
            </button>
          ))}
          <button className="bt pequeno" disabled={!tracos.length} onClick={() => setTracos((ts) => ts.slice(0, -1))}>↶ Desfazer</button>
        </div>
        <div className="linha">
          {CORES.map((c) => (
            <button key={c} aria-label={'Cor ' + c} className={'cor' + (cor === c ? ' ativo' : '')} style={{ background: c }} onClick={() => setCor(c)} />
          ))}
        </div>
        <input className="legenda" placeholder="Legenda da foto" value={legenda} onChange={(e) => setLegenda(e.target.value)} />
      </div>
    </div>
  )
}

function Miniatura(p: { id: ID; versao: number; abrir: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [anotada, setAnotada] = useState(false)
  useEffect(() => {
    let vivo = true
    urlFoto(p.id).then((u) => vivo && setUrl(u))
    lerFoto(p.id).then((f) => { if (vivo && f) { setLegenda(f.legenda); setAnotada(f.tracos.length > 0) } })
    return () => { vivo = false }
  }, [p.id, p.versao])
  return (
    <button className="mini" onClick={p.abrir}>
      {url ? <img src={url} alt={legenda || 'Foto'} /> : <span className="girando" />}
      {anotada && <i>✎</i>}
      <small>{legenda || 'sem legenda'}</small>
    </button>
  )
}

/** Lista de fotos de um elemento ou da obra, com botões para fotografar e escolher da galeria. */
export function ListaFotos(p: { obraId: ID; ids: ID[]; onChange: (ids: ID[]) => void }) {
  const [aberta, setAberta] = useState<ID | null>(null)
  const [versao, setVersao] = useState(0)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  const adicionar = async (arqs: FileList | null) => {
    if (!arqs || !arqs.length) return
    const lista = Array.from(arqs)
    const novos = await comEspera('Guardando foto…', async () => {
      const ids: ID[] = []
      for (const a of lista) ids.push((await novaFoto(p.obraId, a)).id)
      return ids
    })
    if (novos?.length) p.onChange([...p.ids, ...novos])
  }

  return (
    <div className="fotos">
      <div className="grade-fotos">
        {p.ids.map((id) => <Miniatura key={id} id={id} versao={versao} abrir={() => setAberta(id)} />)}
        <button className="mini novo" onClick={() => camRef.current?.click()}><b>📷</b><small>Câmera</small></button>
        <button className="mini novo" onClick={() => galRef.current?.click()}><b>🖼</b><small>Galeria</small></button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} />
      {aberta && (
        <FotoAnotar
          id={aberta}
          fechar={() => { setAberta(null); setVersao((v) => v + 1) }}
          excluir={() => { const id = aberta; setAberta(null); p.onChange(p.ids.filter((x) => x !== id)) }}
        />
      )}
    </div>
  )
}
