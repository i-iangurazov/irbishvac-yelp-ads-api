"use client";

import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";

export function ReportChart({
  rows
}: {
  rows: Array<Record<string, string | number | null>>;
}) {
  return (
    <div className="h-[360px] rounded-xl border border-border bg-card p-4">
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
  );
}
