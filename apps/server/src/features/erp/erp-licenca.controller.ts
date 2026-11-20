import { Controller, Get, Post, Body, Query, Req, UseGuards, HttpCode } from '@nestjs/common'
import { DispositivoService } from '../dispositivos/dispositivo.service'
import { ErpAuthService } from './erp-auth.service'
import { Public } from '../../core/decorators/public.decorator'
import { ErpLicencaGuardOpcional } from '../../core/guards/erp-licenca.guard'

@Public()
@Controller('erp')
export class ErpLicencaController {
  constructor(
    private readonly dispositivoService: DispositivoService,
    private readonly erpAuthService:     ErpAuthService,
  ) {}

  @Get('chave-publica')
  getChavePublica() {
    return { publicKey: this.dispositivoService.getPublicKey() }
  }

  // Cadastro pelo app (LIC-06): sempre a mesma resposta, sem criar licença.
  // 202 para o app novo; 409 CONFIRMACAO_NECESSARIA para as versões instaladas.
  @Post('auto-cadastro')
  @HttpCode(202)
  autoCadastro(@Body() body: unknown) {
    return this.dispositivoService.autoCadastro(body)
  }

  // Aberta pela página confirmar-cadastro do painel web, a partir do link do
  // e-mail. Cria a licença de teste (LIC-06, D-24).
  @Get('auto-cadastro/confirmar')
  confirmarCadastro(@Query('token') token?: string) {
    return this.dispositivoService.confirmarCadastro(token)
  }

  @Post('conectar')
  conectar(@Body() body: unknown) {
    return this.dispositivoService.conectar(body)
  }

  @Post('desconectar')
  desconectar(@Body() body: unknown) {
    return this.dispositivoService.desconectar(body)
  }

  // Gêmea de POST /licenca/heartbeat: token da licença opcional (LIC-09, D-37).
  @Post('heartbeat')
  @UseGuards(ErpLicencaGuardOpcional)
  heartbeat(@Req() req: any, @Body() body: unknown) {
    return this.dispositivoService.heartbeat(body, req.erp)
  }

  @Post('validar')
  validar(@Body() body: unknown) {
    return this.dispositivoService.validar(body)
  }
}
