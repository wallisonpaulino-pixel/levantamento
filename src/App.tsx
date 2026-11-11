import { useEffect, useState } from 'react'
import type { ID, Modo } from './types'
import { useModos, useObra } from './estado'
import { Barra, Dialogos } from './ui'
import { TelaInicio } from './TelaInicio'
import { TelaObra, exportarDxfPav } from './TelaObra'
import { TelaModos } from './TelaModos'
import { Editor } from './Editor'

const ir = (h: string) => { window.location.hash = h }

function ComObra(p: { id: ID; pavId: ID | null; modos: Modo[] }) {
  const { obra, pronto, mutar, gravar } = useObra(p.id)
  if (!pronto) return <div className="pagina"><Barra titulo="Abrindo…" /><main><div className="girando" /></main></div>
  if (!obra)
    return (
      <div className="pagina">
        <Barra titulo="Obra não encontrada" voltar={() => ir('')} />
        <main><p className="nota">Esta obra não existe mais neste aparelho.</p></main>
      </div>
    )
  const pav = p.pavId ? obra.pavimentos.find((x) => x.id === p.pavId) : null
  const modo = p.modos.find((m) => m.id === obra.modoId) ?? p.modos[0]
  if (pav)
    return <Editor key={pav.id} obra={obra} pav={pav} modo={modo} mutar={mutar} voltar={() => { gravar(); ir(`#/obra/${obra.id}`) }} exportarDxf={() => void exportarDxfPav(obra, pav)} />
  return (
    <TelaObra obra={obra} modos={p.modos} mutar={mutar} voltar={() => { gravar(); ir('') }}
      abrirPav={(pid) => ir(`#/obra/${obra.id}/pav/${pid}`)} aoExcluir={() => ir('')} />
  )
}

export function App() {
  const [hash, setHash] = useState(window.location.hash)
  const { modos, gravar } = useModos()
  useEffect(() => {
    const f = () => setHash(window.location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const partes = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  let tela
  if (!modos) tela = <div className="pagina"><Barra titulo="Levantamento Estrutural" /><main><div className="girando" /></main></div>
  else if (partes[0] === 'modos') tela = <TelaModos modos={modos} gravar={gravar} voltar={() => ir('')} />
  else if (partes[0] === 'obra' && partes[1]) tela = <ComObra key={partes[1]} id={partes[1]} pavId={partes[2] === 'pav' ? partes[3] ?? null : null} modos={modos} />
  else tela = <TelaInicio modos={modos} abrir={(id) => ir(`#/obra/${id}`)} abrirModos={() => ir('#/modos')} />

  return <>{tela}<Dialogos /></>
}
