/**
 * ============================================================================
 * NOME DO ARQUIVO: contratacao-cadastro.test.ts
 * MÓDULO: ERP (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Confere que a contratação pelo site guarda TUDO o que a pessoa preencheu
 * (endereço e celular), e não só nome, documento, e-mail e senha.
 *
 * Bug achado na homologação (11/2026): o site mandava o endereço, mas a
 * contratação não o repassava ao cadastro. O setup do app (LIC-03), que
 * preenche a loja com os dados da conta (GET /erp/usuario/titular), abria
 * com o endereço vazio.
 * ============================================================================
 */
import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'
import { DispositivoService } from '../../src/features/dispositivos/dispositivo.service'
import { cadastroDoSite } from '../../src/features/erp/erp-contratacao.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const CNPJ = '11222333000181'   // CNPJ válido de teste

// O cadastro confere se o domínio do e-mail recebe e-mail (registro MX).
// Aqui a resposta é fixa: nenhum teste sai para a internet.
mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.teste', priority: 1 }])

const ENDERECO = {
  cep: '60000000', logradouro: 'Rua das Flores', numero: '123',
  bairro: 'Centro', cidade: 'Fortaleza', estado: 'CE', complemento: 'Sala 2',
}

/** O corpo que o formulário do site (/contratar) manda para a API. */
const corpoDoSite = (extra: Record<string, unknown> = {}) => ({
  planoId: '00000000-0000-4000-8000-000000000001', meses: 1,
  nomeOuRazao: 'Loja Exemplo Ltda', documento: CNPJ,
  email: 'dono@loja.com.br', senha: 'senha-forte-1',
  celular: '(85) 99999-0000', endereco: ENDERECO,
  ...extra,
}) as any

/** O serviço de cadastro de verdade, com o e-mail e o resto de mentira. */
function servicoDeCadastro() {
  const email = new Proxy({}, { get: () => async () => undefined }) // qualquer envio "dá certo"
  return new DispositivoService(email as any, {} as any)
}

describe('contratação pelo site guarda o cadastro completo', () => {
  beforeEach(() => {
    reiniciarBanco()
    tabelas.usuario.push({ id: 'admin-1', tipoUsuario: 'ADMIN' })
    tabelas.plano.push({ id: 'plano-1', nome: 'Básico', status: 'ATIVO', precoMensal: 99, criadoEm: new Date(), limiteUsuario: 2, modulos: [] })
  })

  it('o endereço e o celular vão para o cadastro', () => {
    const cadastro = cadastroDoSite(corpoDoSite()) as any

    assert.deepEqual(cadastro.endereco, ENDERECO)
    assert.equal(cadastro.celular, '(85) 99999-0000')
  })

  it('o que é só da compra (plano, meses) e o hwid não vão para o cadastro', () => {
    const cadastro = cadastroDoSite(corpoDoSite({ hwid: 'hwid-do-navegador', fluxoConfirmacao: true })) as any

    assert.equal(cadastro.planoId, undefined)
    assert.equal(cadastro.meses, undefined)
    assert.equal(cadastro.hwid, undefined)              // o servidor da loja nunca vem do navegador
    assert.equal(cadastro.fluxoConfirmacao, undefined)
  })

  it('a conta criada pelo site fica com o endereço principal e o celular', async () => {
    await servicoDeCadastro().criarContaComTrial(cadastroDoSite(corpoDoSite()))

    assert.equal(tabelas.endereco.length, 1)
    assert.equal(tabelas.endereco[0].tipo, 'PRINCIPAL')
    assert.equal(tabelas.endereco[0].numero, '123')
    assert.equal(tabelas.clientePJ[0].celular, '(85) 99999-0000')
  })
})
