export const FLEET_MANAGED_FILE_NAMES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
] as const;

export type FleetManagedFileName = (typeof FLEET_MANAGED_FILE_NAMES)[number];

export function isFleetManagedFileName(name: string): name is FleetManagedFileName {
  return FLEET_MANAGED_FILE_NAMES.includes(name as FleetManagedFileName);
}
