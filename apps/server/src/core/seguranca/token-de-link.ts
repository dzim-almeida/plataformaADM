/**
 * ============================================================================
 * NOME DO ARQUIVO: token-de-link.ts
 * MÓDULO: Core (segurança)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Tokens dos links enviados por e-mail (confirmar cadastro, criar nova senha),
 * LIC-06 / ACORDO D-35.
 *
 * O token vai no link, e o banco guarda só o HASH dele (sha256). Assim, quem
 * conseguir ler o banco não consegue montar um link válido: precisaria do
 * token original, que só existe no e-mail do dono.
 * ============================================================================
 */
import { createHash, randomBytes } from 'crypto'

/** Resumo sha256 (hex) do token: é o que se grava e o que se procura no banco. */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Gera um token novo: `bruto` vai no link do e-mail; `hash` vai para o banco. */
export function novoTokenDeLink(): { bruto: string; hash: string } {
  const bruto = randomBytes(32).toString('hex')   // 64 caracteres aleatórios
  return { bruto, hash: hashDoToken(bruto) }
}
