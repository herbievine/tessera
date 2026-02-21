import { client } from "@/lib/hono";
import {
	queryOptions,
	useQuery,
	useSuspenseQuery,
  type QueryOptions,
} from "@tanstack/react-query";

export type UseMeReturn = Awaited<ReturnType<typeof fn>>;
type Options = QueryOptions<UseMeReturn>;

async function fn() {
  const res = await client.api.auth.me.$get()

  if (res.ok) {
    const user = await res.json()

    // localStorage.setItem("access_token", user.accessToken)

    return user
  }

  return null
}

export function meOptions(options: Options = {}) {
	return queryOptions({
		queryKey: ["me"],
		queryFn: () => fn(),
		staleTime: 10 * 1000,
		...options,
	});
}

// export function useMe(options: Options = {}) {
// 	const { data, ...query } = useQuery(meOptions(options));

// 	return {
// 		me: data,
// 		...query,
// 	};
// }

// export function useSuspenseMe(options: Options = {}) {
// 	const { data, ...query } = useSuspenseQuery(meOptions(options));

// 	return {
// 		me: data,
// 		...query,
// 	};
// }
