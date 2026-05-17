import { useAppForm } from "@/lib/form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_auth/signup")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { queryClient } = Route.useRouteContext();
	const { mutate, isPending, error } = useMutation({
		mutationKey: ["signup"],
		mutationFn: async (payload: {
			name: string;
			email: string;
			password: string;
		}) => {
			const res = await fetch(
				`${import.meta.env.VITE_API_URL}/api/auth/signup`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);

			const json = await res.json();

			if (!res.ok) {
				throw new Error(json.error ?? "Signup failed");
			}

			localStorage.setItem("access_token", json.token);
			queryClient.removeQueries({ queryKey: ["me"] });
			navigate({ to: "/home" });
		},
	});

	const form = useAppForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		validators: {
			onChange: z.object({
				name: z.string(),
				email: z.string(),
				password: z.string(),
			}),
		},
		onSubmit: ({ value }) => mutate(value),
	});

	return (
		<Card className="w-full max-w-sm">
			<CardHeader className="text-center">
				<CardTitle>Create an account</CardTitle>
				<CardDescription>Sign up to get started</CardDescription>
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
						name="name"
						children={(field) => (
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									type="text"
									placeholder="Your name"
									value={field.state.value}
									onChange={(e) => field.setValue(e.target.value)}
								/>
							</div>
						)}
					/>

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

					{error && (
						<p className="text-sm text-destructive">{error.message}</p>
					)}

					<form.AppForm>
						<Button type="submit" disabled={isPending} className="w-full">
							{isPending ? "Creating account..." : "Create account"}
						</Button>
					</form.AppForm>
				</form>
			</CardContent>
			<CardFooter className="justify-center">
				<p className="text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link to="/login" className="underline underline-offset-4">
						Sign in
					</Link>
				</p>
			</CardFooter>
		</Card>
	);
}
