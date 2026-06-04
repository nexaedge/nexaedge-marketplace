'use strict';

function getApiKey() {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    process.stderr.write(
      'LINEAR_API_KEY is not set. Either:\n' +
        '  - export it from 1Password: export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"\n' +
        '  - add it to ~/.zshenv.local for all shells (current setup)\n' +
        '  - set it in your current shell\n'
    );
    process.exit(2);
  }
  return key;
}

module.exports = { getApiKey };
