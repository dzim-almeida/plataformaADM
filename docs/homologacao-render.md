# Homologação no Render: testar a série de licença antes da produção

> Mora só na branch `homologacao-render` do fork `dzim-almeida/plataformaADM`, junto com o `render.yaml`. Não entra no PR para a produção.

## 1. Para que serve

Subir as mudanças da série de licença (LIC-05, LIC-06, LIC-09 na plataforma; LIC-01 a LIC-04 e LIC-08 no app) num lugar **separado da produção**, testar os fluxos de ponta a ponta e só depois fazer o deploy de verdade.

O ambiente tem três peças, todas no Render e todas novas:

| Peça | Nome no Render | O que é |
|------|----------------|---------|
| Banco | `startbig-hml-db` | Postgres vazio, só de teste |
| API | `startbig-hml-api` | NestJS (`apps/server`) |
| Painel | `startbig-hml-web` | Next.js (`apps/web`); só a página `/confirmar-cadastro` importa aqui |

**Regra de ouro:** nada da produção entra aqui. Banco próprio, par de chaves RSA próprio, Stripe e Asaas em modo de teste, e-mails só para endereços seus.

## 2. O que você precisa ter em mãos

- Conta no Render, com acesso ao GitHub do fork `dzim-almeida/plataformaADM`.
- Chaves de **teste** do Stripe: `sk_test_...` e um segredo de webhook `whsec_...` (o boot da API exige as duas).
- Uma chave do Resend e um remetente (`EMAIL_FROM`) que o Resend aceite.
- Node 22 no seu computador, só para gerar o par de chaves (passo 3).
- Para testar o app: um computador ou máquina virtual **Windows que não seja de loja** (passo 7).

## 3. Gerar o par de chaves RSA de teste

É o par que assina os tokens da licença. Ele **não pode** ser o da produção: assim um token de homologação nunca vale na produção, e vice-versa.

No terminal do seu computador:

```bash
# Gera um par RSA de 2048 bits e imprime as duas chaves em base64,
# no formato que a API espera (LICENCA_PRIVATE_KEY e LICENCA_PUBLIC_KEY).
node -e "const {generateKeyPairSync}=require('crypto');const k=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log('LICENCA_PRIVATE_KEY='+Buffer.from(k.privateKey).toString('base64'));console.log('LICENCA_PUBLIC_KEY='+Buffer.from(k.publicKey).toString('base64'))"
```

Guarde as duas linhas num gerenciador de senhas. Não cole em chat, issue nem commit.

## 4. Criar o ambiente pelo Blueprint (planos pagos)

> **Plano gratuito:** o Render não aplica o Blueprint. Pule para o passo 4b.

1. No Render: **New › Blueprint**.
2. Escolha o repositório `dzim-almeida/plataformaADM` e a branch **`homologacao-render`**. O Render lê o `render.yaml` e mostra o banco e os dois serviços.
3. Ele pede os valores marcados com `sync: false`. Preencha:

   | Variável | Serviço | Valor |
   |----------|---------|-------|
   | `LICENCA_PRIVATE_KEY`, `LICENCA_PUBLIC_KEY` | API | As duas linhas do passo 3 (só o que vem depois do `=`) |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | API | Chaves de **teste** do Stripe |
   | `RESEND_API_KEY`, `EMAIL_FROM` | API | Resend |
   | `APP_URL` | API | Deixe `https://startbig-hml-web.onrender.com` (ajuste no passo 5 se o Render der outro endereço) |
   | `CORS_ORIGINS` | API | O mesmo endereço do painel |
   | `ADMIN_ALERT_EMAIL` | API | Seu e-mail (ou vazio) |
   | `NEXT_PUBLIC_API_URL` | Painel | `https://startbig-hml-api.onrender.com` |

4. **Apply**. O primeiro build da API instala as dependências, compila e roda o `prisma db push`, que cria as tabelas no banco de homologação.

`JWT_SECRET` e `FISCAL_TOKENS_KEY` o Render gera sozinho. O backup em nuvem (`BACKUP_S3_*`) fica de fora: sem ele, a API responde que o armazenamento não está configurado. Se quiser testar backup, crie um bucket **de teste** no R2 e acrescente as variáveis `BACKUP_S3_*` no serviço da API.

## 4b. Plano gratuito: criar à mão (sem Blueprint)

No plano gratuito o Render não aplica o Blueprint. Crie as peças pelo painel, com as mesmas configurações do `render.yaml` (que continua servindo de referência). Três diferenças do gratuito:

- **Não há aba Shell** no serviço: o seed roda do seu computador (passo 6b).
- **O serviço "dorme"** depois de ~15 minutos sem uso e leva ~50 segundos para acordar. O app espera só 3 segundos e cai no modo offline. Antes de cada rodada de testes, **acorde a API** abrindo `https://<api>/licenca/chave-publica` no navegador e esperando a resposta.
- **O Postgres gratuito expira em 30 dias.** Serve para uma rodada de testes.

**1. Banco:** **New › Postgres**
- Name: `startbig-hml-db` · Database: `startbig_hml` · User: `startbig_hml` · Plan: **Free**.
- Depois de criado, copie da página dele a **Internal Database URL** (usada pela API) e a **External Database URL** (usada no seed, passo 6b).

**2. API:** **New › Web Service** › repositório `dzim-almeida/plataformaADM`
- Name: `startbig-hml-api` · Branch: **`homologacao-render`** · Root Directory: vazio (a raiz do repositório) · Runtime: **Node** · Plan: **Free**.
- Build Command:
  ```bash
  npm ci --include=dev && npm run build --workspace=apps/server && npx prisma db push
  ```
- Start Command:
  ```bash
  npm run start --workspace=apps/server
  ```
- Em **Advanced**: Health Check Path `/licenca/chave-publica`.
- **Environment Variables** (botão "Add Environment Variable"):

  | Variável | Valor |
  |----------|-------|
  | `NODE_VERSION` | `22` |
  | `NODE_ENV` | `production` |
  | `DATABASE_URL` | A **Internal Database URL** do banco |
  | `JWT_SECRET` | Um valor aleatório (botão "Generate" do Render) |
  | `FISCAL_TOKENS_KEY` | Um valor aleatório (botão "Generate") |
  | `LICENCA_PRIVATE_KEY`, `LICENCA_PUBLIC_KEY` | As duas linhas do passo 3 (só o que vem depois do `=`) |
  | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Chaves de **teste** do Stripe |
  | `RESEND_API_KEY`, `EMAIL_FROM` | Resend |
  | `APP_URL`, `CORS_ORIGINS` | O endereço do painel (passo 5) |

**3. Painel (opcional):** **New › Web Service**, mesmo repositório
- Name: `startbig-hml-web` · Branch: `homologacao-render` · Runtime: Node · Plan: Free.
- Build Command: `npm ci --include=dev && npm run build --workspace=apps/web`
- Start Command: `npm run start --workspace=apps/web`
- Variáveis: `NODE_VERSION` = `22`, `NODE_ENV` = `production`, `NEXT_PUBLIC_API_URL` = o endereço da API.
- Se o build do painel estourar a memória do plano gratuito (512 MB), pule o painel: dá para confirmar o cadastro pela API (passo 8, fluxo 1).

## 5. Conferir os endereços e refazer o painel

1. Abra cada serviço e copie o endereço que o Render deu (algo como `https://startbig-hml-api.onrender.com`).
2. Se for diferente do que você preencheu, corrija `APP_URL` e `CORS_ORIGINS` (API) e `NEXT_PUBLIC_API_URL` (painel).
3. Refaça o deploy do **painel** (Manual Deploy): o `NEXT_PUBLIC_API_URL` entra no build do Next.js.

Teste rápido no navegador: `https://<api>/licenca/chave-publica` deve devolver `{ "publicKey": "-----BEGIN PUBLIC KEY-----..." }`, e essa chave tem que ser a **de teste** do passo 3.

## 6. Criar o admin e os planos (seed)

O cadastro e a confirmação precisam de um usuário ADMIN e de um plano ATIVO. Em plano pago, abra a aba **Shell** do serviço da API e rode (no gratuito, veja o passo 6b):

```bash
# O seed cria (ou mantém) o admin e os planos. Use um e-mail e uma senha SEUS:
# o padrão do arquivo (admin@admin.com / admin123) não pode ficar num servidor público.
ADMIN_EMAIL="voce@seudominio.com.br" ADMIN_SENHA="uma-senha-forte" npx tsx prisma/seed.ts
```

### 6b. Seed no plano gratuito (sem Shell)

Rode do seu computador, numa cópia da branch `homologacao-render` com as dependências instaladas (`npm install` na raiz), apontando para o banco **de homologação** pela **External Database URL**:

```bash
# DATABASE_URL aqui é a External Database URL do banco DO RENDER (homologação).
# Confira duas vezes: nunca rode este comando com o endereço do banco da produção.
DATABASE_URL="<External Database URL do startbig-hml-db>" \
ADMIN_EMAIL="voce@seudominio.com.br" ADMIN_SENHA="uma-senha-forte" \
npx tsx prisma/seed.ts
```

Se der erro de SSL ou de conexão recusada, acrescente `?sslmode=require` ao fim da URL (o Render exige SSL nas conexões de fora).

No Windows (PowerShell), defina as variáveis antes, uma por linha (`$env:DATABASE_URL="..."`, `$env:ADMIN_EMAIL="..."`, `$env:ADMIN_SENHA="..."`), e depois rode `npx tsx prisma/seed.ts`.

**Confirmar o cadastro sem o painel:** o link do e-mail aponta para `<APP_URL>/confirmar-cadastro?token=...`. Sem o painel no ar, copie o `token` do link e abra no navegador `https://<api>/erp/auto-cadastro/confirmar?token=<token>`. A resposta "Conta confirmada..." é o mesmo que a página mostraria.

## 7. Instalador de teste do app (start-big)

O app instalado fala com `https://api.startbig.com.br` (produção). O endereço está fixo em cinco arquivos do backend do `start-big`:

- `backend-fastapi/app/services/licenca/constantes.py`
- `backend-fastapi/app/services/cloud/_constants.py`
- `backend-fastapi/app/services/fiscal/http/client_startbig.py`
- `backend-fastapi/app/services/licenca/renovacao.py`
- `backend-fastapi/app/services/fiscal/os_notas.py` (`HOST_DA_PLATAFORMA`)

Para o teste:

1. No seu computador Windows de desenvolvimento, numa cópia **à parte** da branch `fix/licenca-seguranca` do `start-big`, troque `api.startbig.com.br` pelo endereço da API do Render nesses cinco arquivos. **Não commite essa troca.**
2. Gere o sidecar e o instalador (`npm run build:sidecar` e depois `npm run tauri build`, na pasta `frontend/`).
3. Instale numa máquina **que não seja de loja**. O banco do app fica em `%LOCALAPPDATA%\StartBigERP\data`, e numa máquina que também é loja ele se misturaria com o de verdade.
4. Desfaça a troca dos endereços. O instalador de teste não pode ir para cliente nenhum.

**Por que não deixar o endereço configurável no app?** O app busca a chave pública na própria API que ele chama. Se desse para trocar o endereço na máquina do cliente (arquivo ou variável), uma API falsa mandaria a própria chave e liberaria todos os módulos. Se a homologação virar rotina, o certo é uma spec que junte o endereço numa constante só e escolha o destino **na hora do build**.

**Instalador antigo (fluxo 2 abaixo):** para simular uma loja que não atualizou, faça o mesmo build a partir do commit que está hoje na produção (a principal do `start-big`), com os mesmos cinco endereços trocados.

## 8. O que testar (passo 11 do roteiro)

Anote em cada fluxo: funcionou, não funcionou (o que apareceu) ou não testado.

1. **Cadastro novo com o app novo:** aparece "Cadastro enviado"; chega o e-mail de confirmação, **sem a chave**; o link abre a página "Conta confirmada"; o "Já tenho conta" entra e o setup vem preenchido com os dados da nuvem.
2. **Cadastro com o instalador antigo:** aparece a mensagem do `409` ("...use a opção 'Já tenho conta'..."); depois de confirmar o e-mail, o "Já tenho conta" funciona.
3. **Login diário:** com internet, os dias vêm da API; sem internet (desligue a rede), o app abre e mostra os dias como "estimados".
4. **Re-login em outro computador:** aviso de troca antes de confirmar; o computador antigo para de funcionar; o backup dele para, com o motivo na tela.
5. **Banco perdido:** re-login, escolha da restauração, reinício e os dados de volta.
6. **Troca de servidor com caixas conectados:** as vagas da loja antiga são liberadas.
7. **Banco copiado para outro computador:** o token e a chave não abrem; a tela leva à transferência.
8. **Loja em teste (trial):** um backup na nuvem; depois dele, o aviso do trial; o download funciona. (Precisa do bucket de teste do passo 4.)

Também vale conferir na API:

- **Bloqueio de login:** cinco senhas erradas seguidas com o mesmo e-mail → espera de 1 minuto (`429 MUITAS_TENTATIVAS`).
- **Reenviar link:** o mesmo e-mail duas vezes dentro de um minuto → só um e-mail chega.

## 9. Manter a homologação em dia

Quando a `fix/licenca-seguranca` receber commits novos:

```bash
git checkout homologacao-render            # vai para a branch de homologação
git merge fix/licenca-seguranca            # traz as mudanças novas da série
git push origin homologacao-render         # o Render faz o deploy sozinho (autoDeploy)
```

## 10. Ao terminar

- Suspenda os dois serviços e apague o banco no Render, para não pagar por eles.
- Descarte o par de chaves de teste e os instaladores de teste.
- O deploy de produção segue o roteiro de sempre (`docs/deploy-pix-asaas.md`), com a conferência do diff do `db push` da LIC-06: o esperado é **só** `ALTER TABLE "clientes" ADD COLUMN ...`.
