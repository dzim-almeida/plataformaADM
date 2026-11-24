import { Injectable, BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { ZodError, z } from 'zod'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const alterarSenhaSchema = z.object({
  senhaAtual: z.string().optional(),
  novaSenha:  z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres.'),
})

const solicitarEmailSchema = z.object({
  novoEmail:  z.string().email('E-mail inválido.'),
  senhaAtual: z.string(),
})

/**
 * Corpo do PUT /erp/usuario/titular (LIC-06, D-22): os campos do GET, SEM
 * `tipoPessoa` e SEM `documento`. `.strict()` recusa (400) qualquer campo a
 * mais — inclusive `tipoPessoa`, que não muda por aqui.
 */
const atualizarTitularSchema = z.object({
  nomeOuRazao:  z.string().trim().min(2, 'Informe o nome ou a razão social.').optional(),
  nomeFantasia: z.string().trim().max(150).nullable().optional(),
  telefone:     z.string().trim().max(20).nullable().optional(),
  celular:      z.string().trim().max(20).nullable().optional(),
  endereco: z.object({
    cep:         z.string().trim().min(8, 'CEP inválido.'),
    logradouro:  z.string().trim().min(1, 'Informe o logradouro.'),
    numero:      z.string().trim().min(1, 'Informe o número.'),
    complemento: z.string().trim().nullable().optional(),
    bairro:      z.string().trim().min(1, 'Informe o bairro.'),
    cidade:      z.string().trim().min(1, 'Informe a cidade.'),
    estado:      z.string().trim().length(2, 'Use a sigla do estado (ex.: CE).'),
  }).optional(),
}).strict()

/** CPF 000.000.000-00 e CNPJ 00.000.000/0000-00, como o setup do app mostra. */
function formatarDocumento(doc: string): string {
  const d = (doc ?? '').replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

@Injectable()
export class ErpUsuarioService {

  private parseBody<T>(schema: { parse: (x: unknown) => T }, body: unknown): T {
    try {
      return schema.parse(body)
    } catch (e) {
      if (e instanceof ZodError)
        throw new BadRequestException({ erro: 'Dados inválidos', detalhes: e.issues })
      throw e
    }
  }

  private get prisma() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require('@startbig/database')
    return prisma
  }

  async getDados(licencaId: string) {
    const licenca = await this.prisma.licenca.findUnique({
      where:   { id: licencaId },
      include: { cliente: { include: { pf: true, pj: true } } },
    })
    if (!licenca) throw new BadRequestException('Licença não encontrada.')

    const { cliente } = licenca
    const nome = cliente.pf?.nomeCompleto ?? cliente.pj?.razaoSocial ?? ''
    return { nome, email: cliente.email, temSenha: !!cliente.senhaHash }
  }

  async alterarSenha(licencaId: string, body: unknown) {
    const dados   = this.parseBody(alterarSenhaSchema, body)
    const licenca = await this.prisma.licenca.findUnique({
      where:   { id: licencaId },
      include: { cliente: true },
    })
    if (!licenca) throw new BadRequestException('Licença não encontrada.')

    const { cliente } = licenca

    if (cliente.senhaHash) {
      if (!dados.senhaAtual)
        throw new BadRequestException('Informe a senha atual para alterá-la.')
      const senhaValida = await bcrypt.compare(dados.senhaAtual, cliente.senhaHash)
      if (!senhaValida) throw new BadRequestException('Senha atual incorreta.')
    }

    const novoHash = await bcrypt.hash(dados.novaSenha, 10)
    await this.prisma.cliente.update({
      where: { id: cliente.id },
      data:  { senhaHash: novoHash },
    })

    await resend.emails.send({
      from:    'noreply@startbig.com.br',
      to:      cliente.email,
      subject: 'Sua senha foi alterada — StartBig',
      html:    `<p>Sua senha de acesso ao StartBig foi alterada com sucesso.<br/>Se não foi você, entre em contato com o suporte imediatamente.</p>`,
    })

    return { mensagem: 'Senha alterada com sucesso.' }
  }

  async solicitarNovoEmail(licencaId: string, body: unknown) {
    const dados   = this.parseBody(solicitarEmailSchema, body)
    const licenca = await this.prisma.licenca.findUnique({
      where:   { id: licencaId },
      include: { cliente: true },
    })
    if (!licenca) throw new BadRequestException('Licença não encontrada.')

    const { cliente } = licenca

    if (!cliente.senhaHash)
      throw new BadRequestException('Nenhuma senha configurada. Defina sua senha antes de alterar o e-mail.')

    const senhaValida = await bcrypt.compare(dados.senhaAtual, cliente.senhaHash)
    if (!senhaValida) throw new BadRequestException('Senha atual incorreta.')

    const emailExiste = await this.prisma.cliente.findFirst({ where: { email: dados.novoEmail } })
    if (emailExiste) throw new ConflictException('E-mail já cadastrado no sistema.')

    const token = randomUUID()
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await this.prisma.cliente.update({
      where: { id: cliente.id },
      data:  {
        emailPendente:      dados.novoEmail,
        tokenEmail:         token,
        tokenEmailExpiraEm: expira,
      },
    })

    const appUrl = process.env.APP_URL ?? 'https://admin.startbig.com.br'
    await resend.emails.send({
      from:    'noreply@startbig.com.br',
      to:      dados.novoEmail,
      subject: 'Confirme seu novo e-mail — StartBig',
      html:    `<p>Clique no link abaixo para confirmar a troca de e-mail:<br/>
               <a href="${appUrl}/confirmar-email?token=${token}">Confirmar e-mail</a><br/><br/>
               Este link expira em 24 horas.</p>`,
    })

    return { mensagem: 'Verifique seu novo e-mail para confirmar a troca.' }
  }

  async confirmarEmail(token: string) {
    if (!token) throw new BadRequestException('Token não informado.')

    const cliente = await this.prisma.cliente.findFirst({ where: { tokenEmail: token } })
    if (!cliente) throw new BadRequestException('Token inválido.')
    if (new Date() > new Date(cliente.tokenEmailExpiraEm))
      throw new BadRequestException('Token expirado. Solicite uma nova troca de e-mail.')

    const emailAntigo = cliente.email

    await this.prisma.cliente.update({
      where: { id: cliente.id },
      data:  {
        email:              cliente.emailPendente,
        emailPendente:      null,
        tokenEmail:         null,
        tokenEmailExpiraEm: null,
      },
    })

    await resend.emails.send({
      from:    'noreply@startbig.com.br',
      to:      emailAntigo,
      subject: 'Seu e-mail foi alterado — StartBig',
      html:    `<p>Seu e-mail de acesso ao StartBig foi alterado com sucesso.<br/>Se não foi você, entre em contato com o suporte imediatamente.</p>`,
    })

    return { mensagem: 'E-mail confirmado com sucesso.' }
  }

  // ── Titular da licença (LIC-06, D-22, D-28) ──────────────────────────────
  // Usado pelo setup do app (SPEC-03) para pré-preencher e atualizar os dados
  // da empresa. O documento (CPF/CNPJ) é só leitura por este caminho.

  /** Cliente dono da licença do token, com PF/PJ e endereços. */
  private async clienteDaLicenca(licencaId: string) {
    const licenca = await this.prisma.licenca.findUnique({ where: { id: licencaId } })
    if (!licenca) throw new BadRequestException('Licença não encontrada.')
    const cliente = await this.prisma.cliente.findUnique({
      where:   { id: licenca.clienteId },
      include: { pf: true, pj: true, enderecos: true },
    })
    if (!cliente) throw new BadRequestException('Titular da licença não encontrado.')
    return cliente
  }

  /** GET /erp/usuario/titular: os dados da empresa do titular. */
  async lerTitular(licencaId: string) {
    const cliente = await this.clienteDaLicenca(licencaId)
    const { pf, pj } = cliente
    // O endereço principal; sem ele, o primeiro que houver.
    const endereco = cliente.enderecos?.find((e: any) => e.tipo === 'PRINCIPAL') ?? cliente.enderecos?.[0] ?? null

    return {
      tipoPessoa:   pj ? 'PJ' : 'PF',
      nomeOuRazao:  pj?.razaoSocial ?? pf?.nomeCompleto ?? '',
      documento:    formatarDocumento(pj?.cnpj ?? pf?.cpf ?? ''),
      nomeFantasia: pj?.nomeFantasia ?? null,
      // PJ e PF guardam o contato cada uma na sua tabela.
      telefone:     pj?.telefone ?? pf?.telefone ?? null,
      celular:      pj?.celular ?? pf?.celular ?? null,
      endereco: endereco
        ? {
            cep: endereco.cep, logradouro: endereco.logradouro, numero: endereco.numero,
            complemento: endereco.complemento ?? null, bairro: endereco.bairro,
            cidade: endereco.cidade, estado: endereco.estado,
          }
        : null,
    }
  }

  /**
   * PUT /erp/usuario/titular: atualiza os dados da empresa, ANTES de o setup
   * do app criar a empresa local (D-22).
   * - `documento` no corpo: 403 DOCUMENTO_TRAVADO (nunca muda por aqui).
   * - PJ: razão social, nome fantasia e telefones em `pj`.
   * - PF: o nome vai para `pf.nomeCompleto` e os telefones para a `pf`
   *   (a PF não tem nome fantasia; esse campo é ignorado).
   * - Sem endereço na nuvem: cria um principal.
   */
  async atualizarTitular(licencaId: string, body: unknown) {
    if (body && typeof body === 'object' && 'documento' in body)
      throw new HttpException(
        { codigo: 'DOCUMENTO_TRAVADO', message: 'O documento do titular não pode ser alterado pelo app. Fale com o suporte.' },
        HttpStatus.FORBIDDEN,
      )

    const dados   = this.parseBody(atualizarTitularSchema, body)   // Zod: 400 com detalhes
    const cliente = await this.clienteDaLicenca(licencaId)

    if (cliente.pj) {
      const campos: Record<string, unknown> = {}
      if (dados.nomeOuRazao !== undefined)  campos.razaoSocial  = dados.nomeOuRazao
      if (dados.nomeFantasia !== undefined) campos.nomeFantasia = dados.nomeFantasia
      if (dados.telefone !== undefined)     campos.telefone     = dados.telefone
      if (dados.celular !== undefined)      campos.celular      = dados.celular
      if (Object.keys(campos).length) await this.prisma.clientePJ.update({ where: { clienteId: cliente.id }, data: campos })
    } else if (cliente.pf) {
      // PF: o nome vai para `nomeCompleto`; telefones, para a própria PF.
      // A PF não tem nome fantasia: esse campo é ignorado.
      const campos: Record<string, unknown> = {}
      if (dados.nomeOuRazao !== undefined) campos.nomeCompleto = dados.nomeOuRazao
      if (dados.telefone !== undefined)    campos.telefone     = dados.telefone
      if (dados.celular !== undefined)     campos.celular      = dados.celular
      if (Object.keys(campos).length) await this.prisma.clientePF.update({ where: { clienteId: cliente.id }, data: campos })
    }

    if (dados.endereco) {
      const atual = cliente.enderecos?.find((e: any) => e.tipo === 'PRINCIPAL') ?? cliente.enderecos?.[0]
      if (atual) await this.prisma.endereco.update({ where: { id: atual.id }, data: dados.endereco })
      else await this.prisma.endereco.create({ data: { clienteId: cliente.id, tipo: 'PRINCIPAL', ...dados.endereco } })
    }

    return this.lerTitular(licencaId)
  }

}
