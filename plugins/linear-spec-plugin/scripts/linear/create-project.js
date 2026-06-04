#!/usr/bin/env node
'use strict';

// Create a Linear project (deliverable).
// Description is read from stdin (optional — pass --no-stdin to skip).
//
// Usage: [cat description.md |] create-project.js --team <key|id> --name "OS-002 / 02 API Implementation" [--initiative <id>] [--no-stdin]

const { query } = require('./lib/graphql');
const { emit, fail, parseFlags, readStdin } = require('./lib/format');

const TEAM_QUERY = `query GetTeam($id: String!) { team(id: $id) { id key } }`;

const MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project { id name url }
    }
  }
`;

(async () => {
  const flags = parseFlags(process.argv.slice(2), { 'no-stdin': 'boolean' });
  const teamRef = flags.team;
  const name = flags.name;
  const initiativeId = flags.initiative;
  if (!teamRef || !name) {
    fail('Usage: create-project.js --team <key|id> --name "..." [--initiative <id>] [--no-stdin] < description.md', 64);
  }

  const teamData = await query(TEAM_QUERY, { id: teamRef });
  if (!teamData.team) fail(`Team not found: ${teamRef}`, 1);

  const input = { teamIds: [teamData.team.id], name };
  if (initiativeId) input.initiativeId = initiativeId;
  if (!flags['no-stdin']) {
    const description = await readStdin();
    if (description.trim()) input.description = description;
  }

  const data = await query(MUTATION, { input });
  if (!data.projectCreate.success) fail('projectCreate returned success=false', 1);
  emit(data.projectCreate.project);
})();
