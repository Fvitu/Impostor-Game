"use client"

import { useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ALL_CATEGORIES_ID,
	type GameCategoryId,
	type GameCategorySelection,
	type CategoryOption,
	TOTAL_WORD_COUNT,
	getSelectionWordCount,
} from "@/lib/game-data";

interface CategoryMultiSelectProps {
	value: GameCategorySelection;
	onChange: (value: GameCategorySelection) => void;
	options: CategoryOption[];
	allLabel: string;
	displayLabel: string;
	disabled?: boolean;
	isSaving?: boolean;
}

export function CategoryMultiSelect({ value, onChange, options, allLabel, displayLabel, disabled, isSaving }: CategoryMultiSelectProps) {
	const [open, setOpen] = useState(false);
	const isAll = value === ALL_CATEGORIES_ID;
	const selectedIds: Set<GameCategoryId> = isAll ? new Set(options.map((o) => o.id)) : new Set(value);

	const wordCount = getSelectionWordCount(value);

	const handleAllToggle = () => {
		onChange(ALL_CATEGORIES_ID);
	};

	const handleCategoryToggle = (categoryId: GameCategoryId) => {
		if (isAll) {
			const remaining = options.map((o) => o.id).filter((id) => id !== categoryId);
			if (remaining.length === 0) return;
			onChange(remaining);
			return;
		}

		const currentArray = value as GameCategoryId[];
		if (currentArray.includes(categoryId)) {
			const remaining = currentArray.filter((id) => id !== categoryId);
			if (remaining.length === 0) {
				onChange(ALL_CATEGORIES_ID);
				return;
			}
			onChange(remaining);
		} else {
			const next = [...currentArray, categoryId];
			if (next.length === options.length) {
				onChange(ALL_CATEGORIES_ID);
				return;
			}
			onChange(next);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild disabled={disabled || isSaving}>
				<button
					type="button"
					data-state={open ? "open" : "closed"}
					style={{ transform: "none" }}
					className="h-12 w-full flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 data-[state=open]:border-primary/40 active:scale-100 focus:scale-100 transition-[color,border-color]">
					<span className="truncate text-left mr-2">{displayLabel}</span>
					<div className="flex items-center gap-2 shrink-0">
						{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin text-primary" /> : null}
						<span className="font-mono text-xs text-muted-foreground tabular-nums">{wordCount}</span>
						<ChevronDown className={`h-4 w-4 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
					</div>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={4}
				className="w-[var(--radix-popover-trigger-width)] p-0 border-primary/20 bg-card/95 backdrop-blur-xl shadow-xl">
				{/* "All Categories" — pinned at top, outside scroll */}
				<div className="p-2 pb-0">
					<label
						className={`flex items-center gap-3 rounded-md px-2 py-2 select-none ${isSaving ? "opacity-60" : "hover:bg-primary/10 cursor-pointer"}`}>
						<Checkbox checked={isAll} onCheckedChange={handleAllToggle} disabled={isSaving} />
						<span className="text-sm font-medium text-foreground flex-1">{allLabel}</span>
						<span className="font-mono text-xs text-muted-foreground tabular-nums">{TOTAL_WORD_COUNT}</span>
					</label>
					<div className="h-px bg-border mx-2 mt-1" />
				</div>

				{/* Individual categories — scrollable list */}
				<div className="max-h-52 overflow-y-auto overscroll-contain px-2 pb-2 pt-1 pr-1.5">
					<div className="space-y-0.5">
						{options.map((option) => (
							<label
								key={option.id}
								className={`flex items-center gap-3 rounded-md px-2 py-2 select-none ${isSaving ? "opacity-60" : "hover:bg-primary/10 cursor-pointer"}`}>
								<Checkbox checked={selectedIds.has(option.id)} onCheckedChange={() => handleCategoryToggle(option.id)} disabled={isSaving} />
								<span className="text-sm text-foreground flex-1 truncate">{option.label}</span>
								<span className="font-mono text-xs text-muted-foreground tabular-nums">{option.wordCount}</span>
							</label>
						))}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
