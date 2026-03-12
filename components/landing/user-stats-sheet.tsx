"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

export function UserStatsSheet() {
	const { user } = useAuth();

	if (!user?.email) {
		return null;
	}

	return (
		<Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
			<Link href="/profile">
				<UserRound className="h-4 w-4" />
				<span className="max-w-28 truncate font-mono text-xs sm:max-w-40">{user.username}</span>
			</Link>
		</Button>
	);
}