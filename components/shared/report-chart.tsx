"use client";

import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";

export function ReportChart({
  rows
}: {
  rows: Array<Record<string, string | number | null>>;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5">
      <div className="mb-4">
        <div className="text-sm font-semibold">Trend view</div>
        <div className="text-xs text-muted-foreground">Stored Yelp batch metrics across the requested window.</div>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="impressions" stroke="#0f766e" strokeWidth={2} />
            <Line type="monotone" dataKey="clicks" stroke="#f59e0b" strokeWidth={2} />
            <Line type="monotone" dataKey="calls" stroke="#2563eb" strokeWidth={2} />
            <Line type="monotone" dataKey="websiteLeads" stroke="#be123c" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
