export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, 2);
}

export function runtimeError(message: string): CliError {
  return new CliError(message, 1);
}
