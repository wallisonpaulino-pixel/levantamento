// Peças de interface reutilizadas: diálogos, campos e folha inferior.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmt, parseNum } from './util'

type Pedido =
  | { tipo: 'confirmar'; titulo: string; msg?: string; perigo?: boolean; ok?: string; resolver: (v: boolean) => void }
  | { tipo: 'pedir'; titulo: string; valor: string; rotulo?: string; numero?: boolean; resolver: (v: string | null) => void }
  | { tipo: 'aviso'; titulo: string; msg?: string; resolver: () => void }
  | { tipo: 'arquivo'; blob: Blob; nome: string; resolver: () => void }
  | { tipo: 'ocupado'; titulo: string }

let definir: ((p: Pedido | null) => void) | null = null

export const confirmar = (titulo: string, msg?: string, op?: { perigo?: boolean; ok?: string }) =>
  new Promise<boolean>((r) => definir?.({ tipo: 'confirmar', titulo, msg, perigo: op?.perigo, ok: op?.ok, resolver: r }))
export const pedirTexto = (titulo: string, valor = '', op?: { rotulo?: string; numero?: boolean }) =>
  new Promise<string | null>((r) => definir?.({ tipo: 'pedir', titulo, valor, rotulo: op?.rotulo, numero: op?.numero, resolver: r }))
export const avisar = (titulo: string, msg?: string) => new Promise<void>((r) => definir?.({ tipo: 'aviso', titulo, msg, resolver: r }))
export const entregarArquivo = (blob: Blob, nome: string) => new Promise<void>((r) => definir?.({ tipo: 'arquivo', blob, nome, resolver: r }))

/** Mostra "aguarde" enquanto a tarefa roda; erros viram aviso. */
export async function comEspera<T>(titulo: string, tarefa: () => Promise<T>): Promise<T | undefined> {
  definir?.({ tipo: 'ocupado', titulo })
  await new Promise((r) => setTimeout(r, 30))
  try {
    const v = await tarefa()
    definir?.(null)
    return v
  } catch (e) {
    console.error(e)
    await avisar('Não foi possível concluir', e instanceof Error ? e.message : String(e))
    return undefined
  }
}

export function Dialogos() {
  const [p, setP] = useState<Pedido | null>(null)
  const [txt, setTxt] = useState('')
  useEffect(() => { definir = setP; return () => { definir = null } }, [])
  useEffect(() => { if (p?.tipo === 'pedir') setTxt(p.valor) }, [p])
  if (!p) return null
  const fechar = () => setP(null)

  if (p.tipo === 'ocupado')
    return <div className="veu"><div className="dialogo"><div className="girando" /><p className="centro">{p.titulo}</p></div></div>

  if (p.tipo === 'arquivo') {
    const arq = new File([p.blob], p.nome, { type: p.blob.type || 'application/octet-stream' })
    const podeCompartilhar = !!navigator.canShare && navigator.canShare({ files: [arq] })
    const baixar = () => {
      const url = URL.createObjectURL(p.blob)
      const a = document.createElement('a')
      a.href = url; a.download = p.nome
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
    const compartilhar = async () => {
      try { await navigator.share({ files: [arq], title: p.nome }) } catch { /* cancelado */ }
    }
    return (
      <div className="veu">
        <div className="dialogo">
          <h3>Arquivo pronto</h3>
          <p className="quebra">{p.nome} · {fmt(p.blob.size / 1024 / 1024, 2)} MB</p>
          <div className="pilha">
            {podeCompartilhar && <button className="bt primario" onClick={compartilhar}>Compartilhar / salvar em Arquivos</button>}
            <button className={'bt' + (podeCompartilhar ? '' : ' primario')} onClick={baixar}>Baixar</button>
            <button className="bt fantasma" onClick={() => { fechar(); p.resolver() }}>Fechar</button>
          </div>
        </div>
      </div>
    )
  }

  if (p.tipo === 'aviso')
    return (
      <div className="veu">
        <div className="dialogo">
          <h3>{p.titulo}</h3>
          {p.msg && <p className="quebra">{p.msg}</p>}
          <div className="linha fim"><button className="bt primario" onClick={() => { fechar(); p.resolver() }}>OK</button></div>
        </div>
      </div>
    )

  if (p.tipo === 'confirmar')
    return (
      <div className="veu">
        <div className="dialogo">
          <h3>{p.titulo}</h3>
          {p.msg && <p className="quebra">{p.msg}</p>}
          <div className="linha fim">
            <button className="bt fantasma" onClick={() => { fechar(); p.resolver(false) }}>Cancelar</button>
            <button className={'bt ' + (p.perigo ? 'perigo' : 'primario')} onClick={() => { fechar(); p.resolver(true) }}>{p.ok ?? 'Confirmar'}</button>
          </div>
        </div>
      </div>
    )

  const enviar = () => { fechar(); p.resolver(txt) }
  return (
    <div className="veu">
      <form className="dialogo" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <h3>{p.titulo}</h3>
        <label className="campo">
          {p.rotulo && <span>{p.rotulo}</span>}
          <input autoFocus value={txt} inputMode={p.numero ? 'decimal' : 'text'} onChange={(e) => setTxt(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="linha fim">
          <button type="button" className="bt fantasma" onClick={() => { fechar(); p.resolver(null) }}>Cancelar</button>
          <button type="submit" className="bt primario">OK</button>
        </div>
      </form>
    </div>
  )
}

// ---------- campos ----------
export function CampoTexto(p: { rotulo: string; valor: string; onChange: (v: string) => void; multilinha?: boolean; tipo?: string; dica?: string }) {
  return (
    <label className="campo">
      <span>{p.rotulo}</span>
      {p.multilinha
        ? <textarea rows={3} value={p.valor} placeholder={p.dica} onChange={(e) => p.onChange(e.target.value)} />
        : <input type={p.tipo ?? 'text'} value={p.valor} placeholder={p.dica} onChange={(e) => p.onChange(e.target.value)} />}
    </label>
  )
}

/** Campo numérico que aceita vírgula. Chama onChange só com número válido (ou null quando vazio e permitido). */
export function CampoNum(p: { rotulo: string; valor: number | null; onChange: (v: number | null) => void; unidade?: string; dec?: number; vazio?: boolean; min?: number }) {
  const texto = (v: number | null) => (v == null ? '' : fmt(v, p.dec ?? 2))
  const [txt, setTxt] = useState(texto(p.valor))
  const foco = useRef(false)
  useEffect(() => { if (!foco.current) setTxt(texto(p.valor)) }, [p.valor]) // eslint-disable-line react-hooks/exhaustive-deps
  const invalido = txt.trim() !== '' && parseNum(txt) == null
  return (
    <label className="campo">
      <span>{p.rotulo}{p.unidade ? ` (${p.unidade})` : ''}</span>
      <input
        inputMode="decimal" value={txt} className={invalido ? 'invalido' : ''}
        onFocus={(e) => { foco.current = true; e.target.select() }}
        onBlur={() => { foco.current = false; setTxt(texto(p.valor)) }}
        onChange={(e) => {
          const t = e.target.value
          setTxt(t)
          const n = parseNum(t)
          if (n == null) { if (t.trim() === '' && p.vazio) p.onChange(null); return }
          if (p.min != null && n < p.min) return
          p.onChange(n)
        }}
      />
    </label>
  )
}

export function CampoOpcao(p: { rotulo: string; valor: string; opcoes: (string | { v: string; t: string })[]; onChange: (v: string) => void; vazio?: boolean }) {
  return (
    <label className="campo">
      <span>{p.rotulo}</span>
      <select value={p.valor} onChange={(e) => p.onChange(e.target.value)}>
        {p.vazio && <option value="">—</option>}
        {p.opcoes.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.t}</option>))}
      </select>
    </label>
  )
}

export function Barra(p: { titulo: string; sub?: string; voltar?: () => void; children?: ReactNode }) {
  return (
    <header className="barra">
      {p.voltar && <button className="icone" aria-label="Voltar" onClick={p.voltar}>‹</button>}
      <div className="titulo">
        <strong>{p.titulo}</strong>
        {p.sub && <small>{p.sub}</small>}
      </div>
      {p.children}
    </header>
  )
}

export function Folha(p: { titulo: string; fechar: () => void; children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="veu baixo" onClick={(e) => { if (e.target === e.currentTarget) p.fechar() }}>
      <div className="folha">
        <div className="folha-topo">
          <strong>{p.titulo}</strong>
          <div className="linha">{p.acoes}<button className="bt primario pequeno" onClick={p.fechar}>Concluir</button></div>
        </div>
        <div className="folha-corpo">{p.children}</div>
      </div>
    </div>
  )
}
