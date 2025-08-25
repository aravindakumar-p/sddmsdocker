import { BaseException } from "./BaseException";

export class InvalidPayloadException extends BaseException {
  constructor(message: string, extensions?: Record<string, unknown>) {
    super(message, 400, "INVALID_PAYLOAD", extensions);
  }
}
