#!/usr/bin/env node
'use strict';

// Search Linear by free-text. Returns top N matches as JSON for picker UI.
//
// Usage:
//   search.js --type issue       --query "..." [--limit 5] [--label type/spec] [--team DIN]
//   search.js --type project     --query "..." [--limit 5] [--team DIN]
//   search.js --type initiative  --query "..." [--limit 5]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const ISSUE_QUERY = `
  query SearchIssues($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes {
        id identifier title url
        state { name type }
        team { key }
        project { id name }
        labels { nodes { name } }
      }
    }
  }
`;

const PROJECT_QUERY = `
  query SearchProjects($filter: ProjectFilter, $first: Int!) {
    projects(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes {
        id name url description
        teams { nodes { id key } }
        initiatives { nodes { id name } }
      }
    }
  }
`;

const INITIATIVE_QUERY = `
  query SearchInitiatives($filter: InitiativeFilter, $first: Int!) {
    initiatives(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes { id name url description }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const type = flags.type;
  const term = flags.query;
  const limit = Number(flags.limit || 5);
  const label = flags.label;
  const teamKey = flags.team;

  if (!type || !term) fail('Usage: search.js --type issue|project|initiative --query "..."', 64);

  let q;
  let filter = {};

  if (type === 'issue') {
    q = ISSUE_QUERY;
    filter.title = { contains: term };
    if (label) filter.labels = { name: { eq: label } };
    if (teamKey) filter.team = { key: { eq: teamKey } };
  } else if (type === 'project') {
    q = PROJECT_QUERY;
    filter.name = { contains: term };
    if (teamKey) filter.accessibleTeams = { key: { eq: teamKey } };
  } else if (type === 'initiative') {
    q = INITIATIVE_QUERY;
    filter.name = { contains: term };
  } else {
    fail(`Unknown --type: ${type}. Use one of: issue, project, initiative.`, 64);
  }

  const data = await query(q, { filter, first: limit });
  const nodes =
    (data.issues && data.issues.nodes) ||
    (data.projects && data.projects.nodes) ||
    (data.initiatives && data.initiatives.nodes) ||
    [];

  emit({ type, term, results: nodes });
})();
