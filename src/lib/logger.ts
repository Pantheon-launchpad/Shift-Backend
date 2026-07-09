// Minimal structured logger. Not a full logging framework on purpose — this
// backend runs as a single process with stdout captured by whatever's
// hosting it (systemd, Docker, a PaaS), so leveled console output is enough.
// Swap the implementation for pino/winston later without touching any call
// site if structured JSON logs become worth the dependency.
//
// Deliberately no timestamp/level prefix on the message itself: the AI
// router's log lines ("[AI] Provider: NVIDIA", "[WARNING] NVIDIA
// unavailable.", etc.) are meant to read exactly as written when scanning
// backend output, so the logger passes them through unmodified and just
// routes to the right stream + optional structured fields.

type LogFields = Record<string, unknown>;

function withFields(message: string, fields?: LogFields): string {
  if (!fields || Object.keys(fields).length === 0) return message;
  return `${message} ${JSON.stringify(fields)}`;
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.log(withFields(message, fields));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(withFields(message, fields));
  },
  error(message: string, fields?: LogFields) {
    console.error(withFields(message, fields));
  },
};
