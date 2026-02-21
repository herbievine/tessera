import { meOptions, type UseMeReturn } from "@/api/me.query";
import { tryCatch } from "@/utils/try-catch";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async ({ context }) => {
		const { data } = await tryCatch(
			context.queryClient.ensureQueryData<UseMeReturn>(meOptions()),
		);

		if (data !== null) {
			throw redirect({
				to: "/home",
			});
		}

		return {
			user: null,
		};
	},
	component: AuthLayout,
});

function AuthLayout() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<Outlet />
		</div>
	);
}
