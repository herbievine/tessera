import { meOptions, type UseMeReturn } from "@/api/me.query";
import type { FileRoutesByTo } from "@/routeTree.gen";
import { tryCatch } from "@/utils/try-catch";
import {
	createFileRoute,
	Outlet,
	redirect,
	Link,
	useLocation,
} from "@tanstack/react-router";
import { Home, LogOut, ChevronUp, User, BarChart3, Link2, Calendar as CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_dash")({
	beforeLoad: async ({ context }) => {
		const { data, error } = await tryCatch(
			context.queryClient.ensureQueryData<UseMeReturn>(meOptions()),
		);

		if (error || data === null) {
			throw redirect({
				to: "/login",
				search: {
					next: location.href as keyof FileRoutesByTo,
				},
			});
		}

		return {
			user: data,
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { user } = Route.useRouteContext();

	const handleLogout = () => {
		localStorage.removeItem("access_token");
		window.location.href = "/login";
	};

	const initials = user.name
		.split(" ")
		.map((n: string) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<SidebarProvider className="h-screen">
			<Sidebar collapsible="none" className="h-full">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" asChild>
								<Link to="/home">
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-semibold">Tessera</span>
									</div>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Dashboard</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton asChild tooltip="Home">
										<Link to="/home">
											<Home />
											<span>Home</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton asChild tooltip="Analytics">
										<Link to="/analytics">
											<BarChart3 />
											<span>Analytics</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton asChild tooltip="Integrations">
										<Link to="/integrations">
											<Link2 />
											<span>Integrations</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton asChild tooltip="Profile">
										<Link to="/profile">
											<User />
											<span>Profile</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									>
										<Avatar className="size-8">
											<AvatarFallback className="rounded-none">
												{initials}
											</AvatarFallback>
										</Avatar>
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-medium">{user.name}</span>
											<span className="truncate text-xs">{user.email}</span>
										</div>
										<ChevronUp className="ml-auto size-4" />
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-none"
									side="bottom"
									align="end"
									sideOffset={4}
								>
									<DropdownMenuLabel className="p-0 font-normal">
										<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
											<Avatar className="size-8">
												<AvatarFallback className="rounded-none">
													{initials}
												</AvatarFallback>
											</Avatar>
											<div className="grid flex-1 text-left text-sm leading-tight">
												<span className="truncate font-medium">
													{user.name}
												</span>
												<span className="truncate text-xs">{user.email}</span>
											</div>
										</div>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										<DropdownMenuItem>Account</DropdownMenuItem>
										<DropdownMenuItem>Settings</DropdownMenuItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={handleLogout}>
										<LogOut className="mr-2 size-4" />
										Log out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset>
				<RouteHeader />
				<div className="flex flex-1 flex-col gap-4 p-6">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

function RouteHeader() {
	const location = useLocation();
	const search = location.search as { startDate?: string; endDate?: string } | undefined;
	const [open, setOpen] = useState(false);
	
	const getDefaultRange = () => {
		const to = search?.endDate ? new Date(search.endDate) : new Date();
		const from = search?.startDate ? new Date(search.startDate) : (() => {
			const d = new Date();
			d.setDate(d.getDate() - 7);
			return d;
		})();
		return { from, to };
	};
	
	const [tempRange, setTempRange] = useState<{ from: Date; to: Date }>(getDefaultRange);

	const pageName = useMemo(() => {
		const path = location.pathname;
		if (path === "/" || path === "/home") return "Home";
		if (path === "/analytics") return "Analytics";
		if (path === "/integrations") return "Integrations";
		if (path === "/profile") return "Profile";
		const lastSegment = path.split("/").pop();
		return lastSegment ? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1) : "Home";
	}, [location.pathname]);

	const currentRange = search?.startDate || search?.endDate ? getDefaultRange() : tempRange;

	const handleApply = () => {
		const params = new URLSearchParams(window.location.search);
		params.set("startDate", format(tempRange.from, "yyyy-MM-dd"));
		params.set("endDate", format(tempRange.to, "yyyy-MM-dd"));
		window.history.pushState({}, "", `?${params.toString()}`);
		setOpen(false);
		window.location.reload();
	};

	return (
		<header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-6">
			<h1 className="text-base font-medium">{pageName}</h1>
			<div className="flex items-center gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							className="justify-start text-left font-normal"
						>
							<CalendarIcon className="mr-2 h-4 w-4" />
							{format(currentRange.from, "MMM d")} - {format(currentRange.to, "MMM d, yyyy")}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="end">
						<Calendar
							mode="range"
							defaultMonth={tempRange.from}
							selected={{ from: tempRange.from, to: tempRange.to }}
							onSelect={(range) => {
								if (range?.from) setTempRange(prev => ({ ...prev, from: range.from! }));
								if (range?.to) setTempRange(prev => ({ ...prev, to: range.to! }));
							}}
							numberOfMonths={2}
						/>
						<div className="flex justify-end gap-2 p-2 border-t">
							<Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
							<Button size="sm" onClick={handleApply}>Apply</Button>
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</header>
	);
}
