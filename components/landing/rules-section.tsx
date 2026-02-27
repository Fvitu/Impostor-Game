"use client"

import { Eye, EyeOff, Users, MessageSquare, Vote, Trophy, Shield, Search } from "lucide-react"

const rules = [
  {
    icon: Users,
    title: "Gather Your Friends",
    description: "You need at least 4 players. One will be secretly assigned as The Impostor.",
  },
  {
    icon: Eye,
    title: "Learn the Secret",
    description: "Friends see the secret word. The Impostor gets nothing (or just the category as a hint).",
  },
  {
    icon: MessageSquare,
    title: "Give Clues",
    description: "Each player gives a one-word clue about the secret. Be subtle enough to not help the Impostor!",
  },
  {
    icon: Search,
    title: "Debate & Deduce",
    description: "Discuss the clues. Who seemed suspicious? Who was too vague or too specific?",
  },
  {
    icon: Vote,
    title: "Vote to Eliminate",
    description: "Cast your vote. The player with the most votes is eliminated. Ties mean no one leaves.",
  },
  {
    icon: Trophy,
    title: "Win the Game",
    description: "Friends win by voting out the Impostor. The Impostor wins by surviving all 3 rounds.",
  },
]

export function RulesSection() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono tracking-widest text-primary uppercase mb-3">
            How to Play
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">
            Simple Rules, Endless Deception
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rules.map((rule, index) => (
            <div
              key={rule.title}
              className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:bg-card/80"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <rule.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">
                    {"Step "}
                    {index + 1}
                  </p>
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    {rule.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {rule.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ScoringSection() {
  return (
    <section className="py-20 px-4 bg-secondary/30">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-mono tracking-widest text-accent uppercase mb-3">
            Points System
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">
            Every Round Counts
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Friends</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="font-mono text-sm text-accent font-bold mt-0.5">+2</span>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  points for voting the Impostor each round
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-sm text-accent font-bold mt-0.5">+10</span>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  bonus if you voted correctly every round and the Impostor loses
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-primary/30 bg-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <EyeOff className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">The Impostor</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="font-mono text-sm text-primary font-bold mt-0.5">+2</span>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  points for each round survived
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-sm text-primary font-bold mt-0.5">+10</span>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  bonus for surviving all 3 rounds
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
