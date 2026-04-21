const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  SUDOKU ENGINE
// ============================================================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(board, row, col, num) {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (board[row][c] === num) return false;
  }
  // Check column
  for (let r = 0; r < 9; r++) {
    if (board[r][col] === num) return false;
  }
  // Check 3×3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r][c] === num) return false;
    }
  }
  return true;
}

function findEmpty(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) return [r, c];
    }
  }
  return null;
}

function solve(board) {
  const empty = findEmpty(board);
  if (!empty) return true;
  const [row, col] = empty;
  for (let num = 1; num <= 9; num++) {
    if (isValid(board, row, col, num)) {
      board[row][col] = num;
      if (solve(board)) return true;
      board[row][col] = 0;
    }
  }
  return false;
}

function generateSolution() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  // Fill the three diagonal 3×3 boxes first (they are mutually independent)
  for (let box = 0; box < 9; box += 3) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let idx = 0;
    for (let r = box; r < box + 3; r++) {
      for (let c = box; c < box + 3; c++) {
        board[r][c] = nums[idx++];
      }
    }
  }
  solve(board);
  return board;
}

function createPuzzle(solution, difficulty) {
  const puzzle = solution.map(row => [...row]);
  const cluesTarget = { easy: 51, medium: 36, hard: 26 }[difficulty] ?? 36;
  const totalCells = 81;
  const cellsToRemove = totalCells - cluesTarget;

  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
  );

  let removed = 0;
  for (const [r, c] of positions) {
    if (removed >= cellsToRemove) break;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    // Verify the puzzle is still solvable
    const copy = puzzle.map(row => [...row]);
    if (solve(copy)) {
      removed++;
    } else {
      puzzle[r][c] = backup;
    }
  }
  return puzzle;
}

function validateBoard(board) {
  const errors = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r][c];
      if (val === 0) continue;
      // Temporarily clear cell to check validity
      board[r][c] = 0;
      if (!isValid(board, r, c, val)) {
        errors.push([r, c]);
      }
      board[r][c] = val;
    }
  }
  const isFull = board.every(row => row.every(v => v !== 0));
  const isSolved = isFull && errors.length === 0;
  return { errors, isSolved };
}

function pickHint(currentBoard, solution) {
  const empties = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (currentBoard[r][c] === 0) empties.push([r, c]);
    }
  }
  if (empties.length === 0) return null;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  return { row: r, col: c, value: solution[r][c] };
}

// ============================================================
//  API ROUTES
// ============================================================

// GET /api/puzzle?difficulty=easy|medium|hard
app.get('/api/puzzle', (req, res) => {
  try {
    const difficulty = ['easy', 'medium', 'hard'].includes(req.query.difficulty)
      ? req.query.difficulty
      : 'medium';
    const solution = generateSolution();
    const puzzle = createPuzzle(solution, difficulty);
    res.json({ puzzle, solution, difficulty });
  } catch (err) {
    console.error('Puzzle generation error:', err);
    res.status(500).json({ error: 'Failed to generate puzzle' });
  }
});

// POST /api/validate  { board: number[][] }
app.post('/api/validate', (req, res) => {
  try {
    const { board } = req.body;
    if (!board || board.length !== 9) return res.status(400).json({ error: 'Invalid board' });
    const result = validateBoard(board.map(row => [...row]));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

// POST /api/hint  { puzzle: number[][], solution: number[][] }
app.post('/api/hint', (req, res) => {
  try {
    const { puzzle, solution } = req.body;
    const hint = pickHint(puzzle, solution);
    res.json({ hint });
  } catch (err) {
    res.status(500).json({ error: 'Hint failed' });
  }
});

// POST /api/solve  { puzzle: number[][] }
app.post('/api/solve', (req, res) => {
  try {
    const { puzzle } = req.body;
    const board = puzzle.map(row => [...row]);
    const solved = solve(board);
    res.json({ solved, board });
  } catch (err) {
    res.status(500).json({ error: 'Solve failed' });
  }
});

// Fallback → serve index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🎮  Sudoku Game is running!`);
  console.log(`    ➜  http://localhost:${PORT}\n`);
});
