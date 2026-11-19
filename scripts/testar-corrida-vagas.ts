/**
 * ============================================================================
 * NOME DO ARQUIVO: testar-corrida-vagas.ts
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Confere, num PostgreSQL de DESENVOLVIMENTO, que dois (ou vinte) computadores
 * entrando ao mesmo tempo não passam do limite de vagas da licença (LIC-09,
 * ACORDO D-38, CA-01).
 *
 * O teste automático (apps/server/test/licenca/sessoes.test.ts) usa um banco
 * falso em memória, onde não existe corrida de verdade. A trava que resolve a
 * corrida é o `SELECT ... FOR UPDATE` do `ocuparVagaSeCouber`, e ela só existe
 * no Postgres: por isso este script.
 *
 * O que ele faz:
 *   1. Lê a licença LICENCA_ID e o limite de vagas dela.
 *   2. Apaga as sessões de teste de rodadas anteriores (hwid "corrida-*").
 *   3. Dispara VAGAS + 10 pedidos de vaga AO MESMO TEMPO, cada um com um hwid novo.
 *   4. Confere: entraram no máximo as vagas livres, e nenhum pedido deu erro
 *      (a resposta de quem não coube é `false`, nunca um erro 500).
 *   5. Apaga as sessões que criou.
 *
 * SEGURANÇA: recusa rodar se o DATABASE_URL não apontar para localhost. Nunca
 * rode contra o banco de produção.
 *
 * COMO RODAR (com um Postgres de desenvolvimento e uma licença de teste):
 *   LICENCA_ID=<uuid> dotenv -e apps/server/.env -- tsx scripts/testar-corrida-vagas.ts
 * ============================================================================
 */
import { prisma, ocuparVagaSeCouber, countSessoesAtivas } from '@startbig/database'

const PREFIXO = 'corrida-'   // hwid das sessões criadas por este script

const ok    = (m: string) => console.log(`  \x1b[32m✔\x1b[0m ${m}`)
const falha = (m: string) => { console.log(`  \x1b[31m✘ ${m}\x1b[0m`); process.exitCode = 1 }

/** Só aceita banco local: este script cria e apaga sessões. */
function exigirBancoLocal() {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* URL inválida: recusa abaixo */ }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.log('\x1b[31mDATABASE_URL não aponta para localhost. Este script só roda em banco de desenvolvimento.\x1b[0m')
    process.exit(1)
  }
}

async function apagarSessoesDeTeste(licencaId: string) {
  await prisma.licencaSessao.deleteMany({ where: { licencaId, hwid: { startsWith: PREFIXO } } })
}

async function main() {
  exigirBancoLocal()

  const licencaId = process.env.LICENCA_ID
  if (!licencaId) {
    console.log('Informe a licença de teste: LICENCA_ID=<uuid>')
    process.exit(1)
  }

  const licenca = await prisma.licenca.findUnique({
    where:   { id: licencaId },
    include: { plano: { select: { limiteUsuario: true } } },
  })
  if (!licenca) {
    console.log(`Licença ${licencaId} não encontrada.`)
    process.exit(1)
  }

  // Mesmo cálculo do limite do DispositivoService (plano + extras).
  const limite = (licenca.plano?.limiteUsuario ?? 1) + (licenca.usuariosExtras ?? 0)

  console.log('\n=== Corrida de vagas (LIC-09) ===\n')
  await apagarSessoesDeTeste(licencaId)

  const ocupadasAntes = await countSessoesAtivas(licencaId)
  const livres        = Math.max(0, limite - ocupadasAntes)
  const pedidos       = limite + 10
  console.log(`  limite ${limite}, ocupadas ${ocupadasAntes}, livres ${livres}; disparando ${pedidos} pedidos juntos`)

  // Todos ao mesmo tempo: Promise.allSettled não espera um terminar para
  // começar o outro, e guarda também os que derem erro.
  const resultados = await Promise.allSettled(
    Array.from({ length: pedidos }, (_, i) => ocuparVagaSeCouber(licencaId, `${PREFIXO}${i}`, limite)),
  )

  const erros    = resultados.filter(r => r.status === 'rejected')
  const entraram = resultados.filter(r => r.status === 'fulfilled' && r.value === true).length

  if (erros.length === 0) ok('nenhum pedido deu erro (quem não coube recebeu false)')
  else falha(`${erros.length} pedido(s) deram erro: ${String((erros[0] as PromiseRejectedResult).reason)}`)

  if (entraram === livres) ok(`entraram exatamente ${entraram} (as vagas livres)`)
  else falha(`entraram ${entraram}, mas só havia ${livres} vaga(s) livre(s)`)

  const ocupadasDepois = await countSessoesAtivas(licencaId)
  if (ocupadasDepois <= limite) ok(`sessões vivas depois: ${ocupadasDepois} (≤ ${limite})`)
  else falha(`sessões vivas depois: ${ocupadasDepois}, acima do limite ${limite}`)

  await apagarSessoesDeTeste(licencaId)
  ok('sessões de teste apagadas')
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
