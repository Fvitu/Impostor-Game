import { HeroSection } from "@/components/landing/hero-section"
import { RulesSection, ScoringSection } from "@/components/landing/rules-section"

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background">
      <HeroSection />
      <RulesSection />
      <ScoringSection />
      <footer className="py-8 px-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground font-mono">
          The Impostor &mdash; A party game of deception and deduction
        </p>
      </footer>
    </main>
  )
}
