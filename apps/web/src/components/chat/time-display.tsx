"use client";

import { cn } from "@nextjs-starter/ui/lib/utils";
import { ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";

export interface TimeDisplayProps {
	date?: Date | string | number | null;
	format?: "time" | "datetime" | "date" | "live";
	className?: string;
	showIcon?: boolean;
}

export function formatTime(
	dateInput?: Date | string | number | null,
	format: "time" | "datetime" | "date" = "time",
): string {
	if (!dateInput) return "";
	const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
	if (Number.isNaN(date.getTime())) return "";

	// The database stores local wall-clock timestamps (e.g. 17:41:50) which Drizzle/Postgres
	// serializes as ISO strings with a 'Z' suffix. Using timeZone: "UTC" formats the raw wall-clock hours/minutes directly (e.g. 17:41 -> 5:41 PM) without double timezone shifting.
	const timeZone = "UTC";

	if (format === "time") {
		return new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
			timeZone,
		}).format(date);
	}

	if (format === "datetime") {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
			timeZone,
		}).format(date);
	}

	if (format === "date") {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone,
		}).format(date);
	}

	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
		timeZone,
	}).format(date);
}

export function TimeDisplay({
	date,
	format = "time",
	className,
	showIcon = false,
}: TimeDisplayProps) {
	const [mounted, setMounted] = useState(false);
	const [liveTime, setLiveTime] = useState<string>("");

	useEffect(() => {
		setMounted(true);
		if (format === "live") {
			const update = () => {
				setLiveTime(
					new Intl.DateTimeFormat("en-US", {
						hour: "numeric",
						minute: "2-digit",
						second: "2-digit",
						hour12: true,
					}).format(new Date()),
				);
			};
			update();
			const interval = setInterval(update, 1000);
			return () => clearInterval(interval);
		}
	}, [format]);

	if (!mounted && format === "live") {
		return null;
	}

	const formatted = format === "live" ? liveTime : formatTime(date, format);

	if (!formatted && format !== "live") return null;

	const isoString = date
		? new Date(date).toISOString()
		: new Date().toISOString();

	return (
		<time
			dateTime={isoString}
			className={cn("inline-flex items-center gap-1 tabular-nums", className)}
			suppressHydrationWarning
		>
			{showIcon && <ClockIcon className="size-3 shrink-0" aria-hidden="true" />}
			<span>{formatted}</span>
		</time>
	);
}
