/**
 * ============================================================================
 * NOME DO ARQUIVO: licenca.controller.ts
 * MÓDULO: LICENÇA
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Atua como o "garçom" da API para o módulo de LICENÇA. Ele recebe as
 * requisições HTTP (GET, POST, PATCH, DELETE) vindas do frontend ou do ERP
 * e as direciona para o Service correspondente processar.
 * 
 * O QUE ELE CONTÉM:
 * - Rotas e Endpoints da API.
 * - Validação básica de entrada de dados (DTOs).
 * - Respostas HTTP formatadas para o cliente.
 * ============================================================================
 */
import { Controller, Post, Patch, Get, Delete, Param, Body, Query } from '@nestjs/common'
import { LicencaService } from './licenca.service'
import { Public } from '../../core/decorators/public.decorator'

@Controller('licenca')
export class LicencaController {
  constructor(private readonly licencaService: LicencaService) {}

  // Ordem importa: rotas fixas antes de parâmetros dinâmicos
  @Public()
  @Get('chave-publica')
  getChavePublica() {
    return { publicKey: this.licencaService.getPublicKey() }
  }

  @Get('planos')
  async listarPlanos() {
    const data = await this.licencaService.listarPlanos()
    return { data }
  }

  @Get('alertas')
  async alertasVencimento(@Query('dias') dias?: string) {
    const data = await this.licencaService.listarAlertasVencimento(dias ? Number(dias) : 30)
    return { data }
  }

  @Get()
  async listarTodas(
    @Query('status')  status?: string,
    @Query('isTrial') isTrial?: string,
    @Query('q')       q?: string,
  ) {
    const data = await this.licencaService.listarTodas({ status, isTrial, q })
    return { data }
  }

  @Post()
  async criar(@Body() body: unknown) {
    return this.licencaService.criarLicenca(body)
  }

  @Get('cliente/:clienteId')
  async listarPorCliente(@Param('clienteId') clienteId: string) {
    const data = await this.licencaService.buscarPorCliente(clienteId)
    return { data }
  }

  @Get(':id')
  async buscarPorId(@Param('id') id: string) {
    const data = await this.licencaService.buscarPorId(id)
    return { data }
  }

  @Delete(':id')
  async deletar(@Param('id') id: string) {
    return this.licencaService.deletarLicenca(id)
  }

  @Public()
  @Post('auto-cadastro')
  async autoCadastro(@Body() body: unknown) {
    return this.licencaService.autoCadastro(body)
  }

  @Public()
  @Post('conectar')
  async conectar(@Body() body: unknown) {
    return this.licencaService.conectar(body)
  }

  @Public()
  @Post('desconectar')
  async desconectar(@Body() body: unknown) {
    return this.licencaService.desconectar(body)
  }

  @Public()
  @Post('heartbeat')
  async heartbeat(@Body() body: unknown) {
    return this.licencaService.heartbeat(body)
  }

  @Public()
  @Post('validar')
  async validar(@Body() body: unknown) {
    return this.licencaService.validar(body)
  }

  @Post(':id/renovar')
  async renovar(@Param('id') id: string, @Body() body: unknown) {
    return this.licencaService.renovar(id, body)
  }

  @Patch(':id/cortesia')
  async darCortesia(@Param('id') id: string, @Body() body: unknown) {
    return this.licencaService.darCortesia(id, body)
  }

  @Patch(':id/resetar-usuarios')
  async resetarUsuarios(@Param('id') id: string) {
    return this.licencaService.resetarContadorUsuarios(id)
  }

  @Patch(':id/adicionar-extra')
  async adicionarExtra(@Param('id') id: string) {
    return this.licencaService.adicionarUsuarioExtra(id)
  }

  @Patch(':id/remover-extra')
  async removerExtra(@Param('id') id: string) {
    return this.licencaService.removerUsuarioExtra(id)
  }

  @Patch(':id/bloquear')
  async bloquear(@Param('id') id: string) {
    return this.licencaService.bloquear(id)
  }

  @Patch(':id/suspender')
  async suspender(@Param('id') id: string) {
    return this.licencaService.suspender(id)
  }

  @Patch(':id/revogar')
  async revogar(@Param('id') id: string) {
    return this.licencaService.revogar(id)
  }

  @Patch(':id/reativar')
  async reativar(@Param('id') id: string) {
    return this.licencaService.reativar(id)
  }

  @Patch(':id/trocar-dispositivo')
  async trocarDispositivo(@Param('id') id: string) {
    return this.licencaService.trocarDispositivo(id)
  }

  @Patch(':id/trocar-plano')
  async trocarPlano(@Param('id') id: string, @Body() body: unknown) {
    return this.licencaService.trocarPlano(id, body)
  }
}
