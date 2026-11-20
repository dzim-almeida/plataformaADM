/**
 * ============================================================================
 * NOME DO ARQUIVO: reenviar-link.test.ts
 * MÓDULO: ERP (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-06 (CT-15 a CT-21). O POST /erp/auth/reenviar-link e o primeiro acesso:
 * - responde sempre 202 e escolhe o link pelo estado da conta (D-31);
 * - no máximo um envio por minuto;
 * - o link de nova senha grava só o HASH em `tokenSenha` (D-35) e vale mesmo
 *   com uma senha já cadastrada (mitigação do R-01);
 * - `tokenEmail` (troca de e-mail) e `tokenSenha` não se misturam.
 * Usa o EmailService de verdade, com o Resend simulado no `fetch`.
 * ============================================================================
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { EmailService } from '../../src/core/email/email.service'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { ErpAuthService } from '../../src/features/erp/erp-auth.service'
import { hashDoToken } from '../../src/core/seguranca/token-de-link'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const EMAIL = 'dono@loja.com.br'
const fetchOriginal = globalThis.fetch
let enviados: { para: string; html: string }[] = []

/** O Resend aceita tudo; guardamos o destinatário e o HTML de cada e-mail. */
function simularResend() {
  enviados = []
  globalThis.fetch = (async (_url: any, init: any) => {
    const corpo = JSON.parse(init.body)
    enviados.push({ para: [].concat(corpo.to).join(','), html: corpo.html })
    return new Response(JSON.stringify({ id: 're_teste' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as any
}

/** Token que foi no link do e-mail (`?token=...`). */
const tokenDoLink = (html: string, pagina: string) =>
  new RegExp(`${pagina}\\?token=([a-f0-9]+)`).exec(html)![1]

function montar() {
  const email = new EmailService()
  const dispositivos = new DispositivoService(email, {} as any)
  return new ErpAuthService(dispositivos)
}

function cliente(extra: Record<string, any> = {}) {
  tabelas.cliente.push({
    id: 'cli-1', email: EMAIL, senhaHash: null, falhasLogin: 0, bloqueadoAte: null,
    tokenConfirmacaoEmail: null, tokenSenha: null, ultimoEnvioLinkEm: null,
    tokenEmail: null, tokenEmailExpiraEm: null, emailPendente: null, ...extra,
  })
  tabelas.clientePF.push({ id: 'pf-1', clienteId: 'cli-1', nomeCompleto: 'Dono', cpf: '52998224725' })
}

const RESPOSTA = { statusCode: 202, message: 'Se este e-mail tiver conta, enviamos um link.' }

describe('LIC-06 — reenviar link e primeiro acesso', () => {
  beforeEach(() => { reiniciarBanco(); simularResend() })
  afterEach(() => { globalThis.fetch = fetchOriginal })

  it('CT-15: conta com confirmação pendente → 202 e link de confirmação novo; o anterior deixa de valer', async () => {
    cliente({ tokenConfirmacaoEmail: hashDoToken('token-velho'), tokenConfirmacaoExpiraEm: new Date(Date.now() + 1000) })

    assert.deepEqual(await montar().reenviarLink({ email: EMAIL }), RESPOSTA)

    const novo = tokenDoLink(enviados[0].html, 'confirmar-cadastro')
    assert.equal(tabelas.cliente[0].tokenConfirmacaoEmail, hashDoToken(novo))
    assert.notEqual(tabelas.cliente[0].tokenConfirmacaoEmail, hashDoToken('token-velho'))
  })

  it('CT-16: conta confirmada → 202 e link de nova senha, com o hash em tokenSenha', async () => {
    cliente({ senhaHash: 'qualquer', emailConfirmadoEm: new Date() })

    assert.deepEqual(await montar().reenviarLink({ email: EMAIL }), RESPOSTA)

    const token = tokenDoLink(enviados[0].html, 'primeiro-acesso')
    assert.equal(tabelas.cliente[0].tokenSenha, hashDoToken(token))   // o banco não guarda o token
    assert.ok(tabelas.cliente[0].tokenSenhaExpiraEm > new Date())
  })

  it('CT-17: e-mail inexistente → mesmo 202, nada enviado', async () => {
    assert.deepEqual(await montar().reenviarLink({ email: 'ninguem@loja.com.br' }), RESPOSTA)
    assert.equal(enviados.length, 0)
  })

  it('CT-18: segundo pedido dentro de 60 s → 202 sem novo envio', async () => {
    cliente({ senhaHash: 'qualquer' })
    const auth = montar()

    await auth.reenviarLink({ email: EMAIL })
    assert.deepEqual(await auth.reenviarLink({ email: EMAIL }), RESPOSTA)
    assert.equal(enviados.length, 1)
  })

  it('CT-19: nova senha pelo link vale e a antiga deixa de valer (R-01)', async () => {
    cliente({ senhaHash: await bcrypt.hash('senha-do-atacante', 4) })
    const auth = montar()
    await auth.reenviarLink({ email: EMAIL })
    const token = tokenDoLink(enviados[0].html, 'primeiro-acesso')

    await auth.primeiroAcesso({ token, novaSenha: 'senha-do-dono-1' })

    const hash = tabelas.cliente[0].senhaHash
    assert.equal(await bcrypt.compare('senha-do-dono-1', hash), true)
    assert.equal(await bcrypt.compare('senha-do-atacante', hash), false)
    assert.equal(tabelas.cliente[0].tokenSenha, null)                        // link de uso único
    await assert.rejects(auth.primeiroAcesso({ token, novaSenha: 'outra-senha-1' }), /Link inválido/)
  })

  it('CT-20: token de troca de e-mail (tokenEmail) não define senha', async () => {
    cliente({ senhaHash: 'hash-antigo', tokenEmail: 'token-da-troca', tokenEmailExpiraEm: new Date(Date.now() + 60_000) })

    await assert.rejects(montar().primeiroAcesso({ token: 'token-da-troca', novaSenha: 'senha-nova-1' }), /Link inválido/)
    assert.equal(tabelas.cliente[0].senhaHash, 'hash-antigo')
  })

  it('CT-21: pedir link de senha não cancela uma troca de e-mail pendente', async () => {
    const expira = new Date(Date.now() + 60_000)
    cliente({ senhaHash: 'x', tokenEmail: 'token-da-troca', tokenEmailExpiraEm: expira, emailPendente: 'novo@loja.com.br' })

    await montar().reenviarLink({ email: EMAIL })

    const c = tabelas.cliente[0]
    assert.equal(c.tokenEmail, 'token-da-troca')
    assert.equal(c.tokenEmailExpiraEm, expira)
    assert.equal(c.emailPendente, 'novo@loja.com.br')
    assert.ok(c.tokenSenha)
  })

  it('link de senha vencido pede um novo pelo StartBig', async () => {
    cliente({ tokenSenha: hashDoToken('t1'), tokenSenhaExpiraEm: new Date(Date.now() - 1000) })

    await assert.rejects(montar().primeiroAcesso({ token: 't1', novaSenha: 'senha-nova-1' }), /Peça um novo link no StartBig/)
  })
})
