'use strict';

const ARCH_LINK_MARKER = '<!-- linear-spec-plugin:arch-link -->';

function appendArchitectureLink(description, archDocUrl, archDocTitle) {
  const block = `\n\n${ARCH_LINK_MARKER}\n**Architecture:** [${archDocTitle}](${archDocUrl})\n`;
  if (!description) return block.trimStart();
  if (description.includes(ARCH_LINK_MARKER)) {
    return description.replace(
      new RegExp(`${ARCH_LINK_MARKER}[\\s\\S]*?(?=\\n\\n|$)`),
      `${ARCH_LINK_MARKER}\n**Architecture:** [${archDocTitle}](${archDocUrl})`
    );
  }
  return description.trimEnd() + block;
}

function isLinearIdentifier(value) {
  return /^[A-Z]{2,5}-\d+$/.test(value || '');
}

module.exports = { appendArchitectureLink, isLinearIdentifier, ARCH_LINK_MARKER };
