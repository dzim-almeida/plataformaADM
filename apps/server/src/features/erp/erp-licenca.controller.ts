import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common'
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

  @Post('auto-cadastro')
  autoCadastro(@Body() body: unknown) {
    return this.dispositivoService.autoCadastro(body)
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
