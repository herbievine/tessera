import { client } from "@/lib/hono";
import {
	queryOptions,
	useQuery,
	useMutation,
	type QueryOptions,
	type UseMutationOptions,
} from "@tanstack/react-query";

export type UseIntegrationsReturn = Awaited<ReturnType<typeof fn>>;
type Options = QueryOptions<UseIntegrationsReturn>;

async function fn() {
	const res = await (client.api as any).integrations.$get();

	if (res.ok) {
		return res.json();
	}

	return [];
}

export function integrationsOptions(options: Options = {}) {
	return queryOptions({
		queryKey: ["integrations"],
		queryFn: () => fn(),
		staleTime: 10 * 1000,
		...options,
	});
}

export function useIntegrations(options: Options = {}) {
	const { data, ...query } = useQuery(integrationsOptions(options));

	return {
		integrations: data,
		...query,
	};
}

export function useDeleteIntegration(
	options: UseMutationOptions<void, Error, string> = {},
) {
	return useMutation({
		mutationKey: ["deleteIntegration"],
		mutationFn: async (id: string) => {
			const res = await (client.api.integrations as any)[":id"].$delete({
				param: { id },
			});

			if (!res.ok) {
				throw new Error("Failed to delete integration");
			}
		},
		onSuccess: (...params) => {
			options?.onSuccess?.(...params);
		},
		...options,
	});
}

export function useConnectGarmin(
	options: UseMutationOptions<void, Error, { email: string; password: string; startDate?: string }> = {},
) {
	return useMutation({
		mutationKey: ["connectGarmin"],
		mutationFn: async ({ email, password, startDate }) => {
			const res = await (client.api.garmin as any).connect.$post({
				json: { email, password, startDate },
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || "Failed to connect Garmin");
			}
		},
		onSuccess: (...params) => {
			options?.onSuccess?.(...params);
		},
		...options,
	});
}
