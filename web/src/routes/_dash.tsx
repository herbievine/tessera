import { meOptions, type UseMeReturn } from "@/api/me.query";
import type { FileRoutesByTo } from "@/routeTree.gen";
import { tryCatch } from "@/utils/try-catch";
import {
	createFileRoute,
	Outlet,
	redirect,
	Link,
} from "@tanstack/react-router";
import { Home, LogOut, ChevronUp, User, BarChart3, Link2 } from "lucide-react";
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
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
					<h1 className="text-base font-medium">Home</h1>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-6">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
