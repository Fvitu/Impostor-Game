"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useTranslation } from 'react-i18next'

interface GameNavbarProps {
  backHref?: string
  onBack?: () => void
  title?: string
  subtitle?: React.ReactNode
  round?: number
}

export function GameNavbar({ backHref = "/", onBack, title, subtitle, round }: GameNavbarProps) {
  const { t } = useTranslation('common')
  return (
    <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">{t('back')}</span>
          </Button>
        ) : (
          <Link href={backHref} aria-label="Back">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">{t('back')}</span>
            </Button>
          </Link>
        )}
        <div className="mr-2">
          {title ? (
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          ) : null}
          {subtitle ? (
            <p className="text-xs font-mono text-muted-foreground mb-0">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {typeof round === "number" && (
        <div className="ml-auto">
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-0">
            {t('round', { number: round })}
          </p>
        </div>
      )}
    </header>
  )
}
