#!/usr/bin/env node
'use strict';

// Create a sub-issue under an existing parent issue. Inherits team and project
// from the parent (Linear requires teamId; project follows by default in same-
// project hierarchies — explicit projectId here keeps it deterministic).
//
// Body (description) is read from stdin.
// Usage: cat body.md | create-sub-issue.js <parent-id> --title "..." [--state "Todo"]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const PARENT_QUERY = `
  query GetParent($id: String!) {
    issue(id: $id) {
      id identifier
      team { id states(first: 50) { nodes { id name } } }
      project { id }
    }
  }
`;

const MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier title url }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const parentId = flags._[0];
  const title = flags.title;
  const stateName = flags.state;
  if (!parentId || !title) {
    fail('Usage: create-sub-issue.js <parent-id> --title "..." [--state "Todo"] < body.md', 64);
  }

  const description = await readStdin();
  const parentData = await query(PARENT_QUERY, { id: parentId });
  const parent = parentData.issue;
  if (!parent) fail(`Parent issue not found: ${parentId}`, 1);

  const input = {
    parentId: parent.id,
    teamId: parent.team.id,
    title,
    description,
  };
  if (parent.project) input.projectId = parent.project.id;

  if (stateName) {
    const states = (parent.team.states && parent.team.states.nodes) || [];
    const target = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!target) fail(`State "${stateName}" not found in parent's team workflow.`, 1);
    input.stateId = target.id;
  }

  const result = await query(MUTATION, { input });
  if (!result.issueCreate.success) fail('issueCreate returned success=false', 1);
  emit(result.issueCreate.issue);
})();
