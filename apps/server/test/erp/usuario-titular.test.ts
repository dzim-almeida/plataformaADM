/**
 * ============================================================================
 * NOME DO ARQUIVO: usuario-titular.test.ts
 * MÓDULO: ERP (testes)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * LIC-06 (CT-22 a CT-27). GET e PUT /erp/usuario/titular: os dados da empresa
 * do titular, para o setup do app (D-22, D-28). O documento é só leitura
 * (DOCUMENTO_TRAVADO), e as rotas exigem o token da licença, com a recusa de
 * máquina revogada do guard (LIC-05).
 * ============================================================================
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { HttpException } from '@nestjs/common'
import { ErpLicencaGuard } from '../../src/core/guards/erp-licenca.guard'
import { ErpUsuarioService } from '../../src/features/erp/erp-usuario.service'
import { reiniciarBanco, tabelas } from '../apoio/prisma-falso'

const LICENCA = 'lic-1'
const servico = new ErpUsuarioService()

function titularPJ() {
  tabelas.licenca.push({ id: LICENCA, clienteId: 'cli-1' })
  tabelas.cliente.push({ id: 'cli-1', email: 'dono@loja.com.br' })
  tabelas.clientePJ.push({
    id: 'pj-1', clienteId: 'cli-1', razaoSocial: 'Loja Exemplo Ltda', cnpj: '11222333000181',
    nomeFantasia: 'Loja Exemplo', telefone: '(85) 3000-0000', celular: '(85) 99999-0000',
  })
  tabelas.endereco.push({
    id: 'end-1', clienteId: 'cli-1', tipo: 'PRINCIPAL', cep: '63000-000', logradouro: 'Rua A',
    numero: '10', complemento: null, bairro: 'Centro', cidade: 'Iguatu', estado: 'CE',
  })
}

function titularPF() {
  tabelas.licenca.push({ id: LICENCA, clienteId: 'cli-2' })
  tabelas.cliente.push({ id: 'cli-2', email: 'pf@loja.com.br' })
  tabelas.clientePF.push({ id: 'pf-1', clienteId: 'cli-2', nomeCompleto: 'Maria Antiga', cpf: '52998224725' })
}

const recusa = (status: number, codigo?: string) => (e: unknown) => {
  assert.ok(e instanceof HttpException, String(e))
  assert.equal(e.getStatus(), status)
  if (codigo) assert.equal((e.getResponse() as any).codigo, codigo)
  return true
}

describe('LIC-06 — dados do titular (GET e PUT /erp/usuario/titular)', () => {
  beforeEach(() => reiniciarBanco())

  it('CT-22: GET devolve os dados da empresa no formato da §4.5', async () => {
    titularPJ()

    assert.deepEqual(await servico.lerTitular(LICENCA), {
      tipoPessoa: 'PJ', nomeOuRazao: 'Loja Exemplo Ltda', documento: '11.222.333/0001-81',
      nomeFantasia: 'Loja Exemplo', telefone: '(85) 3000-0000', celular: '(85) 99999-0000',
      endereco: { cep: '63000-000', logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Iguatu', estado: 'CE' },
    })
  })

  it('CT-23: token de máquina revogada recebe 401 LICENCA_HWID_REVOGADO (GET e PUT passam pelo guard)', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    tabelas.licencaHwidRevogado.push({ id: 'r-1', licencaId: LICENCA, hwid: 'servidor-antigo', revogadoEm: new Date() })
    const token = jwt.sign({ licencaId: LICENCA, hwid: 'servidor-antigo' }, privateKey, { algorithm: 'RS256' })
    const guard = new ErpLicencaGuard({ getPublicKey: () => publicKey } as any)
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }) }) }

    await assert.rejects(guard.canActivate(ctx), recusa(401, 'LICENCA_HWID_REVOGADO'))
  })

  it('CT-24: PUT com dados válidos atualiza e devolve o GET', async () => {
    titularPJ()

    const r = await servico.atualizarTitular(LICENCA, {
      nomeOuRazao: 'Loja Nova Ltda', nomeFantasia: 'Loja Nova', celular: '(85) 98888-0000',
      endereco: { cep: '63500-000', logradouro: 'Rua B', numero: '20', bairro: 'Prado', cidade: 'Iguatu', estado: 'CE' },
    })

    assert.equal(r.nomeOuRazao, 'Loja Nova Ltda')
    assert.equal(r.nomeFantasia, 'Loja Nova')
    assert.equal(r.celular, '(85) 98888-0000')
    assert.equal(r.telefone, '(85) 3000-0000')            // o que não veio, fica
    assert.equal(r.endereco!.logradouro, 'Rua B')
    assert.equal(tabelas.endereco.length, 1)              // atualizou, não duplicou
    assert.equal(r.documento, '11.222.333/0001-81')
  })

  it('CT-25: PUT com documento → 403 DOCUMENTO_TRAVADO, nada alterado', async () => {
    titularPJ()

    await assert.rejects(
      servico.atualizarTitular(LICENCA, { documento: '00000000000000', nomeOuRazao: 'Outra Ltda' }),
      recusa(403, 'DOCUMENTO_TRAVADO'),
    )
    assert.equal(tabelas.clientePJ[0].razaoSocial, 'Loja Exemplo Ltda')
    assert.equal(tabelas.clientePJ[0].cnpj, '11222333000181')
  })

  it('CT-26: PUT de titular PF grava o nome em pf.nomeCompleto e cria o endereço que faltava', async () => {
    titularPF()

    const r = await servico.atualizarTitular(LICENCA, {
      nomeOuRazao: 'Maria Nova',
      endereco: { cep: '60000-000', logradouro: 'Av. C', numero: '5', bairro: 'Aldeota', cidade: 'Fortaleza', estado: 'CE' },
    })

    assert.equal(tabelas.clientePF[0].nomeCompleto, 'Maria Nova')
    assert.equal(r.tipoPessoa, 'PF')
    assert.equal(r.documento, '529.982.247-25')
    assert.equal(r.endereco!.cidade, 'Fortaleza')
    assert.equal(tabelas.endereco[0].tipo, 'PRINCIPAL')
  })

  it('titular PF devolve o celular e o telefone guardados na própria PF', async () => {
    titularPF()
    tabelas.clientePF[0].celular  = '(85) 98888-0000'
    tabelas.clientePF[0].telefone = '(85) 3111-0000'

    const r = await servico.lerTitular(LICENCA)

    assert.equal(r.celular, '(85) 98888-0000')
    assert.equal(r.telefone, '(85) 3111-0000')
  })

  it('PUT de titular PF grava os telefones na PF', async () => {
    titularPF()

    const r = await servico.atualizarTitular(LICENCA, { celular: '(85) 97777-0000', telefone: '(85) 3222-0000' })

    assert.equal(tabelas.clientePF[0].celular, '(85) 97777-0000')
    assert.equal(tabelas.clientePF[0].telefone, '(85) 3222-0000')
    assert.equal(tabelas.clientePF[0].nomeCompleto, 'Maria Antiga')   // o nome não mudou
    assert.equal(r.celular, '(85) 97777-0000')
  })

  it('CT-27: PUT com campo inválido → 400 com detalhes', async () => {
    titularPJ()

    await assert.rejects(
      servico.atualizarTitular(LICENCA, { endereco: { cep: '1', logradouro: '', numero: '', bairro: '', cidade: '', estado: 'Ceará' } }),
      (e: any) => {
        assert.equal(e.getStatus(), 400)
        assert.ok(Array.isArray(e.getResponse().detalhes) && e.getResponse().detalhes.length > 0)
        return true
      },
    )
  })

  it('PUT com tipoPessoa é recusado (o tipo não muda por aqui)', async () => {
    titularPJ()

    await assert.rejects(servico.atualizarTitular(LICENCA, { tipoPessoa: 'PF' }), recusa(400))
  })
})
