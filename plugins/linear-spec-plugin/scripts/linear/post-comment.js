#!/usr/bin/env node
'use strict';

// Post a comment on an issue. Body is read from stdin.
// Usage: cat comment.md | post-comment.js <issue-id>

const { query } = require('./lib/graphql');
const { emit, fail, readStdin } = require('./lib/format');

const MUTATION = `
  mutation CreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id url body createdAt }
    }
  }
`;

(async () => {
  const id = process.argv[2];
  if (!id) fail('Usage: post-comment.js <issue-id> < comment.md', 64);

  const body = await readStdin();
  if (!body.trim()) fail('Comment body (stdin) is empty.', 64);

  const data = await query(MUTATION, { input: { issueId: id, body } });
  if (!data.commentCreate.success) fail('commentCreate returned success=false', 1);
  emit(data.commentCreate.comment);
})();
