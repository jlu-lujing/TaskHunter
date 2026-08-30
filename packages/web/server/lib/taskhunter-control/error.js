export class TaskHunterControlError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'TaskHunterControlError';
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

export const asControlError = (error, fallbackMessage, fallbackStatus = 500) => {
  if (error instanceof TaskHunterControlError) return error;
  const message = error instanceof Error ? error.message : fallbackMessage;
  return new TaskHunterControlError(message || fallbackMessage, Number(error?.statusCode) || fallbackStatus, {
    ...(error?.goalConfigured === true ? { goalConfigured: true } : {}),
  });
};
