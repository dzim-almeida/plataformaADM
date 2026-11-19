/**
 * ============================================================================
 * NOME DO ARQUIVO: backup-trial.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-05 (CT-09 a CT-13). O trial tem direito a UM backup completo (D-06):
 * - sem full: o /status libera e o envio de full é aceito;
 * - com full: o /status diz TRIAL_BACKUP_USADO e o envio é recusado;
 * - o download do trial segue as mesmas regras das licenças pagas.
 * A licença paga continua exatamente como antes.
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException } from '@nestjs/common'
import { cicloAtual } from '@startbig/database'
import { ErpBackupService } from '../../src/features/erp/erp-backup.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA  = 'lic-trial'
const SERVIDOR = 'hwid-servidor'
const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

function cadastrar(isTrial: boolean) {
  tabelas.licenca.push({
    id: LICENCA, clienteId: 'cli-1', status: 'ATIVA', isTrial,
    dataVencimento: dias(10), hwidServidor: SERVIDOR,
  })
}

/** O full do trial, já confirmado na nuvem. */
function fullConfirmado() {
  tabelas.backup.push({
    id: 'bk-1', licencaId: LICENCA, clienteId: 'cli-1', hwid: SERVIDOR, tipo: 'FULL',
    ciclo: cicloAtual(), sequencia: 0, chaveS3: 'clientes/cli-1/lic-trial/ciclos/x/full.zip',
    status: 'CONFIRMADO', tamanhoBytes: 100_000, tamanhoRealBytes: 100_000,
    emitidoEm: new Date(), confirmadoEm: new Date(), codigoConteudo: 'b'.repeat(64),
  })
}

const storageFalso = {
  gerarUrlUpload:   async () => ({ url: 'https://r2/up', expiraEm: dias(1) }),
  gerarUrlDownload: async () => ({ url: 'https://r2/down', expiraEm: dias(1) }),
  conferirObjeto:   async () => ({ tamanhoBytes: 100_000 }),
}
const backup = new ErpBackupService(storageFalso as any)

const envio = (tipo: 'full' | 'fragmento') => ({
  hwid: SERVIDOR, tipo, ciclo: cicloAtual(), tamanhoBytes: 100_000,
  codigoConteudo: 'a'.repeat(64), origem: 'AUTOMATICO',
})

const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

describe('LIC-05 — backup do trial (D-06)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-09: trial sem full — /status libera e o envio do full é aceito', async () => {
    cadastrar(true)

    const status = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status.planoPermiteBackup, true)
    assert.equal(status.codigoBloqueio, null)
    assert.equal(status.fullDoCicloConfirmado, false)   // o ERP manda full por causa disto

    const r = await backup.urlUpload(LICENCA, SERVIDOR, envio('full')) as any
    assert.equal(r.acao, 'ENVIAR')
  })

  it('trial sem full não pode mandar fragmento (segunda barreira)', async () => {
    cadastrar(true)

    await assert.rejects(backup.urlUpload(LICENCA, SERVIDOR, envio('fragmento')), recusa(403, 'BACKUP_TRIAL_LIMITE'))
  })

  it('CT-10: trial com full — /status responde TRIAL_BACKUP_USADO', async () => {
    cadastrar(true)
    fullConfirmado()

    const status = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status.planoPermiteBackup, false)
    assert.equal(status.codigoBloqueio, 'TRIAL_BACKUP_USADO')
  })

  it('CT-11: trial com full — envio recusado com 403 BACKUP_TRIAL_LIMITE', async () => {
    cadastrar(true)
    fullConfirmado()

    await assert.rejects(backup.urlUpload(LICENCA, SERVIDOR, envio('fragmento')), recusa(403, 'BACKUP_TRIAL_LIMITE'))
  })

  it('CT-12: trial com full — o download funciona', async () => {
    cadastrar(true)
    fullConfirmado()

    const r = await backup.urlDownload(LICENCA, SERVIDOR, { hwid: SERVIDOR })
    assert.equal(r.arquivos.length, 1)
  })

  it('trial vencido continua sem download, como a licença paga vencida', async () => {
    cadastrar(true)
    tabelas.licenca[0].dataVencimento = dias(-1)
    fullConfirmado()

    await assert.rejects(backup.urlDownload(LICENCA, SERVIDOR, { hwid: SERVIDOR }), recusa(403, 'BACKUP_PLANO_INATIVO'))
  })

  it('CT-13: licença paga ativa — /status, envio e download como antes', async () => {
    cadastrar(false)

    const status = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status.planoPermiteBackup, true)

    fullConfirmado()
    const status2 = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status2.planoPermiteBackup, true)          // paga não tem limite de um full
    const frag = await backup.urlUpload(LICENCA, SERVIDOR, envio('fragmento')) as any
    assert.equal(frag.acao, 'ENVIAR')
    const r = await backup.urlDownload(LICENCA, SERVIDOR, { hwid: SERVIDOR })
    assert.equal(r.arquivos.length, 1)
  })
})
