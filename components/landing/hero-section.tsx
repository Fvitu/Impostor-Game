"use client"

import Link from "next/link"
import { Smartphone, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-[85vh] px-4 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-3xl mx-auto animate-slide-up">
        <p className="text-sm font-mono tracking-[0.3em] text-primary uppercase mb-6">
          The Party Game of Deception
        </p>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-foreground leading-tight text-balance mb-6">
          The Impostor
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-12 text-pretty">
          One word. One secret. One liar. Can you find the Impostor hiding among your friends before it is too late?
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto text-base px-8 py-6 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/play/online">
              <Wifi className="mr-2 h-5 w-5" />
              Play Online
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto text-base px-8 py-6 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
          >
            <Link href="/play/local">
              <Smartphone className="mr-2 h-5 w-5" />
              {"Pass & Play"}
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-6 font-mono">
          {"4+ players required"}
        </p>
      </div>
    </section>
  )
}
