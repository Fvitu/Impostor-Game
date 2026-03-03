import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { PointerGridOverlay } from '@/components/ui/pointer-grid-overlay'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "The Impostor - Party Game",
	description:
		"A thrilling multiplayer party game. Find the impostor among your friends or survive undetected. Play online or pass-and-play on a single device.",
	icons: {
		icon: "/Impostor-icon.png",
		apple: "/Impostor-icon.png",
	},
};

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased min-h-dvh">
        {children}
        <PointerGridOverlay />
        <Analytics />
      </body>
    </html>
  )
}
