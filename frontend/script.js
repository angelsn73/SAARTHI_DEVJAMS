const BACKEND = "http://127.0.0.1:5000";

const FLOORS = 7;
const ROOMS_PER_FLOOR = 30;
const ROWS = 10;
const COLS = 10;

const floorSelect = document.getElementById('floor-select');
const roomSelect = document.getElementById('room-select');
const findPathBtn = document.getElementById('find-path');
const mapDiv = document.getElementById('map');
const infoDiv = document.getElementById('info');

let currentFloor = null;
let floorGrid = null;
let path = [];
let start = null;
let goal = null;

async function fetchFloors() {
  // If backend unavailable, fallback to local floors
  let floors;
  try {
    const res = await fetch(`${BACKEND}/floors`);
    floors = await res.json();
  } catch {
    floors = Array.from({length: FLOORS}, (_, i) => i + 1);
  }
  floorSelect.innerHTML = '';
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Choose a floor...';
  defaultOption.disabled = true;
  defaultOption.selected = true;
  floorSelect.appendChild(defaultOption);
  floors.forEach(f => {
    const option = document.createElement('option');
    option.value = f;
    option.textContent = `Floor ${f}`;
    floorSelect.appendChild(option);
  });
  currentFloor = null;
  roomSelect.innerHTML = '';
  mapDiv.innerHTML = '';
  infoDiv.textContent = '';
}

async function fetchRooms(floor) {
  let rooms;
  try {
    const res = await fetch(`${BACKEND}/rooms/${floor}`);
    rooms = await res.json();
  } catch {
    // fallback: generate 30 rooms for the selected floor
    rooms = Array.from({length: ROOMS_PER_FLOOR}, (_, i) => `R${floor}${(i+1).toString().padStart(2,'0')}`);
  }
  roomSelect.innerHTML = '';
  rooms.forEach(r => {
    const option = document.createElement('option');
    option.value = r;
    option.textContent = r;
    roomSelect.appendChild(option);
  });
}

async function fetchFloorGrid(floor) {
  const res = await fetch(`${BACKEND}/floorgrid/${floor}`);
  if(res.ok) {
    return await res.json();
  }
  return buildFloorGridLocally(floor);
}

function buildFloorGridLocally(floor) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  for(let r=0; r<ROWS; r++) {
    grid[r][0] = 'X';
    grid[r][COLS-1] = 'X';
  }
  for(let c=0; c<COLS; c++) {
    grid[0][c] = 'X';
    grid[ROWS-1][c] = 'X';
  }
  grid[1][0] = 'LIFT';
  grid[5][0] = 'LIFT';
  grid[8][0] = 'BATH';
  grid[0][5] = 'LIFT';

  let roomNo = 1;
  // Place up to 30 rooms in a spiral pattern
  // Top row
  for(let c=1; c<COLS-1 && roomNo<=ROOMS_PER_FLOOR; c++) {
    grid[1][c] = `R${floor}${roomNo.toString().padStart(2,'0')}`;
    roomNo++;
  }
  // Right column
  for(let r=2; r<ROWS-1 && roomNo<=ROOMS_PER_FLOOR; r++) {
    grid[r][COLS-2] = `R${floor}${roomNo.toString().padStart(2,'0')}`;
    roomNo++;
  }
  // Bottom row
  for(let c=COLS-3; c>=1 && roomNo<=ROOMS_PER_FLOOR; c--) {
    grid[ROWS-2][c] = `R${floor}${roomNo.toString().padStart(2,'0')}`;
    roomNo++;
  }
  // Left column
  for(let r=ROWS-3; r>=2 && roomNo<=ROOMS_PER_FLOOR; r--) {
    grid[r][1] = `R${floor}${roomNo.toString().padStart(2,'0')}`;
    roomNo++;
  }
  // Fill remaining rooms in the center if needed
  for(let r=2; r<ROWS-2 && roomNo<=ROOMS_PER_FLOOR; r++) {
    for(let c=2; c<COLS-2 && roomNo<=ROOMS_PER_FLOOR; c++) {
      grid[r][c] = `R${floor}${roomNo.toString().padStart(2,'0')}`;
      roomNo++;
    }
  }
  grid[ROWS-1][Math.floor(COLS/2)] = 'ENTRANCE';

  return grid;
}

function drawMap() {
  mapDiv.innerHTML = '';
  path = path || [];

  for(let r=0; r < ROWS; r++) {
    for(let c=0; c < COLS; c++) {
      const cellDiv = document.createElement('div');
      cellDiv.classList.add('cell');
      const val = floorGrid[r][c];

      switch(val) {
        case 'X':
          cellDiv.classList.add('wall');
          cellDiv.textContent = 'X';
          break;
        case 'LIFT':
          cellDiv.classList.add('lift');
          cellDiv.textContent = 'LIFT';
          break;
        case 'BATH':
          cellDiv.classList.add('bathroom');
          cellDiv.textContent = 'BATH';
          break;
        case 'COMMON':
          cellDiv.classList.add('commonspace');
          cellDiv.textContent = '';
          break;
        case 'ENTRANCE':
          cellDiv.classList.add('start');
          cellDiv.textContent = 'ENTRANCE';
          start = [r, c];
          break;
        default:
          if(val && val.startsWith('R')) {
            cellDiv.classList.add('room');
            cellDiv.textContent = val;
          } else {
            cellDiv.classList.add('corridor');
            cellDiv.textContent = '';
          }
      }

      if(path.some(p => p[0] === r && p[1] === c) && !(r === start[0] && c === start[1])) {
        cellDiv.classList.add('path');
      }

      if(goal && r === goal[0] && c === goal[1]) {
        cellDiv.classList.add('goal');
      }

      mapDiv.appendChild(cellDiv);
    }
  }
}

floorSelect.addEventListener('change', async e => {
  if (!e.target.value) {
    roomSelect.innerHTML = '';
    mapDiv.innerHTML = '';
    infoDiv.textContent = '';
    currentFloor = null;
    return;
  }
  currentFloor = parseInt(e.target.value);
  await fetchRooms(currentFloor);
  floorGrid = await fetchFloorGrid(currentFloor);
  path = [];
  goal = null;
  infoDiv.textContent = '';
  drawMap();
});

findPathBtn.addEventListener('click', async () => {
  const destination = roomSelect.value;
  if(!destination) {
    alert('Please select a destination room.');
    return;
  }

  const resp = await fetch(`${BACKEND}/path`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({floor: currentFloor, destination}),
  });
  const data = await resp.json();

  if(resp.ok) {
    path = data.path;
    goal = path[path.length - 1];
    drawMap();
    infoDiv.textContent = `Shortest path found: ${path.length - 1} steps`;
  } else {
    alert(data.error);
  }
});

(async () => {
  await fetchFloors();
})();

// Room selection logic: only show rooms whose hundreds digit matches the selected floor
floorSelect.addEventListener('change', async e => {
  currentFloor = parseInt(e.target.value);
  await fetchRooms(currentFloor);
  floorGrid = await fetchFloorGrid(currentFloor);
  path = [];
  goal = null;
  infoDiv.textContent = '';
  drawMap();
});

roomSelect.addEventListener('change', e => {
  const room = e.target.value;
  if(room && room.startsWith('R')) {
    // hundreds digit logic: R{floor}{roomNo}
    const roomFloor = parseInt(room.substring(1,2));
    if(roomFloor !== currentFloor) {
      alert('Selected room does not belong to the chosen floor!');
      roomSelect.value = '';
    }
  }
});
