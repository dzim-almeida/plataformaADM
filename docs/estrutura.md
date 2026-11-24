# Estrutura do projeto

Mapa das pastas e as regras de onde cada coisa mora. Se você vai criar um
arquivo e não sabe onde colocar, a resposta deve estar em
[Onde coloco…?](#onde-coloco).

## Visão geral

```
plataformaADM/
├── apps/
│   ├── server/          API NestJS: toda regra de negócio e todo acesso ao banco
│   └── web/             Painel administrativo + páginas públicas (Next.js)
├── packages/
│   ├── database/        Prisma Client e repositórios (funções de consulta ao banco)
│   └── schemas/         Validações Zod compartilhadas entre API e painel
├── prisma/              schema.prisma, migrações e seed — nada mais
├── scripts/             Scripts de operação e diagnóstico, por assunto
└── docs/                Contratos com o ERP e documentação interna
```

Quem fala com quem:

- O **painel** (`apps/web`) nunca acessa o banco. Ele chama as próprias rotas
  `/api/*`, que repassam a requisição para a API com o token do cookie.
- O **ERP desktop** chama a **API** direto, nas rotas `/erp/*`.
- Só a **API** (`apps/server`) usa `@startbig/database` e fala com Stripe,
  Asaas, Focus NFe, Cloudflare R2 e os serviços de e-mail.

## apps/server — a API

```
src/
├── main.ts                 Liga o servidor (porta, CORS, Helmet)
├── app.module.ts           Lista todos os módulos e os guards globais
├── core/                   Infraestrutura. NÃO conhece regra de negócio.
│   ├── config/             Leitura de segredos e chaves (JWT, RSA da licença)
│   ├── cripto/             Cifra AES-GCM dos tokens fiscais
│   ├── decorators/         @Public, @Roles, @RequerModulo
│   ├── filters/            Formato padrão das respostas de erro
│   ├── guards/             Checagens antes da rota: login, perfil, licença, módulo
│   └── validators/
├── integracoes/            Um cliente por serviço externo
│   ├── asaas/              PIX
│   ├── email/              Resend/SMTP + layout dos e-mails
│   ├── focus-nfe/          Emissão de NF-e, NFC-e e NFS-e
│   ├── notificacao/        Web Push para o celular do admin
│   ├── storage/            Cloudflare R2 (backups)
│   └── stripe/             Cartão e assinaturas
└── features/               Regra de negócio, uma pasta por assunto
    ├── auth/               Login do painel
    ├── backup/             Backups: painel e ERP
    ├── cliente/            Clientes PF/PJ (endereco/ é subpasta)
    ├── contratacao/        Site de contratação e cobrança iniciada pelo ERP
    ├── cron/               Tarefas agendadas
    ├── email-historico/    Histórico de e-mails enviados
    ├── financeiro/         Pagamentos, webhooks, receita
    ├── fiscal/             Emissão fiscal, franquia, saúde fiscal
    ├── licenca/            Licenças, sessões e a identidade do ERP (conectar, login, perfil)
    ├── modulo/             Catálogo de módulos vendáveis
    ├── parceiro/           Parceiros e comissões
    ├── plano/              Planos e preços
    ├── renovacao/          Renovação pelo ERP (PIX e cartão)
    └── usuario/            Usuários do painel
```

### A regra das dependências

```
features  ──▶  integracoes  ──▶  core
   │                              ▲
   └──────────────────────────────┘
```

Uma pasta só importa as que estão à direita dela. `core` não importa nada de
`features` nem de `integracoes`. Foi por isso que as chaves RSA da licença saíram
do `LicencaService` e foram para `core/config/chaves-licenca.ts`: o guard que
confere o token fica em `core` e não podia depender de uma feature.

### Convenção de nomes dentro de uma feature

| Arquivo                         | Quem chama                       | Exemplo                      |
| ------------------------------- | -------------------------------- | ---------------------------- |
| `<assunto>.controller.ts`       | Painel administrativo (ADMIN)    | `licenca.controller.ts`      |
| `erp-<assunto>.controller.ts`   | ERP desktop, rotas `/erp/...`    | `erp-backup.controller.ts`   |
| `<assunto>.service.ts`          | Regra de negócio                 | `licenca.service.ts`         |
| `<assunto>.module.ts`           | Liga controllers e services      | `licenca.module.ts`          |

Bateu o olho num arquivo começando com `erp-`? Ele é chamado pelo ERP das lojas.
Mudar o formato da resposta dele quebra clientes em produção: confira antes os
contratos em `docs/erp-*.md`.

## apps/web — o painel

```
src/
├── app/
│   ├── (painel)/           Telas do admin. Um layout.tsx com menu e cabeçalho.
│   │   ├── dashboard/  clientes/  dispositivos/  planos/  modulos/
│   │   └── parceiros/  financeiro/  fiscal/  backups/  email/
│   ├── (publico)/          Telas sem login: login, contratar, renovar,
│   │                       pagamento, primeiro-acesso, confirmar-email
│   ├── api/                Rotas que repassam para a API (BFF)
│   ├── debug/              Laboratório de testes (ver achado S4 do code review)
│   └── layout.tsx          Layout raiz (fonte, CSS global)
├── components/             Componentes usados por mais de uma tela
├── lib/server.ts           proxyRequest: repassa uma chamada para a API
└── proxy.ts                Redireciona para /login quem não tem sessão
```

**Pastas entre parênteses não entram na URL.** No Next.js isso se chama
*route group*: `app/(painel)/clientes/page.tsx` continua sendo `/clientes`.
Elas servem só para organizar e para dar um layout comum a um grupo de telas.

**Pastas com `_` na frente** (`_components`, `_tipos`) são privadas: o Next
não cria rota para elas. Use para componentes de uma tela só.

## Onde coloco…?

| Quero criar…                                   | Vai em                                             |
| ---------------------------------------------- | -------------------------------------------------- |
| Uma rota nova para o painel                    | `apps/server/src/features/<assunto>/<assunto>.controller.ts` |
| Uma rota nova para o ERP                       | `apps/server/src/features/<assunto>/erp-<assunto>.controller.ts` |
| Integração com um serviço externo novo         | `apps/server/src/integracoes/<servico>/`           |
| Uma checagem que vale para várias rotas        | `apps/server/src/core/guards/`                     |
| Uma consulta ao banco reaproveitável           | `packages/database/src/repositories/`              |
| Uma validação usada pela API e pelo painel     | `packages/schemas/src/<assunto>/`                  |
| Uma tela do painel                             | `apps/web/src/app/(painel)/<tela>/page.tsx`        |
| Uma página aberta ao cliente                   | `apps/web/src/app/(publico)/<pagina>/page.tsx` **e** o caminho em `ROTAS_PUBLICAS` do `proxy.ts` |
| Um componente de uma tela só                   | `apps/web/src/app/(painel)/<tela>/_components/`    |
| Um componente usado em várias telas            | `apps/web/src/components/`                         |
| Um script de operação ou diagnóstico           | `scripts/<assunto>/`                               |
| Um teste da API                                | `apps/server/test/<assunto>/<nome>.test.ts`        |
| Um campo ou tabela no banco                    | `prisma/schema.prisma`                             |

## O que ainda não está padronizado

A reorganização mudou só onde os arquivos moram, sem mudar comportamento. Ficaram
para as próximas etapas (ver o code review):

- Rotas do ERP duplicadas em `/licenca/*` e `/erp/*`. Só dá para remover as de
  `/licenca/*` depois de confirmar que nenhum ERP em produção ainda as chama.
- Formato de resposta único (`{ data }` em todo lugar) e validação Zod por pipe.
- `prisma db push` em produção no lugar de migrações.
- Rotas `/api/*` do painel em três estilos diferentes.
