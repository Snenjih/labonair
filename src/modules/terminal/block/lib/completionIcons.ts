export function getCompletionIconChar(kind: string): string {
  const icons: Record<string, string> = {
    directory: "📁",
    file: "📄",
    command: ">_",
    variable: "$",
    keyword: "#",
  };
  return icons[kind] ?? "";
}
