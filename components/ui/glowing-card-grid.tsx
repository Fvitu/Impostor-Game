"use client"

import React, { useRef, useState, useCallback } from "react"

/* ────────────────────────────────────────────────────────────────
 * GlowingCardGrid
 * ────────────────────────────────────────────────────────────────
 * Wraps a set of <GlowingCard> children.  Tracks the mouse at the
 * grid/container level so the spotlight glow reaches adjacent cards
 * even before the cursor enters them.
 *
 * Adds the `.is-hovered` class when the cursor is inside, which
 * CSS uses to fade the gradient in/out smoothly.
 * ────────────────────────────────────────────────────────────── */

export interface GlowingCardGridProps {
  children: React.ReactNode
  /** Extra classes for the grid container (e.g. Tailwind grid utilities). */
  className?: string
}

export function GlowingCardGrid({
  children,
  className = "",
}: GlowingCardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const grid = gridRef.current
      if (!grid) return

      // Compute cursor position relative to *each* card and set CSS
      // custom properties so the radial-gradient center follows it.
      const cards = grid.querySelectorAll<HTMLElement>(".glowing-card")
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`)
        card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`)
      }
    },
    [],
  )

  return (
    <div
      ref={gridRef}
      className={`glowing-card-grid${isHovered ? " is-hovered" : ""} ${className}`.trim()}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * GlowingCard
 * ────────────────────────────────────────────────────────────────
 * A single card that pairs with <GlowingCardGrid>.
 *
 * Rendering layers (outside → inside):
 *
 *  1. `.glowing-card` ─ 1 px padded shell whose background is the
 *     resting border colour.  Its `::before` holds the radial-
 *     gradient border glow that tracks `--mouse-x` / `--mouse-y`.
 *
 *  2. `.glowing-card-content` ─ glassmorphism panel (dark semi-
 *     transparent bg + backdrop-filter blur).  Its own `::before`
 *     is a dimmer surface glow for subtle illumination inside.
 *
 *  3. {children} ─ everything you pass in is rendered above both
 *     glow layers.
 *
 * The 1 px padding on the shell acts as the border thickness —
 * the inner content covers everything *except* that 1 px gap,
 * which is where the radial-gradient "border" shines through.
 * ────────────────────────────────────────────────────────────── */

export interface GlowingCardProps {
  children: React.ReactNode
  /** Extra classes on the outer card shell (the glow border layer). */
  className?: string
  /** Extra classes on the inner content area (padding, layout, etc.). */
  contentClassName?: string
}

export function GlowingCard({
  children,
  className = "",
  contentClassName = "",
}: GlowingCardProps) {
  return (
    <div className={`glowing-card ${className}`.trim()}>
      <div className={`glowing-card-content ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  )
}
