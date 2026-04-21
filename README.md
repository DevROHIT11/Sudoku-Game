# 🎮 Sudoku Game

A premium, full-stack Sudoku web application built with Node.js + Express backend and vanilla HTML/CSS/JS frontend.

### Site Live at : https://sudoku-game-dgk4.onrender.com

---

## Features

- **Welcome screen** with rules, keyboard shortcuts, and difficulty selection
- **Three difficulty levels**: Easy (51 clues), Medium (36 clues), Hard (26 clues)
- **Interactive board**: click or keyboard-navigate cells
- **Notes mode**: pencil in candidate numbers (3×3 mini-grid per cell)
- **Undo**: unlimited undo history
- **Hint**: reveals one correct cell (−150 pts)
- **Check**: highlights conflicts on the board
- **Auto-solve**: completes the puzzle instantly (−500 pts)
- **Pause / Resume**: freezes the timer
- **Scoring**: starts at base score, deducts for mistakes/hints/time, adds time bonus
- **Timer**: live clock with time-based penalty after 5 minutes
- **Number pad**: shows remaining count per digit; dims exhausted digits
- **Keyboard shortcuts**: 1–9, Backspace, Arrows, N, H, Ctrl+Z, Escape, P

---

## Tech Stack

| Layer    | Technology                |
|----------|---------------------------|
| Frontend | HTML5, CSS3, Vanilla JS   |
| Backend  | Node.js, Express 4        |
| Fonts    | Cormorant Garamond, JetBrains Mono, DM Sans (Google Fonts) |

---

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
# http://localhost:3000
```

---

## API Endpoints

| Method | Route          | Description                          |
|--------|----------------|--------------------------------------|
| GET    | `/api/puzzle`  | Generate puzzle (`?difficulty=easy|medium|hard`) |
| POST   | `/api/validate`| Validate current board (`{board}`)   |
| POST   | `/api/hint`    | Get a hint (`{puzzle, solution}`)    |
| POST   | `/api/solve`   | Auto-solve puzzle (`{puzzle}`)       |

---

## Scoring System

| Event                  | Points       |
|------------------------|--------------|
| Base score (Easy)      | +1,000       |
| Base score (Medium)    | +2,000       |
| Base score (Hard)      | +3,000       |
| Mistake                | −100         |
| Hint used              | −150         |
| Auto-solve used        | −500         |
| Time penalty (>5 min)  | −5 every 30s |
| Time bonus (fast solve)| Up to +300   |

---

## Project Structure

```
sudoku-game/
├── package.json
├── server.js          ← Express server + Sudoku engine
└── public/
    ├── index.html     ← Single-page app (welcome + game)
    ├── css/
    │   └── style.css  ← Premium dark theme
    └── js/
        └── game.js    ← All frontend game logic
```
