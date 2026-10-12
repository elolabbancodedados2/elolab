export function appointmentPayloadForSave<T extends { status?: unknown }>(payload: T, editing: boolean): T | Omit<T, 'status'> {
  if (!editing) return payload;
  const { status: _status, ...editableFields } = payload;
  return editableFields;
}
