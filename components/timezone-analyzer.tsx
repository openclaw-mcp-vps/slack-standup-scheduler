"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LocalSlot {
  slackUserId: string;
  displayName: string;
  timezone: string;
  localLabel: string;
  comfort: "great" | "okay" | "hard";
}

interface WindowRecommendation {
  utcTimestamp: string;
  utcLabel: string;
  participantsInWorkingHours: number;
  comfortScore: number;
  localTimes: LocalSlot[];
  explanation: string;
}

interface TimezoneAnalyzerProps {
  totalMembers: number;
  recommendations: WindowRecommendation[];
}

function comfortClass(comfort: LocalSlot["comfort"]): string {
  if (comfort === "great") {
    return "border-emerald-700 bg-emerald-900/30 text-emerald-200";
  }

  if (comfort === "okay") {
    return "border-amber-700 bg-amber-900/30 text-amber-200";
  }

  return "border-rose-700 bg-rose-900/30 text-rose-200";
}

export function TimezoneAnalyzer({ totalMembers, recommendations }: TimezoneAnalyzerProps) {
  const [activeTab, setActiveTab] = useState(recommendations[0]?.utcTimestamp ?? "empty");

  const activeWindow = useMemo(
    () => recommendations.find((window) => window.utcTimestamp === activeTab),
    [activeTab, recommendations]
  );

  if (totalMembers === 0) {
    return (
      <Card className="border-slate-800 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Timezone Analyzer</CardTitle>
          <CardDescription className="text-slate-400">
            Connect Slack first so we can analyze real member timezone data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Timezone Analyzer</CardTitle>
          <CardDescription className="text-slate-400">
            No recommendations available. Verify that your team members have timezone metadata in Slack.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-950/60">
      <CardHeader>
        <CardTitle className="text-slate-100">Timezone Analyzer</CardTitle>
        <CardDescription className="text-slate-400">
          Ranked by how many teammates are in reasonable local working hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full flex-wrap bg-slate-900/80 p-1">
            {recommendations.map((recommendation) => (
              <TabsTrigger
                key={recommendation.utcTimestamp}
                value={recommendation.utcTimestamp}
                className="flex-1 min-w-32 data-active:bg-cyan-500/20 data-active:text-cyan-100"
              >
                {recommendation.utcLabel}
              </TabsTrigger>
            ))}
          </TabsList>

          {recommendations.map((recommendation) => (
            <TabsContent key={recommendation.utcTimestamp} value={recommendation.utcTimestamp} className="space-y-4 pt-2">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Coverage</p>
                  <p className="text-xl font-semibold text-slate-100">
                    {recommendation.participantsInWorkingHours}/{totalMembers}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Comfort Score</p>
                  <p className="text-xl font-semibold text-slate-100">{recommendation.comfortScore}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Recommendation</p>
                  <p className="text-sm text-slate-200">{recommendation.explanation}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-200">Local time view</p>
                <div className="flex flex-wrap gap-2">
                  {recommendation.localTimes.map((slot) => (
                    <Badge key={slot.slackUserId} className={comfortClass(slot.comfort)}>
                      {slot.displayName}: {slot.localLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {activeWindow ? (
          <p className="text-xs text-slate-500">
            Tip: start with this top-ranked slot and adjust by +/- 30 minutes if your team reports recurring
            handoff delays.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
