// Carrega a obra aberta, aplica alterações e grava sozinho no aparelho.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ID, Modo, Obra } from './types'
import { excluirFoto, fotosDaObra, lerModos, lerObra, salvarModos, salvarObra } from './db'
import { clonar } from './util'
import { idsUsados } from './exportar'

export function useObra(id: ID) {
  const [obra, setObra] = useState<Obra | null>(null)
  const [pronto, setPronto] = useState(false)
  const atual = useRef<Obra | null>(null)
  const sujo = useRef(false)
  const timer = useRef<number>(0)

  const gravar = useCallback(() => {
    window.clearTimeout(timer.current)
    if (sujo.current && atual.current) { sujo.current = false; void salvarObra(atual.current) }
  }, [])

  useEffect(() => {
    let vivo = true
    setPronto(false)
    lerObra(id).then(async (o) => {
      if (!vivo) return
      atual.current = o ?? null
      setObra(o ?? null); setPronto(true)
      if (o) {
        // fotos que ficaram sem dono (elemento excluído) são apagadas ao abrir a obra
        const usadas = new Set(idsUsados(o))
        for (const f of await fotosDaObra(o.id)) if (!usadas.has(f.id)) await excluirFoto(f.id)
      }
    })
    const aoSair = () => gravar()
    const aoOcultar = () => { if (document.visibilityState === 'hidden') gravar() }
    window.addEventListener('pagehide', aoSair)
    document.addEventListener('visibilitychange', aoOcultar)
    return () => { vivo = false; gravar(); window.removeEventListener('pagehide', aoSair); document.removeEventListener('visibilitychange', aoOcultar) }
  }, [id, gravar])

  const mutar = useCallback((fn: (o: Obra) => void) => {
    if (!atual.current) return
    const novo = clonar(atual.current)
    fn(novo)
    novo.atualizadoEm = Date.now()
    atual.current = novo
    sujo.current = true
    setObra(novo)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(gravar, 400)
  }, [gravar])

  return { obra, pronto, mutar, gravar }
}

export function useModos() {
  const [modos, setModos] = useState<Modo[] | null>(null)
  useEffect(() => { lerModos().then(setModos) }, [])
  const gravar = useCallback((m: Modo[]) => { setModos(m); void salvarModos(m) }, [])
  return { modos, gravar }
}
