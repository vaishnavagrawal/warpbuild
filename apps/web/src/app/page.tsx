"use client";
import { Button } from "@nextjs-starter/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { trpc } from "@/utils/trpc";

/** Top-level pages reachable from the home screen. */
const ROUTES = [
	{
		href: "/chat",
		label: "Chat",
		description: "Ask questions about your data",
	},
	{
		href: "/datasources",
		label: "Datasources",
		description: "Connect and inspect databases",
	},
	{ href: "/login", label: "Login", description: "Sign in or sign up" },
] as const;

export default function Home() {
	const healthCheck = useQuery(trpc.healthCheck.queryOptions());

	return (
		<div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Ask your DB</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Query your database using natural language and manage data sources.
				</p>
			</div>

			<div className="grid gap-6">
				<section className="rounded-lg border p-4">
					<h2 className="mb-2 font-medium text-sm">API Status</h2>
					<div className="flex items-center gap-2">
						<div
							className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
						/>
						<span className="text-muted-foreground text-sm">
							{healthCheck.isLoading
								? "Checking..."
								: healthCheck.data
									? "Connected"
									: "Disconnected"}
						</span>
					</div>
				</section>

				<section className="rounded-lg border p-4">
					<h2 className="mb-3 font-medium text-sm">Pages</h2>
					<nav aria-label="Main pages" className="grid gap-2 sm:grid-cols-2">
						{ROUTES.map(({ href, label, description }) => (
							<Button
								className="h-auto flex-col items-start gap-1 py-3 text-left"
								key={href}
								render={<Link href={href} />}
								variant="outline"
							>
								<span className="font-medium">{label}</span>
								<span className="text-muted-foreground text-xs">
									{description}
								</span>
							</Button>
						))}
					</nav>
				</section>
			</div>
		</div>
	);
}
