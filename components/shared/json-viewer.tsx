export function JsonViewer({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
