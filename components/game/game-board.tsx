'use client'

import { GameBoardClient } from './game-board-client'

export function GameBoard() {
  return (
    <GameBoardClient
      config={{
        startUrl: '/api/game/practice/start',
        moveUrl: '/api/game/practice/move',
      }}
    />
  )
}
