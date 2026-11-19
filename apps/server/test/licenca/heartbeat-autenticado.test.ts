/**
 * ============================================================================
 * NOME DO ARQUIVO: heartbeat-autenticado.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-09 (CT-07 a CT-12). O heartbeat passa a ser autenticado pelo token da
 * licença (D-37), com transição para as versões instaladas (ADR-004):
 * - com token: renova e, sem sessão, cria se couber;
 * - sem token: só renova; sessão inexistente → 404 SESSAO_INEXISTENTE;
 * - nenhuma recusa NOVA é 400: o app instalado bloqueia a licença da loja
 *   quando todos os caixas recebem 400.
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { HttpException } from '@nestjs/common'
import { ErpLicencaGuardOpcional } from '../../src/core/guards/erp-licenca.guard'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'   // o heartbeatSchema exige uuid
const OUTRA   = '0a0b0c0d-1e2f-4a5b-8c6d-7e8f9a0b1c2d'
const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength:      2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const token = (claims: Record<string, unknown>) =>
  jwt.sign(claims, privateKey, { algorithm: 'RS256', expiresIn: '7d' })

function cadastrar(limiteUsuario = 2) {
  tabelas.licenca.push({
    id: LICENCA, clienteId: 'cli-1', planoId: 'plano-1', chaveAtivacao: 'CHAVE-1',
    status: 'ATIVA', usuariosExtras: 0, isTrial: false, totalUsuarios: 0,
    dataVencimento: dias(30), carenciaAte: null, hwidServidor: 'servidor',
    plano: { id: 'plano-1', nome: 'Básico', limiteUsuario, modulos: [] },
    modulosExtras: [],
  })
}

const sessao = (hwid: string) =>
  tabelas.licencaSessao.push({ id: `s-${hwid}`, licencaId: LICENCA, hwid, ultimoHeartbeat: dias(-0.001) })
const hwids = () => tabelas.licencaSessao.map(s => s.hwid).sort()

const servico = new DispositivoService({} as any, {} as any)
const guard   = new ErpLicencaGuardOpcional({ getPublicKey: () => publicKey } as any)

/** Passa pelo guard opcional e chama o heartbeat, como a rota faz. */
async function heartbeat(corpo: Record<string, unknown>, authorization?: string) {
  const request: any = { headers: authorization ? { authorization } : {} }
  await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)
  return servico.heartbeat(corpo, request.erp)
}

const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

const comToken = (hwid = 'servidor', licencaId = LICENCA) =>
  `Bearer ${token({ licencaId, hwid })}`

describe('LIC-09 — heartbeat autenticado com transição (D-37)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-07: com token, sessão inexistente e vaga livre — a sessão é criada', async () => {
    cadastrar()

    assert.deepEqual(await heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }, comToken()), { ok: true })
    assert.deepEqual(hwids(), ['caixa-01'])
  })

  it('com token, sessão inexistente e licença cheia — limite como hoje (400 LIMITE_DISPOSITIVOS)', async () => {
    cadastrar(1)
    sessao('caixa-01')

    await assert.rejects(
      heartbeat({ licencaId: LICENCA, hwid: 'caixa-02' }, comToken()),
      recusa(400, 'LIMITE_DISPOSITIVOS'),
    )
  })

  it('CT-08: sem token e sem sessão — 404 SESSAO_INEXISTENTE, nada criado', async () => {
    cadastrar()

    await assert.rejects(heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }), recusa(404, 'SESSAO_INEXISTENTE'))
    assert.deepEqual(hwids(), [])
  })

  it('CT-09: sem token e com sessão — renovada', async () => {
    cadastrar()
    sessao('caixa-01')
    const antes = tabelas.licencaSessao[0].ultimoHeartbeat

    assert.deepEqual(await heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }), { ok: true })
    assert.ok(tabelas.licencaSessao[0].ultimoHeartbeat > antes)
  })

  it('CT-10: token de máquina revogada — 401 LICENCA_HWID_REVOGADO', async () => {
    cadastrar()
    tabelas.licencaHwidRevogado.push({ id: 'r-1', licencaId: LICENCA, hwid: 'servidor-antigo', revogadoEm: new Date() })

    await assert.rejects(
      heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }, comToken('servidor-antigo')),
      recusa(401, 'LICENCA_HWID_REVOGADO'),
    )
  })

  it('CT-11: token de outra licença — 403 HEARTBEAT_LICENCA_DIVERGENTE', async () => {
    cadastrar()

    await assert.rejects(
      heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }, comToken('servidor', OUTRA)),
      recusa(403, 'HEARTBEAT_LICENCA_DIVERGENTE'),
    )
  })

  it('CT-12: nenhuma recusa NOVA do heartbeat usa 400', async () => {
    cadastrar()
    tabelas.licencaHwidRevogado.push({ id: 'r-1', licencaId: LICENCA, hwid: 'servidor-antigo', revogadoEm: new Date() })

    // As três recusas que a LIC-09 criou, com os status que o app instalado aguenta.
    const novas: [Promise<unknown>, number][] = [
      [heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }), 404],
      [heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }, comToken('servidor-antigo')), 401],
      [heartbeat({ licencaId: LICENCA, hwid: 'caixa-01' }, comToken('servidor', OUTRA)), 403],
    ]
    for (const [promessa, esperado] of novas) {
      const erro = await promessa.then(() => null, (e: unknown) => e)
      assert.ok(erro instanceof HttpException)
      assert.equal(erro.getStatus(), esperado)
      assert.notEqual(erro.getStatus(), 400)
    }
  })
})
