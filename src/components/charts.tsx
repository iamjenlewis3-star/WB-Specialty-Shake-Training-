"use client";

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const axisProps = {
  stroke: "var(--muted-2)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
} as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
      contentStyle={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
        fontSize: 12, color: "var(--foreground)", boxShadow: "0 8px 24px rgba(13,21,38,.14)",
      }}
      labelStyle={{ color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}
    />
  );
}

export interface SeriesPoint { name: string; [key: string]: string | number }

export function BarChartView({
  data, dataKeys, height = 260, layout = "horizontal", stacked = false, unit = "",
}: {
  data: SeriesPoint[]; dataKeys: Array<{ key: string; label: string; color?: string }>;
  height?: number; layout?: "horizontal" | "vertical"; stacked?: boolean; unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 6, right: 12, bottom: 4, left: layout === "vertical" ? 8 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={layout === "vertical"} />
        {layout === "vertical" ? (
          <>
            <XAxis type="number" domain={[0, 100]} unit={unit} {...axisProps} />
            <YAxis type="category" dataKey="name" width={140} {...axisProps} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
            <YAxis unit={unit} {...axisProps} width={44} />
          </>
        )}
        <ChartTooltip />
        {dataKeys.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} /> : null}
        {dataKeys.map((dk, i) => (
          <Bar
            key={dk.key} dataKey={dk.key} name={dk.label} fill={dk.color ?? PALETTE[i % PALETTE.length]}
            radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={38}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartView({
  data, dataKeys, height = 260, unit = "",
}: { data: SeriesPoint[]; dataKeys: Array<{ key: string; label: string; color?: string }>; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
        <YAxis unit={unit} {...axisProps} width={44} />
        <ChartTooltip />
        {dataKeys.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} /> : null}
        {dataKeys.map((dk, i) => (
          <Line
            key={dk.key} type="monotone" dataKey={dk.key} name={dk.label}
            stroke={dk.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaChartView({
  data, dataKey, label, height = 220, color = "var(--chart-1)", unit = "",
}: { data: SeriesPoint[]; dataKey: string; label: string; height?: number; color?: string; unit?: string }) {
  const gradientId = React.useId();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
        <YAxis unit={unit} {...axisProps} width={44} />
        <ChartTooltip />
        <Area type="monotone" dataKey={dataKey} name={label} stroke={color} strokeWidth={2.4} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChartView({
  data, height = 220, unit = "",
}: { data: Array<{ name: string; value: number; color?: string }>; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="84%" paddingAngle={2} stroke="var(--surface)">
          {data.map((entry, i) => <Cell key={entry.name} fill={entry.color ?? PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <ChartTooltip />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { PALETTE as CHART_PALETTE };
