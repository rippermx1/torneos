console.error(
  [
    'scripts/test-flow-deposit.mjs esta obsoleto: la wallet ya no acepta recargas.',
    'Usa npm run smoke:flow -- <tournament_id> <user_id> para probar checkout Flow de torneo.',
  ].join('\n')
)

process.exit(1)
