"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-provider";
import { GameNavbar } from "@/components/game/game-navbar";
import { UserStatsPanel } from "@/components/profile/user-stats-panel";

export default function ProfilePage() {
	const router = useRouter();
	const { t } = useTranslation("landing");
	const { user, loading } = useAuth();

	useEffect(() => {
		if (!loading && !user) {
			router.replace("/auth");
		}
	}, [loading, router, user]);

	if (loading || !user) {
		return (
			<div className="min-h-dvh flex items-center justify-center px-4">
				<div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
			</div>
		);
	}

	return (
		<div className="min-h-dvh flex flex-col animate-page-enter">
			<GameNavbar backHref="/" title={t("hero.statsPanel.title")} subtitle={t("hero.statsPanel.description")} />
			<div className="flex-1 pb-8">
				<UserStatsPanel />
			</div>
		</div>
	);
}