/**
 * ============================================================================
 * NOME DO ARQUIVO: contrato-recusa.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-05 (CT-14 a CT-16). Trava o FORMATO das recusas que o app da loja lê
 * (F27, F28). As versões instaladas do app não se atualizam sozinhas
 * (ADR-004): mudar um status aqui sem querer quebra a loja em produção. Com
 * estes testes, quem muda o status quebra o teste antes.
 *
 * - /licenca/conectar vencida: 402 com `codigo: LICENCA_VENCIDA` (o app já
 *   trata 402 como vencimento).
 * - /licenca/validar recusada: 201 (valor de retorno) com `valida: false`.
 * - /licenca/conectar de máquina transferida: 400 LICENCA_TRANSFERIDA.
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException } from '@nestjs/common'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const CHAVE   = 'CHAVE-1'
const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

function cadastrar(licenca: Record<string, any> = {}) {
  tabelas.licenca.push({
    id: LICENCA, clienteId: 'cli-1', planoId: 'plano-1', chaveAtivacao: CHAVE,
    status: 'ATIVA', usuariosExtras: 0, isTrial: false,
    dataVencimento: dias(30), carenciaAte: null, hwidServidor: 'hwid-servidor', criadoEm: dias(-100),
    plano: { id: 'plano-1', nome: 'Básico', limiteUsuario: 2, modulos: [] },
    cliente: { email: 'dono@loja.com.br', pf: null, pj: null },
    modulosExtras: [],
    ...licenca,
  })
}

const servico = () => new DispositivoService({} as any, {} as any)

const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

describe('LIC-05 — contrato das recusas de licença (F27, F28)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-14: /licenca/conectar com licença vencida responde 402 LICENCA_VENCIDA', async () => {
    cadastrar({ dataVencimento: dias(-1) })

    await assert.rejects(servico().conectar({ chave: CHAVE, hwid: 'hwid-servidor' }), recusa(402, 'LICENCA_VENCIDA'))
    assert.equal(tabelas.licenca[0].status, 'VENCIDA')   // como antes, a licença é marcada
  })

  it('CT-14b: licença que o cron já marcou como VENCIDA também responde 402', async () => {
    cadastrar({ status: 'VENCIDA', dataVencimento: dias(-3) })

    await assert.rejects(servico().conectar({ chave: CHAVE, hwid: 'hwid-servidor' }), recusa(402, 'LICENCA_VENCIDA'))
  })

  it('CT-15: /licenca/validar recusada devolve valida: false com os campos esperados', async () => {
    cadastrar({ dataVencimento: dias(-1) })

    const r = await servico().validar({ chave: CHAVE, hwid: 'hwid-servidor' }) as any

    // Sem exceção: o controller responde 201 com este corpo, e é assim que o app lê.
    assert.equal(r.valida, false)
    assert.equal(r.status, 'VENCIDA')
    assert.equal(r.motivo, 'Licença vencida.')
    assert.equal(r.licencaId, LICENCA)
    assert.equal(r.isTrial, false)
  })

  it('CT-16: /licenca/conectar de máquina transferida responde 400 LICENCA_TRANSFERIDA', async () => {
    cadastrar()
    tabelas.licencaHwidRevogado.push({ id: 'r-1', licencaId: LICENCA, hwid: 'hwid-antigo', revogadoEm: new Date() })

    await assert.rejects(servico().conectar({ chave: CHAVE, hwid: 'hwid-antigo' }), recusa(400, 'LICENCA_TRANSFERIDA'))
  })
})
