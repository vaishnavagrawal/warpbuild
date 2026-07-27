"use client";

import { Badge } from "@nextjs-starter/ui/components/badge";

interface ConnectionStatusProps {
	status: "unverified" | "connected" | "error";
	lastCheckedAt: string | null;
	lastError: string | null;
}

export function ConnectionStatus({
	status,
	lastCheckedAt,
	lastError,
}: ConnectionStatusProps) {
	const variant =
		status === "connected"
			? "default"
			: status === "error"
				? "destructive"
				: "secondary";

	const label =
		status === "connected"
			? "Connected"
			: status === "error"
				? "Error"
				: "Unverified";

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<Badge variant={variant}>{label}</Badge>
				{lastCheckedAt && (
					<span className="text-muted-foreground text-xs">
						Last checked: {new Date(lastCheckedAt).toLocaleString()}
					</span>
				)}
			</div>
			{status === "error" && lastError && (
				<p className="text-destructive text-xs">{lastError}</p>
			)}
		</div>
	);
}
