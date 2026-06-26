import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/withings/callback")({
	validateSearch: (search: Record<string, unknown>) => ({
		success: search.success === "true",
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { success, error } = Route.useSearch();

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader className="text-center">
					<div className="flex justify-center">
						{success ? (
							<Check className="size-8 text-green-600" />
						) : (
							<X className="size-8 text-destructive" />
						)}
					</div>
					<CardTitle>
						{success ? "Withings connected" : "Connection failed"}
					</CardTitle>
					<CardDescription>
						{success
							? "Your Withings account has been linked successfully."
							: error
								? `Something went wrong (${error}). Please try again.`
								: "Something went wrong. Please try again."}
					</CardDescription>
				</CardHeader>
				<CardContent />
				<CardFooter className="justify-center">
					<Button asChild>
						<Link to="/integrations">Back to integrations</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
