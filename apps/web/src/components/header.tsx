"use client";

import { cn } from "@nextjs-starter/ui/lib/utils";
import { DatabaseIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const links = [
	{ to: "/", label: "Home" },
	{ to: "/chat", label: "Chat" },
	{ to: "/datasources", label: "Datasources" },
] as const;

export default function Header() {
	const pathname = usePathname();

	const isActive = (to: string) =>
		to === "/" ? pathname === "/" : pathname.startsWith(to);

	return (
		<header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
				<Link
					href="/"
					className="flex items-center gap-2 font-semibold text-sm tracking-tight"
				>
					<DatabaseIcon className="size-4 text-primary" aria-hidden="true" />
					<span>Ask&nbsp;your&nbsp;DB</span>
				</Link>

				<nav aria-label="Main" className="flex flex-1 items-center gap-1">
					{links.map(({ to, label }) => {
						const active = isActive(to);
						return (
							<Link
								key={to}
								href={to}
								aria-current={active ? "page" : undefined}
								className={cn(
									"rounded-md px-2.5 py-1.5 text-sm transition-colors",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									active
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
								)}
							>
								{label}
							</Link>
						);
					})}
				</nav>

				<div className="flex items-center gap-1.5">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
