import { type UseMeReturn, meOptions } from "@/api/me.query";
import { tryCatch } from "@/utils/try-catch";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		const { data } = await tryCatch(
			context.queryClient.ensureQueryData<UseMeReturn>(meOptions()),
		);

		if (data !== null) {
			throw redirect({
				to: "/home",
			});
		}

		throw redirect({
			to: "/login",
		});
	},
	component: () => null,
});
