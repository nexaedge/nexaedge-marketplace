#!/usr/bin/env node
'use strict';

// Update a Project Document. Body is read from stdin and replaces content.
// Usage: cat new-content.md | update-document.js <doc-id> [--title "New Title"]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const MUTATION = `
  mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document { id title url }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const id = flags._[0];
  if (!id) fail('Usage: update-document.js <doc-id> [--title "..."] < content.md', 64);

  const content = await readStdin();
  const input = {};
  if (content.trim()) input.content = content;
  if (flags.title) input.title = flags.title;
  if (Object.keys(input).length === 0) fail('Nothing to update — provide stdin content or --title.', 64);

  const data = await query(MUTATION, { id, input });
  if (!data.documentUpdate.success) fail('documentUpdate returned success=false', 1);
  emit(data.documentUpdate.document);
})();
