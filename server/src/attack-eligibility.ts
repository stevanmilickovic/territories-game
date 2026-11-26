export function canAttackTerritory(
  factionId: string,
  territory: { id: string; neighborIds: readonly string[] },
  ownership: ReadonlyMap<string, string | null>,
): boolean {
  if (ownership.get(territory.id) === factionId) return false;
  if (!Array.from(ownership.values()).includes(factionId)) return true;
  return territory.neighborIds.some((id) => ownership.get(id) === factionId);
}
