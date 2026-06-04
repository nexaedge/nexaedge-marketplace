#!/usr/bin/env node
'use strict';

// Create a top-level issue in a project (no parent). Used by /plan to create
// spec issues with the type/spec label.
//
// Body (description) is read from stdin.
// Usage: cat body.md | create-issue.js --project <id> --team <key|id> --title "..." [--label type/spec] [--state "Backlog"]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const TEAM_QUERY = `
  query GetTeam($id: String!) {
    team(id: $id) {
      id key
      states(first: 50) { nodes { id name } }
      labels(first: 200) { nodes { id name } }
    }
  }
`;

const CREATE_LABEL = `
  mutation CreateLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel { id name }
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
  const projectId = flags.project;
  const teamRef = flags.team;
  const title = flags.title;
  const labelName = flags.label;
  const stateName = flags.state;

  if (!projectId || !teamRef || !title) {
    fail('Usage: create-issue.js --project <id> --team <key|id> --title "..." [--label type/spec] [--state "Backlog"] < body.md', 64);
  }

  const description = await readStdin();
  const teamData = await query(TEAM_QUERY, { id: teamRef });
  const team = teamData.team;
  if (!team) fail(`Team not found: ${teamRef}`, 1);

  const input = {
    teamId: team.id,
    projectId,
    title,
    description,
  };

  if (stateName) {
    const states = (team.states && team.states.nodes) || [];
    const target = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!target) fail(`State "${stateName}" not found in team ${team.key} workflow.`, 1);
    input.stateId = target.id;
  }

  if (labelName) {
    const labels = (team.labels && team.labels.nodes) || [];
    let label = labels.find((l) => l.name === labelName);
    if (!label) {
      const created = await query(CREATE_LABEL, { input: { name: labelName, teamId: team.id } });
      if (!created.issueLabelCreate.success) fail(`Could not create label ${labelName}`, 1);
      label = created.issueLabelCreate.issueLabel;
    }
    input.labelIds = [label.id];
  }

  const result = await query(MUTATION, { input });
  if (!result.issueCreate.success) fail('issueCreate returned success=false', 1);
  emit(result.issueCreate.issue);
})();
