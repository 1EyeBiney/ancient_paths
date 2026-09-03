// Type surface of the dependency-free map generator, for the M2 tests
// that import it. The manifest itself is validated through
// mapManifestSchema at the point of use, which is the real contract.
export const BOUNDS: { north: number; south: number; east: number; west: number };
export const WIDTH: number;
export const HEIGHT: number;
