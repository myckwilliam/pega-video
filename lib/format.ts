export function formatBytes(
  value: number | null | undefined,
  approximate = false,
): string {
  if (!value || value <= 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** exponent;

  let text: string;
  if (exponent === 0) text = String(Math.round(amount));
  else if (amount >= 100) text = amount.toFixed(0);
  else if (amount >= 10) text = amount.toFixed(1);
  else text = amount.toFixed(2);

  text = text.replace(".", ",").replace(/,0+$/, "");
  return `${approximate ? "~" : ""}${text} ${units[exponent]}`;
}

export function formatDuration(value: number | null | undefined): string {
  if (!value || value <= 0) return "—";

  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || value < 0) return null;
  if (value < 1000) return String(value);

  if (value < 1_000_000) {
    const amount = value / 1000;
    return `${amount.toFixed(amount >= 100 ? 0 : 1).replace(".", ",").replace(/,0$/, "")} mil`;
  }

  const amount = value / 1_000_000;
  return `${amount.toFixed(amount >= 100 ? 0 : 1).replace(".", ",").replace(/,0$/, "")} mi`;
}
