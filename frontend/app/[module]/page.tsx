"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DenialsPage,
  RevenueRiskPage,
  PrioritisationPage,
  PayerPerformancePage,
  UnderpaymentsPage,
} from "@/components/analytics-pages";
import { PredictivePage, CopilotPage } from "@/components/intelligence-pages";
import {
  LiveMonitorPage,
  DataIngestionPage,
  DataQualityPage,
} from "@/components/operations-pages";
import { ReportsPage, SettingsPage } from "@/components/workspace-pages";
import { Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
const pages: Record<string, React.ComponentType> = {
  denials: DenialsPage,
  "revenue-risk": RevenueRiskPage,
  "claim-prioritisation": PrioritisationPage,
  "payer-performance": PayerPerformancePage,
  underpayments: UnderpaymentsPage,
  "predictive-analytics": PredictivePage,
  copilot: CopilotPage,
  "live-monitor": LiveMonitorPage,
  "data-ingestion": DataIngestionPage,
  "data-quality": DataQualityPage,
  reports: ReportsPage,
  settings: SettingsPage,
};
export default function ModulePage() {
  const params = useParams<{ module: string }>();
  const Page = pages[params.module];
  return Page ? (
    <Page />
  ) : (
    <Empty
      title="This page isn’t in the workspace."
      description="Return to the overview to explore your synthetic claims."
    >
      <Button asChild>
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </Empty>
  );
}
