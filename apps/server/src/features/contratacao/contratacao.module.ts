/**
 * ============================================================================
 * NOME DO ARQUIVO: contratacao.module.ts
 * MÓDULO: CONTRATAÇÃO
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Agrupa a venda: o site de contratação (planos públicos, identificar cliente,
 * contratar) e a cobrança iniciada pelo ERP (/erp/cobranca, /erp/plano/:id).
 *
 * Antes estas rotas moravam em features/erp/, junto com login, backup e perfil.
 * Agora cada rota do ERP fica na pasta do assunto dela; aqui é "vender".
 * ============================================================================
 */
import { Module } from '@nestjs/common'
import { LicencaModule }    from '../licenca/licenca.module'       // cria a licença do cliente novo
import { FinanceiroModule } from '../financeiro/financeiro.module' // gera o checkout do Stripe
import { PlanoModule }      from '../plano/plano.module'           // vitrine de planos e preços
import { ErpCobrancaController } from './erp-cobranca.controller'
import { ErpContratacaoService } from './erp-contratacao.service'

@Module({
  imports:     [LicencaModule, FinanceiroModule, PlanoModule],
  controllers: [ErpCobrancaController],
  providers:   [ErpContratacaoService],
})
export class ContratacaoModule {}
