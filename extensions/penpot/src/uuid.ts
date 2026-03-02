/**
 * UUID generation for PenPot shapes and pages.
 * PenPot uses standard v4 UUIDs throughout.
 */

export function generateUuid(): string {
  return crypto.randomUUID();
}

/** The root frame UUID used by PenPot for each page's top-level frame. */
export const ROOT_FRAME_ID = "00000000-0000-0000-0000-000000000000";
