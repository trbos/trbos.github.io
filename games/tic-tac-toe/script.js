const cells = Array.from(document.querySelectorAll('.cell'));
const statusText = document.getElementById('status');
const scoreXEl = document.getElementById('scoreX');
const scoreOEl = document.getElementById('scoreO');
const scoreDrawEl = document.getElementById('scoreDraw');

const modePvpBtn = document.getElementById('modePvp');
const modeAiBtn = document.getElementById('modeAi');
const newRoundBtn = document.getElementById('newRound');
const resetAllBtn = document.getElementById('resetAll');

const WIN_COMBOS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let board = Array(9).fill('');
let currentPlayer = 'X';
let gameOver = false;
let mode = 'pvp';
let score = { X: 0, O: 0, draw: 0 };

function setMode(nextMode) {
  mode = nextMode;
  modePvpBtn.classList.toggle('active', mode === 'pvp');
  modeAiBtn.classList.toggle('active', mode === 'ai');
  resetBoard(true);
}

function resetBoard(resetStarter = false) {
  board = Array(9).fill('');
  gameOver = false;
  if (resetStarter) currentPlayer = 'X';

  cells.forEach((cell) => {
    cell.textContent = '';
    cell.disabled = false;
    cell.classList.remove('x', 'o');
  });

  updateStatus();

  if (mode === 'ai' && currentPlayer === 'O' && !gameOver) {
    setTimeout(aiMove, 300);
  }
}

function updateStatus(message) {
  if (message) {
    statusText.textContent = message;
    return;
  }

  if (mode === 'ai') {
    statusText.textContent = currentPlayer === 'X' ? 'Your turn (X)' : 'AI is thinking...';
  } else {
    statusText.textContent = `${currentPlayer}'s turn`;
  }
}

function updateScoreUI() {
  scoreXEl.textContent = score.X;
  scoreOEl.textContent = score.O;
  scoreDrawEl.textContent = score.draw;
}

function checkWinner(nextBoard) {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[a] === nextBoard[c]) {
      return nextBoard[a];
    }
  }

  if (nextBoard.every((cell) => cell !== '')) {
    return 'draw';
  }

  return null;
}

function endGame(result) {
  gameOver = true;
  cells.forEach((cell) => (cell.disabled = true));

  if (result === 'draw') {
    score.draw += 1;
    updateStatus('Draw game!');
  } else {
    score[result] += 1;
    if (mode === 'ai' && result === 'O') {
      updateStatus('AI wins this round!');
    } else if (mode === 'ai' && result === 'X') {
      updateStatus('You win this round!');
    } else {
      updateStatus(`${result} wins!`);
    }
  }

  updateScoreUI();
}

function makeMove(index, player) {
  if (board[index] || gameOver) return false;

  board[index] = player;
  cells[index].textContent = player;
  cells[index].classList.add(player.toLowerCase());
  cells[index].disabled = true;

  const result = checkWinner(board);
  if (result) {
    endGame(result);
  } else {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateStatus();
  }

  return true;
}

function handleCellClick(event) {
  const index = Number(event.target.dataset.index);

  if (mode === 'ai') {
    if (currentPlayer !== 'X' || gameOver) return;

    const played = makeMove(index, 'X');
    if (played && !gameOver) {
      setTimeout(aiMove, 350);
    }
    return;
  }

  makeMove(index, currentPlayer);
}

function getBestMove() {
  const emptyIndices = board
    .map((value, idx) => (value === '' ? idx : null))
    .filter((idx) => idx !== null);

  for (const idx of emptyIndices) {
    const test = [...board];
    test[idx] = 'O';
    if (checkWinner(test) === 'O') return idx;
  }

  for (const idx of emptyIndices) {
    const test = [...board];
    test[idx] = 'X';
    if (checkWinner(test) === 'X') return idx;
  }

  if (board[4] === '') return 4;

  const corners = [0, 2, 6, 8].filter((idx) => board[idx] === '');
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

  return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
}

function aiMove() {
  if (mode !== 'ai' || currentPlayer !== 'O' || gameOver) return;
  const move = getBestMove();
  makeMove(move, 'O');
}

modePvpBtn.addEventListener('click', () => setMode('pvp'));
modeAiBtn.addEventListener('click', () => setMode('ai'));
newRoundBtn.addEventListener('click', () => resetBoard());
resetAllBtn.addEventListener('click', () => {
  score = { X: 0, O: 0, draw: 0 };
  updateScoreUI();
  resetBoard(true);
});

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));

updateScoreUI();
resetBoard(true);


function reportGameState(type, message) {
  if (window.parent !== window) {
    window.parent.postMessage({ id: 'tic-tac-toe', type, message }, location.origin);
  }
}

window.addEventListener('error', (event) => reportGameState('game:error', event.message));
window.addEventListener('unhandledrejection', (event) => reportGameState('game:error', String(event.reason)));
reportGameState('game:ready');
