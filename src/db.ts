// Armazenamento local (IndexedDB). Os dados ficam só no aparelho.
import { openDB } from 'idb'
import type { FotoReg, ID, Modo, Obra, Traco } from './types'
import { modosPadrao } from './modos'
import { uid } from './util'

const dbp = openDB('levantamento-estrutural', 1, {
  upgrade(db) {
    db.createObjectStore('obras', { keyPath: 'id' })
    const f = db.createObjectStore('fotos', { keyPath: 'id' })
    f.createIndex('obraId', 'obraId')
    db.createObjectStore('kv')
  },
})

export async function listarObras(): Promise<Obra[]> {
  const todas = (await (await dbp).getAll('obras')) as Obra[]
  return todas.sort((a, b) => b.atualizadoEm - a.atualizadoEm)
}
export const lerObra = async (id: ID) => (await (await dbp).get('obras', id)) as Obra | undefined
export const salvarObra = async (o: Obra) => { await (await dbp).put('obras', o) }
export async function excluirObra(id: ID) {
  const db = await dbp
  const tx = db.transaction(['obras', 'fotos'], 'readwrite')
  const chaves = await tx.objectStore('fotos').index('obraId').getAllKeys(id)
  for (const k of chaves) { await tx.objectStore('fotos').delete(k); esquecerUrl(String(k)) }
  await tx.objectStore('obras').delete(id)
  await tx.done
}

// ---------- fotos ----------
const urls = new Map<ID, string>()
function esquecerUrl(id: ID) {
  const u = urls.get(id)
  if (u) { URL.revokeObjectURL(u); urls.delete(id) }
}
export const lerFoto = async (id: ID) => (await (await dbp).get('fotos', id)) as FotoReg | undefined
export const fotosDaObra = async (obraId: ID) => (await (await dbp).getAllFromIndex('fotos', 'obraId', obraId)) as FotoReg[]
export async function salvarFoto(f: FotoReg) { await (await dbp).put('fotos', f) }
export async function excluirFoto(id: ID) { await (await dbp).delete('fotos', id); esquecerUrl(id) }
export async function atualizarFoto(id: ID, mud: { legenda?: string; tracos?: Traco[] }) {
  const f = await lerFoto(id)
  if (f) await salvarFoto({ ...f, ...mud })
}
/** URL para exibir a foto original (sem anotações). */
export async function urlFoto(id: ID): Promise<string | null> {
  const ja = urls.get(id)
  if (ja) return ja
  const f = await lerFoto(id)
  if (!f) return null
  const u = URL.createObjectURL(new Blob([f.dados], { type: f.mime }))
  urls.set(id, u)
  return u
}

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => erro(new Error('Não foi possível ler a imagem.'))
    img.src = src
  })
}
export async function imagemDaFoto(id: ID): Promise<HTMLImageElement | null> {
  const u = await urlFoto(id)
  return u ? carregarImg(u) : null
}

/** Reduz e converte a imagem escolhida para JPEG e grava como foto da obra. */
export async function novaFoto(obraId: ID, arq: Blob, maxDim = 2000): Promise<FotoReg> {
  const url = URL.createObjectURL(arq)
  try {
    const img = await carregarImg(url)
    const esc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * esc)), h = Math.max(1, Math.round(img.naturalHeight * esc))
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Não foi possível processar a imagem.')
    const reg: FotoReg = { id: uid(), obraId, dados: await blob.arrayBuffer(), mime: 'image/jpeg', w, h, legenda: '', tracos: [], criadaEm: Date.now() }
    await salvarFoto(reg)
    return reg
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ---------- modos de levantamento ----------
export async function lerModos(): Promise<Modo[]> {
  const m = (await (await dbp).get('kv', 'modos')) as Modo[] | undefined
  return m && m.length ? m : modosPadrao()
}
export async function salvarModos(m: Modo[]) { await (await dbp).put('kv', m, 'modos') }

/** Pede ao navegador para não apagar os dados automaticamente. */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch { /* sem suporte */ }
  return false
}
