export function formatDeviceType(type: string): string {
  return type.replace(/-/g, ' ');
}

export function formatFloor(floor: number): string {
  return floor === 0 ? 'B1' : `${floor}F`;
}

export const SEVERITY_TEXT_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

export const SEVERITY_DOT_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};
