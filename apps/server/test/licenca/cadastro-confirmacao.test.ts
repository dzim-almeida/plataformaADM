/**
 * ============================================================================
 * NOME DO ARQUIVO: cadastro-confirmacao.test.ts
 * MÓDULO: Licença (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-06 (CT-01 a CT-08). O cadastro pelo app:
 * - responde SEMPRE igual (conta nova, e-mail ou documento já cadastrado),
 *   para não revelar quem é cliente (D-31);
 * - 202 para o app novo, 409 CONFIRMACAO_NECESSARIA para os instalados (D-34);
 * - nunca cria licença nem manda a chave; a licença de teste nasce no link de
 *   confirmação (D-23, D-24).
 * Os e-mails são simulados (nada sai daqui) e o DNS do domínio também.
 * ============================================================================
 */
import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'
import { HttpException } from '@nestjs/common'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { hashDoToken } from '../../src/core/seguranca/token-de-link'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const CPF  = '52998224725'      // CPF válido de teste
const CNPJ = '11222333000181'   // CNPJ válido de teste

/** Domínio de e-mail sempre "existe": o teste não consulta DNS de verdade. */
mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.teste', priority: 1 }])

type Envio = { metodo: string; dados: any }

/** E-mails de mentira: guardam o que seria enviado. */
function montar() {
  const enviados: Envio[] = []
  const registrar = (metodo: string) => async (dados: any) => { enviados.push({ metodo, dados }) }
  const email = {
    enviarConfirmacaoCadastro:        registrar('confirmacao'),
    enviarAvisoJaCadastrado:          registrar('ja-cadastrado'),
    enviarAvisoDocumentoJaCadastrado: registrar('documento-ja-cadastrado'),
    enviarAlertaDocumentoUsado:       registrar('alerta-documento'),
    enviarPrimeiroAcesso:             registrar('nova-senha'),
    enviarChaveAtivacao:              registrar('CHAVE'),
  }
  return { servico: new DispositivoService(email as any, {} as any), enviados }
}

function semear() {
  tabelas.usuario.push({ id: 'admin-1', tipoUsuario: 'ADMIN' })
  tabelas.plano.push({ id: 'plano-1', nome: 'Básico', status: 'ATIVO', precoMensal: 99, criadoEm: new Date(), limiteUsuario: 2, modulos: [] })
}

const pedido = (extra: Record<string, unknown> = {}) => ({
  documento: CPF, nomeOuRazao: 'Dono da Loja', email: 'novo@loja.com.br', senha: 'senha-forte-1', ...extra,
})

/** Um cliente que já existe, com CPF e licença. */
function clienteExistente(email = 'antigo@loja.com.br') {
  tabelas.cliente.push({ id: 'cli-antigo', email, senhaHash: 'x', tokenConfirmacaoEmail: null, ultimoEnvioLinkEm: null })
  tabelas.clientePF.push({ id: 'pf-1', clienteId: 'cli-antigo', nomeCompleto: 'Titular Antigo', cpf: CPF })
  tabelas.clientePJ.push({ id: 'pj-1', clienteId: 'cli-antigo', razaoSocial: 'Antiga Ltda', cnpj: CNPJ })
}

const recusa = (status: number, codigo: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

/** A resposta do app novo, sempre a mesma. */
const RESPOSTA_202 = {
  statusCode: 202,
  message: 'Enviamos as instruções para o seu e-mail. Se este e-mail já tiver conta, enviamos as instruções para entrar.',
}

describe('LIC-06 — cadastro com resposta única e confirmação', () => {
  beforeEach(() => { reiniciarBanco(); semear() })

  it('CT-01: cadastro novo com fluxoConfirmacao → 202, conta sem licença, e-mail de confirmação sem chave', async () => {
    const { servico, enviados } = montar()

    assert.deepEqual(await servico.autoCadastro(pedido({ fluxoConfirmacao: true })), RESPOSTA_202)

    assert.equal(tabelas.cliente.length, 1)
    assert.equal(tabelas.licenca.length, 0)
    assert.deepEqual(enviados.map(e => e.metodo), ['confirmacao'])
    const cliente = tabelas.cliente[0]
    // O banco guarda só o HASH do token que foi no e-mail.
    assert.equal(cliente.tokenConfirmacaoEmail, hashDoToken(enviados[0].dados.token))
    assert.ok(!JSON.stringify(enviados).includes('START-'), 'nenhum e-mail leva a chave')
  })

  it('CT-02: cadastro novo SEM fluxoConfirmacao → 409 CONFIRMACAO_NECESSARIA, conta sem licença, e-mail enviado', async () => {
    const { servico, enviados } = montar()

    await assert.rejects(servico.autoCadastro(pedido()), recusa(409, 'CONFIRMACAO_NECESSARIA'))

    assert.equal(tabelas.cliente.length, 1)
    assert.equal(tabelas.licenca.length, 0)
    assert.deepEqual(enviados.map(e => e.metodo), ['confirmacao'])
  })

  it('CT-03: e-mail já cadastrado → mesma resposta, nada criado, aviso "já tem cadastro"', async () => {
    clienteExistente('novo@loja.com.br')
    const { servico, enviados } = montar()

    assert.deepEqual(await servico.autoCadastro(pedido({ documento: '39053344705', fluxoConfirmacao: true })), RESPOSTA_202)

    assert.equal(tabelas.cliente.length, 1)
    assert.deepEqual(enviados.map(e => e.metodo), ['ja-cadastrado'])
    assert.equal(enviados[0].dados.email, 'novo@loja.com.br')
  })

  it('CT-04: e-mail novo com CPF já cadastrado → mesma resposta, nada criado, aviso e alerta', async () => {
    clienteExistente()
    const { servico, enviados } = montar()

    assert.deepEqual(await servico.autoCadastro(pedido({ fluxoConfirmacao: true })), RESPOSTA_202)

    assert.equal(tabelas.cliente.length, 1)
    assert.deepEqual(enviados.map(e => [e.metodo, e.dados.email]), [
      ['documento-ja-cadastrado', 'novo@loja.com.br'],   // quem pediu
      ['alerta-documento',        'antigo@loja.com.br'], // o titular
    ])
  })

  it('CT-05: e-mail novo com CNPJ já cadastrado → igual ao CT-04', async () => {
    clienteExistente()
    const { servico, enviados } = montar()

    await assert.rejects(servico.autoCadastro(pedido({ documento: CNPJ })), recusa(409, 'CONFIRMACAO_NECESSARIA'))

    assert.equal(tabelas.cliente.length, 1)
    assert.deepEqual(enviados.map(e => e.metodo), ['documento-ja-cadastrado', 'alerta-documento'])
  })

  it('CT-06: link válido → licença de teste de 14 dias a partir de agora, sem e-mail de chave', async () => {
    const { servico, enviados } = montar()
    await servico.autoCadastro(pedido({ fluxoConfirmacao: true }))
    const token = enviados[0].dados.token

    const r = await servico.confirmarCadastro(token)

    assert.equal(r.message, 'Conta confirmada. Volte ao StartBig e entre com o seu e-mail e senha.')
    const cliente = tabelas.cliente[0]
    assert.ok(cliente.emailConfirmadoEm instanceof Date)
    assert.equal(cliente.tokenConfirmacaoEmail, null)
    assert.equal(tabelas.licenca.length, 1)
    const licenca = tabelas.licenca[0]
    assert.equal(licenca.isTrial, true)
    assert.equal(licenca.status, 'ATIVA')
    const dias = (licenca.dataVencimento.getTime() - Date.now()) / 86_400_000
    assert.ok(dias > 13.9 && dias <= 14, `vence em ${dias} dias`)
    assert.ok(!enviados.some(e => e.metodo === 'CHAVE'))
  })

  it('CT-07: link já usado → 400 TOKEN_CONFIRMACAO_INVALIDO, sem segunda licença', async () => {
    const { servico, enviados } = montar()
    await servico.autoCadastro(pedido({ fluxoConfirmacao: true }))
    const token = enviados[0].dados.token
    await servico.confirmarCadastro(token)

    await assert.rejects(servico.confirmarCadastro(token), recusa(400, 'TOKEN_CONFIRMACAO_INVALIDO'))
    await assert.rejects(servico.confirmarCadastro(undefined), recusa(400, 'TOKEN_CONFIRMACAO_INVALIDO'))
    assert.equal(tabelas.licenca.length, 1)
  })

  it('CT-08: link vencido → 410 TOKEN_CONFIRMACAO_EXPIRADO', async () => {
    const { servico, enviados } = montar()
    await servico.autoCadastro(pedido({ fluxoConfirmacao: true }))
    tabelas.cliente[0].tokenConfirmacaoExpiraEm = new Date(Date.now() - 1000)

    await assert.rejects(servico.confirmarCadastro(enviados[0].dados.token), recusa(410, 'TOKEN_CONFIRMACAO_EXPIRADO'))
    assert.equal(tabelas.licenca.length, 0)
  })

  it('validações que não revelam conta continuam 400 (CPF inválido)', async () => {
    const { servico } = montar()

    await assert.rejects(servico.autoCadastro(pedido({ documento: '11111111112' })), (e: any) => e.getStatus() === 400)
  })

  it('a contratação do site (criarContaComTrial) continua criando a licença na hora', async () => {
    const { servico } = montar()

    const r = await servico.criarContaComTrial(pedido()) as any

    assert.ok(r.licencaId)
    assert.equal(tabelas.licenca.length, 1)
  })
})
