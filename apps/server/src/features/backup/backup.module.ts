/**
 * ============================================================================
 * NOME DO ARQUIVO: backup.module.ts
 * MÓDULO: BACKUP
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Junta os dois lados do backup em nuvem:
 * - backup.controller.ts     → painel consulta os backups (/backups)
 * - erp-backup.controller.ts → ERP pede URL de envio/download (/erp/backup)
 *
 * O StorageService (Cloudflare R2) não aparece em `imports` porque o módulo
 * dele é @Global: fica disponível para todo o servidor.
 * ============================================================================
 */
import { Module } from '@nestjs/common'
import { BackupController }    from './backup.controller'
import { BackupService }       from './backup.service'
import { ErpBackupController } from './erp-backup.controller'
import { ErpBackupService }    from './erp-backup.service'

@Module({
  controllers: [BackupController, ErpBackupController],
  providers:   [BackupService, ErpBackupService],
})
export class BackupModule {}
