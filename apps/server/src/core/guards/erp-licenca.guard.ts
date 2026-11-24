/**
 * ============================================================================
 * NOME DO ARQUIVO: erp-licenca.guard.ts
 * MÓDULO: CORE/GUARDS
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Protege as rotas que o ERP desktop chama (/erp/fiscal, /erp/backup,
 * /erp/usuario). Só deixa passar quem mandar um token de licença assinado
 * pela nossa chave privada RSA.
 *
 * Não depende de nenhum service: lê a chave pública de core/config. Por isso
 * pode ser usado com @UseGuards em qualquer módulo sem importar o de licença.
 * ============================================================================
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import jwt from 'jsonwebtoken'                                            // biblioteca que confere tokens JWT
import { CHAVE_PUBLICA_LICENCA } from '../config/chaves-licenca'          // chave que confere a assinatura

@Injectable()
export class ErpLicencaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Pega a requisição HTTP que está chegando.
    const request = context.switchToHttp().getRequest()
    // O ERP manda o token no cabeçalho: "Authorization: Bearer <token>".
    const authHeader: string | undefined = request.headers.authorization

    // Sem o cabeçalho, ou num formato diferente, recusa na hora.
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de licença não fornecido.')
    }

    // Remove o prefixo "Bearer " (7 caracteres) e fica só com o token.
    const token = authHeader.slice(7)
    try {
      // Confere a assinatura e a validade. Aceita SÓ RS256, para ninguém
      // conseguir trocar o algoritmo por um mais fraco.
      const payload = jwt.verify(token, CHAVE_PUBLICA_LICENCA, { algorithms: ['RS256'] })
      // Guarda os dados da licença na requisição; os controllers leem em req.erp.
      request.erp = payload
      return true
    } catch {
      // Assinatura errada, token vencido ou malformado: mesma resposta para todos.
      throw new UnauthorizedException('Token de licença inválido ou expirado.')
    }
  }
}
