import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PointerGridOverlay } from '@/components/ui/pointer-grid-overlay'
import { GlowTracker } from '@/components/ui/glow-tracker'
import { SessionRedirect } from "@/components/session-redirect";
import { I18nProvider } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AuthProvider } from "@/components/auth-provider";
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "The Impostor - Deception game",
	description:
		"A thrilling multiplayer deception game. Find the impostor among your friends or survive undetected. Play online or pass-and-play on a single device.",
	manifest: "/manifest.json",
	icons: {
		icon: "/Impostor-icon.png",
		apple: "/apple-touch-icon.png",
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "The Impostor",
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
				<I18nProvider>
					<AuthProvider>
						<SessionRedirect />
						{children}
						<LanguageSwitcher />
					</AuthProvider>
				</I18nProvider>
				<PointerGridOverlay />
				<GlowTracker />
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
  );
}
