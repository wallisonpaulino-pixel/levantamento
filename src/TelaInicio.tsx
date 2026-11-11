import { useEffect, useRef, useState } from 'react'
import type { Modo, Obra } from './types'
import { listarObras, pedirPersistencia, salvarObra } from './db'
import { importarBackup } from './exportar'
import { Barra, avisar, comEspera, confirmar, pedirTexto } from './ui'
import { dataBR, hoje, uid } from './util'

export function TelaInicio(p: { modos: Modo[]; abrir: (id: string) => void; abrirModos: () => void }) {
  const [obras, setObras] = useState<Obra[] | null>(null)
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const arqRef = useRef<HTMLInputElement>(null)
  const recarregar = () => listarObras().then(setObras)
  useEffect(() => { void recarregar(); pedirPersistencia().then(setPersistente) }, [])

  const nova = async () => {
    const nome = await pedirTexto('Nova obra', '', { rotulo: 'Nome da obra' })
    if (!nome || !nome.trim()) return
    const agora = Date.now()
    const obra: Obra = {
      id: uid(), nome: nome.trim(), endereco: '', cliente: '', responsavel: '', data: hoje(), obs: '',
      modoId: p.modos[0]?.id ?? 'forma', fotosGerais: [], criadoEm: agora, atualizadoEm: agora,
      pavimentos: [{ id: uid(), nome: 'Térreo', nivel: 0, peDireito: 0, elementos: [], fundo: null }],
    }
    await salvarObra(obra)
    p.abrir(obra.id)
  }
  const importar = async (arq: File | undefined) => {
    if (!arq) return
    const id = await comEspera('Importando backup…', () =>
      importarBackup(arq, (nome) => confirmar(`A obra "${nome}" já existe neste aparelho`, 'Substituir a obra existente pelo backup? Se cancelar, o backup entra como cópia.', { perigo: true, ok: 'Substituir' })))
    if (id) { await recarregar(); await avisar('Backup importado') }
  }

  return (
    <div className="pagina">
      <Barra titulo="Levantamento Estrutural" sub="Obras neste aparelho" />
      <main>
        <button className="bt primario grande" onClick={nova}>+ Nova obra</button>
        {obras === null ? <div className="girando" /> : obras.length === 0 ? (
          <div className="vazio">
            <p><strong>Nenhuma obra ainda.</strong></p>
            <p>Crie uma obra para começar o levantamento: pavimentos, planta de forma, seções, níveis, patologias e fotos.</p>
          </div>
        ) : (
          <ul className="lista">
            {obras.map((o) => {
              const n = o.pavimentos.reduce((s, pv) => s + pv.elementos.length, 0)
              return (
                <li key={o.id}>
                  <button onClick={() => p.abrir(o.id)}>
                    <strong>{o.nome}</strong>
                    <small>{dataBR(o.data)} · {o.pavimentos.length} pavimento{o.pavimentos.length === 1 ? '' : 's'} · {n} elemento{n === 1 ? '' : 's'}</small>
                    {o.endereco && <small>{o.endereco}</small>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="pilha topo">
          <button className="bt" onClick={p.abrirModos}>Modos de levantamento (fichas)</button>
          <button className="bt" onClick={() => arqRef.current?.click()}>Importar backup (.zip)</button>
        </div>
        <input ref={arqRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = '' }} />
        <p className="nota rodape">
          Os dados ficam guardados só neste aparelho.{' '}
          {persistente === false && 'O navegador ainda não garantiu guardar os dados de forma permanente: instale o app na tela inicial e faça backup de cada obra. '}
          Faça o backup (ZIP) ao fim de cada visita.
        </p>
      </main>
    </div>
  )
}
