import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError, api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

/**
 * Change the master password (§6.2). The server revokes EVERY session on
 * success — including this one — so the honest UX is: change, clear the
 * client cache, and land on the login screen to start a fresh session.
 */
export function SecurityPane() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      queryClient.clear(); // the session is gone; drop every cached query
      void navigate({ to: "/login", search: { notice: "password_changed" } });
    },
  });

  const tooShort = next !== "" && next.length < 12;
  const mismatch = confirm !== "" && next !== confirm;
  const canSubmit = current !== "" && next.length >= 12 && next === confirm && !change.isPending;

  return (
    <Card data-testid="security-pane">
      <CardHeader>
        <CardTitle className="text-base">Security</CardTitle>
        <CardDescription>
          One master password guards everything. Changing it signs every device out — that is
          deliberate: it is how you recover from a leaked password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) change.mutate();
          }}
        >
          <div className="max-w-sm space-y-2">
            <Label htmlFor="security-current">Current password</Label>
            <Input
              id="security-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              data-testid="security-current"
            />
          </div>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="security-new">New password</Label>
            <Input
              id="security-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              data-testid="security-new"
            />
            {tooShort && (
              <p className="text-sm text-destructive" data-testid="security-too-short">
                At least 12 characters — this password guards all your data.
              </p>
            )}
          </div>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="security-confirm">Confirm new password</Label>
            <Input
              id="security-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="security-confirm"
            />
            {mismatch && (
              <p className="text-sm text-destructive" data-testid="security-mismatch">
                The two passwords do not match.
              </p>
            )}
          </div>

          {change.isError && (
            <p className="text-sm text-destructive" role="alert" data-testid="security-error">
              {changeError(change.error)}
            </p>
          )}

          <Button type="submit" disabled={!canSubmit} data-testid="security-submit">
            {change.isPending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function changeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_credentials") return "That current password is not right.";
    if (err.code === "rate_limited" || err.code === "locked")
      return "Too many attempts — wait a moment and try again.";
  }
  return "Could not change the password.";
}
