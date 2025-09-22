from flask import Flask, request, jsonify
from collections import deque
from flask_cors import CORS


app = Flask(__name__)

CORS(app)

NUM_FLOORS = 11
ROOMS_PER_FLOOR = 27
ROWS, COLS = 10, 10  # grid size matching frontend map

FLOORS = {}

for f in range(1, NUM_FLOORS + 1):
    grid = [[" " for _ in range(COLS)] for _ in range(ROWS)]

    # walls outer ring
    for r in range(ROWS):
        grid[r][0] = "X"
        grid[r][COLS-1] = "X"
    for c in range(COLS):
        grid[0][c] = "X"
        grid[ROWS-1][c] = "X"

    # rooms in second ring clockwise
    room_no = 1
    for c in range(1, COLS-1):
        if room_no > ROOMS_PER_FLOOR:
            break
        grid[1][c] = f"R{f}{room_no:02d}"
        room_no += 1
    for r in range(2, ROWS-1):
        if room_no > ROOMS_PER_FLOOR:
            break
        grid[r][COLS-2] = f"R{f}{room_no:02d}"
        room_no += 1
    for c in range(COLS-3, 0, -1):
        if room_no > ROOMS_PER_FLOOR:
            break
        grid[ROWS-2][c] = f"R{f}{room_no:02d}"
        room_no += 1
    for r in range(ROWS-3, 1, -1):
        if room_no > ROOMS_PER_FLOOR:
            break
        grid[r][1] = f"R{f}{room_no:02d}"
        room_no += 1

    # corridor ring with lifts and bathroom
    # Fill corridors with blank spaces or some mark as needed
    for r in range(2, ROWS-2):
        for c in range(2, COLS-2):
            grid[r][c] = " "  # corridor space

    grid[2][6] = "LIFT"
    grid[6][2] = "LIFT"
    grid[7][6] = "LIFT"
    grid[8][2] = "BATH"

    FLOORS[f] = grid

def allowed_corridors_for_lift(grid, lift_pos):
    r_lift, c_lift = lift_pos
    allowed = set()

    # Include the lift cell itself
    allowed.add((r_lift, c_lift))

    # Vertical line corridors from lift
    for r in range(ROWS):
        if grid[r][c_lift] in [" ", "C", "LIFT", "BATH"] or (r, c_lift) == lift_pos:
            allowed.add((r, c_lift))
        else:
            # Blocked vertically
            if r < r_lift:
                # block upwards stops here
                break
            # continue downwards
    # Horizontal line corridors from lift
    for c in range(COLS):
        if grid[r_lift][c] in [" ", "C", "LIFT", "BATH"] or (r_lift, c) == lift_pos:
            allowed.add((r_lift, c))
        else:
            # Blocked horizontally
            if c < c_lift:
                # block left stops here
                break
            # continue rightwards

    return allowed



def find_position(floor, value):
    grid = FLOORS[floor]
    for r in range(ROWS):
        for c in range(COLS):
            if grid[r][c] == value:
                return (r, c)
    return None

def bfs(floor, start, goal):
    grid = FLOORS[floor]
    queue = deque([start])
    visited = {start: None}

    while queue:
        r, c = queue.popleft()
        if (r, c) == goal:
            break
        for dr, dc in [(1,0),(-1,0),(0,1),(0,-1)]:
            nr, nc = r+dr, c+dc
            if 0 <= nr < ROWS and 0 <= nc < COLS:
                # Allow moving if:
                # - cell is corridor, lift, bathroom 
                # - or cell is goal (room)
                if ((grid[nr][nc] in [" ", "C", "LIFT", "BATH"]) or ((nr, nc) == goal)) and (nr, nc) not in visited:
                    queue.append((nr, nc))
                    visited[(nr, nc)] = (r, c)

    if goal not in visited:
        return None

    path = []
    node = goal
    while node:
        path.append(node)
        node = visited[node]
    path.reverse()
    return path



@app.route('/floors', methods=['GET'])
def get_floors():
    return jsonify(list(FLOORS.keys()))

@app.route('/rooms/<int:floor>', methods=['GET'])
def get_rooms(floor):
    if floor not in FLOORS:
        return jsonify({'error': 'Invalid floor'}), 400
    rooms = []
    grid = FLOORS[floor]
    for r in range(ROWS):
        for c in range(COLS):
            if grid[r][c].startswith('R'):
                rooms.append(grid[r][c])
    return jsonify(rooms)

@app.route('/floorgrid/<int:floor>', methods=['GET'])
def get_floor_grid(floor):
    if floor not in FLOORS:
        return jsonify({'error': 'Invalid floor'}), 400
    return jsonify(FLOORS[floor])



@app.route('/path', methods=['POST'])
def get_path():
    data = request.json
    floor = data.get('floor')
    destination = data.get('destination')
    if floor not in FLOORS:
        return jsonify({'error': 'Invalid floor'}), 400

    # Find all lifts on this floor
    grid = FLOORS[floor]
    lifts = []
    for r in range(len(grid)):
        for c in range(len(grid[0])):
            if grid[r][c] == 'LIFT':
                lifts.append((r, c))

    # Find position of destination room
    goal = find_position(floor, destination)
    if not goal:
        return jsonify({'error': 'Invalid destination room'}), 400

    # Find shortest path from closest lift
    shortest_path = None
    min_len = float('inf')
    for lift_pos in lifts:
        path = bfs(floor, lift_pos, goal)
        if path and len(path) < min_len:
            shortest_path = path
            min_len = len(path)

    if not shortest_path:
        return jsonify({'error': 'No path found from lifts'}), 404

    # Build readable path with labels
    labeled_path = []
    for (r, c) in shortest_path:
        val = grid[r][c]
        if val in [" ", "C"]:
            labeled_path.append("corridor")
        elif val == "X":
            labeled_path.append("wall")
        else:
            labeled_path.append(val)

    return jsonify({
        'path': shortest_path,        # raw coordinates
        'labels': labeled_path        # human-readable labels
    })


if __name__ == '__main__':
    app.run(debug=True)