/**
 * ============================================================================
 * NOME DO ARQUIVO: sessoes.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-09 (CT-01 a CT-06). As vagas de computador da licença:
 * - sessão sem heartbeat há mais de 10 minutos deixa de ocupar vaga na hora
 *   (D-10), e o cron usa o mesmo prazo;
 * - ocupar vaga é "conta e grava" com a licença trancada (D-38);
 * - na troca de servidor, as sessões da loja antiga saem todas (F17).
 *
 * A corrida REAL (dois processos no PostgreSQL) não dá para testar no banco
 * falso: ela é conferida pelo scripts/testar-corrida-vagas.ts.
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINUTOS_SESSAO_VIVA,
  assumirServidorDaLicenca,
  countSessoesAtivas,
  ocuparVagaSeCouber,
} from '@startbig/database'
import { CronService } from '../../src/features/cron/cron.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA = 'lic-1'
const minutos = (n: number) => new Date(Date.now() + n * 60 * 1000)

function cadastrar() {
  tabelas.licenca.push({ id: LICENCA, clienteId: 'cli-1', status: 'ATIVA', totalUsuarios: 0, hwidServidor: 'servidor' })
}

const sessao = (hwid: string, ultimoHeartbeat = new Date()) =>
  tabelas.licencaSessao.push({ id: `s-${hwid}`, licencaId: LICENCA, hwid, ultimoHeartbeat })

const hwids = () => tabelas.licencaSessao.map(s => s.hwid).sort()

describe('LIC-09 — sessões e vagas (D-10, D-38, F17)', () => {
  beforeEach(() => reiniciarBanco())

  it('a janela de sessão viva é de 10 minutos', () => {
    assert.equal(MINUTOS_SESSAO_VIVA, 10)
  })

  it('CT-01: limite 1 — o primeiro computador entra, o segundo recebe false', async () => {
    cadastrar()

    assert.equal(await ocuparVagaSeCouber(LICENCA, 'caixa-a', 1), true)
    assert.equal(await ocuparVagaSeCouber(LICENCA, 'caixa-b', 1), false)
    assert.deepEqual(hwids(), ['caixa-a'])   // nada gravado para o segundo
  })

  it('CT-02: sessão sem heartbeat há 11 minutos fica fora da contagem', async () => {
    cadastrar()
    sessao('caixa-morto', minutos(-11))

    assert.equal(await countSessoesAtivas(LICENCA), 0)
    assert.equal(await ocuparVagaSeCouber(LICENCA, 'caixa-novo', 1), true)   // a vaga está livre
  })

  it('CT-03: sessão com heartbeat há 9 minutos continua contando', async () => {
    cadastrar()
    sessao('caixa-vivo', minutos(-9))

    assert.equal(await countSessoesAtivas(LICENCA), 1)
    assert.equal(await ocuparVagaSeCouber(LICENCA, 'caixa-novo', 1), false)
  })

  it('CT-04: o cron apaga a sessão de 11 minutos e atualiza totalUsuarios', async () => {
    cadastrar()
    sessao('caixa-morto', minutos(-11))
    sessao('caixa-vivo', minutos(-1))
    const cron = new CronService({} as any, {} as any)

    await cron.handleGarbageCollector()

    assert.deepEqual(hwids(), ['caixa-vivo'])
    assert.equal(tabelas.licenca[0].totalUsuarios, 1)
  })

  it('CT-05: troca de servidor apaga todas as sessões, menos a do servidor novo', async () => {
    cadastrar()
    sessao('servidor')
    sessao('caixa-01')
    sessao('caixa-02')
    sessao('notebook')

    await assumirServidorDaLicenca(LICENCA, 'notebook', 'servidor')

    assert.deepEqual(hwids(), ['notebook'])
    assert.deepEqual(tabelas.licencaHwidRevogado.map(r => r.hwid), ['servidor'])
  })

  it('CT-06: o mesmo computador reconectando com a licença no limite entra sem contar duas vezes', async () => {
    cadastrar()
    sessao('caixa-a', minutos(-2))

    assert.equal(await ocuparVagaSeCouber(LICENCA, 'caixa-a', 1, 'CAIXA-A'), true)
    assert.equal(await countSessoesAtivas(LICENCA), 1)
    const s = tabelas.licencaSessao.find(x => x.hwid === 'caixa-a')!
    assert.ok(s.ultimoHeartbeat > minutos(-1))     // renovada
    assert.equal(s.nomeComputador, 'CAIXA-A')
  })
})
