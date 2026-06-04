#!/usr/bin/env node
'use strict';

// Fetch a single issue by identifier or UUID.
// Usage: get-issue.js <id> [--with-comments] [--with-children]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const QUERY = `
  query GetIssue($id: String!) {
    issue(id: $id) {
      id identifier title description url
      state { id name type }
      labels { nodes { id name } }
      team { id key name }
      project { id name url }
      parent { id identifier }
      children(first: 100) {
        nodes {
          id identifier title url
          state { id name type }
        }
      }
      comments(first: 200) {
        nodes { id body createdAt user { name } }
      }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2), {
    'with-comments': 'boolean',
    'with-children': 'boolean',
  });
  const id = flags._[0];
  if (!id) fail('Usage: get-issue.js <id> [--with-comments] [--with-children]', 64);

  const data = await query(QUERY, { id });
  const issue = data.issue;
  if (!issue) fail(`Issue not found: ${id}`, 1);

  const out = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description || '',
    url: issue.url,
    state: issue.state,
    labels: ((issue.labels && issue.labels.nodes) || []).map((l) => l.name),
    team: issue.team,
    project: issue.project,
    parent: issue.parent,
  };
  if (flags['with-children']) {
    out.children = (issue.children && issue.children.nodes) || [];
  }
  if (flags['with-comments']) {
    out.comments = (issue.comments && issue.comments.nodes) || [];
  }
  emit(out);
})();
