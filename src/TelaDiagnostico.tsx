// Diagnóstico do aparelho: mostra o que este navegador libera (AR, sensores, câmera, armazenamento).
// Serve para decidir, no iPhone real, se a medição por posição cabe na versão web.
import { useEffect, useRef, useState } from 'react'
import { Barra, avisar } from './ui'
import { fmt } from './util'

type Linha = { nome: string; valor: string; ok: boolean | null }
/* eslint-disable @typescript-eslint/no-explicit-any */

function navegador(): string {
  const ua = navigator.userAgent
  const ios = /OS (\d+)[_.](\d+)/.exec(ua)
  const ap = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'Computador'
  const nav = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS|Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'outro'
  return `${ap}${ios && ap !== 'Computador' && ap !== 'Android' ? ` · iOS ${ios[1]}.${ios[2]}` : ''} · ${nav}`
}

export function TelaDiagnostico(p: { voltar: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [ar, setAr] = useState('Ainda não testado.')
  const [arAtivo, setArAtivo] = useState(false)
  const [pose, setPose] = useState('')
  const [incl, setIncl] = useState('Ainda não testado.')
  const sobreRef = useRef<HTMLDivElement>(null)
  const sessaoRef = useRef<any>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const L: Linha[] = []
      const xr = (navigator as any).xr
      let arOk: boolean | null = null, vrOk: boolean | null = null
      if (xr?.isSessionSupported) {
        try { arOk = await xr.isSessionSupported('immersive-ar') } catch { arOk = false }
        try { vrOk = await xr.isSessionSupported('immersive-vr') } catch { vrOk = false }
      }
      L.push({ nome: 'Aparelho e navegador', valor: navegador(), ok: null })
      L.push({ nome: 'AR no navegador (WebXR)', valor: !xr ? 'não existe neste navegador' : arOk ? 'disponível' : 'existe, mas sem modo AR', ok: !!arOk })
      if (xr) L.push({ nome: 'Modo VR (WebXR)', valor: vrOk ? 'disponível' : 'indisponível', ok: null })
      L.push({ nome: 'Sensor de inclinação', valor: 'DeviceOrientationEvent' in window ? 'existe (teste abaixo)' : 'não existe', ok: 'DeviceOrientationEvent' in window })
      L.push({ nome: 'Conexão segura (https)', valor: window.isSecureContext ? 'sim' : 'não', ok: window.isSecureContext })
      const instalado = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
      L.push({ nome: 'Aberto pelo ícone da tela inicial', valor: instalado ? 'sim' : 'não (aberto no navegador)', ok: instalado })
      L.push({ nome: 'Pronto para uso sem internet', valor: navigator.serviceWorker?.controller ? 'sim' : 'ainda não (abra o app de novo com internet)', ok: !!navigator.serviceWorker?.controller })
      let persistente: boolean | null = null, espaco = 'não informado'
      try {
        if (navigator.storage?.persisted) persistente = await navigator.storage.persisted()
        if (navigator.storage?.estimate) {
          const e = await navigator.storage.estimate()
          if (e.quota) espaco = `${fmt((e.usage ?? 0) / 1048576, 1)} MB usados de ${fmt(e.quota / 1073741824, 1)} GB`
        }
      } catch { /* sem suporte */ }
      L.push({ nome: 'Dados guardados de forma permanente', valor: persistente == null ? 'não informado' : persistente ? 'sim' : 'não garantido (faça backup)', ok: persistente })
      L.push({ nome: 'Espaço para obras e fotos', valor: espaco, ok: null })
      const camera = !!(navigator as any).mediaDevices?.getUserMedia
      L.push({ nome: 'Câmera ao vivo', valor: camera ? 'disponível' : 'indisponível', ok: camera })
      let comp = false
      try { comp = !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'teste.pdf', { type: 'application/pdf' })] }) } catch { /* sem suporte */ }
      L.push({ nome: 'Compartilhar arquivos (PDF, DXF)', valor: comp ? 'disponível' : 'indisponível (usa "Baixar")', ok: comp })
      L.push({ nome: 'Bluetooth no navegador (trena laser)', valor: (navigator as any).bluetooth ? 'disponível' : 'indisponível', ok: !!(navigator as any).bluetooth })
      if (vivo) setLinhas(L)
    })()
    return () => { vivo = false; try { sessaoRef.current?.end() } catch { /* já encerrada */ } }
  }, [])

  /** Tenta abrir uma sessão de AR e ler a posição do celular. É a prova de que a medição por posição funciona. */
  const testarAR = async () => {
    const xr = (navigator as any).xr
    if (!xr) { setAr('Não funcionou: este navegador não tem AR (WebXR ausente).'); return }
    try {
      const sessao = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['local'], optionalFeatures: ['dom-overlay', 'hit-test'], domOverlay: { root: sobreRef.current },
      })
      sessaoRef.current = sessao
      const cv = document.createElement('canvas')
      const gl = cv.getContext('webgl', { xrCompatible: true } as any) as WebGLRenderingContext | null
      if (!gl) throw new Error('WebGL indisponível')
      const camada = new (window as any).XRWebGLLayer(sessao, gl)
      await sessao.updateRenderState({ baseLayer: camada })
      const ref = await sessao.requestReferenceSpace('local')
      let n = 0, ultima = ''
      const quadro = (_t: number, frame: any) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, camada.framebuffer)
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
        const v = frame.getViewerPose(ref)
        if (v) {
          const { x, y, z } = v.transform.position
          n++
          ultima = `X ${fmt(x * 100, 1)} cm · altura ${fmt(y * 100, 1)} cm · Z ${fmt(z * 100, 1)} cm`
          if (n % 6 === 0) setPose(ultima)
        }
        sessao.requestAnimationFrame(quadro)
      }
      sessao.requestAnimationFrame(quadro)
      sessao.addEventListener('end', () => {
        sessaoRef.current = null; setArAtivo(false)
        setAr(n > 0 ? `FUNCIONOU: ${n} leituras de posição. Última: ${ultima}` : 'A sessão abriu, mas não entregou a posição do celular.')
      })
      setArAtivo(true); setAr('AR aberto. Ande com o celular e veja os números mudarem.')
    } catch (e) {
      setAr('Não funcionou: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
    }
  }

  const testarInclinacao = async () => {
    const DOE = (window as any).DeviceOrientationEvent
    if (!DOE) { setIncl('Não funcionou: o sensor não existe neste navegador.'); return }
    try {
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission()
        if (r !== 'granted') { setIncl('Permissão negada. Recarregue a página para tentar de novo.'); return }
      }
      let recebeu = false
      window.addEventListener('deviceorientation', (e) => {
        if (e.beta == null || e.gamma == null) return
        recebeu = true
        setIncl(`FUNCIONOU: frente/trás ${fmt(e.beta, 1)}° · lateral ${fmt(e.gamma, 1)}°`)
      })
      setIncl('Aguardando o sensor…')
      setTimeout(() => { if (!recebeu) setIncl('O sensor não respondeu (comum em computador).') }, 2500)
    } catch (e) {
      setIncl('Não funcionou: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const resumo = [...linhas.map((l) => `${l.nome}: ${l.valor}`), `Teste de AR: ${ar}`, `Teste de inclinação: ${incl}`].join('\n')
  const copiar = async () => {
    try { await navigator.clipboard.writeText(resumo); await avisar('Resultado copiado', 'Cole na conversa para eu analisar.') }
    catch { await avisar('Não foi possível copiar', 'Tire uma captura desta tela.') }
  }

  return (
    <div className="pagina">
      <Barra titulo="Diagnóstico do aparelho" sub="O que este navegador libera" voltar={p.voltar} />
      <main>
        <section className="cartao">
          <h2>Medição pela posição do celular (AR)</h2>
          <p className="nota">Este teste tenta abrir a câmera em modo AR e ler a posição x, y, z do aparelho. Se funcionar, a medição por posição cabe na versão web.</p>
          <button className="bt primario" onClick={testarAR}>Testar AR agora</button>
          <p className={'resultado' + (ar.startsWith('FUNCIONOU') ? ' bom' : ar.startsWith('Não') || ar.startsWith('A sessão') ? ' ruim' : '')}>{ar}</p>
        </section>

        <section className="cartao">
          <h2>Inclinação e prumo (sensor)</h2>
          <p className="nota">Mostra o ângulo do aparelho. No iPhone, o navegador pede permissão ao tocar no botão.</p>
          <button className="bt" onClick={testarInclinacao}>Testar sensor de inclinação</button>
          <p className={'resultado' + (incl.startsWith('FUNCIONOU') ? ' bom' : incl.startsWith('Não') || incl.startsWith('O sensor') || incl.startsWith('Permissão') ? ' ruim' : '')}>{incl}</p>
        </section>

        <section className="cartao">
          <h2>Recursos do navegador</h2>
          {linhas.length === 0 ? <div className="girando" /> : (
            <ul className="diag">
              {linhas.map((l) => (
                <li key={l.nome}>
                  <span className={'sinal ' + (l.ok == null ? 'neutro' : l.ok ? 'bom' : 'ruim')}>{l.ok == null ? '•' : l.ok ? '✓' : '✕'}</span>
                  <div><strong>{l.nome}</strong><small>{l.valor}</small></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button className="bt" onClick={copiar}>Copiar resultado</button>
        <p className="nota">Depois dos dois testes, toque em "Copiar resultado" e cole na conversa, ou envie uma captura desta tela.</p>
      </main>

      <div ref={sobreRef} className={'sobre-ar' + (arAtivo ? ' ativo' : '')}>
        <div className="sobre-ar-caixa">
          <strong>Posição do celular</strong>
          <span>{pose || 'aguardando leitura…'}</span>
          <button className="bt primario" onClick={() => { try { sessaoRef.current?.end() } catch { /* já encerrada */ } }}>Encerrar teste</button>
        </div>
      </div>
    </div>
  )
}
