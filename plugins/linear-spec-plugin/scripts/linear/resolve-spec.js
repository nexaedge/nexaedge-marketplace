#!/usr/bin/env node
'use strict';

// Resolve a Linear identifier (e.g. DIN-142) to full spec context:
// issue, project (deliverable), team, parent initiative, and existing
// project documents.
//
// Usage: resolve-spec.js DIN-142 [--require-spec-label]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const QUERY = `
  query ResolveSpec($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      url
      state { id name type }
      labels { nodes { id name } }
      team { id key name }
      project {
        id
        name
        url
        description
        documents(first: 50) { nodes { id title url } }
        initiatives { nodes { id name url } }
      }
      parent { id identifier }
      children(first: 100) {
        nodes {
          id identifier title url
          state { id name type }
        }
      }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2), { 'require-spec-label': 'boolean' });
  const id = flags._[0];
  if (!id) fail('Usage: resolve-spec.js <identifier> [--require-spec-label]', 64);

  const data = await query(QUERY, { id });
  const issue = data.issue;
  if (!issue) fail(`Issue not found: ${id}`, 1);

  const labels = (issue.labels && issue.labels.nodes) || [];
  const hasSpecLabel = labels.some((l) => l.name === 'type/spec');

  if (flags['require-spec-label'] && !hasSpecLabel) {
    fail(`Issue ${id} is not labeled type/spec. Aborting.`, 1);
  }

  emit({
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || '',
      url: issue.url,
      state: issue.state,
      labels: labels.map((l) => l.name),
    },
    team: issue.team,
    project: issue.project
      ? {
          id: issue.project.id,
          name: issue.project.name,
          url: issue.project.url,
          description: issue.project.description || '',
          documents: (issue.project.documents && issue.project.documents.nodes) || [],
          initiatives: (issue.project.initiatives && issue.project.initiatives.nodes) || [],
        }
      : null,
    parent: issue.parent,
    subIssues: (issue.children && issue.children.nodes) || [],
    hasSpecLabel,
  });
})();
