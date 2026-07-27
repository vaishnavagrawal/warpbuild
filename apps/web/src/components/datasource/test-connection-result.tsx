"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@nextjs-starter/ui/components/alert";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";

interface TestConnectionResultProps {
	result: {
		ok: boolean;
		serverVersion?: string;
		error?: string;
		checkedAt: string;
	} | null;
}

export function TestConnectionResult({ result }: TestConnectionResultProps) {
	if (!result) return null;

	return (
		<div aria-live="polite" aria-atomic="true">
			{result.ok ? (
				<Alert>
					<CheckCircle2Icon className="size-4 text-green-600" />
					<AlertTitle>Connection successful</AlertTitle>
					<AlertDescription>
						{result.serverVersion && (
							<span>Server: {result.serverVersion}</span>
						)}
					</AlertDescription>
				</Alert>
			) : (
				<Alert variant="destructive">
					<XCircleIcon className="size-4" />
					<AlertTitle>Connection failed</AlertTitle>
					<AlertDescription>{result.error || "Unknown error"}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
