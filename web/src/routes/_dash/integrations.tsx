import { useState } from "react";
import { useIntegrations, useDeleteIntegration, useConnectGarmin } from "@/api/integrations.query";
import { createFileRoute } from "@tanstack/react-router";
import { Link2, Check, X, Trash2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_dash/integrations")({
	component: RouteComponent,
});

type Integration = {
	id: string;
	vendor: string;
	createdAt: Date | string | null;
};

const availableIntegrations = [
	{
		vendor: "withings",
		name: "Withings",
		description: "Smart scales, blood pressure monitors, and sleep trackers",
	},
	{
		vendor: "macrofactor",
		name: "MacroFactor",
		description: "Nutrition tracking and macro counting",
	},
	{
		vendor: "oura",
		name: "Oura",
		description: "Sleep and activity tracking ring",
	},
	{
		vendor: "apple",
		name: "Apple Health",
		description: "iOS health data aggregation",
	},
	{
		vendor: "fitbit",
		name: "Fitbit",
		description: "Activity trackers and smartwatches",
	},
	{
		vendor: "garmin",
		name: "Garmin",
		description: "GPS fitness trackers and smartwatches",
	},
];

function GarminConnectSheet() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [open, setOpen] = useState(false);

	const { mutate: connect, isPending } = useConnectGarmin({
		onSuccess: () => {
			setOpen(false);
			setEmail("");
			setPassword("");
			window.location.reload();
		},
		onError: (error) => {
			alert(error.message || "Failed to connect");
		},
	});

	const handleConnect = () => {
		connect({ email, password });
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Connect
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Connect Garmin</DialogTitle>
					<DialogDescription>
						Enter your Garmin Connect credentials to sync your data.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your@email.com"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex justify-end">
					<Button onClick={handleConnect} disabled={isPending || !email || !password}>
						{isPending ? "Connecting..." : "Connect"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function RouteComponent() {
	const { integrations, isLoading } = useIntegrations();

	const { mutate: deleteIntegration, isPending: isDeleting } = useDeleteIntegration({
		onSuccess: () => {
			window.location.reload();
		},
	});

	const handleDelete = (id: string) => {
		if (!confirm("Disconnect this integration? This will delete all related data.")) {
			return;
		}
		deleteIntegration(id);
	};

	const formatDate = (date: Date | string | null) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString();
	};

	const connectedVendors = new Set(
		(integrations as Integration[] | undefined)?.map((i) =>
			i.vendor.toLowerCase(),
		) || [],
	);

	const getConnectionDate = (vendor: string) => {
		const integration = (integrations as Integration[] | undefined)?.find(
			(i) => i.vendor.toLowerCase() === vendor.toLowerCase(),
		);
		return integration?.createdAt ? formatDate(integration.createdAt) : null;
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Connected Integrations</CardTitle>
					<CardDescription>
						Your currently connected health data sources
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : integrations && integrations.length > 0 ? (
						<div className="space-y-2">
							{(integrations as Integration[]).map((integration) => (
								<div
									key={integration.id}
									className="flex items-center justify-between p-3 bg-muted rounded-none"
								>
									<div className="flex items-center gap-3">
										<Link2 className="size-4 text-muted-foreground" />
										<div>
											<p className="text-sm font-medium capitalize">
												{integration.vendor}
											</p>
											<p className="text-xs text-muted-foreground">
												Connected {formatDate(integration.createdAt)}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="icon"
											className="size-8 text-muted-foreground hover:text-destructive"
											onClick={() => handleDelete(integration.id)}
											disabled={isDeleting}
										>
											<Trash2 className="size-4" />
										</Button>
										<Check className="size-4 text-green-600" />
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No integrations connected
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Available Integrations</CardTitle>
					<CardDescription>
						Connect more health data sources to get a complete picture
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{availableIntegrations.map((integration) => {
							const isConnected = connectedVendors.has(integration.vendor);
							const connectionDate = getConnectionDate(integration.vendor);

							return (
								<div
									key={integration.vendor}
									className="flex items-center justify-between p-3 bg-muted rounded-none"
								>
									<div className="flex items-center gap-3">
										<Link2 className="size-4 text-muted-foreground" />
										<div>
											<p className="text-sm font-medium">{integration.name}</p>
											<p className="text-xs text-muted-foreground">
												{integration.description}
											</p>
										</div>
									</div>
									{isConnected ? (
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												{connectionDate}
											</span>
											<Check className="size-4 text-green-600" />
										</div>
									) : integration.vendor === "garmin" ? (
										<GarminConnectSheet />
									) : (
										<X className="size-4 text-muted-foreground" />
									)}
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
