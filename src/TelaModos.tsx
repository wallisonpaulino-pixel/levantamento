// Configuração dos modos de levantamento: ferramentas disponíveis e campos de cada ficha.
import { useState } from 'react'
import type { Campo, ID, Modo, Tipo } from './types'
import { NOME_TIPO, TIPOS } from './types'
import { modosPadrao } from './modos'
import { Barra, CampoOpcao, CampoTexto, Folha, confirmar, pedirTexto } from './ui'
import { clonar, uid } from './util'

const TIPO_CAMPO = [{ v: 'texto', t: 'Texto' }, { v: 'numero', t: 'Número' }, { v: 'opcao', t: 'Lista de opções' }, { v: 'simnao', t: 'Sim / não' }]

/** Caixa de opções com texto próprio, para aceitar quebra de linha enquanto se digita. */
function CampoOpcoes(p: { opcoes: string[]; onChange: (l: string[]) => void }) {
  const [txt, setTxt] = useState(p.opcoes.join('\n'))
  return <CampoTexto rotulo="Opções, uma por linha" multilinha valor={txt} onChange={(v) => { setTxt(v); p.onChange(v.split('\n').map((s) => s.trim()).filter(Boolean)) }} />
}

export function TelaModos(p: { modos: Modo[]; gravar: (m: Modo[]) => void; voltar: () => void }) {
  const [aberto, setAberto] = useState<ID | null>(null)
  const [campoEd, setCampoEd] = useState<{ tipo: Tipo; key: string } | null>(null)
  const modo = p.modos.find((m) => m.id === aberto) ?? null
  const mudar = (fn: (m: Modo) => void) => {
    const novos = clonar(p.modos)
    const m = novos.find((x) => x.id === aberto)
    if (m) { fn(m); p.gravar(novos) }
  }
  const campo = modo && campoEd ? modo.campos[campoEd.tipo]?.find((c) => c.key === campoEd.key) ?? null : null
  const mudarCampo = (fn: (c: Campo) => void) => mudar((m) => { const c = m.campos[campoEd!.tipo]?.find((x) => x.key === campoEd!.key); if (c) fn(c) })

  const novoModo = async () => {
    const nome = await pedirTexto('Novo modo de levantamento', '', { rotulo: 'Nome' })
    if (!nome || !nome.trim()) return
    const id = uid()
    p.gravar([...p.modos, { id, nome: nome.trim(), ferramentas: [...TIPOS], campos: {} }])
    setAberto(id)
  }
  const restaurar = async () => {
    if (await confirmar('Restaurar os modos padrão?', 'Os modos e campos que você criou ou alterou serão apagados. O que já foi preenchido nas obras continua guardado.', { perigo: true, ok: 'Restaurar' })) {
      setAberto(null); p.gravar(modosPadrao())
    }
  }

  if (!modo)
    return (
      <div className="pagina">
        <Barra titulo="Modos de levantamento" sub="Ferramentas e fichas por tipo de serviço" voltar={p.voltar} />
        <main>
          <p className="nota">Cada modo define quais ferramentas aparecem no desenho e quais campos cada ficha tem. Escolha o modo na tela da obra.</p>
          <ul className="lista">
            {p.modos.map((m) => {
              const n = Object.values(m.campos).reduce((s, l) => s + (l?.length ?? 0), 0)
              return (
                <li key={m.id}>
                  <button onClick={() => setAberto(m.id)}>
                    <strong>{m.nome}</strong>
                    <small>{m.ferramentas.length} ferramenta{m.ferramentas.length === 1 ? '' : 's'} · {n} campo{n === 1 ? '' : 's'} de ficha</small>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="pilha topo">
            <button className="bt primario" onClick={novoModo}>+ Novo modo</button>
            <button className="bt perigo fantasma" onClick={restaurar}>Restaurar modos padrão</button>
          </div>
        </main>
      </div>
    )

  return (
    <div className="pagina">
      <Barra titulo={modo.nome} sub="Modo de levantamento" voltar={() => setAberto(null)} />
      <main>
        <section className="cartao">
          <CampoTexto rotulo="Nome do modo" valor={modo.nome} onChange={(v) => mudar((m) => { m.nome = v })} />
          <h2>Ferramentas no desenho</h2>
          <div className="marcas">
            {TIPOS.map((t) => (
              <label key={t}>
                <input type="checkbox" checked={modo.ferramentas.includes(t)}
                  onChange={(e) => mudar((m) => { m.ferramentas = TIPOS.filter((x) => (x === t ? e.target.checked : m.ferramentas.includes(x))) })} />
                {NOME_TIPO[t]}
              </label>
            ))}
          </div>
        </section>

        {TIPOS.filter((t) => t !== 'cota' && t !== 'nota').map((t) => (
          <section className="cartao" key={t}>
            <h2>Ficha de {NOME_TIPO[t].toLowerCase()}</h2>
            <ul className="lista interna">
              {(modo.campos[t] ?? []).map((c, i, arr) => (
                <li key={c.key} className="com-acao">
                  <button onClick={() => setCampoEd({ tipo: t, key: c.key })}>
                    <strong>{c.label}{c.unidade ? ` (${c.unidade})` : ''}</strong>
                    <small>{TIPO_CAMPO.find((x) => x.v === c.tipo)?.t}{c.tipo === 'opcao' ? `: ${(c.opcoes ?? []).join(', ')}` : ''}</small>
                  </button>
                  <button className="icone escuro" aria-label="Subir campo" disabled={i === 0} onClick={() => mudar((m) => { const l = m.campos[t]!; [l[i - 1], l[i]] = [l[i], l[i - 1]] })}>↑</button>
                  <button className="icone escuro" aria-label="Descer campo" disabled={i === arr.length - 1} onClick={() => mudar((m) => { const l = m.campos[t]!; [l[i + 1], l[i]] = [l[i], l[i + 1]] })}>↓</button>
                </li>
              ))}
            </ul>
            <button className="bt" onClick={async () => {
              const label = await pedirTexto(`Novo campo em ${NOME_TIPO[t].toLowerCase()}`, '', { rotulo: 'Nome do campo' })
              if (!label || !label.trim()) return
              const key = 'c_' + uid()
              mudar((m) => { (m.campos[t] ??= []).push({ key, label: label.trim(), tipo: 'texto' }) })
              setCampoEd({ tipo: t, key })
            }}>+ Campo</button>
          </section>
        ))}

        <button className="bt perigo fantasma" onClick={async () => {
          if (p.modos.length <= 1) return
          if (await confirmar(`Excluir o modo "${modo.nome}"?`, 'As obras que usam este modo passam a usar o primeiro da lista.', { perigo: true, ok: 'Excluir' })) {
            const id = modo.id
            setAberto(null); p.gravar(p.modos.filter((m) => m.id !== id))
          }
        }} disabled={p.modos.length <= 1}>Excluir este modo</button>
      </main>

      {campo && campoEd && (
        <Folha titulo="Campo da ficha" fechar={() => setCampoEd(null)}
          acoes={<button className="bt perigo pequeno" onClick={() => { const { tipo, key } = campoEd; setCampoEd(null); mudar((m) => { m.campos[tipo] = (m.campos[tipo] ?? []).filter((c) => c.key !== key) }) }}>Excluir</button>}>
          <CampoTexto rotulo="Nome do campo" valor={campo.label} onChange={(v) => mudarCampo((c) => { c.label = v })} />
          <CampoOpcao rotulo="Tipo de resposta" valor={campo.tipo} opcoes={TIPO_CAMPO} onChange={(v) => mudarCampo((c) => { c.tipo = v as Campo['tipo'] })} />
          {(campo.tipo === 'numero' || campo.tipo === 'texto') && <CampoTexto rotulo="Unidade (opcional)" valor={campo.unidade ?? ''} dica="cm, mm, MPa…" onChange={(v) => mudarCampo((c) => { if (v.trim()) c.unidade = v.trim(); else delete c.unidade })} />}
          {campo.tipo === 'opcao' && <CampoOpcoes key={campo.key} opcoes={campo.opcoes ?? []} onChange={(l) => mudarCampo((c) => { c.opcoes = l })} />}
        </Folha>
      )}
    </div>
  )
}
