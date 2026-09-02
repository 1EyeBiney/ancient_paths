// Thrown by dispatch() when a command is not legal for the engine's current
// state (§25: "Only commands valid for the current state should execute...
// must not leak into another mode"). Dispatch is transactional: on this
// error, nothing about the session has changed.

export class IllegalCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly reason: string,
  ) {
    super(`Illegal command "${command}": ${reason}`);
    this.name = "IllegalCommandError";
  }
}
