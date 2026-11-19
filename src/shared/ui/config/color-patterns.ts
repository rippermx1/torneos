// Only literal colors are accepted for a brand: no var(), url(), keywords or `;`.
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
export const OKLCH_COLOR = /^oklch\((?:\d+(?:\.\d+)?|\.\d+) (?:\d+(?:\.\d+)?|\.\d+) (?:\d+(?:\.\d+)?|\.\d+)\)$/
