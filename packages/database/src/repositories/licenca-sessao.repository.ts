import { prisma } from '../client'

/**
 * Sessão VIVA = heartbeat nos últimos 10 minutos (LIC-09, ACORDO D-10).
 *
 * O start-big manda heartbeat de cada caixa a cada 100 segundos: 10 minutos dão
 * folga para várias falhas seguidas de rede. Uma regra só, usada pela contagem
 * das vagas e pelo cron que limpa as linhas.
 */
export const MINUTOS_SESSAO_VIVA = 10

/** Momento a partir do qual uma sessão ainda conta como viva. */
function inicioDaJanela(): Date {
  return new Date(Date.now() - MINUTOS_SESSAO_VIVA * 60 * 1000)
}

export async function upsertLicencaSessao(licencaId: string, hwid: string, nomeComputador?: string) {
  return prisma.licencaSessao.upsert({
    where: {
      licencaId_hwid: {
        licencaId,
        hwid,
      },
    },
    update: {
      ultimoHeartbeat: new Date(),
      // Só sobrescreve quando veio: o heartbeat não manda o nome e não pode apagá-lo.
      ...(nomeComputador ? { nomeComputador } : {}),
    },
    create: {
      licencaId,
      hwid,
      nomeComputador: nomeComputador ?? null,
    },
  })
}

export async function findLicencaSessao(licencaId: string, hwid: string) {
  return prisma.licencaSessao.findUnique({
    where: { licencaId_hwid: { licencaId, hwid } },
  })
}

/**
 * Quantas vagas a licença tem ocupadas AGORA.
 *
 * Só conta quem deu sinal de vida dentro da janela: uma sessão morta deixa de
 * ocupar vaga na hora, sem esperar o cron passar (antes contava todas as linhas,
 * e uma sessão morta prendia a vaga por até 35 minutos).
 */
export async function countSessoesAtivas(licencaId: string) {
  return prisma.licencaSessao.count({
    where: { licencaId, ultimoHeartbeat: { gte: inicioDaJanela() } },
  })
}

/**
 * Ocupa a vaga de `hwid` SE couber, sem corrida (LIC-09, F6, D-38).
 *
 * Dentro de uma transação, primeiro TRANCA a linha da licença
 * (`SELECT ... FOR UPDATE`). Dois caixas entrando juntos fazem fila nessa
 * trava: o segundo espera o primeiro terminar (milissegundos) e já vê a vaga
 * ocupada. Sem a trava, os dois contavam "1 vaga livre" ao mesmo tempo e os
 * dois entravam. (Uma transação serializável também resolveria, mas falharia
 * com erro 500 em vez de responder "limite atingido".)
 *
 * Devolve `true` se o computador ficou com a vaga (inclusive quando ele já
 * tinha uma: reconexão não conta duas vezes) e `false` se não coube (nada é
 * gravado).
 */
export async function ocuparVagaSeCouber(
  licencaId: string,
  hwid: string,
  limite: number,
  nomeComputador?: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // A trava: as outras transações que pedirem esta mesma linha esperam aqui.
    await tx.$queryRaw`SELECT id FROM licencas WHERE id = ${licencaId} FOR UPDATE`

    const jaTem = await tx.licencaSessao.findUnique({
      where: { licencaId_hwid: { licencaId, hwid } },
    })
    const vivas = await tx.licencaSessao.count({
      where: { licencaId, ultimoHeartbeat: { gte: inicioDaJanela() } },
    })
    if (!jaTem && vivas >= limite) return false   // sem vaga: nada gravado

    await tx.licencaSessao.upsert({
      where:  { licencaId_hwid: { licencaId, hwid } },
      update: { ultimoHeartbeat: new Date(), ...(nomeComputador ? { nomeComputador } : {}) },
      create: { licencaId, hwid, nomeComputador: nomeComputador ?? null },
    })
    return true
  })
}

export async function deletarSessoesInativas(minutosOffline: number) {
  const limite = new Date()
  limite.setMinutes(limite.getMinutes() - minutosOffline)

  // Acha as sessões que vão morrer para sincronizar a licença depois
  const morrendo = await prisma.licencaSessao.findMany({
    where: { ultimoHeartbeat: { lt: limite } },
    select: { licencaId: true },
  })

  if (morrendo.length === 0) return { count: 0 }

  const result = await prisma.licencaSessao.deleteMany({
    where: { ultimoHeartbeat: { lt: limite } },
  })

  // Re-sincroniza o totalUsuarios das licenças afetadas
  const licencasAfetadas = [...new Set(morrendo.map(m => m.licencaId))]
  for (const licId of licencasAfetadas) {
    const restantes = await prisma.licencaSessao.count({ where: { licencaId: licId } })
    await prisma.licenca.update({
      where: { id: licId },
      data: { totalUsuarios: restantes }
    })
  }

  return result
}

export async function deletarSessao(licencaId: string, hwid: string) {
  return prisma.licencaSessao.deleteMany({
    where: {
      licencaId,
      hwid,
    },
  })
}

export async function deletarTodasSessoesDaLicenca(licencaId: string) {
  return prisma.licencaSessao.deleteMany({
    where: {
      licencaId,
    },
  })
}

/**
 * Derruba as `quantidade` sessões com heartbeat mais antigo.
 *
 * É o que um login autenticado faz quando a licença está cheia: libera só a
 * vaga que falta, em vez de derrubar a loja inteira — o caixa aberto naquele
 * momento continua vendendo. A mais antiga é a que mais provavelmente já
 * morreu (máquina desligada, sistema reinstalado).
 */
export async function deletarSessoesMaisAntigas(licencaId: string, quantidade: number) {
  if (quantidade <= 0) return { count: 0 }

  // Só entre as VIVAS: as mortas já não ocupam vaga (LIC-09), e derrubá-las
  // não liberaria nada.
  const alvos = await prisma.licencaSessao.findMany({
    where:   { licencaId, ultimoHeartbeat: { gte: inicioDaJanela() } },
    orderBy: { ultimoHeartbeat: 'asc' },
    take:    quantidade,
    select:  { id: true },
  })

  return prisma.licencaSessao.deleteMany({
    where: { id: { in: alvos.map(a => a.id) } },
  })
}
