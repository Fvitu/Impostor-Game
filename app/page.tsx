"use client";

import { HeroSection } from "@/components/landing/hero-section";
import { RulesSection, ScoringSection } from "@/components/landing/rules-section";
import { useTranslation } from "react-i18next";

export default function HomePage() {
	const { t } = useTranslation("common");
	const currentYear = new Date().getFullYear();

	return (
		<main className="min-h-dvh animate-page-enter">
			{" "}
			<HeroSection />
			<RulesSection />
			<ScoringSection />
			<footer className="page-footer glow-box py-8 px-4 text-center border-t border-border bg-card backdrop-blur-sm transition-colors relative z-20 animate-page-enter animate-page-enter-delay-2">
				<p className="text-xs text-muted-foreground font-mono">{t("footer.tagline")}</p>
				<p className="text-xs text-muted-foreground font-mono">
					{t("footer.credit")} &copy; {currentYear}
				</p>
			</footer>
		</main>
	);
}
