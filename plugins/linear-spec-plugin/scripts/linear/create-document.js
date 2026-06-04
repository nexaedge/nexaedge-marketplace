#!/usr/bin/env node
'use strict';

// Create a Project Document. Body is read from stdin.
// Usage: cat content.md | create-document.js --project <id> --title "Spec v0.3 — Architecture"

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const MUTATION = `
  mutation CreateDocument($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document { id title url }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const projectId = flags.project;
  const initiativeId = flags.initiative;
  const title = flags.title;

  if ((!projectId && !initiativeId) || !title) {
    fail('Usage: create-document.js (--project <id> | --initiative <id>) --title "..." < content.md', 64);
  }

  const content = await readStdin();
  if (!content.trim()) fail('Document content (stdin) is empty.', 64);

  const input = { title, content };
  if (projectId) input.projectId = projectId;
  if (initiativeId) input.initiativeId = initiativeId;

  const data = await query(MUTATION, { input });
  if (!data.documentCreate.success) fail('documentCreate returned success=false', 1);
  emit(data.documentCreate.document);
})();
