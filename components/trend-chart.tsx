import type { TrendPoint } from "@/lib/types";

interface TrendChartProps {
  points: TrendPoint[];
}

function buildPath(points: TrendPoint[], width: number, height: number): string {
  if (points.length === 0) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TrendChart({ points }: TrendChartProps) {
  const width = 720;
  const height = 240;
  const path = buildPath(points, width, height);

  if (points.length === 0) {
    return <div className="chart-empty">No historical data yet for this variant.</div>;
  }

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Price trend chart">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
