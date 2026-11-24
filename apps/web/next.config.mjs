/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pacotes do monorepo escritos em TypeScript que o Next precisa compilar.
  // O painel NÃO usa @startbig/database: todo acesso ao banco passa pela API
  // (apps/server). @startbig/schemas fica para os tipos e validações
  // compartilhados com a API.
  transpilePackages: ['@startbig/schemas'],
};

export default nextConfig;
