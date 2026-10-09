"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statusColor } from "@/features/candidate-progress/presentation";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { workflowApi, errorText } from "@/features/workflows/client";
export type IntakeStatus =
  | "not_extracted"
  | "processing"
  | "extracted"
  | "failed";
export const INTAKE_LABELS: Record<IntakeStatus, string> = {
  not_extracted: "Not extracted",
  processing: "Processing",
  extracted: "Extracted",
  failed: "Failed",
};
type IntakeItem = {
  progress: {
    label: string;
    next: string;
    href: string;
    fileName: string;
  } | null;
  id: string;
  candidateId: string;
  fullName: string;
  email: string;
  username: string;
  fileName: string;
  extractionStatus: IntakeStatus;
  reviewStatus: "verified" | "needs_review";
  cvCount: number;
  verifiedCvCount: number;
  accountCreated: boolean;
  confirmed: boolean;
  possibleDuplicate: boolean;
};
const FILTERS = { search: "", status: "all" };
const validFilter = (key: keyof typeof FILTERS, value: string) =>
  key === "search"
    ? value.length <= 500
    : ["all", "needs_review", "verified"].includes(value);
export function IntakeDashboard({
  displayName,
  preferenceKey,
}: {
  displayName: string;
  preferenceKey: string;
}) {
  const [data, setData] = useState<{
      items: IntakeItem[];
      bot: { configured: boolean; username: string | null };
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const {
    filters: { search, status },
    setFilters,
    ready: filtersReady,
  } = useUrlFilters(FILTERS, validFilter, preferenceKey);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!filtersReady) return;
      setLoading(true);
      try {
        const result = await workflowApi<NonNullable<typeof data>>(
          `/api/intake?${new URLSearchParams({ search, status })}`,
          { signal },
        );
        if (!signal?.aborted) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [search, status, filtersReady],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`https://t.me/${data?.bot.username}`);
      setNotice(
        "Bot link copied. Share it through Messenger, LinkedIn, or Telegram.",
      );
    } catch {
      setError("Copy failed. Use the bot link shown below.");
    }
  }
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Incoming candidates"
        description="Candidate details and CVs received through Telegram. Login accounts are created only after HR approval."
        actions={
          <Button
            variant="outline"
            disabled={!data?.bot.username}
            onClick={() => void copyLink()}
          >
            <Copy /> Copy bot link
          </Button>
        }
      />
      <Alert>
        <AlertDescription>
          Uploads are stored only. AI extraction starts when HR explicitly
          requests it.{" "}
          {data?.bot.username && (
            <a
              className="underline"
              href={`https://t.me/${data.bot.username}`}
              target="_blank"
              rel="noreferrer"
            >
              @{data.bot.username}
            </a>
          )}
        </AlertDescription>
      </Alert>
      {data && !data.bot.configured && (
        <Alert>
          <AlertDescription>
            Telegram setup is incomplete. Configure the bot token and webhook
            secret in deployment settings before candidates can submit CVs.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 p-5">
            <Input
              aria-label="Search candidate intake"
              placeholder="Search name, email, Telegram, or CV"
              className="min-w-48 flex-1"
              disabled={!filtersReady}
              value={search}
              onChange={(e) => setFilters({ search: e.target.value })}
            />
            <Select
              disabled={!filtersReady}
              value={status}
              onValueChange={(value) => setFilters({ status: value })}
            >
              <SelectTrigger className="w-48" aria-label="CV review status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All review statuses</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="verified">CV approved</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh candidate intake"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Candidate",
                    "Telegram",
                    "CV",
                    "Candidate Preparation",
                    "Login account",
                    "Action",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.email}
                      </p>
                      {item.possibleDuplicate && (
                        <Badge variant="outline">Possible duplicate</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.username ? `@${item.username}` : "Connected user"}
                      <p className="text-xs text-muted-foreground">
                        {item.confirmed
                          ? "HR confirmed"
                          : "Pending confirmation"}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {item.fileName}
                      <p className="text-xs text-muted-foreground">
                        {item.cvCount} CV{item.cvCount === 1 ? "" : "s"} ·{" "}
                        {item.verifiedCvCount} verified
                      </p>
                    </TableCell>
                    <TableCell>
                      {item.progress ? (
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={statusColor(item.progress.label)}
                          >
                            {item.progress.label}
                          </Badge>
                          <Link
                            className="block text-sm underline"
                            href={item.progress.href}
                          >
                            {item.progress.next}
                          </Link>
                          {item.progress.fileName !== item.fileName && (
                            <p className="text-xs text-muted-foreground">
                              Progress for {item.progress.fileName}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant={
                            item.reviewStatus === "verified"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {item.reviewStatus === "verified"
                            ? "CV approved"
                            : "Needs Resume Editor review"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.accountCreated ? "Created / linked" : "Not created"}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/candidates/${item.candidateId}?tab=documents`}
                        >
                          Review candidate
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.items.length && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-40 text-center text-muted-foreground"
                    >
                      {loading
                        ? "Loading candidate intake…"
                        : "No candidates match. Share the bot link to receive candidate details and PDF CVs."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="border-t p-4 text-xs text-muted-foreground">
            {data?.items.length ?? 0} submissions shown · Most recent 200
            submissions
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
