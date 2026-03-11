"use client"

import { Eye, EyeOff, Users, MessageSquare, Vote, Trophy, Shield, Search } from "lucide-react"
import { useTranslation } from "react-i18next"


export function RulesSection() {
  const { t } = useTranslation('landing')

  const rules = [
	{
		icon: Users,
		title: t('rules.gatherTitle'),
		description: t('rules.gatherDesc'),
	},
	{
		icon: Eye,
		title: t('rules.learnTitle'),
		description: t('rules.learnDesc'),
	},
	{
		icon: MessageSquare,
		title: t('rules.cluesTitle'),
		description: t('rules.cluesDesc'),
	},
	{
		icon: Search,
		title: t('rules.debateTitle'),
		description: t('rules.debateDesc'),
	},
	{
		icon: Vote,
		title: t('rules.voteTitle'),
		description: t('rules.voteDesc'),
	},
	{
		icon: Trophy,
		title: t('rules.winTitle'),
		description: t('rules.winDesc'),
	},
  ];

  return (
		<section className="py-20 px-4 animate-page-enter animate-page-enter-delay-1">
			<div className="max-w-5xl mx-auto">
				<div className="text-center mb-16">
					<p className="text-sm font-mono tracking-widest text-primary uppercase mb-3">{t('rules.sectionLabel')}</p>
					<h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">{t('rules.sectionTitle')}</h2>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{rules.map((rule, index) => (
						<div
							key={rule.title}
							className="glow-box rounded-xl p-6 animate-page-enter"
							style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }}>
							<div className="flex items-start gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
									<rule.icon className="h-5 w-5" />
								</div>
								<div>
									<p className="text-xs font-mono text-muted-foreground mb-1">
										{t('rules.step', { number: index + 1 })}
									</p>
									<h3 className="text-base font-semibold text-foreground mb-2">{rule.title}</h3>
									<p className="text-sm text-muted-foreground leading-relaxed">{rule.description}</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
  );
}

export function ScoringSection() {
  const { t } = useTranslation('landing')

  return (
		<section className="py-20 px-4 bg-secondary/30 animate-page-enter animate-page-enter-delay-2">
			<div className="max-w-4xl mx-auto">
				<div className="text-center mb-12">
					<p className="text-sm font-mono tracking-widest text-primary uppercase mb-3">{t('scoring.sectionLabel')}</p>
					<h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">{t('scoring.sectionTitle')}</h2>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="glow-box rounded-xl border-success/30 p-8 animate-page-enter">
						<div className="flex items-center gap-3 mb-6">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
								<Shield className="h-5 w-5 text-success" />
							</div>
							<h3 className="text-xl font-bold text-foreground">{t('scoring.friends')}</h3>
						</div>
						<ul className="space-y-3">
							<li className="flex items-start gap-3">
								<span className="font-mono text-sm text-success font-bold mt-0.5">+2</span>
								<span className="text-sm text-muted-foreground leading-relaxed">{t('scoring.friendVotePoints')}</span>
							</li>
							<li className="flex items-start gap-3">
								<span className="font-mono text-sm text-success font-bold mt-0.5">+10</span>
								<span className="text-sm text-muted-foreground leading-relaxed">
									{t('scoring.friendBonusPoints')}
								</span>
							</li>
						</ul>
					</div>

					<div className="glow-box rounded-xl border-primary/30 p-8 animate-page-enter animate-page-enter-delay-1">
						<div className="flex items-center gap-3 mb-6">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<EyeOff className="h-5 w-5 text-primary" />
							</div>
							<h3 className="text-xl font-bold text-foreground">{t('scoring.theImpostor')}</h3>
						</div>
						<ul className="space-y-3">
							<li className="flex items-start gap-3">
								<span className="font-mono text-sm text-primary font-bold mt-0.5">+2</span>
								<span className="text-sm text-muted-foreground leading-relaxed">{t('scoring.impostorSurvivePoints')}</span>
							</li>
							<li className="flex items-start gap-3">
								<span className="font-mono text-sm text-primary font-bold mt-0.5">+10</span>
								<span className="text-sm text-muted-foreground leading-relaxed">{t('scoring.impostorBonusPoints')}</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</section>
  );
}
