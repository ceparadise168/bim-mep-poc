export function formatDeviceType(type: string): string {
  return type.replace(/-/g, ' ');
}

export const SEVERITY_TEXT_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};
