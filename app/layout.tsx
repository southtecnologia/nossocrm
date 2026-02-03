import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'
import { InstallBanner } from '@/components/pwa/InstallBanner'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'SouthCRM - CRM Inteligente para Gestão de Vendas',
  description: 'SouthCRM é uma plataforma de CRM inteligente que otimiza a gestão de vendas com ferramentas avançadas de pipeline, automação e análise de dados.',
  metadataBase: new URL('https://crm.southti.com.br'),
  keywords: ['CRM', 'gestão de vendas', 'pipeline', 'automação', 'leads', 'vendas'],
  authors: [{ name: 'SouthCRM' }],
  creator: 'SouthCRM',
  publisher: 'SouthCRM',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: '/app/icon.png',
    shortcut: '/app/icon.png',
    apple: '/app/icon.png',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/app/icon.png',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://crm.southti.com.br',
    title: 'SouthCRM - CRM Inteligente para Gestão de Vendas',
    description: 'SouthCRM é uma plataforma de CRM inteligente que otimiza a gestão de vendas com ferramentas avançadas de pipeline, automação e análise de dados.',
    siteName: 'SouthCRM',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SouthCRM - CRM Inteligente para Gestão de Vendas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SouthCRM - CRM Inteligente para Gestão de Vendas',
    description: 'SouthCRM é uma plataforma de CRM inteligente que otimiza a gestão de vendas com ferramentas avançadas de pipeline, automação e análise de dados.',
    images: ['/og-image.png'],
    creator: '@southcrm',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

/**
 * Componente React `RootLayout`.
 *
 * @param {{ children: ReactNode; }} {
  children,
} - Parâmetro `{
  children,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-[var(--color-bg)] text-[var(--color-text-primary)]`}>
        <ServiceWorkerRegister />
        <InstallBanner />
        {children}
      </body>
    </html>
  )
}
