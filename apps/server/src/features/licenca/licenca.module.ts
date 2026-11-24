/**
 * ============================================================================
 * NOME DO ARQUIVO: licenca.module.ts
 * MÓDULO: LICENÇA
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Junta tudo que diz respeito à licença do ERP: o cadastro e a gestão pelo
 * painel, e a "identidade" do ERP (conectar, validar, login e perfil).
 *
 * CONVENÇÃO DE NOMES DESTA PASTA (vale para todas as features):
 * - licenca.controller.ts  → rotas do painel administrativo (/licenca)
 * - erp-*.controller.ts    → rotas que o ERP desktop chama (/erp/...)
 * ============================================================================
 */
import { Module } from '@nestjs/common'
import { EmailModule } from '../../integracoes/email/email.module' // a licença manda e-mail (chave, troca de PC)

// Painel administrativo
import { LicencaController } from './licenca.controller'
import { LicencaService }    from './licenca.service'

// Chamado pelo ERP desktop
import { ErpLicencaController } from './erp-licenca.controller' // /erp/conectar, /erp/validar, /erp/heartbeat...
import { ErpAuthController }    from './erp-auth.controller'    // /erp/auth/login e /erp/auth/primeiro-acesso
import { ErpAuthService }       from './erp-auth.service'
import { ErpUsuarioController } from './erp-usuario.controller' // /erp/usuario/dados, alterar-senha, e-mail
import { ErpUsuarioService }    from './erp-usuario.service'

@Module({
  // Módulos de que este depende.
  imports:     [EmailModule],
  // Classes que recebem requisições HTTP.
  controllers: [LicencaController, ErpLicencaController, ErpAuthController, ErpUsuarioController],
  // Classes com a regra de negócio, criadas pelo NestJS e entregues aos controllers.
  providers:   [LicencaService, ErpAuthService, ErpUsuarioService],
  // O LicencaService é usado também pela contratação (cria licença trial).
  exports:     [LicencaService],
})
export class LicencaModule {}
