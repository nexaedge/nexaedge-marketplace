#!/usr/bin/env node
'use strict';

// Move an issue to a new workflow state. Resolves state by name within the
// issue's team workflow.
//
// Usage: transition-issue.js <issue-id> --state "In Progress"

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags } = require('./lib/format');

const ISSUE_QUERY = `
  query GetIssueTeam($id: String!) {
    issue(id: $id) {
      id identifier
      state { id name }
      team {
        id key
        states(first: 50) { nodes { id name type } }
      }
    }
  }
`;

const MUTATION = `
  mutation UpdateIssueState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
      issue { id identifier state { id name } }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const id = flags._[0];
  const targetName = flags.state;
  if (!id || !targetName) fail('Usage: transition-issue.js <issue-id> --state "<state name>"', 64);

  const data = await query(ISSUE_QUERY, { id });
  const issue = data.issue;
  if (!issue) fail(`Issue not found: ${id}`, 1);

  const states = (issue.team && issue.team.states && issue.team.states.nodes) || [];
  const target = states.find((s) => s.name.toLowerCase() === targetName.toLowerCase());
  if (!target) {
    const names = states.map((s) => s.name).join(', ');
    fail(`State "${targetName}" not found in team ${issue.team.key} workflow. Available: ${names}`, 1);
  }

  if (issue.state.id === target.id) {
    emit({ unchanged: true, issue: { id: issue.id, identifier: issue.identifier, state: issue.state } });
    return;
  }

  const result = await query(MUTATION, { id, stateId: target.id });
  if (!result.issueUpdate.success) fail('issueUpdate returned success=false', 1);
  emit(result.issueUpdate.issue);
})();
