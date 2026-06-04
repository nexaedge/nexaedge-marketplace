#!/usr/bin/env node
'use strict';

// List sub-issues of a parent issue.
// Usage: list-sub-issues.js <parent-id>

const { query } = require('./lib/graphql');
const { emit, fail } = require('./lib/format');

const QUERY = `
  query ListSubIssues($id: String!) {
    issue(id: $id) {
      id identifier
      children(first: 200) {
        nodes {
          id identifier title url
          state { id name type }
          labels { nodes { name } }
        }
      }
    }
  }
`;

(async () => {
  const id = process.argv[2];
  if (!id) fail('Usage: list-sub-issues.js <parent-id>', 64);

  const data = await query(QUERY, { id });
  const issue = data.issue;
  if (!issue) fail(`Issue not found: ${id}`, 1);

  emit({
    parent: { id: issue.id, identifier: issue.identifier },
    subIssues: (issue.children && issue.children.nodes) || [],
  });
})();
