"use client";
import { Button } from "@/components/ui/button";
export default function SetupError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Setup could not be loaded</h1>
      <p className="text-sm text-muted-foreground">
        Your saved configuration is unchanged. Try loading the setup checks
        again.
      </p>
      <Button onClick={reset}>Retry setup</Button>
    </main>
  );
}
