import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { ZodError, z } from 'zod'
import bcrypt from 'bcryptjs'
import { DispositivoService } from '../dispositivos/dispositivo.service'
import { hashDoToken } from '../../core/seguranca/token-de-link'

/**
 * Bloqueio progressivo do login por e-mail (LIC-06, ACORDO D-09): a partir da
 * 5ª senha errada seguida, espera de 1, 5 e depois 15 minutos (o teto). O teto
 * curto protege a conta sem trancar o dono por muito tempo.
 */
const FALHAS_ANTES_DO_BLOQUEIO = 5
const ESPERAS_MIN = [1, 5, 15]
const minutosAFrente = (min: number) => new Date(Date.now() + min * 60 * 1000)

const reenviarLinkSchema = z.object({
  email: z.string().email('E-mail inválido.'),
})

const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  senha: z.string(),
  hwid:  z.string().optional(),
  /** Hostname da máquina, só para leitura humana (e-mail de aviso, suporte). */
  nomeComputador: z.string().trim().max(100).optional(),
})

const primeiroAcessoSchema = z.object({
  token:     z.string(),
  novaSenha: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
})

@Injectable()
export class ErpAuthService {
  constructor(private readonly dispositivoService: DispositivoService) {}

  private parseBody<T>(schema: { parse: (x: unknown) => T }, body: unknown): T {
    try {
      return schema.parse(body)
    } catch (e) {
      if (e instanceof ZodError)
        throw new BadRequestException({ erro: 'Dados inválidos', detalhes: e.issues })
      throw e
    }
  }

  /**
   * Erro com `codigo` estável: a tela do ERP decide pela chave, sem depender
   * do texto. O status HTTP continua o de antes onde já existia (401 = senha).
   */
  private erro(status: HttpStatus, codigo: string, message: string): HttpException {
    return new HttpException({ codigo, message }, status)
  }

  private get prisma() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require('@startbig/database')
    return prisma
  }

  async login(body: unknown) {
    const dados = this.parseBody(loginSchema, body)

    // VENCIDA entra na busca por causa da carência: com o cartão sendo
    // re-tentado o dono continua usando o sistema, e precisa conseguir trocar
    // de computador também — senão a troca é a única coisa que a carência não
    // cobre.
    const cliente = await this.prisma.cliente.findFirst({
      where:   { email: dados.email },
      include: {
        dispositivos: {
          where:   { status: { in: ['ATIVA', 'VENCIDA'] } },
          orderBy: { criadoEm: 'desc' },
          include: { plano: true },
        },
      },
    })

    // E-mail que não existe: mesma resposta da senha errada (F12), e nada é
    // gravado (não há conta onde contar a falha).
    if (!cliente) throw this.credenciaisInvalidas()

    // Bloqueado por muitas tentativas (D-09). Conferido ANTES da senha: durante
    // o bloqueio, nem a senha certa entra.
    if (cliente.bloqueadoAte && new Date(cliente.bloqueadoAte) > new Date())
      throw this.erro(HttpStatus.TOO_MANY_REQUESTS, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Tente de novo em alguns minutos.')

    // Conta sem senha cai no MESMO erro de senha errada (F12). Antes ela
    // respondia SENHA_NAO_CONFIGURADA, que revelava que o e-mail é cliente.
    const senhaValida = !!cliente.senhaHash && await bcrypt.compare(dados.senha, cliente.senhaHash)
    if (!senhaValida) {
      await this.registrarFalha(cliente)
      throw this.credenciaisInvalidas()
    }

    if (cliente.falhasLogin || cliente.bloqueadoAte)
      await this.prisma.cliente.update({ where: { id: cliente.id }, data: { falhasLogin: 0, bloqueadoAte: null } })

    // Conta SEM NENHUMA licença e com confirmação pendente (D-32). Conta com
    // licença nunca cai aqui, mesmo sem `emailConfirmadoEm`: os clientes de
    // hoje não precisam de nenhum preenchimento.
    const temAlgumaLicenca = await this.prisma.licenca.count({ where: { clienteId: cliente.id } }) > 0
    if (!temAlgumaLicenca && cliente.tokenConfirmacaoEmail)
      throw this.erro(
        HttpStatus.FORBIDDEN,
        'AGUARDANDO_CONFIRMACAO_EMAIL',
        'Confirme o link enviado ao seu e-mail antes de entrar.',
      )

    // A mesma regra do conectar: ATIVA dentro do prazo, ou qualquer uma com
    // carência vigente. Checada aqui para responder 402 com código, em vez do
    // 400 genérico que o conectar daria.
    const agora = new Date()
    const utilizavel = (l: { status: string; dataVencimento: Date | null; carenciaAte: Date | null }) =>
      this.dispositivoService.carenciaVigente(l) ||
      (l.status === 'ATIVA' && (!l.dataVencimento || l.dataVencimento > agora))

    const licenca = cliente.dispositivos.find(utilizavel)
    if (!licenca) {
      if (cliente.dispositivos.length > 0)
        throw this.erro(
          HttpStatus.PAYMENT_REQUIRED,
          'LICENCA_VENCIDA',
          'Sua licença está vencida. Renove a assinatura para ativar o sistema neste computador.',
        )
      throw this.erro(HttpStatus.BAD_REQUEST, 'SEM_LICENCA_ATIVA', 'Nenhuma licença ativa encontrada para este e-mail.')
    }

    // Reutiliza o fluxo de conectar passando a chave da licença.
    // autenticado: identidade já provada por email+senha, então em caso de
    // limite de dispositivos atingido a sessão mais antiga é encerrada em vez de bloquear.
    // servidor: só o backend do servidor da loja chama este login, com o HWID
    // dele — é o que grava (ou troca) o servidor da licença. Sem HWID real não há
    // o que gravar.
    const resultado = await this.dispositivoService.conectar(
      {
        chave:          licenca.chaveAtivacao,
        hwid:           dados.hwid ?? `login-${randomUUID()}`,
        nomeComputador: dados.nomeComputador,
      },
      { autenticado: true, servidor: !!dados.hwid },
    )

    // O ERP precisa guardar a chaveAtivacao localmente para os próximos
    // /licenca/validar e /licenca/desconectar — conectar() não a devolve
    // porque normalmente quem chama já a tem.
    return { ...resultado, chaveAtivacao: licenca.chaveAtivacao }
  }

  /**
   * Define a senha pelo link do e-mail (primeiro acesso ou nova senha).
   *
   * Procura SÓ pelo hash em `tokenSenha` (LIC-06, D-35), nunca em `tokenEmail`:
   * assim um token de troca de e-mail não define senha, e pedir um link de
   * senha não apaga uma troca de e-mail pendente. A senha antiga, se havia,
   * deixa de valer (mitigação do R-01).
   */
  async primeiroAcesso(body: unknown) {
    const dados = this.parseBody(primeiroAcessoSchema, body)

    const cliente = await this.prisma.cliente.findFirst({
      where: { tokenSenha: hashDoToken(dados.token) },
    })

    if (!cliente)
      throw new BadRequestException('Link inválido.')

    if (!cliente.tokenSenhaExpiraEm || new Date() > new Date(cliente.tokenSenhaExpiraEm))
      throw new BadRequestException('Link expirado. Peça um novo link no StartBig.')

    const senhaHash = await bcrypt.hash(dados.novaSenha, 10)

    await this.prisma.cliente.update({
      where: { id: cliente.id },
      data:  {
        senhaHash,
        tokenSenha:         null,
        tokenSenhaExpiraEm: null,
        // Quem definiu a senha pelo link provou ter o e-mail: o bloqueio sai.
        falhasLogin:        0,
        bloqueadoAte:       null,
      },
    })

    return { mensagem: 'Senha criada com sucesso. Você já pode fazer login no sistema.' }
  }

  /**
   * "Reenviar link" do app (POST /erp/auth/reenviar-link, LIC-06).
   *
   * Responde SEMPRE 202 com a mesma mensagem, exista ou não o e-mail (D-31).
   * Quem escolhe o link é o estado da conta (confirmação pendente ou nova
   * senha); no máximo um envio por minuto (ver enviarLinkPeloEstado).
   */
  async reenviarLink(body: unknown) {
    const { email } = this.parseBody(reenviarLinkSchema, body)
    const resposta  = { statusCode: 202, message: 'Se este e-mail tiver conta, enviamos um link.' }

    const cliente = await this.prisma.cliente.findFirst({ where: { email }, include: { pf: true, pj: true } })
    if (cliente) await this.dispositivoService.enviarLinkPeloEstado(cliente, 'reenvio')

    return resposta
  }

  /** 401 genérico: não diz se o e-mail existe ou se a senha é que está errada (F12). */
  private credenciaisInvalidas(): HttpException {
    return this.erro(HttpStatus.UNAUTHORIZED, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.')
  }

  /**
   * Conta mais uma senha errada e, da 5ª em diante, bloqueia o login: 1 min
   * na 5ª, 5 min na 6ª, 15 min da 7ª em diante (D-09).
   */
  private async registrarFalha(cliente: { id: string; falhasLogin?: number | null }) {
    const falhas = (cliente.falhasLogin ?? 0) + 1
    const nivel  = Math.min(falhas - FALHAS_ANTES_DO_BLOQUEIO, ESPERAS_MIN.length - 1)
    await this.prisma.cliente.update({
      where: { id: cliente.id },
      data:  {
        falhasLogin:  falhas,
        bloqueadoAte: falhas >= FALHAS_ANTES_DO_BLOQUEIO ? minutosAFrente(ESPERAS_MIN[nivel]) : null,
      },
    })
  }
}
