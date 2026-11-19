/**
 * ============================================================================
 * NOME DO ARQUIVO: erp-licenca.guard.ts
 * MÓDULO: Core (guards)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Protege as rotas do ERP (o app da loja) com o TOKEN DA LICENÇA, um JWT
 * assinado em RS256 pela própria API.
 *
 * Um "guard" do NestJS é uma porta que roda antes da rota: devolve true para
 * deixar passar, ou lança uma exceção para recusar.
 *
 * LIC-05 (ACORDO D-04): além da assinatura e da validade, o guard consulta se a
 * MÁQUINA do token foi revogada (servidor antigo, depois de uma troca). Sem
 * isso, o token de uma máquina já trocada continuava valendo por até 7 dias e
 * conseguia baixar o backup da empresa inteira.
 * ============================================================================
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { hwidEstaRevogado } from '@startbig/database'
import { DispositivoService } from '../../features/dispositivos/dispositivo.service'
import jwt from 'jsonwebtoken'

/**
 * Lê e confere o token da licença do cabeçalho `Authorization: Bearer ...`.
 *
 * - Sem cabeçalho: devolve `null` (quem chama decide se o token é obrigatório).
 * - Token com assinatura errada ou vencido: lança 401.
 * - Token bom: devolve as claims (licencaId, hwid, ...).
 *
 * Fica separado do guard porque o heartbeat (LIC-09) usa a mesma conferência
 * com o token OPCIONAL na transição (ADR-004).
 */
export function lerTokenDaLicenca(request: any, publicKey: string): any | null {
  const authHeader: string | undefined = request.headers?.authorization
  if (!authHeader?.startsWith('Bearer ')) return null

  try {
    // jwt.verify confere a assinatura com a chave pública E a validade (exp).
    return jwt.verify(authHeader.slice(7), publicKey, { algorithms: ['RS256'] })
  } catch {
    throw new UnauthorizedException('Token de licença inválido ou expirado.')
  }
}

@Injectable()
export class ErpLicencaGuard implements CanActivate {
  constructor(private readonly dispositivoService: DispositivoService) {}

  /** `async` porque a revogação é uma consulta ao banco. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const payload = lerTokenDaLicenca(request, this.dispositivoService.getPublicKey())

    if (!payload) throw new UnauthorizedException('Token de licença não fornecido.')

    // A regra aqui é só "a máquina não foi revogada". Ser o servidor ATUAL é
    // exigido só no backup (erp-backup.service): o login sem hwid gera um token
    // com identificador próprio (login-<uuid>), que nunca está nesta lista.
    if (payload.hwid && await hwidEstaRevogado(payload.licencaId, payload.hwid))
      throw new UnauthorizedException({
        codigo:  'LICENCA_HWID_REVOGADO',
        message: 'Esta máquina não é mais o servidor desta licença.',
      })

    request.erp = payload   // as rotas leem licencaId e hwid daqui
    return true
  }
}
