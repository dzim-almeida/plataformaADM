import { Module } from '@nestjs/common'
import { FiscalController, FiscalNfceController, FiscalConfigController } from './fiscal.controller'
import { FiscalNfseController } from './fiscal-nfse.controller'
import { FiscalNfseService } from './fiscal-nfse.service'
import { FiscalMunicipioService } from './fiscal-municipio.service'
import { FiscalAdminController, FiscalSaudeController, FiscalExcedenteController, FiscalMunicipioController, FiscalRotaNfseController } from './fiscal-admin.controller'
import { FiscalFranquiaService } from './fiscal-franquia.service'
import { FiscalExcedenteService } from './fiscal-excedente.service'
import { FiscalEmissaoService } from './fiscal-emissao.service'
import { FiscalCotaService } from './fiscal-cota.service'
import { FiscalOnboardingService } from './fiscal-onboarding.service'
import { FiscalSaudeService } from './fiscal-saude.service'

// Não importa mais o LicencaModule: ele só estava aqui para o ErpLicencaGuard,
// que agora lê a chave direto de core/config e não precisa de nenhum service.
@Module({
  controllers: [FiscalController, FiscalNfceController, FiscalNfseController, FiscalConfigController, FiscalAdminController, FiscalSaudeController, FiscalExcedenteController, FiscalMunicipioController, FiscalRotaNfseController],
  providers:   [FiscalOnboardingService, FiscalEmissaoService, FiscalNfseService, FiscalMunicipioService, FiscalCotaService, FiscalSaudeService, FiscalFranquiaService, FiscalExcedenteService],
  exports:     [FiscalOnboardingService, FiscalEmissaoService, FiscalCotaService],
})
export class FiscalModule {}
