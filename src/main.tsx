import { createRoot } from 'react-dom/client'
import { App } from './App'
import './estilo.css'

createRoot(document.getElementById('raiz')!).render(<App />)

// Em produção (https), o service worker guarda o app para abrir sem internet.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}) })
}
