function emit(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  const output = JSON.stringify(payload, null, 0);

  if (level === 'error') {
    console.error(output);
    return;
  }

  if (level === 'warn') {
    console.warn(output);
    return;
  }

  console.log(output);
}

export function logInfo(message, meta) {
  emit('info', message, meta);
}

export function logWarn(message, meta) {
  emit('warn', message, meta);
}

export function logError(message, meta) {
  emit('error', message, meta);
}

export function logStep(step, message, meta) {
  emit('info', message, { step, ...meta });
}

export function logSuccess(message, meta) {
  emit('info', message, { status: 'success', ...meta });
}
