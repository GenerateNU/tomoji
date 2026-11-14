import { expect, test } from "vitest";
import { heatStep, smoothAreaPath, smoothLinePath } from "@/components/charts/paths";

test("draws level-tangent curves between points, scaled to the view box", () => {
  expect(
    smoothLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      100,
    ),
  ).toBe("M0,100 C500,100 500,0 1000,0");
});

test("closes the area down to the baseline", () => {
  expect(
    smoothAreaPath(
      [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      100,
    ),
  ).toBe("M0,50 C500,50 500,50 1000,50 L1000,100 L0,100 Z");
});

test("buckets heatmap values into quarters of the maximum, keeping 0 for none", () => {
  expect([0, 1, 25, 26, 50, 75, 100].map((value) => heatStep(value, 100))).toEqual([
    0, 1, 1, 2, 2, 3, 4,
  ]);
});
