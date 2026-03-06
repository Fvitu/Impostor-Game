"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * GlowTracker – Page-level mouse tracker for the `.glow-box` system.
 *
 * Attach once (in root layout). On every mousemove it updates
 * `--mouse-x` / `--mouse-y` on every `.glow-box` element and toggles
 * `html.glow-active` so CSS can fade the glow in/out.
 */
export function GlowTracker() {
	const rafId = useRef<number>(0);
	const mouse = useRef({ x: -9999, y: -9999 });

	const tick = useCallback(() => {
		rafId.current = 0;
		const els = document.querySelectorAll<HTMLElement>(".glow-box");
		for (const el of els) {
			const rect = el.getBoundingClientRect();
			el.style.setProperty(
				"--mouse-x",
				`${mouse.current.x - rect.left}px`
			);
			el.style.setProperty(
				"--mouse-y",
				`${mouse.current.y - rect.top}px`
			);
		}
	}, []);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			mouse.current = { x: e.clientX, y: e.clientY };
			if (!rafId.current) {
				rafId.current = requestAnimationFrame(tick);
			}
		};

		const onEnter = () =>
			document.documentElement.classList.add("glow-active");
		const onLeave = () =>
			document.documentElement.classList.remove("glow-active");

		document.addEventListener("mousemove", onMove);
		document.documentElement.addEventListener("mouseenter", onEnter);
		document.documentElement.addEventListener("mouseleave", onLeave);

		return () => {
			document.removeEventListener("mousemove", onMove);
			document.documentElement.removeEventListener(
				"mouseenter",
				onEnter
			);
			document.documentElement.removeEventListener(
				"mouseleave",
				onLeave
			);
			if (rafId.current) cancelAnimationFrame(rafId.current);
		};
	}, [tick]);

	return null;
}
