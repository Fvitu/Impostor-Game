import { HeroSection } from "@/components/landing/hero-section"
import { RulesSection, ScoringSection } from "@/components/landing/rules-section"

export default function HomePage() {
	const currentYear = new Date().getFullYear();

	return (
		<main className="min-h-dvh animate-page-enter">
			{" "}
			<HeroSection />
			<RulesSection />
			<ScoringSection />
			<footer className="page-footer py-8 px-4 text-center border-t border-border bg-card/40 backdrop-blur-sm transition-colors relative z-20 animate-page-enter animate-page-enter-delay-2">
				<p className="text-xs text-muted-foreground font-mono">The Impostor &mdash; A party game of deception and deduction</p>
				<p className="text-xs text-muted-foreground font-mono">Created with ♡ by Fvitu &copy; {currentYear}</p>
			</footer>
		</main>
	);
}
