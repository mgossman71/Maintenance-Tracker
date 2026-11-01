import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input } from "../components/ui/input";
import { ApiClientError, api } from "../lib/api";
import { useSession } from "../lib/hooks";

export function LoginPage() {
	const session = useSession();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);

	const setupComplete = session.data?.setupComplete;
	const authenticated = session.data?.authenticated;

	useEffect(() => {
		if (authenticated) navigate({ to: "/", replace: true });
	}, [authenticated, navigate]);

	const submit = useMutation({
		mutationFn: async () => {
			if (setupComplete === false) {
				if (password !== confirm)
					throw new ApiClientError(400, "mismatch", "Passwords do not match");
				await api.post("/api/setup", { password });
			} else {
				await api.post("/api/login", { password });
			}
		},
		onSuccess: () => {
			session.refetch();
			navigate({ to: "/", replace: true });
		},
		onError: (err) => setError(err instanceof Error ? err.message : "Something went wrong"),
	});

	if (session.isPending) return null;

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<Card className="w-full max-w-sm p-6">
				<div className="mb-5 flex items-center gap-2 text-lg font-semibold">
					<Gauge className="size-6 text-primary" />
					Maintenance Tracker
				</div>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						submit.mutate();
					}}
				>
					{setupComplete === false ? (
						<>
							<h1 className="text-base font-semibold">Set your master password</h1>
							<p className="text-sm text-muted-foreground">
								This password protects everything. There are no other accounts.
							</p>
							<Field label="Master password" hint={`At least ${10} characters`}>
								<Input
									type="password"
									value={password}
									autoFocus
									onChange={(e) => setPassword(e.target.value)}
								/>
							</Field>
							<Field label="Confirm password">
								<Input
									type="password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
								/>
							</Field>
						</>
					) : (
						<>
							<h1 className="text-base font-semibold">Welcome back</h1>
							<Field label="Master password">
								<Input
									type="password"
									value={password}
									autoFocus
									onChange={(e) => setPassword(e.target.value)}
								/>
							</Field>
						</>
					)}
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={submit.isPending || !password}>
						{submit.isPending ? "Working…" : setupComplete === false ? "Create password" : "Log in"}
					</Button>
				</form>
			</Card>
		</div>
	);
}
