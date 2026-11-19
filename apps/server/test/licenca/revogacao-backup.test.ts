/**
 * ============================================================================
 * NOME DO ARQUIVO: revogacao-backup.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-05 (CT-01 a CT-08). Uma máquina que já foi trocada não entra mais:
 * - o guard do ERP recusa o token de máquina revogada (D-04);
 * - o backup (status, envio e download) só aceita o servidor ATUAL da licença;
 * - licença antiga sem servidor registrado grava o primeiro que chamar (D-33).
 *
 * Os tokens são assinados de verdade (RS256), com um par de chaves gerado aqui,
 * como a API faz com a chave privada dela.
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { HttpException } from '@nestjs/common'
import { cicloAtual } from '@startbig/database'
import { ErpLicencaGuard } from '../../src/core/guards/erp-licenca.guard'
import { ErpBackupService } from '../../src/features/erp/erp-backup.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA  = 'lic-1'
const SERVIDOR = 'hwid-servidor'
const ANTIGO   = 'hwid-servidor-antigo'

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

// ── Chaves da "API" ─────────────────────────────────────────────────────────
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength:      2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

/** Token da licença assinado como a API assina. */
const token = (claims: Record<string, unknown>) =>
  jwt.sign({ licencaId: LICENCA, ...claims }, privateKey, { algorithm: 'RS256', expiresIn: '7d' })

/** Contexto do Nest de mentira: só o que o guard lê (o pedido HTTP). */
function contexto(authorization?: string) {
  const request: any = { headers: authorization ? { authorization } : {} }
  return { request, ctx: { switchToHttp: () => ({ getRequest: () => request }) } as any }
}

const guard = new ErpLicencaGuard({ getPublicKey: () => publicKey } as any)

// ── Banco e armazenamento ───────────────────────────────────────────────────
function cadastrar(licenca: Record<string, any> = {}) {
  tabelas.licenca.push({
    id: LICENCA, clienteId: 'cli-1', status: 'ATIVA', isTrial: false,
    dataVencimento: dias(30), hwidServidor: SERVIDOR, ...licenca,
  })
}

/** Um full confirmado no ciclo corrente, para o download ter o que baixar. */
function fullConfirmado() {
  tabelas.backup.push({
    id: 'bk-1', licencaId: LICENCA, clienteId: 'cli-1', hwid: SERVIDOR, tipo: 'FULL',
    ciclo: cicloAtual(), sequencia: 0, chaveS3: 'clientes/cli-1/lic-1/ciclos/x/full.zip',
    status: 'CONFIRMADO', tamanhoBytes: 1000, tamanhoRealBytes: 1000,
    emitidoEm: new Date(), confirmadoEm: new Date(), codigoConteudo: 'c-0',
  })
}

/** O R2 de mentira: assina qualquer chave e diz que todo objeto existe. */
const storageFalso = {
  gerarUrlUpload:   async () => ({ url: 'https://r2/up', expiraEm: dias(1) }),
  gerarUrlDownload: async () => ({ url: 'https://r2/down', expiraEm: dias(1) }),
  conferirObjeto:   async () => ({ tamanhoBytes: 1000 }),
}
const backup = new ErpBackupService(storageFalso as any)

/** Código de conteúdo no formato que o schema exige (SHA-256 em hex). */
const CODIGO_NOVO = 'a'.repeat(64)

const pedidoEnvio = (hwid: string, extra: Record<string, unknown> = {}) => ({
  hwid, tipo: 'full', ciclo: cicloAtual(), tamanhoBytes: 100_000,
  codigoConteudo: CODIGO_NOVO, origem: 'AUTOMATICO', ...extra,
})

/** Recusa com status e `codigo` — o que o ERP lê. */
const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

describe('LIC-05 — guard recusa máquina revogada (D-04)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-01: token de hwid revogado recebe 401 LICENCA_HWID_REVOGADO', async () => {
    tabelas.licencaHwidRevogado.push({ id: 'r-1', licencaId: LICENCA, hwid: ANTIGO, revogadoEm: new Date() })
    const { ctx } = contexto(`Bearer ${token({ hwid: ANTIGO })}`)

    await assert.rejects(guard.canActivate(ctx), recusa(401, 'LICENCA_HWID_REVOGADO'))
  })

  it('CT-02: token de hwid não revogado passa e o payload vai para o pedido', async () => {
    const { ctx, request } = contexto(`Bearer ${token({ hwid: SERVIDOR })}`)

    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(request.erp.hwid, SERVIDOR)
    assert.equal(request.erp.licencaId, LICENCA)
  })

  it('sem token e com token inválido continuam 401, como antes', async () => {
    await assert.rejects(guard.canActivate(contexto().ctx), (e: any) => e.getStatus() === 401)
    await assert.rejects(guard.canActivate(contexto('Bearer lixo').ctx), (e: any) => e.getStatus() === 401)
  })

  it('token de login sem hwid de máquina passa (a regra do servidor é só do backup)', async () => {
    const { ctx } = contexto(`Bearer ${token({ hwid: 'login-123' })}`)

    assert.equal(await guard.canActivate(ctx), true)
  })
})

describe('LIC-05 — backup só do servidor atual (F15, F29)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-03: envio de máquina que não é o servidor recebe BACKUP_MAQUINA_REVOGADA', async () => {
    cadastrar()

    await assert.rejects(
      backup.urlUpload(LICENCA, ANTIGO, pedidoEnvio(ANTIGO)),
      recusa(403, 'BACKUP_MAQUINA_REVOGADA'),
    )
  })

  it('CT-04: download de máquina que não é o servidor recebe BACKUP_MAQUINA_REVOGADA', async () => {
    cadastrar()
    fullConfirmado()

    await assert.rejects(
      backup.urlDownload(LICENCA, ANTIGO, { hwid: ANTIGO }),
      recusa(403, 'BACKUP_MAQUINA_REVOGADA'),
    )
  })

  it('CT-05: /status de máquina que não é o servidor recebe BACKUP_MAQUINA_REVOGADA', async () => {
    cadastrar()

    await assert.rejects(backup.status(LICENCA, ANTIGO), recusa(403, 'BACKUP_MAQUINA_REVOGADA'))
  })

  it('CT-06: envio com token sem hwid recebe BACKUP_HWID_AUSENTE', async () => {
    cadastrar()

    await assert.rejects(
      backup.urlUpload(LICENCA, null, pedidoEnvio(SERVIDOR)),
      recusa(403, 'BACKUP_HWID_AUSENTE'),
    )
  })

  it('o servidor atual continua enviando, consultando e baixando', async () => {
    cadastrar()

    const envio = await backup.urlUpload(LICENCA, SERVIDOR, pedidoEnvio(SERVIDOR)) as any
    assert.equal(envio.acao, 'ENVIAR')

    const status = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status.planoPermiteBackup, true)

    fullConfirmado()
    const download = await backup.urlDownload(LICENCA, SERVIDOR, { hwid: SERVIDOR })
    assert.equal(download.arquivos.length, 1)
  })

  it('CT-07: hwidServidor vazio — a primeira chamada grava o servidor; outra máquina é recusada', async () => {
    cadastrar({ hwidServidor: null })

    const status = await backup.status(LICENCA, SERVIDOR)
    assert.equal(status.planoPermiteBackup, true)
    assert.equal(tabelas.licenca[0].hwidServidor, SERVIDOR)

    await assert.rejects(
      backup.urlUpload(LICENCA, 'hwid-de-outra-maquina', pedidoEnvio('hwid-de-outra-maquina')),
      recusa(403, 'BACKUP_MAQUINA_REVOGADA'),
    )
  })

  it('CT-08: duas chamadas simultâneas com hwidServidor vazio — só uma grava', async () => {
    cadastrar({ hwidServidor: null })

    const [a, b] = await Promise.allSettled([
      backup.status(LICENCA, 'hwid-a'),
      backup.status(LICENCA, 'hwid-b'),
    ])

    const vencedor = tabelas.licenca[0].hwidServidor
    assert.ok(vencedor === 'hwid-a' || vencedor === 'hwid-b')
    const resultados = [a, b].map(r => r.status)
    assert.deepEqual(resultados.sort(), ['fulfilled', 'rejected'])   // uma passa, a outra cai na regra normal
    const recusada = [a, b].find(r => r.status === 'rejected') as PromiseRejectedResult
    assert.equal((recusada.reason.getResponse() as any).codigo, 'BACKUP_MAQUINA_REVOGADA')
  })
})
