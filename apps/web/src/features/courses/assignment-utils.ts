function referenceId(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && '_id' in value && typeof value._id === 'string') return value._id;
  return undefined;
}

/** Empty new arrays must not hide assignments saved before the array fields existed. */
export function getCourseStaffIds(course: unknown): { doctorIds: string[]; teachingAssistantIds: string[] } {
  const record = course && typeof course === 'object' ? course as Record<string, unknown> : {};
  const collect = (keys: string[]) => [...new Set(keys.flatMap((key) => {
    const value = record[key];
    return (Array.isArray(value) ? value : [value]).map(referenceId).filter((id): id is string => Boolean(id));
  }))];
  return {
    doctorIds: collect(['doctorIds', 'doctorId', 'doctors']),
    teachingAssistantIds: collect(['teachingAssistantIds', 'teachingAssistants', 'teachingAssistantId', 'teachingAssistant']),
  };
}
