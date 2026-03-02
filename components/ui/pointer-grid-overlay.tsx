'use client'

import { useEffect, useRef } from 'react'

export function PointerGridOverlay() {
  const cursorPositionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const cursorPosition = cursorPositionRef.current

    if (!cursorPosition) {
      return
    }

    // If the user prefers reduced motion, do not run the animation.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let currentX = targetX
    let currentY = targetY
    let animationFrameId = 0

    const handlePointerMove = (event: PointerEvent) => {
      targetX = event.clientX
      targetY = event.clientY
    }

    const animate = () => {
      currentX += (targetX - currentX) * 0.12
      currentY += (targetY - currentY) * 0.12

      // Position the cursor-position element; the inner cursor is centered
      // via CSS using translate(-50%, -50%), so we place the anchor at the
      // exact pointer coordinates.
      cursorPosition.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`
      animationFrameId = window.requestAnimationFrame(animate)
    }

    window.addEventListener('pointermove', handlePointerMove)
    animate()

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="pointer-grid-overlay" aria-hidden="true">
      <div ref={cursorPositionRef} className="pointer-grid-cursor-position">
        <div className="pointer-grid-cursor" />
      </div>
    </div>
  )
}
