"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Scoreboard } from "@/components/game/scoreboard"
import type { GameState } from "@/lib/game-logic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

function ResultsContent() {
  const searchParams = useSearchParams()
  const data = searchParams.get("data")

  if (!data) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">No game data found.</p>
          <Button asChild variant="outline" className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  try {
    const game: GameState = JSON.parse(decodeURIComponent(data))
    return <Scoreboard game={game} backPath="/play/local" />
  } catch {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">Invalid game data.</p>
          <Button asChild variant="outline" className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    )
  }
}

export default function LocalResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
