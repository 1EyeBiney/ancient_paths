// Type surface of the dependency-free generator, for the V8 tests that
// import it. Kept minimal on purpose: the pack is validated through
// contentPackSchema at the point of use, which is the real contract.
export function buildPack(): unknown;
