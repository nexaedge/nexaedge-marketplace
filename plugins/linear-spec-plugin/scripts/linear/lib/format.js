'use strict';

function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function readStdin() {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function parseFlags(argv, schema = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (schema[name] === 'boolean') {
        out[name] = true;
      } else if (next !== undefined && !next.startsWith('--')) {
        out[name] = next;
        i++;
      } else {
        out[name] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

module.exports = { emit, fail, readStdin, parseFlags };
