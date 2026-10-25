'use strict';

const { createHash } = require('node:crypto');

function checkDigit(prefix) {
  let sum = 0;
  for (let index = 0; index < prefix.length; index += 1) {
    const weight = ((prefix.length - index) % 8) + 1;
    sum += Number(prefix[index]) * weight;
  }
  const remainder = sum % 11;
  return String(remainder < 2 ? 0 : 11 - remainder);
}

function syntheticCnpj(seed) {
  if (typeof seed !== 'string' || !seed.trim()) {
    throw new TypeError('A fixture seed must be a non-empty string.');
  }
  let base = [...createHash('sha256').update(seed).digest('hex').slice(0, 12)]
    .map((digit) => String(parseInt(digit, 16) % 10)).join('');
  if (/^(\\d)\\1{11}$/.test(base)) base = `31415926535${(Number(base[11]) + 1) % 10}`;
  const first = checkDigit(base);
  return base + first + checkDigit(base + first);
}

function formatCnpj(value) {
  const digits = String(value).replace(/\\D/g, '');
  if (!/^\\d{14}$/.test(digits)) throw new TypeError('Expected a 14-digit synthetic CNPJ.');
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

module.exports = { syntheticCnpj, formatCnpj };
