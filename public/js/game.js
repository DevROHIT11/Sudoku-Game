/* ================================================================
   SUDOKU GAME — FRONTEND LOGIC
   Handles: rendering, interaction, scoring, timer, notes, undo
================================================================ */

'use strict';

// ──────────────────────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────────────────────
const G = {
  board: [],       // number[][] current board (0 = empty)
  solution: [],       // number[][] correct solution
  initial: [],       // boolean[][] true = given (locked)
  notes: [],       // Set<number>[][] pencil marks
  history: [],       // {row,col,prevVal,prevNotes}[]

  selected: null,     // {row, col} | null
  difficulty: 'medium',

  moves: 0,
  errors: 0,
  hints: 0,
  score: 0,
  baseScore: 0,

  timer: 0,
  timerID: null,

  isPaused: false,
  notesMode: false,
  isComplete: false,
  isLoading: false,
};

// Scoring config
const SCORE = {
  easy: 1000,
  medium: 2000,
  hard: 3000,
  mistake: -100,
  hint: -150,
  autoSolve: -500,
  timePenaltyAfter: 300,   // seconds before penalty kicks in
  timePenaltyEvery: 30,   // every N seconds apply penalty
  timePenaltyAmt: 5,   // points deducted
  // Time bonus: full bonus if under 2 min, tapering off
  timeBonusMax: 300,
};

// ──────────────────────────────────────────────────────────────
//  DOM REFS
// ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $board = $('sudoku-board');
const $loading = $('loading-overlay');
const $complete = $('completion-overlay');
const $pause = $('pause-overlay');
const $toast = $('toast');

// ──────────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────────
function init() {
  bindWelcomeEvents();
  bindGameEvents();
}

function bindWelcomeEvents() {
  // Difficulty selection
  document.querySelectorAll('.diff-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      G.difficulty = card.dataset.difficulty;
    });
  });

  $('start-btn').addEventListener('click', () => startGame());
}

function bindGameEvents() {
  $('back-btn').addEventListener('click', () => {
    if (confirm('Leave the current puzzle?')) returnToWelcome();
  });

  // Number pad
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => placeNumber(parseInt(btn.dataset.num)));
  });

  // Controls
  $('undo-btn').addEventListener('click', undo);
  $('notes-btn').addEventListener('click', toggleNotes);
  $('hint-btn').addEventListener('click', getHint);
  $('check-btn').addEventListener('click', checkBoard);
  $('pause-btn').addEventListener('click', togglePause);
  $('resume-btn').addEventListener('click', togglePause);
  $('solve-btn').addEventListener('click', autoSolve);
  $('new-game-btn').addEventListener('click', () => startGame());
  $('play-again-btn').addEventListener('click', () => {
    $complete.classList.add('hidden');
    startGame();
  });

  // Keyboard
  document.addEventListener('keydown', handleKeydown);

  // Click away from board to deselect
  document.addEventListener('click', e => {
    if (!e.target.closest('.sudoku-board') && !e.target.closest('.num-btn')) {
      G.selected = null;
      renderHighlights();
    }
  });
}

// ──────────────────────────────────────────────────────────────
//  SCREEN TRANSITIONS
// ──────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function returnToWelcome() {
  clearTimer();
  G.isComplete = false;
  showScreen('welcome-screen');
}

// ──────────────────────────────────────────────────────────────
//  START GAME
// ──────────────────────────────────────────────────────────────
async function startGame() {
  G.isLoading = true;
  $loading.classList.remove('hidden');
  $complete.classList.add('hidden');

  try {
    const res = await fetch(`/api/puzzle?difficulty=${G.difficulty}`);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    G.board = data.puzzle;
    G.solution = data.solution;
    G.initial = data.puzzle.map(row => row.map(v => v !== 0));
    G.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set()));
    G.history = [];
    G.selected = null;
    G.moves = 0;
    G.errors = 0;
    G.hints = 0;
    G.baseScore = SCORE[G.difficulty] ?? 2000;
    G.score = G.baseScore;
    G.timer = 0;
    G.isPaused = false;
    G.notesMode = false;
    G.isComplete = false;

    // Update badge
    $('diff-badge').textContent =
      G.difficulty.charAt(0).toUpperCase() + G.difficulty.slice(1);

    clearTimer();
    renderBoard();
    updateStats();
    updateNumpadCounts();
    syncNotesBtn();

    showScreen('game-screen');
    startTimer();
  } catch (err) {
    console.error('Failed to start game:', err);
    showToast('Failed to load puzzle. Please try again.', 'error');
  } finally {
    $loading.classList.add('hidden');
    G.isLoading = false;
  }
}

// ──────────────────────────────────────────────────────────────
//  BOARD RENDERING
// ──────────────────────────────────────────────────────────────
function renderBoard() {
  $board.innerHTML = '';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute('role', 'gridcell');

      populateCell(cell, r, c);

      cell.addEventListener('click', e => {
        e.stopPropagation();
        selectCell(r, c);
      });

      $board.appendChild(cell);
    }
  }

  renderHighlights();
}

function populateCell(cell, r, c) {
  cell.innerHTML = '';
  cell.className = 'cell';
  cell.dataset.row = r;
  cell.dataset.col = c;

  if (G.initial[r][c]) {
    cell.classList.add('given');
    cell.textContent = G.board[r][c];
  } else if (G.board[r][c] !== 0) {
    cell.classList.add('filled');
    cell.textContent = G.board[r][c];
  } else if (G.notes[r][c].size > 0) {
    // Render notes mini-grid
    const grid = document.createElement('div');
    grid.classList.add('notes-grid');
    for (let n = 1; n <= 9; n++) {
      const span = document.createElement('span');
      span.classList.add('note-num');
      span.textContent = G.notes[r][c].has(n) ? n : '';
      grid.appendChild(span);
    }
    cell.appendChild(grid);
  }
}

function updateCell(r, c) {
  const cell = getCellEl(r, c);
  if (!cell) return;

  const wasSelected = cell.classList.contains('selected');
  const wasHighlight = cell.classList.contains('highlighted');
  const wasSame = cell.classList.contains('same-number');

  if (!G.initial[r][c]) {
    populateCell(cell, r, c);
  }

  if (wasSelected) cell.classList.add('selected');
  if (wasHighlight) cell.classList.add('highlighted');
  if (wasSame) cell.classList.add('same-number');
}

function renderHighlights() {
  document.querySelectorAll('.cell').forEach(cell => {
    cell.classList.remove('selected', 'highlighted', 'same-number');
  });

  if (!G.selected) return;

  const { row, col } = G.selected;
  const selVal = G.board[row][col];

  document.querySelectorAll('.cell').forEach(cell => {
    const r = +cell.dataset.row;
    const c = +cell.dataset.col;
    const sameBox = (Math.floor(r / 3) === Math.floor(row / 3)) &&
      (Math.floor(c / 3) === Math.floor(col / 3));

    if (r === row || c === col || sameBox) cell.classList.add('highlighted');
    if (selVal !== 0 && G.board[r][c] === selVal) cell.classList.add('same-number');
    if (r === row && c === col) cell.classList.add('selected');
  });
}

function getCellEl(r, c) {
  return $board.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
}

// ──────────────────────────────────────────────────────────────
//  SELECTION
// ──────────────────────────────────────────────────────────────
function selectCell(r, c) {
  if (G.isPaused || G.isComplete) return;
  G.selected = (G.selected?.row === r && G.selected?.col === c) ? null : { row: r, col: c };
  renderHighlights();
}

// ──────────────────────────────────────────────────────────────
//  PLACING NUMBERS
// ──────────────────────────────────────────────────────────────
function placeNumber(num) {
  if (!G.selected || G.isPaused || G.isComplete) return;
  // Validate input: must be integer 1-9 or 0 (for erase)
  if (!Number.isInteger(num) || num < 0 || num > 9) {
    showToast('Invalid input: Please enter a number between 1 and 9.', 'error');
    return;
  }
  const { row, col } = G.selected;
  if (G.initial[row][col]) {
    showToast('Given cells cannot be changed.', 'warn');
    return;
  }

  // Notes mode
  if (G.notesMode && num !== 0) {
    pushHistory(row, col);
    const s = G.notes[row][col];
    if (s.has(num)) s.delete(num); else s.add(num);
    updateCell(row, col);
    return;
  }


  // Regular placement
  if (G.board[row][col] === num) return; // no-op if same number

  // Enforce Sudoku rule: no duplicate in row, column, or box
  if (num !== 0) {
    // Check row
    for (let c = 0; c < 9; c++) {
      if (c !== col && G.board[row][c] === num) {
        showToast('Invalid move: Number already exists in this row.', 'error');
        return;
      }
    }
    // Check column
    for (let r = 0; r < 9; r++) {
      if (r !== row && G.board[r][col] === num) {
        showToast('Invalid move: Number already exists in this column.', 'error');
        return;
      }
    }
    // Check 3x3 box
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if ((r !== row || c !== col) && G.board[r][c] === num) {
          showToast('Invalid move: Number already exists in this box.', 'error');
          return;
        }
      }
    }
  }

  pushHistory(row, col);

  if (num === 0) {
    // Erase
    G.board[row][col] = 0;
    G.notes[row][col].clear();
    updateCell(row, col);
    renderHighlights();
    updateNumpadCounts();
    return;
  }

  G.board[row][col] = num;
  G.notes[row][col].clear();
  G.moves++;

  const isCorrect = (num === G.solution[row][col]);
  if (!isCorrect) {
    G.errors++;
    G.score = Math.max(0, G.score + SCORE.mistake);
    flashCell(row, col, 'error');
  } else {
    // Auto-clear matching notes from row/col/box
    clearRelatedNotes(row, col, num);
    checkGroupCompletion(row, col);
  }

  updateCell(row, col);
  renderHighlights();
  updateStats();
  updateNumpadCounts();
  checkCompletion();
}

function pushHistory(row, col) {
  G.history.push({
    row, col,
    prevVal: G.board[row][col],
    prevNotes: new Set(G.notes[row][col]),
  });
  // Limit history to 200 entries
  if (G.history.length > 200) G.history.shift();
}

function clearRelatedNotes(row, col, num) {
  const clear = (r, c) => {
    if (G.notes[r][c].has(num)) {
      G.notes[r][c].delete(num);
      updateCell(r, c);
    }
  };
  for (let i = 0; i < 9; i++) {
    clear(row, i);
    clear(i, col);
  }
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) clear(r, c);
}

// Briefly flash a completed group
function checkGroupCompletion(row, col) {
  // Check row
  if (G.board[row].every(v => v !== 0 && v === G.solution[row][G.board[row].indexOf(v)])) {
    /* group complete – subtle flash handled by CSS elsewhere */
  }
}

// ──────────────────────────────────────────────────────────────
//  KEYBOARD
// ──────────────────────────────────────────────────────────────
function handleKeydown(e) {
  // Ignore if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key >= '1' && e.key <= '9') {
    placeNumber(parseInt(e.key));
    return;
  }

  switch (e.key) {
    case 'Backspace': case 'Delete': case '0':
      placeNumber(0); break;

    case 'ArrowUp':
      e.preventDefault();
      moveSelection(-1, 0); break;
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(1, 0); break;
    case 'ArrowLeft':
      e.preventDefault();
      moveSelection(0, -1); break;
    case 'ArrowRight':
      e.preventDefault();
      moveSelection(0, 1); break;

    case 'n': case 'N':
      toggleNotes(); break;

    case 'h': case 'H':
      getHint(); break;

    case 'z': case 'Z':
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); }
      break;

    case 'p': case 'P':
      togglePause(); break;

    case 'Escape':
      if (!G.isPaused) { G.selected = null; renderHighlights(); }
      break;
  }
}

function moveSelection(dr, dc) {
  if (!G.selected) {
    G.selected = { row: 0, col: 0 };
  } else {
    let r = G.selected.row + dr;
    let c = G.selected.col + dc;
    // Wrap around
    if (r < 0) r = 8; if (r > 8) r = 0;
    if (c < 0) c = 8; if (c > 8) c = 0;
    G.selected = { row: r, col: c };
  }
  renderHighlights();
}

// ──────────────────────────────────────────────────────────────
//  UNDO
// ──────────────────────────────────────────────────────────────
function undo() {
  if (G.history.length === 0) { showToast('Nothing to undo.', 'info'); return; }
  if (G.isPaused || G.isComplete) return;

  const last = G.history.pop();
  G.board[last.row][last.col] = last.prevVal;
  G.notes[last.row][last.col] = last.prevNotes;

  updateCell(last.row, last.col);
  renderHighlights();
  updateNumpadCounts();
}

// ──────────────────────────────────────────────────────────────
//  NOTES MODE
// ──────────────────────────────────────────────────────────────
function toggleNotes() {
  G.notesMode = !G.notesMode;
  syncNotesBtn();
  showToast(G.notesMode ? 'Notes mode ON' : 'Notes mode OFF', 'info');
}

function syncNotesBtn() {
  $('notes-btn').classList.toggle('active', G.notesMode);
}

// ──────────────────────────────────────────────────────────────
//  HINT
// ──────────────────────────────────────────────────────────────
async function getHint() {
  if (G.isPaused || G.isComplete || G.isLoading) return;

  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzle: G.board, solution: G.solution }),
    });
    const data = await res.json();

    if (!data.hint) { showToast('Board is already complete!', 'info'); return; }

    const { row, col, value } = data.hint;

    pushHistory(row, col);
    G.board[row][col] = value;
    G.notes[row][col].clear();
    G.hints++;
    G.moves++;
    G.score = Math.max(0, G.score + SCORE.hint);

    clearRelatedNotes(row, col, value);
    updateCell(row, col);
    flashCell(row, col, 'hint');

    G.selected = { row, col };
    renderHighlights();
    updateStats();
    updateNumpadCounts();
    checkCompletion();

    showToast(`Hint placed! (−${Math.abs(SCORE.hint)} pts)`, 'warn');
  } catch (err) {
    console.error('Hint error:', err);
    showToast('Hint failed. Try again.', 'error');
  }
}

// ──────────────────────────────────────────────────────────────
//  CHECK BOARD
// ──────────────────────────────────────────────────────────────
async function checkBoard() {
  if (G.isPaused || G.isComplete) return;

  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: G.board }),
    });
    const data = await res.json();

    if (data.isSolved) {
      completeGame();
      return;
    }

    if (data.errors.length > 0) {
      data.errors.forEach(([r, c]) => flashCell(r, c, 'error'));
      showToast(`${data.errors.length} conflict${data.errors.length > 1 ? 's' : ''} found.`, 'error');
    } else {
      // All filled cells are correct so far
      $board.classList.add('check-ok');
      setTimeout(() => $board.classList.remove('check-ok'), 900);
      const empty = G.board.flat().filter(v => v === 0).length;
      showToast(empty > 0 ? `Looking good! ${empty} cells remaining.` : 'Board complete!', 'success');
    }
  } catch (err) {
    showToast('Check failed. Try again.', 'error');
  }
}

// ──────────────────────────────────────────────────────────────
//  AUTO SOLVE
// ──────────────────────────────────────────────────────────────
async function autoSolve() {
  if (G.isPaused || G.isComplete) return;
  if (!confirm('Auto-solve will deduct 500 points from your score. Continue?')) return;

  try {
    const res = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzle: G.board }),
    });
    const data = await res.json();

    if (!data.solved) { showToast('Puzzle has no solution!', 'error'); return; }

    G.board = data.board;
    G.score = Math.max(0, G.score + SCORE.autoSolve);

    renderBoard();
    updateStats();
    updateNumpadCounts();
    showToast('Puzzle solved! (−500 pts)', 'warn');
    setTimeout(completeGame, 600);
  } catch (err) {
    showToast('Solve failed. Try again.', 'error');
  }
}

// ──────────────────────────────────────────────────────────────
//  PAUSE
// ──────────────────────────────────────────────────────────────
function togglePause() {
  if (G.isComplete) return;
  G.isPaused = !G.isPaused;

  if (G.isPaused) {
    clearTimer();
    $pause.classList.remove('hidden');
    $('pause-label').textContent = 'Resume';
    $('pause-icon').innerHTML =
      `<polygon points="5 3 19 12 5 21 5 3"/>`;
  } else {
    $pause.classList.add('hidden');
    startTimer();
    $('pause-label').textContent = 'Pause';
    $('pause-icon').innerHTML =
      `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  }
}

// ──────────────────────────────────────────────────────────────
//  COMPLETION
// ──────────────────────────────────────────────────────────────
function checkCompletion() {
  const full = G.board.every(row => row.every(v => v !== 0));
  if (!full) return;
  const correct = G.board.every((row, r) => row.every((v, c) => v === G.solution[r][c]));
  if (correct) setTimeout(completeGame, 350);
}

function completeGame() {
  if (G.isComplete) return;
  G.isComplete = true;
  clearTimer();

  // Time bonus: up to SCORE.timeBonusMax for fast completion
  const timeBonus = Math.max(0, SCORE.timeBonusMax - G.timer);
  G.score = Math.max(0, G.score + timeBonus);

  // Populate completion card
  $('final-score').textContent = G.score;
  $('final-time').textContent = formatTime(G.timer);
  $('final-moves').textContent = G.moves;
  $('final-errors').textContent = G.errors;

  $complete.classList.remove('hidden');
}

// ──────────────────────────────────────────────────────────────
//  TIMER
// ──────────────────────────────────────────────────────────────
function startTimer() {
  if (G.timerID) return;
  G.timerID = setInterval(() => {
    G.timer++;
    $('timer-display').textContent = formatTime(G.timer);

    // Time penalty after X seconds
    if (G.timer > SCORE.timePenaltyAfter &&
      G.timer % SCORE.timePenaltyEvery === 0) {
      G.score = Math.max(0, G.score - SCORE.timePenaltyAmt);
      updateStats();
    }
  }, 1000);
}

function clearTimer() {
  clearInterval(G.timerID);
  G.timerID = null;
}

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ──────────────────────────────────────────────────────────────
//  UI HELPERS
// ──────────────────────────────────────────────────────────────
function updateStats() {
  $('score-display').textContent = G.score;
  $('moves-display').textContent = G.moves;
  $('errors-display').textContent = G.errors;
}

function updateNumpadCounts() {
  // Count how many of each digit are on the board
  const counts = Array(10).fill(0);
  G.board.forEach(row => row.forEach(v => { if (v) counts[v]++; }));

  for (let n = 1; n <= 9; n++) {
    const remaining = 9 - counts[n];
    const el = $(`cnt-${n}`);
    const btn = el?.closest('.num-btn');
    if (!el || !btn) continue;

    if (remaining <= 0) {
      el.textContent = '';
      btn.classList.add('exhausted');
    } else {
      el.textContent = `×${remaining}`;
      btn.classList.remove('exhausted');
    }
  }
}

function flashCell(r, c, cls) {
  const cell = getCellEl(r, c);
  if (!cell) return;
  cell.classList.add(cls);
  setTimeout(() => {
    cell.classList.remove(cls);
    // Re-render in case class stripped content
    if (!G.initial[r][c]) updateCell(r, c);
  }, cls === 'error' ? 700 : 900);
}

// ──────────────────────────────────────────────────────────────
//  TOAST
// ──────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, type = 'info') {
  $toast.textContent = msg;
  $toast.className = `toast toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = 'toast hidden'; }, 2800);
}

// ──────────────────────────────────────────────────────────────
//  BOOT
// ──────────────────────────────────────────────────────────────
init();
