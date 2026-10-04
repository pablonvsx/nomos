import { NetworkTimeoutError } from "@/core/net/network-timeout";

/**
 * A Google Drive request (or media transfer) did not finish in time. Kept in
 * its own dependency-free file so restore-error-messages.ts can use
 * `instanceof` without importing drive-api-client.ts and its native
 * dependencies.
 */
export class DriveTimeoutError extends NetworkTimeoutError {
  constructor(timeoutMs: number) {
    super(timeoutMs, `Google Drive did not respond within ${timeoutMs} ms.`);
    this.name = "DriveTimeoutError";
  }
}
