'use strict';

const { getApiKey } = require('./auth');

const ENDPOINT = 'https://api.linear.app/graphql';
const MAX_ATTEMPTS = 4;

async function query(operation, variables = {}) {
  const apiKey = getApiKey();
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({ query: operation, variables }),
      });
    } catch (err) {
      lastError = err;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      lastError = new Error(`Linear API ${res.status}`);
      await sleep(backoff(attempt, res.headers.get('retry-after')));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      process.stderr.write(`Linear API ${res.status}: ${text}\n`);
      process.exit(1);
    }

    const json = await res.json();
    if (json.errors) {
      process.stderr.write(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}\n`);
      process.exit(1);
    }
    return json.data;
  }

  process.stderr.write(`Linear API unreachable after ${MAX_ATTEMPTS} attempts: ${lastError && lastError.message}\n`);
  process.exit(1);
}

function backoff(attempt, retryAfter) {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return secs * 1000;
  }
  return Math.min(8000, 500 * 2 ** (attempt - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { query };
