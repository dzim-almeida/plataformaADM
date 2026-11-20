/**
 * ============================================================================
 * NOME DO ARQUIVO: login-bloqueio.test.ts
 * MÓDULO: ERP (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-06 (CT-09 a CT-14). O POST /erp/auth/login:
 * - bloqueia o e-mail depois de 5 senhas erradas seguidas (1, 5, 15 min, D-09);
 * - responde igual para e-mail inexistente, senha errada e conta sem senha (F12);
 * - conta SEM licença com confirmação pendente: 403 AGUARDANDO_CONFIRMACAO_EMAIL;
 * - quem já tinha licença entra como sempre, sem nenhum preenchimento (D-32).
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { HttpException } from '@nestjs/common'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { ErpAuthService } from '../../src/features/erp/erp-auth.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const EMAIL = 'dono@loja.com.br'
const SENHA = 'senha-certa'
const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

let senhaHash: string

function cliente(extra: Record<string, any> = {}) {
  tabelas.cliente.push({ id: 'cli-1', email: EMAIL, senhaHash, falhasLogin: 0, bloqueadoAte: null, tokenConfirmacaoEmail: null, ...extra })
}

function licenca() {
  tabelas.licenca.push({
    id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', clienteId: 'cli-1', planoId: 'plano-1', chaveAtivacao: 'CHAVE-1',
    status: 'ATIVA', usuariosExtras: 0, isTrial: false, dataVencimento: dias(30), carenciaAte: null,
    hwidServidor: null, criadoEm: dias(-100),
    plano: { id: 'plano-1', nome: 'Básico', limiteUsuario: 2, modulos: [] },
    cliente: { email: EMAIL, pf: { nomeCompleto: 'Dono' }, pj: null }, modulosExtras: [],
  })
}

const auth = () => new ErpAuthService(new DispositivoService({ enviarAlertaTrocaDispositivo: async () => {} } as any, {} as any))
const login = (senha = SENHA, email = EMAIL) => auth().login({ email, senha, hwid: 'hwid-servidor' })

const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

describe('LIC-06 — login com bloqueio progressivo e resposta genérica', () => {
  beforeEach(async () => {
    reiniciarBanco()
    senhaHash ??= await bcrypt.hash(SENHA, 4)
  })

  it('CT-09: cinco falhas seguidas gravam bloqueadoAte de 1 minuto', async () => {
    cliente()
    for (let i = 0; i < 5; i++)
      await assert.rejects(login('errada'), recusa(401, 'CREDENCIAIS_INVALIDAS'))

    const c = tabelas.cliente[0]
    assert.equal(c.falhasLogin, 5)
    const minutos = (c.bloqueadoAte.getTime() - Date.now()) / 60_000
    assert.ok(minutos > 0.9 && minutos <= 1, `bloqueio de ${minutos} min`)
  })

  it('quatro falhas não bloqueiam; a 6ª bloqueia 5 min e a 7ª, 15 min (teto)', async () => {
    cliente({ falhasLogin: 3 })
    await assert.rejects(login('errada'))
    assert.equal(tabelas.cliente[0].bloqueadoAte, null)

    tabelas.cliente[0].falhasLogin = 5
    await assert.rejects(login('errada'))
    assert.ok((tabelas.cliente[0].bloqueadoAte.getTime() - Date.now()) / 60_000 > 4.9)

    tabelas.cliente[0].bloqueadoAte = null
    tabelas.cliente[0].falhasLogin = 9
    await assert.rejects(login('errada'))
    const min = (tabelas.cliente[0].bloqueadoAte.getTime() - Date.now()) / 60_000
    assert.ok(min > 14.9 && min <= 15)
  })

  it('CT-10: durante o bloqueio, até a senha certa recebe 429 MUITAS_TENTATIVAS', async () => {
    cliente({ falhasLogin: 5, bloqueadoAte: new Date(Date.now() + 60_000) })
    licenca()

    await assert.rejects(login(), recusa(429, 'MUITAS_TENTATIVAS'))
  })

  it('CT-11: e-mail inexistente, senha errada e conta sem senha — mesma resposta 401', async () => {
    cliente()
    tabelas.cliente.push({ id: 'cli-2', email: 'semsenha@loja.com.br', senhaHash: null, falhasLogin: 0 })

    const respostas = []
    // Funções (e não promessas): cada tentativa só começa quando a anterior acabou.
    const tentativas = [() => login(SENHA, 'nao@existe.com.br'), () => login('errada'), () => login(SENHA, 'semsenha@loja.com.br')]
    for (const tentativa of tentativas) {
      const e = await tentativa().then(() => null, (x: any) => x)
      respostas.push([e.getStatus(), e.getResponse()])
    }
    assert.deepEqual(respostas[0], respostas[1])
    assert.deepEqual(respostas[1], respostas[2])
    assert.equal(respostas[0][0], 401)
    assert.equal((respostas[0][1] as any).codigo, 'CREDENCIAIS_INVALIDAS')
  })

  it('CT-12: conta sem licença com confirmação pendente → 403 AGUARDANDO_CONFIRMACAO_EMAIL, sem chave', async () => {
    cliente({ tokenConfirmacaoEmail: 'hash-pendente' })

    await assert.rejects(login(), recusa(403, 'AGUARDANDO_CONFIRMACAO_EMAIL'))
  })

  it('CT-13: depois da confirmação (licença criada), o login devolve a chave', async () => {
    cliente({ emailConfirmadoEm: new Date() })
    licenca()

    const r = await login() as any
    assert.equal(r.chaveAtivacao, 'CHAVE-1')
  })

  it('CT-14: cliente antigo, com licença e sem emailConfirmadoEm, entra normalmente', async () => {
    cliente({ emailConfirmadoEm: undefined })
    licenca()

    const r = await login() as any
    assert.equal(r.chaveAtivacao, 'CHAVE-1')
  })

  it('acertar a senha zera as falhas', async () => {
    cliente({ falhasLogin: 3 })
    licenca()

    await login()
    assert.equal(tabelas.cliente[0].falhasLogin, 0)
  })
})
