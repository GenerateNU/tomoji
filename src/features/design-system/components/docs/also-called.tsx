export function AlsoCalled({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((name) => (
        <li key={name}>
          <code className="block rounded border border-gray-100 px-2 py-1 font-mono text-body-xs text-gray-600">
            {name}
          </code>
        </li>
      ))}
    </ul>
  );
}
