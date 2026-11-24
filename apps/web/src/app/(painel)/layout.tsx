/**
 * Layout de TODAS as telas do painel administrativo.
 *
 * A pasta `(painel)` tem o nome entre parênteses: no Next.js isso é um
 * "route group". Ela organiza os arquivos, mas NÃO entra na URL. Ou seja,
 * `app/(painel)/clientes/page.tsx` continua sendo a página `/clientes`.
 *
 * Antes cada tela tinha um layout.tsx próprio, todos iguais. Agora existe só
 * este: para mudar o menu ou o cabeçalho do painel, muda-se num lugar só.
 *
 * Quem impede o acesso sem login é o `src/proxy.ts`, não este arquivo.
 */
import { DashboardShell } from '@/components/layout' // menu lateral + cabeçalho do painel

// `children` é a página que está sendo aberta (clientes, planos, fiscal...).
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  // Envolve a página com a "moldura" do painel.
  return <DashboardShell>{children}</DashboardShell>
}
