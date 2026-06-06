/**
 * Typed governance error carrying an HTTP status, so libs can signal
 * 400/404/409 and the route handlers map them straight through.
 */
export class GovError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GovError';
    this.status = status;
  }
}
