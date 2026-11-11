// Ficha de um elemento: geometria, campos do modo de levantamento, observação e fotos.
import { useState } from 'react'
import type { Campo, Elemento, ID, Modo, Pavimento, Pilar, ValorCampo } from './types'
import { NOME_TIPO } from './types'
import { areaLajeM2, dist, fmt, fmtNivel } from './util'
import { CampoNum, CampoOpcao, CampoTexto, Folha } from './ui'
import { ListaFotos } from './fotos'

const REFS_NIVEL = ['Piso acabado', 'Piso bruto', 'Fundo de viga', 'Fundo de laje', 'Topo de laje', 'Forro', 'Topo de pilar', 'Outro']

export function resumoElemento(el: Elemento): string {
  switch (el.tipo) {
    case 'pilar': return el.forma === 'circ' ? `Ø${fmt(el.b)} cm` : `${fmt(el.b)}×${fmt(el.h)} cm`
    case 'viga': return `${fmt(el.bw)}×${fmt(el.h)} cm · vão ${fmt(dist(el.a, el.b))} cm`
    case 'parede': return `esp. ${fmt(el.esp)} cm · ${fmt(dist(el.a, el.b))} cm`
    case 'laje': return `h=${fmt(el.esp)} cm · ${fmt(areaLajeM2(el), 2)} m²`
    case 'cota': return el.valor != null ? `${fmt(el.valor)} cm (medida)` : `~${fmt(dist(el.a, el.b))} cm (do desenho)`
    case 'nivel': return `${fmt(el.valor)} cm · ${el.ref}`
    case 'nota': return el.texto
    default: return String(el.campos['pat_tipo'] ?? '')
  }
}

function CampoModo(p: { c: Campo; v: ValorCampo | undefined; onChange: (v: ValorCampo | undefined) => void }) {
  const { c, v } = p
  if (c.tipo === 'numero')
    return <CampoNum rotulo={c.label} unidade={c.unidade} valor={typeof v === 'number' ? v : null} vazio onChange={(n) => p.onChange(n ?? undefined)} />
  if (c.tipo === 'opcao')
    return <CampoOpcao rotulo={c.label} valor={typeof v === 'string' ? v : ''} opcoes={c.opcoes ?? []} vazio onChange={(s) => p.onChange(s || undefined)} />
  if (c.tipo === 'simnao')
    return <CampoOpcao rotulo={c.label} valor={v === true ? 'sim' : v === false ? 'nao' : ''} opcoes={[{ v: 'sim', t: 'Sim' }, { v: 'nao', t: 'Não' }]} vazio onChange={(s) => p.onChange(s === 'sim' ? true : s === 'nao' ? false : undefined)} />
  return <CampoTexto rotulo={c.label + (c.unidade ? ` (${c.unidade})` : '')} valor={typeof v === 'string' ? v : ''} onChange={(s) => p.onChange(s || undefined)} />
}

export function Ficha(p: {
  el: Elemento
  pav: Pavimento
  modo: Modo
  obraId: ID
  mudar: (fn: (e: Elemento) => void) => void
  fechar: () => void
  excluir: () => void
  novoPilarDeslocado: (base: Pilar, dx: number, dy: number) => void
}) {
  const { el, pav, mudar } = p
  const [dx, setDx] = useState<number | null>(null)
  const [dy, setDy] = useState<number | null>(null)
  const campos = p.modo.campos[el.tipo] ?? []

  return (
    <Folha
      titulo={`${NOME_TIPO[el.tipo]} ${el.tipo === 'cota' ? '' : el.nome}`}
      fechar={p.fechar}
      acoes={<button className="bt perigo pequeno" onClick={p.excluir}>Excluir</button>}
    >
      {el.tipo !== 'cota' && <CampoTexto rotulo="Nome" valor={el.nome} onChange={(v) => mudar((e) => { e.nome = v })} />}

      {el.tipo === 'pilar' && (
        <>
          <CampoOpcao rotulo="Forma" valor={el.forma} opcoes={[{ v: 'ret', t: 'Retangular' }, { v: 'circ', t: 'Circular' }]} onChange={(v) => mudar((e) => { if (e.tipo === 'pilar') e.forma = v as 'ret' | 'circ' })} />
          <div className="duas">
            <CampoNum rotulo={el.forma === 'circ' ? 'Diâmetro' : 'b (em X)'} unidade="cm" valor={el.b} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'pilar') e.b = v })} />
            {el.forma === 'ret' && <CampoNum rotulo="h (em Y)" unidade="cm" valor={el.h} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'pilar') e.h = v })} />}
          </div>
          <div className="duas">
            <CampoNum rotulo="X do centro" unidade="cm" valor={el.pos.x} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'pilar') e.pos.x = v })} />
            <CampoNum rotulo="Y do centro" unidade="cm" valor={el.pos.y} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'pilar') e.pos.y = v })} />
          </div>
          {el.forma === 'ret' && <CampoNum rotulo="Giro" unidade="graus" valor={el.rot} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'pilar') e.rot = v })} />}
        </>
      )}

      {el.tipo === 'viga' && (
        <>
          <div className="duas">
            <CampoNum rotulo="Largura bw" unidade="cm" valor={el.bw} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'viga') e.bw = v })} />
            <CampoNum rotulo="Altura h" unidade="cm" valor={el.h} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'viga') e.h = v })} />
          </div>
          <p className="nota">Comprimento no desenho (eixo a eixo): {fmt(dist(el.a, el.b))} cm</p>
        </>
      )}

      {el.tipo === 'parede' && (
        <>
          <CampoNum rotulo="Espessura" unidade="cm" valor={el.esp} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'parede') e.esp = v })} />
          <p className="nota">Comprimento no desenho: {fmt(dist(el.a, el.b))} cm</p>
        </>
      )}

      {el.tipo === 'laje' && (
        <>
          <CampoNum rotulo="Espessura h" unidade="cm" valor={el.esp} min={0.1} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'laje') e.esp = v })} />
          <p className="nota">Área no desenho: {fmt(areaLajeM2(el), 2)} m²</p>
        </>
      )}

      {el.tipo === 'cota' && (() => {
        const des = dist(el.a, el.b)
        const dif = el.valor != null ? el.valor - des : 0
        return (
          <>
            <CampoNum rotulo="Medida em campo" unidade="cm" valor={el.valor} vazio min={0} onChange={(v) => mudar((e) => { if (e.tipo === 'cota') e.valor = v })} />
            <CampoOpcao rotulo="Origem da medida" valor={el.origem} opcoes={[{ v: 'manual', t: 'Trena' }, { v: 'laser', t: 'Trena laser' }, { v: 'ar', t: 'Scan / AR' }]} onChange={(v) => mudar((e) => { if (e.tipo === 'cota') e.origem = v as 'manual' | 'laser' | 'ar' })} />
            <p className={'nota' + (Math.abs(dif) > 2 ? ' alerta' : '')}>
              No desenho: {fmt(des)} cm.
              {el.valor == null ? ' Sem medida de campo: a cota aparece com "~".' : Math.abs(dif) > 2 ? ` Diferença de ${fmt(dif)} cm entre a medida e o desenho.` : ' Medida e desenho conferem.'}
            </p>
            <CampoNum rotulo="Afastamento da linha de cota" unidade="cm" valor={el.afast} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'cota') e.afast = v })} />
          </>
        )
      })()}

      {el.tipo === 'nivel' && (
        <>
          <CampoOpcao rotulo="Referência" valor={el.ref} opcoes={REFS_NIVEL.includes(el.ref) ? REFS_NIVEL : [el.ref, ...REFS_NIVEL]} onChange={(v) => mudar((e) => { if (e.tipo === 'nivel') e.ref = v })} />
          <CampoNum rotulo="Altura em relação ao piso do pavimento" unidade="cm" valor={el.valor} onChange={(v) => v != null && mudar((e) => { if (e.tipo === 'nivel') e.valor = v })} />
          <p className="nota">Piso do pavimento em {fmtNivel(pav.nivel)} m. Nível deste ponto: {fmtNivel(pav.nivel + el.valor)} m.</p>
        </>
      )}

      {el.tipo === 'nota' && <CampoTexto rotulo="Texto" valor={el.texto} multilinha onChange={(v) => mudar((e) => { if (e.tipo === 'nota') e.texto = v })} />}

      {campos.length > 0 && <h4>{p.modo.nome}</h4>}
      {campos.map((c) => (
        <CampoModo key={c.key} c={c} v={el.campos[c.key]} onChange={(v) => mudar((e) => { if (v === undefined) delete e.campos[c.key]; else e.campos[c.key] = v })} />
      ))}

      {el.tipo !== 'nota' && <CampoTexto rotulo="Observação" valor={el.obs} multilinha onChange={(v) => mudar((e) => { e.obs = v })} />}

      <h4>Fotos</h4>
      <ListaFotos obraId={p.obraId} ids={el.fotos} onChange={(ids) => mudar((e) => { e.fotos = ids })} />

      {el.tipo === 'pilar' && (
        <>
          <h4>Novo pilar a partir deste</h4>
          <p className="nota">Cria outro pilar igual, deslocado pela distância medida entre os centros.</p>
          <div className="duas">
            <CampoNum rotulo="Distância em X (→ +)" unidade="cm" valor={dx} vazio onChange={setDx} />
            <CampoNum rotulo="Distância em Y (↑ +)" unidade="cm" valor={dy} vazio onChange={setDy} />
          </div>
          <button className="bt" disabled={!(dx || dy)} onClick={() => { p.novoPilarDeslocado(el, dx ?? 0, dy ?? 0); setDx(null); setDy(null) }}>Criar pilar deslocado</button>
        </>
      )}
    </Folha>
  )
}
