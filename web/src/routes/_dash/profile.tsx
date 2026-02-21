import { createFileRoute } from "@tanstack/react-router";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dash/profile")({
	component: RouteComponent,
});

function RouteComponent() {
	const { user } = Route.useRouteContext();
	const [copiedUrl, setCopiedUrl] = useState(false);
	const [copiedKey, setCopiedKey] = useState(false);

	const formatDate = (date: Date | string | null) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString();
	};

	const copyUrl = async () => {
		await navigator.clipboard.writeText("http://172.17.0.1:3010/mcp");
		setCopiedUrl(true);
		setTimeout(() => setCopiedUrl(false), 2000);
	};

	const copyApiKey = async () => {
		if (user.apiKeyHash) {
			await navigator.clipboard.writeText(`Bearer ${user.apiKeyHash}`);
			setCopiedKey(true);
			setTimeout(() => setCopiedKey(false), 2000);
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Profile</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex">
						<span className="text-sm text-muted-foreground w-24">Name</span>
						<span className="text-sm">{user.name}</span>
					</div>
					<div className="flex">
						<span className="text-sm text-muted-foreground w-24">Email</span>
						<span className="text-sm">{user.email}</span>
					</div>
					<div className="flex">
						<span className="text-sm text-muted-foreground w-24">
							Member since
						</span>
						<span className="text-sm">{formatDate(user.createdAt)}</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>MCP Connection</CardTitle>
					<CardDescription>
						Use these settings to connect an MCP client
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-1">
						<span className="text-xs text-muted-foreground uppercase tracking-wide">
							URL
						</span>
						<div className="flex items-center gap-2">
							<code className="flex-1 text-sm bg-muted px-3 py-2 rounded-none font-mono">
								http://172.17.0.1:3010/mcp
							</code>
							<Button
								variant="outline"
								size="icon"
								onClick={copyUrl}
								className="shrink-0"
							>
								{copiedUrl ? (
									<Check className="size-4" />
								) : (
									<Copy className="size-4" />
								)}
							</Button>
						</div>
					</div>
					<div className="space-y-1">
						<span className="text-xs text-muted-foreground uppercase tracking-wide">
							Type
						</span>
						<p className="text-sm">Streamable HTTP</p>
					</div>
					<div className="space-y-1">
						<span className="text-xs text-muted-foreground uppercase tracking-wide">
							Authorization
						</span>
						<div className="flex items-center gap-2">
							<code className="flex-1 text-sm bg-muted px-3 py-2 rounded-none font-mono truncate">
								Bearer {user.apiKeyHash}
							</code>
							<Button
								variant="outline"
								size="icon"
								onClick={copyApiKey}
								className="shrink-0"
							>
								{copiedKey ? (
									<Check className="size-4" />
								) : (
									<Copy className="size-4" />
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
