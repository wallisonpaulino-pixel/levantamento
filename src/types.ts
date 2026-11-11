// Modelo de dados. Coordenadas do desenho em centímetros, com Y para cima (como no CAD).
export type ID = string
export interface Pt { x: number; y: number }

export type Tipo = 'pilar' | 'viga' | 'laje' | 'parede' | 'cota' | 'nivel' | 'patologia' | 'foto' | 'nota'
export type ValorCampo = string | number | boolean

interface Base {
  id: ID
  nome: string
  campos: Record<string, ValorCampo> // campos da ficha, definidos pelo modo de levantamento
  fotos: ID[]
  obs: string
}

export interface Pilar extends Base { tipo: 'pilar'; pos: Pt; forma: 'ret' | 'circ'; b: number; h: number; rot: number }
export interface Viga extends Base { tipo: 'viga'; a: Pt; b: Pt; bw: number; h: number }
export interface Laje extends Base { tipo: 'laje'; pts: Pt[]; esp: number }
export interface Parede extends Base { tipo: 'parede'; a: Pt; b: Pt; esp: number }
export type OrigemMedida = 'manual' | 'laser' | 'ar'
/** valor = medida de campo (cm); null enquanto não foi medida. afast = distância da linha de cota ao trecho. */
export interface Cota extends Base { tipo: 'cota'; a: Pt; b: Pt; valor: number | null; origem: OrigemMedida; afast: number }
/** valor em cm, relativo ao piso do pavimento. */
export interface Nivel extends Base { tipo: 'nivel'; pos: Pt; valor: number; ref: string }
export interface Patologia extends Base { tipo: 'patologia'; pos: Pt }
export interface FotoMarca extends Base { tipo: 'foto'; pos: Pt }
export interface Nota extends Base { tipo: 'nota'; pos: Pt; texto: string }

export type Elemento = Pilar | Viga | Laje | Parede | Cota | Nivel | Patologia | FotoMarca | Nota

/** Imagem de planta usada como base de desenho. (x, y) = canto superior esquerdo no desenho. */
export interface Fundo { fotoId: ID; cmPorPx: number; x: number; y: number; opac: number; w: number; h: number }

export interface Pavimento {
  id: ID
  nome: string
  nivel: number // cota do piso em cm
  peDireito: number // cm; 0 = não informado
  elementos: Elemento[]
  fundo: Fundo | null
}

export interface Obra {
  id: ID
  nome: string
  endereco: string
  cliente: string
  responsavel: string
  data: string // aaaa-mm-dd
  obs: string
  modoId: ID
  pavimentos: Pavimento[]
  fotosGerais: ID[]
  criadoEm: number
  atualizadoEm: number
}

export interface Traco { k: 'livre' | 'seta' | 'texto'; cor: string; pts: Pt[]; texto?: string } // pts normalizados 0..1
export interface FotoReg {
  id: ID
  obraId: ID
  dados: ArrayBuffer
  mime: string
  w: number
  h: number
  legenda: string
  tracos: Traco[]
  criadaEm: number
}

export interface Campo {
  key: string
  label: string
  tipo: 'texto' | 'numero' | 'opcao' | 'simnao'
  unidade?: string
  opcoes?: string[]
}
/** Modo de levantamento: quais ferramentas aparecem e quais campos cada tipo de elemento tem. */
export interface Modo {
  id: ID
  nome: string
  ferramentas: Tipo[]
  campos: Partial<Record<Tipo, Campo[]>>
}

export const TIPOS: Tipo[] = ['pilar', 'viga', 'laje', 'parede', 'cota', 'nivel', 'patologia', 'foto', 'nota']
export const NOME_TIPO: Record<Tipo, string> = {
  pilar: 'Pilar', viga: 'Viga', laje: 'Laje', parede: 'Parede', cota: 'Cota',
  nivel: 'Nível', patologia: 'Patologia', foto: 'Foto', nota: 'Nota',
}
export const PREFIXO: Record<Tipo, string> = {
  pilar: 'P', viga: 'V', laje: 'L', parede: 'PAR', cota: 'C', nivel: 'N', patologia: 'PAT', foto: 'F', nota: 'NT',
}
