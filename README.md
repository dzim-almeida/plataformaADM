# plataformaADM

Plataforma de suporte e monitoramento do ERP desktop StartBIG. Reúne o painel
administrativo e a API que o ERP das lojas consulta:

- **Licenças**: ativação, conexão e limite de computadores de cada loja.
- **Cobrança**: assinaturas no cartão (Stripe) e PIX (Asaas), renovação e comissões de parceiros.
- **Fiscal**: emissão de NF-e, NFC-e e NFS-e pela Focus NFe, com franquia mensal.
- **Backup**: o ERP envia o banco e as imagens para o Cloudflare R2.
- **Monitoramento**: saúde fiscal, histórico de e-mails e notificações no celular do admin.

## Como está organizado

```
apps/server     API NestJS (porta 3001)
apps/web        Painel Next.js (porta 3000)
packages/       Código compartilhado: database (Prisma) e schemas (Zod)
prisma/         Schema do banco, migrações e seed
scripts/        Scripts de operação, por assunto
docs/           Contratos com o ERP e documentação interna
```

O mapa completo, com as convenções e uma tabela de "onde coloco cada coisa", está
em [docs/estrutura.md](docs/estrutura.md).

## Rodando localmente

Precisa de Node.js 20+ e um PostgreSQL.

```bash
npm install
```

```bash
cp apps/server/.env.example apps/server/.env
```

Preencha pelo menos `DATABASE_URL` no `apps/server/.env`. Os outros serviços
(Stripe, Asaas, Focus, R2) são opcionais em desenvolvimento: sem a chave, a parte
correspondente fica desligada e o resto sobe normalmente.

```bash
npm run db:push
```

```bash
npm run dev:server
```

Em outro terminal:

```bash
npm run dev
```

O painel abre em http://localhost:3000. Ele encontra a API pela variável
`SERVER_URL` (padrão `http://localhost:3001`).

## Testes

```bash
npm test --workspace=apps/server
```

## Deploy

Hoje o deploy é feito na VPS com `npm run deploy` (pull, install, `db push`,
build e restart no PM2). Os riscos desse processo e o plano para trocá-lo por CI
e migrações estão no code review do projeto.

## Documentos importantes

- [docs/erp-portas-de-entrada.md](docs/erp-portas-de-entrada.md): todas as rotas que o ERP chama.
- [docs/integracao-erp-local.md](docs/integracao-erp-local.md): guia de integração do ERP.
- [docs/erp-backup-contrato.md](docs/erp-backup-contrato.md): contrato do backup em nuvem.
- [docs/deploy-pix-asaas.md](docs/deploy-pix-asaas.md): como ligar o PIX em produção.
