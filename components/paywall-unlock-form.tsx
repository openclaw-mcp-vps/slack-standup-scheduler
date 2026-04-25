"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PaywallUnlockForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/paywall/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to verify purchase.");
      }

      setSuccess("Access unlocked for this browser. Redirecting to the dashboard...");
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="purchase-email" className="text-slate-200">
          Work email used at checkout
        </Label>
        <Input
          id="purchase-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400">
        {isSubmitting ? "Verifying purchase..." : "Unlock Dashboard"}
      </Button>

      {error ? (
        <Alert variant="destructive" className="border-red-900 bg-red-950/40 text-red-200">
          <AlertTitle>Verification failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert className="border-emerald-900 bg-emerald-950/40 text-emerald-200">
          <AlertTitle>Access granted</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
