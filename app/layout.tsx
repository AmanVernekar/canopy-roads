import type { Metadata } from 'next'
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

// Source Serif 4 for dossier headings — sells the "civic document" feel.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["400", "600", "700"],
})

export const metadata: Metadata = {
  title: 'Canopy — Climate adaptation planner',
  description:
    'Heat + flood adaptation plans for UK neighbourhoods that need them most. An agent that turns vulnerability data into grant-ready intervention dossiers.',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} bg-paper`}
    >
      <body className="font-sans antialiased text-ink">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
