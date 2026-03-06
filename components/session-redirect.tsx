"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getSavedOnlineSession, clearOnlineSession } from "@/lib/storage"

/**
 * Client component that checks for an active online session on mount.
 * If found and the user is not already on the online play page, redirects them.
 */
export function SessionRedirect() {
	const pathname = usePathname()
	const router = useRouter()
	const [checked, setChecked] = useState(false)

	useEffect(() => {
		if (checked) return;

		// Don't redirect if already on the online play pages
		if (pathname?.startsWith("/play/online")) {
			setChecked(true);
			return;
		}

		const session = getSavedOnlineSession();
		if (!session) {
			setChecked(true);
			return;
		}

		// Verify the session is still valid before redirecting
		const verify = async () => {
			try {
				const res = await fetch(
					`/api/rooms/state?code=${session.roomCode}&pid=${session.playerId}`
				);
				if (res.ok) {
					const data = await res.json();
					const stillInRoom = data.game?.players?.some(
						(p: { id: string }) => p.id === session.playerId
		);
					if (stillInRoom) {
						setChecked(true);
						router.push("/play/online");
						return;
					}
				}
				// Handle ended room (410) - clear session
				if (res.status === 410) {
					clearOnlineSession();
					setChecked(true);
					return;
				}
			} catch {
				// Network error, don't redirect
			}

			// Session is stale, clear it
			clearOnlineSession();
			setChecked(true);
		};

		verify();
	}, [pathname, router, checked]);

	return null;
}
