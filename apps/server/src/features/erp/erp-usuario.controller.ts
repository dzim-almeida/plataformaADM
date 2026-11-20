import { Controller, Get, Post, Put, Body, Query, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ErpUsuarioService } from './erp-usuario.service'
import { ErpLicencaGuard } from '../../core/guards/erp-licenca.guard'
import { Public } from '../../core/decorators/public.decorator'

/// `@Public()` tira do caminho o AuthGuard global (que valida HS256 com o segredo
/// do painel admin) — sem ele, o token RS256 da licença era rejeitado com
/// "Token inválido ou expirado." antes de o ErpLicencaGuard rodar, e estas rotas
/// não respondiam para nenhum ERP. Quem autentica aqui é o ErpLicencaGuard.
@Public()
@UseGuards(ErpLicencaGuard)
@Controller('erp/usuario')
export class ErpUsuarioController {
  constructor(private readonly erpUsuarioService: ErpUsuarioService) {}

  @Get('dados')
  getDados(@Req() req: Request & { erp: { licencaId: string } }) {
    return this.erpUsuarioService.getDados(req.erp.licencaId)
  }

  // Dados da empresa do titular, para o setup do app (LIC-06, D-28). Herdam o
  // @Public() e o ErpLicencaGuard da classe: exigem o token da licença, e o
  // token de máquina revogada recebe 401 (LIC-05).
  @Get('titular')
  lerTitular(@Req() req: Request & { erp: { licencaId: string } }) {
    return this.erpUsuarioService.lerTitular(req.erp.licencaId)
  }

  @Put('titular')
  atualizarTitular(
    @Req() req: Request & { erp: { licencaId: string } },
    @Body() body: unknown,
  ) {
    return this.erpUsuarioService.atualizarTitular(req.erp.licencaId, body)
  }

  @Post('alterar-senha')
  alterarSenha(
    @Req() req: Request & { erp: { licencaId: string } },
    @Body() body: unknown,
  ) {
    return this.erpUsuarioService.alterarSenha(req.erp.licencaId, body)
  }

  @Post('solicitar-novo-email')
  solicitarNovoEmail(
    @Req() req: Request & { erp: { licencaId: string } },
    @Body() body: unknown,
  ) {
    return this.erpUsuarioService.solicitarNovoEmail(req.erp.licencaId, body)
  }

  // Chamado pela página Next.js após clique no link — não precisa de token de licença
  @Public()
  @Get('confirmar-email')
  confirmarEmail(@Query('token') token: string) {
    return this.erpUsuarioService.confirmarEmail(token)
  }
}
