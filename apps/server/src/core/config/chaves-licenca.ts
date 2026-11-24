/**
 * ============================================================================
 * NOME DO ARQUIVO: chaves-licenca.ts
 * MÓDULO: CORE/CONFIG
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Carrega o par de chaves RSA que assina (privada) e confere (pública) o token
 * de licença do ERP.
 *
 * POR QUE ESTÁ EM core/ E NÃO NA PASTA DE LICENÇA:
 * Quem confere o token é o ErpLicencaGuard, que também fica em core/. Antes
 * ele pedia a chave ao LicencaService, e isso fazia a infraestrutura (core)
 * depender de uma regra de negócio (features). Com as chaves aqui, os dois
 * lados importam o mesmo arquivo e a dependência passa a ter um sentido só:
 * features → core, nunca o contrário.
 * ============================================================================
 */
import { generateKeyPairSync } from 'crypto' // função do Node que cria um par de chaves novo

// Lê as chaves do ambiente ou, se faltarem, gera um par temporário.
function carregarChaves(): { privateKey: string; publicKey: string } {
  // As chaves ficam no .env em base64 (texto sem quebras de linha).
  const envPriv = process.env.LICENCA_PRIVATE_KEY
  const envPub  = process.env.LICENCA_PUBLIC_KEY

  // Caminho normal: as duas existem, então só convertemos de base64 para o texto PEM.
  if (envPriv && envPub) {
    return {
      privateKey: Buffer.from(envPriv, 'base64').toString('utf8'),
      publicKey:  Buffer.from(envPub,  'base64').toString('utf8'),
    }
  }

  // Sem chaves no ambiente: gera um par RSA de 2048 bits só para esta execução.
  // ATENÇÃO (achado S3 do code review): isso também acontece em produção, e o
  // aviso abaixo imprime a chave privada no log. A correção é exigir as duas
  // variáveis em validarSegredosProducao() — fica para a fase de segurança,
  // porque esta mudança é só de organização e não altera comportamento.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength:      2048,                                // tamanho da chave
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },    // formato padrão da pública
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },    // formato padrão da privada
  })

  console.warn('\n[LICENÇA] Chaves RS256 não configuradas — par temporário gerado para desenvolvimento.')
  console.warn('[LICENÇA] Adicione ao apps/server/.env para persistir entre reinicializações:\n')
  console.warn(`LICENCA_PRIVATE_KEY="${Buffer.from(privateKey).toString('base64')}"`)
  console.warn(`LICENCA_PUBLIC_KEY="${Buffer.from(publicKey).toString('base64')}"\n`)

  return { privateKey, publicKey }
}

// Roda uma única vez, quando o arquivo é importado pela primeira vez. Depois
// disso o Node guarda o resultado, e todo mundo que importar recebe o mesmo par.
const chaves = carregarChaves()

/** Chave privada: só quem EMITE o token (LicencaService) usa. */
export const CHAVE_PRIVADA_LICENCA = chaves.privateKey

/** Chave pública: quem CONFERE o token (ErpLicencaGuard) e a rota /erp/chave-publica. */
export const CHAVE_PUBLICA_LICENCA = chaves.publicKey
