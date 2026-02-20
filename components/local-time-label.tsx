"use client";

import { useEffect, useState } from "react";

interface LocalTimeLabelProps {
  isoTimestamp: string | null;
  prefix?: string;
}

function formatTime(timestamp: string, timeZone?: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return "N/A";
  }

  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {})
  }).format(date);

  return formatted.replace(" AM", "am").replace(" PM", "pm");
}

export function LocalTimeLabel({ isoTimestamp, prefix = "Last updated" }: LocalTimeLabelProps) {
  const [value, setValue] = useState<string>(() => (isoTimestamp ? formatTime(isoTimestamp, "UTC") : "N/A"));

  useEffect(() => {
    if (!isoTimestamp) {
      setValue("N/A");
      return;
    }

    setValue(formatTime(isoTimestamp));
  }, [isoTimestamp]);

  return (
    <time dateTime={isoTimestamp ?? undefined} suppressHydrationWarning>
      {prefix}: {value}
    </time>
  );
}
