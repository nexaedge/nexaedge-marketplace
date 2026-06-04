#!/usr/bin/env node
'use strict';

// List documents on a project. Optionally filter by title regex (matched
// against the document title).
//
// Usage: list-documents.js <project-id> [--title-match "Spec v0\\.3 — Architecture"]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const QUERY = `
  query ListProjectDocuments($id: String!) {
    project(id: $id) {
      id name
      documents(first: 200) {
        nodes { id title url updatedAt }
      }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const id = flags._[0];
  if (!id) fail('Usage: list-documents.js <project-id> [--title-match "<regex>"]', 64);

  const data = await query(QUERY, { id });
  const project = data.project;
  if (!project) fail(`Project not found: ${id}`, 1);

  let docs = (project.documents && project.documents.nodes) || [];
  if (flags['title-match']) {
    const re = new RegExp(flags['title-match']);
    docs = docs.filter((d) => re.test(d.title));
  }

  emit({ project: { id: project.id, name: project.name }, documents: docs });
})();
