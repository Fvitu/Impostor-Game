import { HeroSection } from "@/components/landing/hero-section"
import { RulesSection, ScoringSection } from "@/components/landing/rules-section"

export default function HomePage() {
  return (
		<main className="min-h-dvh">
			{" "}
			<HeroSection />
			<RulesSection />
			<ScoringSection />
			<footer className="page-footer py-8 px-4 text-center border-t border-border bg-card/40 backdrop-blur-sm transition-colors relative z-20">
				<p className="text-xs text-muted-foreground font-mono">The Impostor &mdash; A party game of deception and deduction</p>
				<p className="text-xs text-muted-foreground font-mono">Created with ❤️ by Fvitu &copy; 2026</p>
			</footer>
		</main>
  );
}
