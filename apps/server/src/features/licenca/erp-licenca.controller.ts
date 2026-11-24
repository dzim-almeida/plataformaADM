import { Controller, Get, Post, Body } from '@nestjs/common'
import { LicencaService } from './licenca.service'
import { ErpAuthService } from './erp-auth.service'
import { Public } from '../../core/decorators/public.decorator'

@Public()
@Controller('erp')
export class ErpLicencaController {
  constructor(
    private readonly licencaService: LicencaService,
    private readonly erpAuthService:     ErpAuthService,
  ) {}

  @Get('chave-publica')
  getChavePublica() {
    return { publicKey: this.licencaService.getPublicKey() }
  }

  @Post('auto-cadastro')
  autoCadastro(@Body() body: unknown) {
    return this.licencaService.autoCadastro(body)
  }

  @Post('conectar')
  conectar(@Body() body: unknown) {
    return this.licencaService.conectar(body)
  }

  @Post('desconectar')
  desconectar(@Body() body: unknown) {
    return this.licencaService.desconectar(body)
  }

  @Post('heartbeat')
  heartbeat(@Body() body: unknown) {
    return this.licencaService.heartbeat(body)
  }

  @Post('validar')
  validar(@Body() body: unknown) {
    return this.licencaService.validar(body)
  }
}
