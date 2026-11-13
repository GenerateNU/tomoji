import type { ReactNode } from "react";

export type PropRow = {
  name: string;
  type: string;
  default?: string;
  description: ReactNode;
};

export function PropsTable({ component, rows }: { component: string; rows: PropRow[] }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="font-mono text-body-sm font-medium text-gray-950">{component}</h3>
      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full min-w-[560px] text-left text-body-sm leading-[1.4]">
          <caption className="sr-only">{component} props</caption>
          <thead className="bg-gray-25 text-body-xs text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Prop
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Default
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3 font-mono text-code-lg whitespace-nowrap">{row.name}</td>
                <td className="px-4 py-3 font-mono text-code text-gray-600">{row.type}</td>
                <td className="px-4 py-3 font-mono text-code text-gray-500">
                  {row.default ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
