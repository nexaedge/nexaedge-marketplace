#!/usr/bin/env node
'use strict';

// Replace a project's description. Body is read from stdin.
// Usage: cat description.md | set-project-description.js <project-id>

const { query } = require('./lib/graphql');
const { emit, fail, readStdin } = require('./lib/format');

const MUTATION = `
  mutation UpdateProjectDescription($id: String!, $description: String!) {
    projectUpdate(id: $id, input: { description: $description }) {
      success
      project { id name url }
    }
  }
`;

(async () => {
  const id = process.argv[2];
  if (!id) fail('Usage: set-project-description.js <project-id> < description.md', 64);

  const description = await readStdin();
  if (!description.trim()) fail('Project description (stdin) is empty.', 64);

  const data = await query(MUTATION, { id, description });
  if (!data.projectUpdate.success) fail('projectUpdate returned success=false', 1);
  emit(data.projectUpdate.project);
})();
