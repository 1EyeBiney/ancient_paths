// Type surface of the dependency-free WAV generator, for tests that
// import it.
export const PLACEHOLDER_TONES: [name: string, hz: number, seconds: number][];

export interface PlaceholderFile {
  name: string;
  buffer: Buffer;
  durationSeconds: number;
}

export function buildPlaceholderFiles(): PlaceholderFile[];
