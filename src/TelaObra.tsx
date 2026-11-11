import { useState } from 'react'
import type { ID, Modo, Obra, Pavimento } from './types'
import { Barra, CampoNum, CampoOpcao, CampoTexto, Folha, comEspera, confirmar, entregarArquivo, pedirTexto } from './ui'
import { ListaFotos } from './fotos'
import { excluirObra } from './db'
import { gerarBackup, gerarDXF, gerarPacote, gerarPDFCroqui, gerarRelatorioFotos, numerarFotos } from './exportar'
import { clonar, fmt, fmtNivel, nomeArquivo, uid } from './util'

export function exportarDxfPav(obra: Obra, pav: Pavimento) {
  return entregarArquivo(gerarDXF(pav), `${nomeArquivo(obra.nome)}_${nomeArquivo(pav.nome)}.dxf`)
}

/** Corte esquemático: os pavimentos empilhados pelos níveis informados. */
function Elevacao({ pavs }: { pavs: Pavimento[] }) {
  const ord = [...pavs].sort((a, b) => a.nivel - b.nivel)
  const topo = Math.max(...ord.map((p) => p.nivel + (p.peDireito || 0)))
  const base = Math.min(...ord.map((p) => p.nivel))
  const faixa = Math.max(topo - base, 100)
  const H = Math.min(60 + ord.length * 46, 320), W = 320, m = 22
  const y = (n: number) => H - m - ((n - base) / faixa) * (H - 2 * m)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="elevacao" role="img" aria-label="Corte esquemático dos pavimentos">
      {ord.map((p) => (
        <g key={p.id}>
          <line x1={70} x2={W - 12} y1={y(p.nivel)} y2={y(p.nivel)} stroke="#111827" strokeWidth={2.5} />
          <text x={64} y={y(p.nivel) + 4} textAnchor="end" fontSize={12} fontWeight={600} fill="#7c3aed">{fmtNivel(p.nivel)}</text>
          <text x={78} y={y(p.nivel) - 5} fontSize={11.5} fill="#111827">{p.nome}</text>
          {p.peDireito > 0 && (
            <>
              <line x1={W - 40} x2={W - 40} y1={y(p.nivel)} y2={y(p.nivel + p.peDireito)} stroke="#b45309" strokeWidth={1} />
              <line x1={W - 46} x2={W - 34} y1={y(p.nivel + p.peDireito)} y2={y(p.nivel + p.peDireito)} stroke="#b45309" strokeWidth={1} />
              <text x={W - 46} y={(y(p.nivel) + y(p.nivel + p.peDireito)) / 2 + 4} textAnchor="end" fontSize={11} fill="#b45309">{fmt(p.peDireito)}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

export function TelaObra(p: { obra: Obra; modos: Modo[]; mutar: (fn: (o: Obra) => void) => void; voltar: () => void; abrirPav: (id: ID) => void; aoExcluir: () => void }) {
  const { obra, mutar } = p
  const [editando, setEditando] = useState<ID | null>(null)
  const pavEd = obra.pavimentos.find((x) => x.id === editando) ?? null
  const mudarPav = (id: ID, fn: (pv: Pavimento) => void) => mutar((o) => { const pv = o.pavimentos.find((x) => x.id === id); if (pv) fn(pv) })
  const nFotos = numerarFotos(obra).length
  const base = nomeArquivo(obra.nome)

  const novoPav = async () => {
    const ult = obra.pavimentos[obra.pavimentos.length - 1]
    const nome = await pedirTexto('Novo pavimento', obra.pavimentos.length ? `${obra.pavimentos.length}º Pavimento` : 'Térreo', { rotulo: 'Nome' })
    if (!nome || !nome.trim()) return
    const id = uid()
    mutar((o) => { o.pavimentos.push({ id, nome: nome.trim(), nivel: ult ? ult.nivel + (ult.peDireito || 300) : 0, peDireito: 0, elementos: [], fundo: null }) })
    setEditando(id)
  }
  const duplicar = async (pv: Pavimento) => {
    const nome = await pedirTexto('Duplicar pavimento', `${obra.pavimentos.length}º Pavimento`, { rotulo: 'Nome do novo pavimento' })
    if (!nome || !nome.trim()) return
    const copia: Pavimento = {
      id: uid(), nome: nome.trim(), nivel: pv.nivel + (pv.peDireito || 300), peDireito: pv.peDireito, fundo: null,
      elementos: clonar(pv.elementos).filter((e) => ['pilar', 'viga', 'laje', 'parede'].includes(e.tipo)).map((e) => ({ ...e, id: uid(), fotos: [], obs: '' })),
    }
    mutar((o) => { o.pavimentos.push(copia) })
    setEditando(copia.id)
  }
  const mover = (id: ID, d: number) => mutar((o) => {
    const i = o.pavimentos.findIndex((x) => x.id === id), j = i + d
    if (i < 0 || j < 0 || j >= o.pavimentos.length) return
    ;[o.pavimentos[i], o.pavimentos[j]] = [o.pavimentos[j], o.pavimentos[i]]
  })
  const apagarPav = async (pv: Pavimento) => {
    if (!(await confirmar(`Excluir o pavimento "${pv.nome}"?`, `${pv.elementos.length} elemento(s) e as fotos deles serão apagados. Não dá para desfazer.`, { perigo: true, ok: 'Excluir' }))) return
    setEditando(null)
    mutar((o) => { o.pavimentos = o.pavimentos.filter((x) => x.id !== pv.id) })
  }
  const apagarObra = async () => {
    if (!(await confirmar(`Excluir a obra "${obra.nome}"?`, 'Todos os pavimentos, elementos e fotos serão apagados deste aparelho. Não dá para desfazer. Faça o backup antes, se precisar.', { perigo: true, ok: 'Excluir obra' }))) return
    await excluirObra(obra.id)
    p.aoExcluir()
  }
  const exportar = async (titulo: string, nome: string, gerar: () => Promise<Blob> | Blob) => {
    const blob = await comEspera(titulo, async () => gerar())
    if (blob) await entregarArquivo(blob, nome)
  }

  return (
    <div className="pagina">
      <Barra titulo={obra.nome} sub="Obra" voltar={p.voltar} />
      <main>
        <section className="cartao">
          <h2>Pavimentos</h2>
          <ul className="lista interna">
            {obra.pavimentos.map((pv) => (
              <li key={pv.id} className="com-acao">
                <button onClick={() => p.abrirPav(pv.id)}>
                  <strong>{pv.nome}</strong>
                  <small>piso {fmtNivel(pv.nivel)} m{pv.peDireito ? ` · pé-direito ${fmt(pv.peDireito)} cm` : ''} · {pv.elementos.length} elemento{pv.elementos.length === 1 ? '' : 's'}</small>
                </button>
                <button className="icone escuro" aria-label={`Editar ${pv.nome}`} onClick={() => setEditando(pv.id)}>✎</button>
              </li>
            ))}
          </ul>
          <button className="bt" onClick={novoPav}>+ Pavimento</button>
          {obra.pavimentos.length > 0 && <Elevacao pavs={obra.pavimentos} />}
        </section>

        <section className="cartao">
          <h2>Dados da obra</h2>
          <CampoTexto rotulo="Nome" valor={obra.nome} onChange={(v) => mutar((o) => { o.nome = v })} />
          <CampoTexto rotulo="Endereço" valor={obra.endereco} onChange={(v) => mutar((o) => { o.endereco = v })} />
          <CampoTexto rotulo="Cliente" valor={obra.cliente} onChange={(v) => mutar((o) => { o.cliente = v })} />
          <CampoTexto rotulo="Responsável pelo levantamento" valor={obra.responsavel} onChange={(v) => mutar((o) => { o.responsavel = v })} />
          <CampoTexto rotulo="Data" tipo="date" valor={obra.data} onChange={(v) => mutar((o) => { o.data = v })} />
          <CampoOpcao rotulo="Modo de levantamento" valor={obra.modoId} opcoes={p.modos.map((m) => ({ v: m.id, t: m.nome }))} onChange={(v) => mutar((o) => { o.modoId = v })} />
          <p className="nota">O modo define as ferramentas do desenho e os campos de cada ficha. Pode trocar a qualquer momento; o que já foi preenchido fica guardado.</p>
          <CampoTexto rotulo="Observações gerais" multilinha valor={obra.obs} onChange={(v) => mutar((o) => { o.obs = v })} />
        </section>

        <section className="cartao">
          <h2>Fotos gerais</h2>
          <p className="nota">Fachada, entorno e vistas que não pertencem a um elemento. As fotos de pilares, vigas e patologias entram na ficha de cada um.</p>
          <ListaFotos obraId={obra.id} ids={obra.fotosGerais} onChange={(ids) => mutar((o) => { o.fotosGerais = ids })} />
        </section>

        <section className="cartao">
          <h2>Exportar</h2>
          <div className="pilha">
            <button className="bt" onClick={() => exportar('Gerando croqui…', `${base}_croqui.pdf`, () => gerarPDFCroqui(obra, p.modos))}>PDF de croqui cotado e tabelas</button>
            <button className="bt" onClick={() => exportar('Gerando relatório…', `${base}_relatorio_fotografico.pdf`, () => gerarRelatorioFotos(obra))}>Relatório fotográfico ({nFotos} foto{nFotos === 1 ? '' : 's'})</button>
            {obra.pavimentos.map((pv) => (
              <button key={pv.id} className="bt" onClick={() => exportarDxfPav(obra, pv)}>DXF — {pv.nome}</button>
            ))}
            <button className="bt primario" onClick={() => exportar('Montando pacote…', `${base}_levantamento.zip`, () => gerarPacote(obra, p.modos))}>Tudo num ZIP (PDFs, DXF, fotos e backup)</button>
            <button className="bt" onClick={() => exportar('Gerando backup…', `${base}_backup.zip`, () => gerarBackup(obra))}>Só o backup da obra</button>
          </div>
        </section>

        <button className="bt perigo fantasma" onClick={apagarObra}>Excluir obra</button>
      </main>

      {pavEd && (
        <Folha titulo="Pavimento" fechar={() => setEditando(null)}>
          <CampoTexto rotulo="Nome" valor={pavEd.nome} onChange={(v) => mudarPav(pavEd.id, (pv) => { pv.nome = v })} />
          <div className="duas">
            <CampoNum rotulo="Nível do piso" unidade="m" valor={pavEd.nivel / 100} dec={3} onChange={(v) => v != null && mudarPav(pavEd.id, (pv) => { pv.nivel = Math.round(v * 1000) / 10 })} />
            <CampoNum rotulo="Pé-direito" unidade="cm" valor={pavEd.peDireito || null} vazio min={0} onChange={(v) => mudarPav(pavEd.id, (pv) => { pv.peDireito = v ?? 0 })} />
          </div>
          <p className="nota">O nível do piso é a referência do pavimento. Os níveis marcados no desenho (fundo de viga, fundo de laje etc.) são medidos a partir dele.</p>
          <div className="pilha">
            <button className="bt primario" onClick={() => { const id = pavEd.id; setEditando(null); p.abrirPav(id) }}>Abrir desenho</button>
            <button className="bt" onClick={() => duplicar(pavEd)}>Duplicar para outro pavimento (pilares, vigas, lajes, paredes)</button>
            <div className="duas">
              <button className="bt" onClick={() => mover(pavEd.id, -1)}>↑ Subir na lista</button>
              <button className="bt" onClick={() => mover(pavEd.id, 1)}>↓ Descer na lista</button>
            </div>
            <button className="bt perigo" onClick={() => apagarPav(pavEd)}>Excluir pavimento</button>
          </div>
        </Folha>
      )}
    </div>
  )
}
