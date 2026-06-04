#!/usr/bin/env node
'use strict';

// Replace an issue's description. Body is read from stdin.
// Usage: cat body.md | set-issue-description.js <issue-id>

const { query } = require('./lib/graphql');
const { emit, fail, readStdin } = require('./lib/format');

const MUTATION = `
  mutation UpdateIssueDescription($id: String!, $description: String!) {
    issueUpdate(id: $id, input: { description: $description }) {
      success
      issue { id identifier title url }
    }
  }
`;

(async () => {
  const id = process.argv[2];
  if (!id) fail('Usage: set-issue-description.js <issue-id> < body.md', 64);

  const description = await readStdin();
  if (!description.trim()) fail('Description body (stdin) is empty.', 64);

  const data = await query(MUTATION, { id, description });
  if (!data.issueUpdate.success) fail('issueUpdate returned success=false', 1);
  emit(data.issueUpdate.issue);
})();
