"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-provider";
import { SessionAccessPanel } from "@/components/auth/session-access-panel";
import { GameNavbar } from "@/components/game/game-navbar";

export default function AuthPage() {
	const { t } = useTranslation("auth");
	const { user } = useAuth();
	const router = useRouter();

	// If already logged in, redirect to home
	if (user) {
		router.replace("/");
		return null;
	}

	return (
		<div className="min-h-dvh flex flex-col animate-page-enter">
			<GameNavbar backHref="/" title={t("title")} subtitle={t("subtitle")} />

			<div className="flex-1 flex flex-col items-center justify-center px-4 max-w-sm mx-auto w-full">
				<SessionAccessPanel
					title={t("accountTitle")}
					description={t("accountDescription")}
					guestNote={t("guestNote")}
					onAuthenticated={() => router.push("/")}
					onGuest={() => router.push("/play/online")}
				/>
			</div>
		</div>
	);
}
