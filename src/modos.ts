import type { Campo, Modo, Tipo } from './types'

const CONSERVACAO: Campo = { key: 'conservacao', label: 'Estado de conservação', tipo: 'opcao', opcoes: ['Bom', 'Regular', 'Ruim', 'Crítico'] }

const PATOLOGIA: Campo[] = [
  { key: 'pat_tipo', label: 'Tipo', tipo: 'opcao', opcoes: ['Fissura', 'Trinca', 'Corrosão de armadura', 'Armadura exposta', 'Desplacamento de concreto', 'Infiltração / umidade', 'Eflorescência', 'Deformação / flecha', 'Ninho de concretagem', 'Recalque', 'Outro'] },
  { key: 'pat_elemento', label: 'Elemento afetado', tipo: 'texto' },
  { key: 'pat_abertura', label: 'Abertura', tipo: 'numero', unidade: 'mm' },
  { key: 'pat_comprimento', label: 'Comprimento', tipo: 'numero', unidade: 'cm' },
  { key: 'pat_direcao', label: 'Direção', tipo: 'opcao', opcoes: ['Vertical', 'Horizontal', 'Inclinada', 'Mapeada'] },
  { key: 'pat_atividade', label: 'Atividade', tipo: 'opcao', opcoes: ['Não verificada', 'Ativa', 'Passiva'] },
  { key: 'pat_gravidade', label: 'Gravidade', tipo: 'opcao', opcoes: ['Baixa', 'Média', 'Alta'] },
]

const MATERIAL: Campo[] = [
  { key: 'fck', label: 'fck estimado', tipo: 'numero', unidade: 'MPa' },
  { key: 'cobrimento', label: 'Cobrimento', tipo: 'numero', unidade: 'mm' },
  { key: 'arm_long', label: 'Armadura longitudinal', tipo: 'texto' },
  { key: 'estribos', label: 'Estribos', tipo: 'texto' },
  { key: 'esclerometria', label: 'Índice esclerométrico', tipo: 'numero' },
  { key: 'carbonatacao', label: 'Profundidade de carbonatação', tipo: 'numero', unidade: 'mm' },
]

const LAJE_TIPO: Campo = { key: 'laje_tipo', label: 'Tipo de laje', tipo: 'opcao', opcoes: ['Maciça', 'Nervurada', 'Pré-moldada treliçada', 'Steel deck', 'Outro'] }
const LAJE_REFORCO: Campo[] = [
  LAJE_TIPO,
  { key: 'laje_armadura', label: 'Armadura', tipo: 'texto' },
  { key: 'laje_revest', label: 'Contrapiso / revestimento', tipo: 'numero', unidade: 'cm' },
  { key: 'cobrimento', label: 'Cobrimento', tipo: 'numero', unidade: 'mm' },
]

const FUNDACAO: Campo[] = [
  { key: 'fund_tipo', label: 'Tipo de fundação', tipo: 'opcao', opcoes: ['Sapata', 'Bloco sobre estacas', 'Estaca', 'Tubulão', 'Radier', 'Não identificada'] },
  { key: 'fund_dim', label: 'Dimensões da fundação', tipo: 'texto' },
  { key: 'fund_prof', label: 'Profundidade', tipo: 'numero', unidade: 'cm' },
  { key: 'fund_solo', label: 'Solo observado', tipo: 'texto' },
]

const TODAS: Tipo[] = ['pilar', 'viga', 'laje', 'parede', 'cota', 'nivel', 'patologia', 'foto', 'nota']

export function modosPadrao(): Modo[] {
  return [
    {
      id: 'forma', nome: 'Forma (geometria)',
      ferramentas: ['pilar', 'viga', 'laje', 'parede', 'cota', 'nivel', 'foto', 'nota'],
      campos: { laje: [LAJE_TIPO] },
    },
    {
      id: 'patologia', nome: 'Patologia',
      ferramentas: TODAS,
      campos: { patologia: PATOLOGIA, pilar: [CONSERVACAO], viga: [CONSERVACAO], laje: [LAJE_TIPO, CONSERVACAO] },
    },
    {
      id: 'reforco', nome: 'Reforço',
      ferramentas: TODAS,
      campos: { pilar: [...MATERIAL, CONSERVACAO], viga: [...MATERIAL, CONSERVACAO], laje: [...LAJE_REFORCO, CONSERVACAO], patologia: PATOLOGIA },
    },
    {
      id: 'fundacao', nome: 'Fundação',
      ferramentas: ['pilar', 'viga', 'cota', 'nivel', 'patologia', 'foto', 'nota'],
      campos: { pilar: FUNDACAO, patologia: PATOLOGIA },
    },
    {
      id: 'completo', nome: 'Completo',
      ferramentas: TODAS,
      campos: {
        pilar: [...MATERIAL, CONSERVACAO, ...FUNDACAO], viga: [...MATERIAL, CONSERVACAO],
        laje: [...LAJE_REFORCO, CONSERVACAO], patologia: PATOLOGIA,
      },
    },
  ]
}

/** Rótulo e unidade de cada campo conhecido, para as tabelas de exportação. */
export function rotulos(modos: Modo[]): Map<string, { label: string; unidade?: string }> {
  const m = new Map<string, { label: string; unidade?: string }>()
  for (const modo of modos)
    for (const lista of Object.values(modo.campos))
      for (const c of lista ?? []) if (!m.has(c.key)) m.set(c.key, { label: c.label, unidade: c.unidade })
  return m
}
