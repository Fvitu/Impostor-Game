"use client"

import { useEffect, useState, useCallback } from "react"
import { Download, Share, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

interface InstallButtonProps {
  className?: string
}

export function InstallButton({ className }: InstallButtonProps) {
  const { t } = useTranslation("landing")
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [showIosModal, setShowIosModal] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Hide if already installed / running in standalone
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsStandalone(true)
      return
    }

    // Detect iOS
    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIos(isiOS)

    // Listen for the native install prompt (Chrome / Edge / Samsung Internet / etc.)
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handler)

    // Hide button if user installs the app
    const installedHandler = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }
    window.addEventListener("appinstalled", installedHandler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [])

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setDeferredPrompt(null)
      }
    } else if (isIos) {
      setShowIosModal(true)
    }
  }, [deferredPrompt, isIos])

  // Don't render anything if already installed
  if (isStandalone) return null

  // Only show when we can actually do something
  if (!deferredPrompt && !isIos) return null

  return (
    <>
      <div className={cn("glow-box glow-box--clean rounded-md", className)}>
        <Button
          type="button"
          onClick={handleInstallClick}
          size="lg"
          variant="outline"
          className="w-full text-base px-8 py-6 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
          aria-label={t("hero.installApp")}
        >
          {isIos ? (
            <Share className="h-5 w-5 shrink-0 mr-2" />
          ) : (
            <Download className="h-5 w-5 shrink-0 mr-2" />
          )}
          {t("hero.installApp")}
        </Button>
      </div>

      {/* iOS instruction modal */}
      {showIosModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIosModal(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-foreground mb-4">{t("hero.installTitle")}</h3>

            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <span>
                  {t("hero.installStep1Before")}{" "}
                  <strong className="text-foreground">{t("hero.installShare")}</strong>{" "}
                  {t("hero.installStep1Middle")}{" "}
                  <Share className="inline h-4 w-4 text-foreground align-text-bottom" />{" "}
                  {t("hero.installStep1After")}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </span>
                <span>
                  {t("hero.installStep2Before")}{" "}
                  <strong className="text-foreground">{t("hero.installAddToHomeScreen")}</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  3
                </span>
                <span>
                  {t("hero.installStep3Before")}{" "}
                  <strong className="text-foreground">{t("hero.installAdd")}</strong>{" "}
                  {t("hero.installStep3After")}
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
