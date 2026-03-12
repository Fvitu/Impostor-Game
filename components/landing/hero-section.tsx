"use client"

import Link from "next/link"
import { Smartphone, Wifi, Trophy, User } from "lucide-react";
import { InstallButton } from "@/components/install-button";
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-provider";
import { UserStatsSheet } from "@/components/landing/user-stats-sheet";

export function HeroSection() {
  const { t } = useTranslation("landing");
	const { user, loading } = useAuth();

  return (
		<section className="relative flex flex-col items-center justify-center min-h-[100vh] px-4 overflow-hidden">
			{/* Background Glow */}
			<div className="absolute inset-0 pointer-events-none">
				<div className="absolute top-1/2 left-0 right-0 mx-auto -translate-y-1/2 w-[min(80vw,800px)] h-[min(80vw,800px)] rounded-full bg-primary/8 blur-3xl animate-hero-glow-drift transform-gpu" />
			</div>

			{/* Top-left leaderboard button */}
			<div className="absolute top-4 left-4 z-20">
				<Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
					<Link href="/leaderboard">
						<Trophy className="h-4 w-4 mr-1.5" />
						{t("hero.leaderboard")}
					</Link>
				</Button>
			</div>

			{/* Top-right auth panel */}
			<div className="absolute top-4 right-4 z-20 flex items-center gap-2">
				{!loading &&
					(user ? (
						<UserStatsSheet />
					) : (
						<Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
							<Link href="/auth">
								<User className="h-4 w-4 mr-1.5" />
								{t("hero.login")}
							</Link>
						</Button>
					))}
			</div>

			<div className="relative z-10 text-center max-w-3xl mx-auto animate-slide-up">
				<p className="text-sm font-mono tracking-[0.3em] text-primary uppercase mb-6">{t("hero.subtitle")}</p>

				<h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-foreground leading-tight text-balance mb-6">{t("hero.title")}</h1>

				<p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-12 text-pretty">{t("hero.description")}</p>

				<div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
					<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="glow-box glow-box--clean rounded-md w-full">
							<Button asChild size="lg" className="w-full text-base px-8 py-6 bg-primary text-primary-foreground hover:bg-primary/90 border-0">
								<Link href="/play/online">
									<Wifi className="mr-2 h-5 w-5" />
									{t("hero.playOnline")}
								</Link>
							</Button>
						</div>

						<div className="glow-box glow-box--clean rounded-md w-full">
							<Button asChild size="lg" className="w-full text-base px-8 py-6 bg-primary text-primary-foreground hover:bg-primary/90 border-0">
								<Link href="/play/local">
									<Smartphone className="mr-2 h-5 w-5" />
									{t("hero.passAndPlay")}
								</Link>
							</Button>
						</div>
					</div>

					<InstallButton className="w-full" />
				</div>

				<p className="text-xs text-muted-foreground mt-6 font-mono">{t("hero.minPlayers")}</p>
			</div>
		</section>
  );
}
