import { useAppForm } from "@/lib/form";
import { client } from "@/lib/hono";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_auth/login")({
	component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
	const { queryClient } = Route.useRouteContext();
	const { mutate, isPending } = useMutation({
		mutationKey: ["login"],
		mutationFn: async (payload: { email: string; password: string }) => {
			const data = await client.api.auth.login.$post({
				json: payload,
			});

			if (data.status === 401) {
				throw new Error("Invalid credentials");
			}

			const json = await data.json();

			localStorage.setItem("access_token", json.token);

			queryClient.removeQueries({ queryKey: ["me"] });

			navigate({
				to: "/home",
			});
		},
	});
	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onChange: z.object({
				email: z.string(),
				password: z.string(),
			}),
		},
		onSubmit: ({ value }) => mutate(value),
	});

	return (
		<Card className="w-full max-w-sm">
			<CardHeader className="text-center">
				<CardTitle>Welcome back</CardTitle>
				<CardDescription>Sign in to your account</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.AppField
						name="email"
						children={(field) => (
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									placeholder="you@example.com"
									value={field.state.value}
									onChange={(e) => field.setValue(e.target.value)}
								/>
							</div>
						)}
					/>

					<form.AppField
						name="password"
						children={(field) => (
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									placeholder="••••••••"
									value={field.state.value}
									onChange={(e) => field.setValue(e.target.value)}
								/>
							</div>
						)}
					/>

					<form.AppForm>
						<Button type="submit" disabled={isPending} className="w-full">
							{isPending ? "Signing in..." : "Sign in"}
						</Button>
					</form.AppForm>
				</form>
			</CardContent>
		</Card>
	);
}
