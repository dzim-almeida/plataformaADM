# Homologação no Render (plano gratuito)

Testar a API da série de licença (LIC-05, LIC-06 e LIC-09) num servidor **separado da produção**, antes do deploy de verdade.

> Este guia e a coleção do Postman (`docs/homologacao-render.postman_collection.json`) moram só na branch `homologacao-render` do fork. Não entram no PR para a produção.

## 1. O que vamos montar

| Peça | Nome no Render | O que é |
|------|----------------|---------|
| Banco | `startbig-hml-db` | Postgres gratuito, vazio, só de teste |
| API | `startbig-hml-api` | O servidor NestJS (`apps/server`), plano gratuito |

O painel web não é necessário: o roteiro lê os e-mails pelo histórico da própria API.

**Regra de ouro:** nada da produção entra aqui. Nem banco, nem chaves, nem segredos.

### Limites do plano gratuito

- **O serviço "dorme"** depois de ~15 minutos sem uso e leva ~50 segundos para acordar. Antes de testar, rode o passo `00` do Postman e espere a resposta.
- **O banco gratuito expira em 30 dias.** Depois disso, é só criar outro e repetir o guia.
- **Não há aba Shell** no serviço: o seed roda do seu computador (passo 6).

## 2. O que você precisa

- Conta no Render ligada ao GitHub do fork `dzim-almeida/plataformaADM`.
- Node (qualquer versão recente) e o repositório no seu computador, **só para o seed** (passo 6).
- [Postman](https://www.postman.com/downloads/) para o roteiro de testes.

Não precisa de Stripe, de Resend, de gerar chaves à mão nem de máquina Windows: o guia usa valores falsos onde a API só exige que a variável exista.

## 3. Criar o banco

1. No Render: **New › Postgres**.
2. Name `startbig-hml-db`, Database `startbig_hml`, User `startbig_hml`, Plan **Free**. **Create Database**.
3. Na página do banco, em **Connections**, copie e guarde:
   - **Internal Database URL**, que a API usa (passo 4);
   - **External Database URL**, que o seed usa (passo 6).

## 4. Criar a API

1. **New › Web Service** e escolha o repositório `dzim-almeida/plataformaADM`.
2. Preencha:

   | Campo | Valor |
   |-------|-------|
   | Name | `startbig-hml-api` |
   | Branch | `homologacao-render` |
   | Root Directory | (vazio: a raiz do repositório) |
   | Runtime / Language | Node |
   | Build Command | `npm ci --include=dev && npm run build --workspace=apps/server && npx prisma db push` |
   | Start Command | `npm run start --workspace=apps/server` |
   | Instance Type | **Free** |

   O que o Build Command faz: instala as dependências (o `--include=dev` traz o TypeScript e o Prisma, que o build usa), compila a API e cria as tabelas no banco **de homologação** (`prisma db push`).

3. Em **Advanced › Health Check Path**: `/licenca/chave-publica`.
4. Em **Environment Variables**, acrescente:

   | Variável | Valor | Por quê |
   |----------|-------|---------|
   | `NODE_VERSION` | `22` | Versão do Node usada no projeto |
   | `NODE_ENV` | `production` | Liga as travas de segurança, como na produção |
   | `DATABASE_URL` | A **Internal Database URL** do passo 3 | O banco de homologação |
   | `JWT_SECRET` | Clique em **Generate** | Segredo do login do painel |
   | `FISCAL_TOKENS_KEY` | Clique em **Generate** | Chave dos segredos fiscais (própria da homologação) |
   | `STRIPE_SECRET_KEY` | `sk_test_falso` | A API só exige que exista; pagamento não entra nos testes |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_falso` | Idem |
   | `RESEND_API_KEY` | `re_falso` | A biblioteca do Resend não carrega sem chave. Nenhum e-mail sai: eles ficam no histórico da API, com o link dentro |
   | `APP_URL` | `https://startbig-hml-api.onrender.com` | Monta os links dos e-mails. Não há painel; o roteiro só lê o token do link |

   **Deixe de fora**, por enquanto, `LICENCA_PRIVATE_KEY` e `LICENCA_PUBLIC_KEY` (passo 5).

5. **Create Web Service** e espere o primeiro deploy terminar ("Live").

## 5. Fixar as chaves RSA da licença

São as chaves que assinam os tokens da licença. Sem elas fixas, a API gera um par novo **a cada vez que acorda**, e os tokens emitidos antes passam a ser recusados.

1. Abra a aba **Logs** da API e procure, perto do início do boot, estas linhas:
   ```
   [LICENÇA] Chaves RS256 não configuradas — par temporário gerado para desenvolvimento.
   LICENCA_PRIVATE_KEY="..."
   LICENCA_PUBLIC_KEY="..."
   ```
2. Em **Environment**, crie as duas variáveis com esses valores (o texto **entre as aspas**, sem as aspas).
3. **Save Changes**. O Render reinicia a API com as chaves fixas.

São chaves **só de homologação**: nunca use as da produção aqui, nem estas lá. Não cole as chaves em chat, issue nem commit.

## 6. Criar o admin e os planos (seed)

O banco nasce vazio, e o cadastro precisa de duas coisas que o seed cria:
- **um usuário ADMIN**: todo cliente novo fica ligado a ele, e é com ele que o roteiro lê os e-mails;
- **um plano ATIVO**: a licença de teste nasce ligada a ele na confirmação.

No seu computador, numa cópia do fork na branch `homologacao-render`:

```bash
git checkout homologacao-render
npm install                      # instala as dependências (uma vez só)
```

Depois, **no Git Bash, Linux ou Mac**:

```bash
# DATABASE_URL = a External Database URL do banco DE HOMOLOGAÇÃO (passo 3).
# Confira duas vezes: nunca rode com o endereço do banco da produção.
DATABASE_URL="<External Database URL>?sslmode=require" \
ADMIN_EMAIL="voce@seudominio.com.br" \
ADMIN_SENHA="uma-senha-forte" \
npx tsx prisma/seed.ts
```

**No PowerShell (Windows)**, uma linha por vez:

```powershell
$env:DATABASE_URL = "<External Database URL>?sslmode=require"
$env:ADMIN_EMAIL  = "voce@seudominio.com.br"
$env:ADMIN_SENHA  = "uma-senha-forte"
npx tsx prisma/seed.ts
```

O `?sslmode=require` existe porque o Render exige conexão cifrada de fora. Se a URL já tiver um `?`, use `&sslmode=require`. O seed pode rodar de novo sem duplicar nada.

Ao terminar, feche o terminal (no PowerShell, as variáveis somem junto) para não rodar outro comando sem querer contra esse banco.

## 7. Roteiro no Postman

### Importar

1. Postman › **Import** › escolha `docs/homologacao-render.postman_collection.json`.
2. Abra a coleção **StartBig · Homologação da licença (Render)** › aba **Variables** e preencha a coluna **Current value**:

   | Variável | O que colocar |
   |----------|---------------|
   | `baseUrl` | O endereço da API no Render (ex.: `https://startbig-hml-api.onrender.com`) |
   | `adminEmail`, `adminSenha` | Os do seed (passo 6) |
   | `clienteEmail` | Um e-mail com domínio real (a API confere o domínio). Ex.: `seuemail+hml1@gmail.com` |
   | `clienteSenha` | Qualquer senha com 8 caracteres ou mais |
   | `cpf` | Um CPF **válido** que ainda não esteja no banco. O padrão `52998224725` é um CPF de teste |
   | `hwidServidor`, `hwidNovo` | Deixe como estão (são os "computadores" do teste) |

   As outras variáveis (`adminToken`, `licencaToken`, `confirmToken`...) a coleção preenche sozinha.

### Rodar

Rode os passos **na ordem**, um por vez (botão **Send**), e olhe a aba **Test Results** de cada um. Ou use **Run collection** para rodar todos de uma vez.

| Passo | O que testa | Esperado |
|-------|-------------|----------|
| 00 | Acorda a API | `200` com a chave pública |
| 01 | Login do admin | `201` (guarda o token do admin) |
| 02 | Cadastro pelo app **novo** | `202`, sem chave na resposta |
| 03 | Cadastro pelo app **antigo** | `409 CONFIRMACAO_NECESSARIA` |
| 04 | Login antes de confirmar | `403 AGUARDANDO_CONFIRMACAO_EMAIL` |
| 05 | Achar o e-mail de confirmação no histórico | `200` (guarda o id do e-mail) |
| 06 | Ler o link do e-mail | `200`; o link está lá e **a chave não** |
| 07 | Confirmar o cadastro (o "clique" no link) | `200` "Conta confirmada" |
| 08 | Confirmar de novo | `400 TOKEN_CONFIRMACAO_INVALIDO` |
| 09 | Login do servidor da loja | `201` com a chave e o token da licença |
| 10 | Dados do titular | `200`, documento formatado |
| 11 | Trocar o documento | `403 DOCUMENTO_TRAVADO` |
| 12 | Status do backup | `200`, `planoPermiteBackup: true` (trial sem full) |
| 13 | Heartbeat **sem** token de caixa novo | `404 SESSAO_INEXISTENTE` (nunca `400`) |
| 14 | Heartbeat **com** token de caixa novo | `201`, `ok: true` |
| 15 | Reenviar link | `202`. Rode duas vezes seguidas: no histórico só aparece **um** e-mail novo |
| 16 | Reenviar link de e-mail que não existe | `202`, a mesma resposta |
| 17 | Troca de servidor (login de outro computador) | `201` |
| 18 | Token do servidor antigo | `401 LICENCA_HWID_REVOGADO` |
| 19 | Status do backup com o servidor novo | `200` |
| 20 | Senha errada (rode **6 vezes**) | 1ª a 5ª: `401`. 6ª em diante: `429 MUITAS_TENTATIVAS` |

O passo 20 fica por último porque bloqueia o login daquele e-mail por 1 minuto.

### Rodar de novo do zero

O cadastro é por e-mail e CPF: numa segunda rodada, troque `clienteEmail` (ex.: `+hml2`) e `cpf` (outro CPF válido de teste) nas variáveis. O admin e os planos continuam valendo.

### Se algo der errado

| Sintoma | Causa provável |
|---------|----------------|
| O passo 00 demora ou dá timeout | A API estava dormindo: mande de novo |
| `400` no passo 02 falando do domínio do e-mail | O domínio do `clienteEmail` não existe. Use um real (gmail.com etc.) |
| `400` no passo 02 falando de CPF | CPF inválido. Use um CPF de teste válido |
| `400` no 02 com "Sistema não configurado para auto-cadastro" | Falta o admin: o seed não rodou (passo 6) |
| `400` no 07 com "Nenhum plano ATIVO" | Faltam os planos: o seed não rodou (passo 6) |
| `401` no passo 01 | `adminEmail`/`adminSenha` diferentes dos usados no seed |
| A API não sobe; o log fala de "API key" do Resend | `RESEND_API_KEY` vazia. Ponha `re_falso` |
| A API não sobe; o log fala de "Variáveis de ambiente obrigatórias" | Falta `JWT_SECRET`, `STRIPE_SECRET_KEY` ou `STRIPE_WEBHOOK_SECRET` (passo 4) |
| `401` no passo 10 depois de um tempo parado | As chaves RSA não foram fixadas (passo 5): a API gerou um par novo ao acordar. Fixe-as e refaça desde o 09 |

## 8. Manter a homologação em dia

Quando a `fix/licenca-seguranca` receber commits novos:

```bash
git checkout homologacao-render            # vai para a branch de homologação
git merge fix/licenca-seguranca            # traz as mudanças novas da série
git push origin homologacao-render         # o Render faz o deploy sozinho
```

## 9. Testar também o app (opcional, exige Windows)

O app instalado fala com `https://api.startbig.com.br` (produção). O endereço está fixo em cinco arquivos do `start-big`:

- `backend-fastapi/app/services/licenca/constantes.py`
- `backend-fastapi/app/services/cloud/_constants.py`
- `backend-fastapi/app/services/fiscal/http/client_startbig.py`
- `backend-fastapi/app/services/licenca/renovacao.py`
- `backend-fastapi/app/services/fiscal/os_notas.py` (`HOST_DA_PLATAFORMA`)

Para um instalador de teste: numa cópia **à parte** da branch `fix/licenca-seguranca` do `start-big`, troque `api.startbig.com.br` pelo endereço da API do Render nesses cinco arquivos, **sem commitar**. Gere `npm run build:sidecar` e `npm run tauri build` em `frontend/`, e instale numa máquina **que não seja de loja**. Antes de abrir o app, acorde a API (passo 00): o app espera só 3 segundos e, se a API estiver dormindo, entra no modo offline.

Nunca deixe esse endereço configurável no app das lojas. O app busca a chave pública na API que ele chama, e uma API falsa poderia liberar todos os módulos.

## 10. Ao terminar

- Apague o serviço `startbig-hml-api` e o banco `startbig-hml-db` no Render.
- Descarte as chaves RSA de homologação e qualquer instalador de teste.
- O deploy de produção segue o roteiro de sempre (`docs/deploy-pix-asaas.md`), com a conferência do diff do `db push` da LIC-06: o esperado é **só** `ALTER TABLE "clientes" ADD COLUMN ...` e `ALTER TABLE "clientes_pf" ADD COLUMN ...` (telefone e celular da PF).
