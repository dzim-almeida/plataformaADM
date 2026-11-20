/**
 * ============================================================================
 * NOME DO ARQUIVO: page.tsx (confirmar-cadastro)
 * MÓDULO: Painel web (páginas públicas)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Página que o link do e-mail de confirmação abre (LIC-06). Ela chama
 * GET /erp/auto-cadastro/confirmar?token=..., que confirma o e-mail e cria a
 * licença de teste de 14 dias, e mostra um dos dois estados do quadro 6 dos
 * mockups aprovados:
 * - "Conta confirmada": volte ao StartBig e entre com e-mail e senha;
 * - "Este link expirou": peça um novo link no StartBig ("Reenviar link").
 *   Vale também para link já usado: nesse caso a conta já está confirmada.
 *
 * Mesmo padrão da página primeiro-acesso: componente de cliente ('use client')
 * dentro de um <Suspense>, porque lê o token da URL com useSearchParams.
 * ============================================================================
 */
'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = 'confirmando' | 'confirmada' | 'expirado' | 'erro-conexao'

function ConfirmarCadastroConteudo() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const [status, setStatus] = useState<Status>('confirmando')

  useEffect(() => {
    // Sem token na URL não há o que confirmar: mesmo aviso do link inválido.
    if (!token) { setStatus('expirado'); return }

    // `ativo` evita atualizar a tela depois que o usuário saiu dela.
    let ativo = true
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/erp/auto-cadastro/confirmar?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (!ativo) return
        // 200: confirmada. 400 (inválido ou já usado) e 410 (vencido): o
        // mockup aprovado mostra a mesma tela, que explica os dois casos.
        setStatus(res.ok ? 'confirmada' : 'expirado')
      })
      .catch(() => { if (ativo) setStatus('erro-conexao') })

    return () => { ativo = false }
  }, [token])

  if (status === 'confirmando') return <p style={texto}>Confirmando o seu e-mail...</p>

  if (status === 'confirmada') return (
    <>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
      </svg>
      <h1 style={titulo}>Conta confirmada</h1>
      <p style={texto}>Volte ao StartBig e entre com o seu e-mail e senha.</p>
      <p style={nota}>O período de teste de 14 dias começa agora.</p>
    </>
  )

  if (status === 'erro-conexao') return (
    <>
      <h1 style={titulo}>Não foi possível confirmar agora</h1>
      <p style={texto}>Verifique a sua internet e abra o link do e-mail de novo.</p>
    </>
  )

  return (
    <>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
      <h1 style={titulo}>Este link expirou</h1>
      <p style={texto}>Peça um novo link no StartBig: na tela de entrada, use &quot;Reenviar link&quot;.</p>
      <p style={nota}>Se o link já tinha sido usado, a conta já está confirmada: basta entrar.</p>
    </>
  )
}

const titulo: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }
const texto:  React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: '#64748b' }
const nota:   React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#64748b' }

export default function ConfirmarCadastroPage() {
  return (
    <main style={{ fontFamily: 'Arial, sans-serif', maxWidth: 420, margin: '80px auto', padding: '40px', border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Suspense fallback={<p style={texto}>Carregando...</p>}>
        <ConfirmarCadastroConteudo />
      </Suspense>
    </main>
  )
}
