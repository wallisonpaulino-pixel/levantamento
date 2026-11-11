// Gera os ícones PNG do app (sem dependências): planta com 4 pilares, vigas e uma cota.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function png(n, pintar) {
  const px = Buffer.alloc(n * n * 4)
  const ret = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = Math.max(0, Math.round(y0 * n)); y < Math.min(n, Math.round(y1 * n)); y++)
      for (let x = Math.max(0, Math.round(x0 * n)); x < Math.min(n, Math.round(x1 * n)); x++) {
        const i = (y * n + x) * 4
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
      }
  }
  pintar(ret)
  const linhas = Buffer.alloc(n * (n * 4 + 1))
  for (let y = 0; y < n; y++) px.copy(linhas, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4)
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii')
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length)
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0)
    return Buffer.concat([len, t, dados, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr), bloco('IDAT', deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0)),
  ])
}

const FUNDO = [17, 24, 39], VIGA = [56, 189, 248], PILAR = [255, 255, 255], COTA = [251, 146, 60]
const desenho = (ret) => {
  ret(0, 0, 1, 1, FUNDO)
  const a = 0.26, b = 0.74, e = 0.022
  ret(a, a - e, b, a + e, VIGA); ret(a, b - e, b, b + e, VIGA)
  ret(a - e, a, a + e, b, VIGA); ret(b - e, a, b + e, b, VIGA)
  const s = 0.075
  for (const [x, y] of [[a, a], [b, a], [a, b], [b, b]]) ret(x - s, y - s, x + s, y + s, PILAR)
  const yc = 0.88, t = 0.012
  ret(a, yc - t, b, yc + t, COTA)
  ret(a - t, yc - 0.035, a + t, yc + 0.035, COTA); ret(b - t, yc - 0.035, b + t, yc + 0.035, COTA)
}

mkdirSync('public/icones', { recursive: true })
for (const n of [180, 192, 512]) writeFileSync(`public/icones/icone-${n}.png`, png(n, desenho))
console.log('ícones gerados')
