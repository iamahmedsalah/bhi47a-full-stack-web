/** Redact private storage details for hydrated documents and lean nested responses. */
function routeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  )
    return value.toHexString() as string;
  return undefined;
}

export function publicMaterialResponse(value: unknown): unknown {
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  )
    return value;
  if (Array.isArray(value)) return value.map(publicMaterialResponse);
  if ('toHexString' in value) return value;
  // Preserve schema-level security transforms before applying material redaction.
  // Converting a user document with toObject() first bypasses its toJSON() sanitizer.
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    const serialized: unknown = value.toJSON();
    if (serialized !== value) return publicMaterialResponse(serialized);
  } else if ('toObject' in value && typeof value.toObject === 'function') {
    const serialized: unknown = value.toObject();
    if (serialized !== value) return publicMaterialResponse(serialized);
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (
      [
        'storedFile',
        'syllabusFile',
        'syllabusPdfData',
        'syllabusUploadedBy',
        'contentSupervisorId',
        'legacyMaterialSource',
      ].includes(key)
    )
      continue;
    result[key] = publicMaterialResponse(item);
  }
  const id = routeId(source.courseId || source._id);
  if (
    id &&
    (source.syllabusPdfUrl || source.syllabusFile || source.syllabusPdfData)
  ) {
    result.syllabusPdfUrl = `/api/courses/${id}/syllabus/download`;
  }
  if (
    source._id &&
    source.courseId &&
    (source.type === 'lecture' || source.type === 'section') &&
    'fileUrl' in source
  ) {
    const materialId = routeId(source._id);
    result.hasFile =
      source.hasFile ??
      Boolean(
        source.storedFile ||
        source.mimeType ||
        source.fileSize ||
        !source.videoUrl,
      );
    if (materialId)
      result.fileUrl = `/api/courses/materials/${materialId}/download`;
  }
  return result;
}
