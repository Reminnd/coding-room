export class BridgeError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
    this.details = details;
  }
}

export function needsDecision(message, details = null) {
  return new BridgeError('needs_decision', message, details);
}

export function blocked(message, details = null) {
  return new BridgeError('blocked', message, details);
}
