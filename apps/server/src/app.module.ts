/**
 * ============================================================================
 * NOME DO ARQUIVO: app.module.ts
 * MÓDULO: INICIALIZAÇÃO DO SERVIDOR
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * É o módulo raiz: lista todos os outros módulos da API e liga os "guards"
 * globais (as checagens que rodam antes de toda rota).
 *
 * COMO AS PASTAS ESTÃO ORGANIZADAS (ver docs/estrutura.md):
 * - core/        infraestrutura sem regra de negócio (guards, config, filtros)
 * - integracoes/ clientes de serviços externos (Stripe, Asaas, Focus, R2...)
 * - features/    regra de negócio, uma pasta por assunto
 * ============================================================================
 */
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'                    // habilita tarefas agendadas (@Cron)
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'  // limite de requisições por IP

// ── core/: checagens globais ────────────────────────────────────────────────
import { AuthGuard }  from './core/guards/auth.guard'   // exige o JWT do painel (exceto rotas @Public)
import { RolesGuard } from './core/guards/roles.guard'  // exige o perfil certo (ADMIN por padrão)

// ── integracoes/: serviços externos (todos @Global) ─────────────────────────
import { StripeModule }      from './integracoes/stripe/stripe.module'
import { AsaasModule }       from './integracoes/asaas/asaas.module'
import { NotificacaoModule } from './integracoes/notificacao/notificacao.module'
import { StorageModule }     from './integracoes/storage/storage.module'
import { FocusNfeModule }    from './integracoes/focus-nfe/focus-nfe.module'
import { EmailModule }       from './integracoes/email/email.module'

// ── features/: regra de negócio ─────────────────────────────────────────────
import { AuthModule }           from './features/auth/auth.module'
import { ClienteModule }        from './features/cliente/cliente.module'
import { UsuarioModule }        from './features/usuario/usuario.module'
import { EnderecoModule }       from './features/cliente/endereco/endereco.module'
import { LicencaModule }        from './features/licenca/licenca.module'
import { FinanceiroModule }     from './features/financeiro/financeiro.module'
import { CronModule }           from './features/cron/cron.module'
import { PlanoModule }          from './features/plano/plano.module'
import { ParceiroModule }       from './features/parceiro/parceiro.module'
import { ContratacaoModule }    from './features/contratacao/contratacao.module'
import { BackupModule }         from './features/backup/backup.module'
import { RenovacaoModule }      from './features/renovacao/renovacao.module'
import { FiscalModule }         from './features/fiscal/fiscal.module'
import { ModuloModule }         from './features/modulo/modulo.module'
import { EmailHistoricoModule } from './features/email-historico/email-historico.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // No máximo 100 requisições por minuto (60.000 ms) por IP.
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // Integrações
    StripeModule,
    AsaasModule,
    NotificacaoModule,
    StorageModule,
    FocusNfeModule,
    EmailModule,

    // Features. A ordem é a mesma de antes da reorganização: o NestJS registra
    // as rotas nessa ordem, e mudar isso poderia alterar qual rota responde
    // quando dois caminhos se parecem.
    AuthModule,
    ClienteModule,
    UsuarioModule,
    EnderecoModule,
    LicencaModule,
    FinanceiroModule,
    CronModule,
    PlanoModule,
    ParceiroModule,
    ContratacaoModule,
    BackupModule,
    RenovacaoModule,
    FiscalModule,
    ModuloModule,
    EmailHistoricoModule,
  ],
  providers: [
    // Guards globais, nesta ordem: limite de requisições → login → perfil.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
