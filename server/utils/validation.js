// Centralized Strict Input Validation Helper

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isPositiveInteger(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') {
    return Number.isInteger(val) && val > 0 && Number.isSafeInteger(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num > 0;
  }
  return false;
}

function parsePositiveInteger(val) {
  return isPositiveInteger(val) ? parseInt(String(val).trim(), 10) : null;
}

function isNonNegativeInteger(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') {
    return Number.isInteger(val) && val >= 0 && Number.isSafeInteger(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^(0|[1-9]\d*)$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num >= 0;
  }
  return false;
}

function parseNonNegativeInteger(val) {
  return isNonNegativeInteger(val) ? parseInt(String(val).trim(), 10) : null;
}

function isValidString(val, minLen = 1, maxLen = Infinity) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length >= minLen && trimmed.length <= maxLen;
}

function isValidEmail(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim().toLowerCase();
  if (trimmed.length > 255 || trimmed.length < 5) return false;
  return EMAIL_REGEX.test(trimmed);
}

const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];

function isValidPriority(val) {
  if (typeof val !== 'string') return false;
  return ALLOWED_PRIORITIES.includes(val.trim().toLowerCase());
}

function isValidDate(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const parsed = new Date(trimmed + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) return false;
  // Ensure the date components didn't roll over (e.g., Feb 31 -> Mar 3)
  const [year, month, day] = trimmed.split('-').map(Number);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

module.exports = {
  EMAIL_REGEX,
  isPositiveInteger,
  parsePositiveInteger,
  isNonNegativeInteger,
  parseNonNegativeInteger,
  isValidString,
  isValidEmail,
  isValidPriority,
  isValidDate,
  ALLOWED_PRIORITIES
};
