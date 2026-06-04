#!/usr/bin/env node
'use strict';

// Create a Linear initiative (used at OS level for engagements).
// Description is read from stdin (optional).
//
// Usage: [cat description.md |] create-initiative.js --name "OS-002" [--no-stdin]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const MUTATION = `
  mutation CreateInitiative($input: InitiativeCreateInput!) {
    initiativeCreate(input: $input) {
      success
      initiative { id name url }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2), { 'no-stdin': 'boolean' });
  const name = flags.name;
  if (!name) fail('Usage: create-initiative.js --name "..." [--no-stdin] < description.md', 64);

  const input = { name };
  if (!flags['no-stdin']) {
    const description = await readStdin();
    if (description.trim()) input.description = description;
  }

  const data = await query(MUTATION, { input });
  if (!data.initiativeCreate.success) fail('initiativeCreate returned success=false', 1);
  emit(data.initiativeCreate.initiative);
})();
