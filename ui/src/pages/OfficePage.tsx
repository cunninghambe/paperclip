import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { officeApi, officeKeys } from "../api/office";
import type { OfficeAgent } from "../api/office";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { AgentPresenceSummary } from "../components/office/AgentPresenceSummary";
import { Button } from "@/components/ui/button";

const OfficeCanvas = lazy(() =>
  import("../components/office/OfficeCanvas").then((m) => ({ default: m.OfficeCanvas })),
);

export default function OfficePage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null);
  const [pendingLayout, setPendingLayout] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "3D Office" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: officeKeys.layout(selectedCompanyId ?? ""),
    queryFn: () => officeApi.getLayout(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  // Presence polling every 10s
  useQuery({
    queryKey: officeKeys.presence(selectedCompanyId ?? ""),
    queryFn: () => officeApi.getPresence(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: (layoutData: Record<string, unknown>) =>
      officeApi.saveLayout(selectedCompanyId!, layoutData),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: officeKeys.layout(selectedCompanyId ?? ""),
      });
      setPendingLayout(null);
    },
  });

  const handleSaveLayout = useCallback(() => {
    if (pendingLayout) {
      saveMutation.mutate(pendingLayout);
    }
  }, [pendingLayout, saveMutation]);

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load office layout"}
        </p>
      </div>
    );
  }

  if (!data?.agents.length) {
    return (
      <EmptyState
        icon={Building2}
        message="No agents in this company yet. Hire some agents to see them in the 3D office."
      />
    );
  }

  return (
    <div className="h-full w-full relative flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h2 className="text-sm font-medium">3D Office</h2>
        <div className="flex items-center gap-2">
          <AgentPresenceSummary agents={data.agents} />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveLayout}
            disabled={!pendingLayout || saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveMutation.isPending ? "Saving…" : "Save Layout"}
          </Button>
        </div>
      </div>
      {/* Canvas */}
      <div className="flex-1 relative">
        <Suspense fallback={<PageSkeleton variant="org-chart" />}>
          <OfficeCanvas agents={data.agents} onAgentSelect={setSelectedAgent} />
        </Suspense>
        {selectedAgent && (
          <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-border bg-card p-3 shadow-md min-w-[200px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{selectedAgent.name}</span>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-muted-foreground hover:text-foreground text-xs leading-none"
                aria-label="Close agent panel"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground capitalize">{selectedAgent.status}</p>
            {selectedAgent.currentTask && (
              <p className="mt-1 text-xs text-muted-foreground truncate">{selectedAgent.currentTask}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
