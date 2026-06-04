#!/usr/bin/env node
'use strict';

// Fetch a project by id, with documents and issues.
// Usage: get-project.js <id-or-slug> [--with-issues] [--with-documents]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const QUERY = `
  query GetProject($id: String!) {
    project(id: $id) {
      id name url description state
      teams { nodes { id key name } }
      initiatives { nodes { id name url } }
      documents(first: 100) { nodes { id title url } }
      issues(first: 200) {
        nodes {
          id identifier title url
          state { id name type }
          labels { nodes { name } }
          parent { id identifier }
        }
      }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2), {
    'with-issues': 'boolean',
    'with-documents': 'boolean',
  });
  const id = flags._[0];
  if (!id) fail('Usage: get-project.js <id> [--with-issues] [--with-documents]', 64);

  const data = await query(QUERY, { id });
  const project = data.project;
  if (!project) fail(`Project not found: ${id}`, 1);

  const out = {
    id: project.id,
    name: project.name,
    url: project.url,
    description: project.description || '',
    state: project.state,
    teams: (project.teams && project.teams.nodes) || [],
    initiatives: (project.initiatives && project.initiatives.nodes) || [],
  };
  if (flags['with-documents']) {
    out.documents = (project.documents && project.documents.nodes) || [];
  }
  if (flags['with-issues']) {
    out.issues = (project.issues && project.issues.nodes) || [];
  }
  emit(out);
})();
