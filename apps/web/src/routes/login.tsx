import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "invalid_credentials":
        return "Invalid password";
      case "locked":
      case "rate_limited":
        return "Too many attempts — wait a moment and try again";
      default:
        return "Something went wrong. Try again.";
    }
  }
  return "Could not reach the server.";
}

function LoginPage() {
  useTitle("Sign in — Maintenance-Tracker");
  const status = useQuery({ queryKey: ["auth-status"], queryFn: api.status });
  if (status.isPending) return null;
  return status.data?.setupComplete === false ? <SetupScreen /> : <LoginScreen />;
}

function Brand() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      <Wrench className="size-7 text-primary" aria-hidden="true" />
      <span className="text-xl font-semibold tracking-tight">Maintenance-Tracker</span>
    </div>
  );
}

function LoginScreen() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: (pw: string) => api.login(pw),
    onSuccess: () => {
      queryClient.clear();
      void navigate({ to: "/" });
    },
  });

  return (
    <AuthShell>
      <Brand />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length > 0) login.mutate(password);
        }}
        data-testid="login-form"
      >
        <div className="space-y-2">
          <Label htmlFor="password">Master password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="password-input"
          />
        </div>
        {login.isError && (
          <p role="alert" className="text-sm text-destructive" data-testid="login-error">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending || password === ""}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

function SetupScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setup = useMutation({
    mutationFn: (pw: string) => api.setup(pw),
    onSuccess: () => {
      queryClient.clear();
      void navigate({ to: "/" });
    },
  });

  const mismatch = confirm !== "" && password !== confirm;
  const tooShort = password !== "" && password.length < 12;

  return (
    <AuthShell>
      <Brand />
      <CardDescription className="mb-4 text-center">
        First run — choose the master password that guards everything.
      </CardDescription>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length >= 12 && password === confirm) setup.mutate(password);
        }}
        data-testid="setup-form"
      >
        <div className="space-y-2">
          <Label htmlFor="new-password">Master password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="setup-password"
          />
          {tooShort && <p className="text-sm text-destructive">At least 12 characters.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            data-testid="setup-confirm"
          />
          {mismatch && <p className="text-sm text-destructive">Passwords do not match.</p>}
        </div>
        {setup.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(setup.error)}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={setup.isPending || password.length < 12 || password !== confirm}
          data-testid="setup-submit"
        >
          {setup.isPending ? "Setting up…" : "Create vault"}
        </Button>
      </form>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="sr-only">Authentication</CardTitle>
          {children}
        </CardHeader>
      </Card>
    </div>
  );
}
