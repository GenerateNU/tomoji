import { Chart, type ChartProps } from "./line-chart";

/** A `Chart` fixed to type="bar": blue bars, with the other bars dimmed on hover. */
export function BarChart(props: Omit<ChartProps, "type" | "todayIndex" | "compare">) {
  return <Chart {...props} type="bar" />;
}
