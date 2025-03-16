/**
 * Mechanism Solver
 * 
 * A JavaScript module to simulate planar mechanism motion based on
 * kinematic constraints, ported from Python implementation.
 */

// Main function to simulate mechanism motion
function simulateMechanism(mechanismState, numSteps = 200) {
    try {
        // Convert mechanism state to solver format
        const { adjacencyMatrix, initialPositions, motorNodes, fixedNodes } = prepareMechanismData(mechanismState);
        
        // Check if mechanism is valid 
        const { path, isValid } = findPath(adjacencyMatrix, motorNodes, fixedNodes);
        
        if (!isValid) {
            return {
                isValid: false,
                errorMessage: "Mechanism is not dyadic or has DOF other than 1",
                positions: []
            };
        }
        
        // Sort mechanism based on solution path
        const { sortedAdjacencyMatrix, sortedPositions, sortedMotorNodes, sortedFixedNodes, sortOrder } = 
            sortMechanism(adjacencyMatrix, initialPositions, motorNodes, fixedNodes);
        
        // Generate thetas (motor angles) for simulation
        const thetas = generateThetas(numSteps);
        
        // Solve the mechanism for all thetas
        const solverResult = solveMechanism(
            sortedAdjacencyMatrix, 
            sortedPositions, 
            sortedMotorNodes, 
            sortedFixedNodes, 
            thetas
        );
        
        // Reorder results to match original node ordering
        const reorderedPositions = reorderResults(solverResult.positions, sortOrder);
        
        return {
            isValid: true,
            positions: reorderedPositions,
            path: path,
            hasLocking: solverResult.hasLocking,
            lockingFrames: solverResult.lockingFrames,
            status: solverResult.hasLocking ? "partial" : "complete"
        };
    } catch (error) {
        console.error("Error during mechanism simulation:", error);
        return {
            isValid: false,
            errorMessage: error.message,
            positions: [],
            status: "error"
        };
    }
}

/**
 * Converts the mechanism state from UI format to solver format
 * @param {Object} mechanismState - State from getMechanismState()
 * @returns {Object} - Formatted data for solver
 */
function prepareMechanismData(mechanismState) {
    const { nodes, edges } = mechanismState;
    const numNodes = nodes.length;
    
    // Create adjacency matrix
    const adjacencyMatrix = Array(numNodes).fill().map(() => Array(numNodes).fill(0));
    
    // Fill adjacency matrix based on edges
    edges.forEach(edge => {
        const [node1, node2] = edge.nodeIds;
        adjacencyMatrix[node1][node2] = 1;
        adjacencyMatrix[node2][node1] = 1;
    });
    
    // Extract initial positions
    const initialPositions = nodes.map(node => [node.x, node.y]);
    
    // Find motor nodes
    let motorNodes = [0, 1]; // Default
    
    // Find motor edge and its nodes
    const motorEdge = edges.find(edge => edge.isMotor);
    if (motorEdge) {
        motorNodes = [...motorEdge.nodeIds]; // Clone to avoid modifying the original
        
        // Check if any of the motor nodes is a ground node
        const groundNodeIndices = nodes
            .filter(node => node.isGround)
            .map(node => node.id);
            
        // If motor connects to ground, make sure ground node is first
        if (groundNodeIndices.includes(motorNodes[1]) && !groundNodeIndices.includes(motorNodes[0])) {
            // Swap nodes to ensure ground node is first
            [motorNodes[0], motorNodes[1]] = [motorNodes[1], motorNodes[0]];
        }
    }
    
    // Find fixed nodes
    const fixedNodes = nodes
        .filter(node => node.isGround)
        .map(node => node.id);
    
    return {
        adjacencyMatrix,
        initialPositions,
        motorNodes,
        fixedNodes
    };
}

/**
 * Finds the solution path for a dyadic mechanism
 * @param {Array} adjacencyMatrix - Adjacency matrix of the mechanism
 * @param {Array} motorNodes - Motor nodes [node1, node2]
 * @param {Array} fixedNodes - Array of fixed (ground) node IDs
 * @returns {Object} - Path and validity info
 */
function findPath(adjacencyMatrix, motorNodes, fixedNodes) {
    const path = [];
    const n = adjacencyMatrix.length;
    
    // Start with known nodes (fixed nodes and second motor node)
    const knowns = [...fixedNodes];
    if (!knowns.includes(motorNodes[1])) {
        knowns.push(motorNodes[1]);
    }
    
    // Get unknowns (nodes not in knowns)
    let unknowns = [];
    for (let i = 0; i < n; i++) {
        if (!knowns.includes(i)) {
            unknowns.push(i);
        }
    }
    
    let counter = 0;
    while (unknowns.length > 0) {
        if (counter === unknowns.length) {
            // Non-dyadic or DOF larger than 1
            return { path: [], isValid: false };
        }
        
        const node = unknowns[counter];
        
        // Find neighbors
        const neighbors = [];
        for (let i = 0; i < n; i++) {
            if (adjacencyMatrix[node][i] === 1) {
                neighbors.push(i);
            }
        }
        
        // Find known neighbors
        const knownNeighbors = neighbors.filter(neighbor => knowns.includes(neighbor));
        
        if (knownNeighbors.length === 2) {
            // This node can be solved
            path.push([node, knownNeighbors[0], knownNeighbors[1]]);
            counter = 0;
            knowns.push(node);
            unknowns = unknowns.filter(n => n !== node);
        } else if (knownNeighbors.length > 2) {
            // Redundant or overconstrained
            return { path: [], isValid: false };
        } else {
            counter++;
        }
    }
    
    return { path, isValid: true };
}

/**
 * Gets the order for mechanism solution
 * @param {Array} adjacencyMatrix - Adjacency matrix
 * @param {Array} motorNodes - Motor nodes
 * @param {Array} fixedNodes - Fixed nodes
 * @returns {Array} - Ordered node sequence for solution
 */
function getOrder(adjacencyMatrix, motorNodes, fixedNodes) {
    const { path, isValid } = findPath(adjacencyMatrix, motorNodes, fixedNodes);
    
    if (!isValid) {
        throw new Error("Non-dyadic or DOF larger than 1");
    }
    
    // Combine motor nodes, other fixed nodes, and path nodes
    const otherFixedNodes = fixedNodes.filter(node => node !== motorNodes[0]);
    const pathNodes = path.map(triple => triple[0]);
    
    return [...motorNodes, ...otherFixedNodes, ...pathNodes];
}

/**
 * Sorts the mechanism based on solution path
 * @param {Array} adjacencyMatrix - Adjacency matrix
 * @param {Array} positions - Node positions
 * @param {Array} motorNodes - Motor nodes
 * @param {Array} fixedNodes - Fixed nodes
 * @returns {Object} - Sorted mechanism data
 */
function sortMechanism(adjacencyMatrix, positions, motorNodes, fixedNodes) {
    const order = getOrder(adjacencyMatrix, motorNodes, fixedNodes);
    
    // Create node type array (1 for fixed, 0 for movable)
    const nodeTypes = Array(adjacencyMatrix.length).fill(0);
    fixedNodes.forEach(node => {
        nodeTypes[node] = 1;
    });
    
    // Reorder adjacency matrix
    const sortedAdjacencyMatrix = Array(adjacencyMatrix.length)
        .fill()
        .map(() => Array(adjacencyMatrix.length).fill(0));
    
    for (let i = 0; i < order.length; i++) {
        for (let j = 0; j < order.length; j++) {
            sortedAdjacencyMatrix[i][j] = adjacencyMatrix[order[i]][order[j]];
        }
    }
    
    // Reorder positions
    const sortedPositions = order.map(i => positions[i]);
    
    // Reorder node types
    const sortedNodeTypes = order.map(i => nodeTypes[i]);
    
    // Update fixed and motor node indices
    const sortedFixedNodes = [];
    for (let i = 0; i < order.length; i++) {
        if (sortedNodeTypes[i] === 1) {
            sortedFixedNodes.push(i);
        }
    }
    
    // Motor nodes are always first two in sorted order
    const sortedMotorNodes = [0, 1];
    
    return {
        sortedAdjacencyMatrix,
        sortedPositions,
        sortedMotorNodes,
        sortedFixedNodes,
        sortOrder: order
    };
}

/**
 * Generate theta values for motor rotation
 * @param {Number} numSteps - Number of steps to simulate
 * @returns {Array} - Array of theta values
 */
function generateThetas(numSteps) {
    const thetas = [];
    for (let i = 0; i < numSteps; i++) {
        thetas.push(i * 2 * Math.PI / numSteps);
    }
    return thetas;
}

/**
 * Solve mechanism for all thetas
 * @param {Array} adjacencyMatrix - Sorted adjacency matrix
 * @param {Array} positions - Sorted initial positions
 * @param {Array} motorNodes - Sorted motor nodes
 * @param {Array} fixedNodes - Sorted fixed nodes
 * @param {Array} thetas - Array of motor angles
 * @returns {Array} - Node positions for each theta value
 */
function solveMechanism(adjacencyMatrix, positions, motorNodes, fixedNodes, thetas) {
    const numNodes = adjacencyMatrix.length;
    const numThetas = thetas.length;
    
    // Initialize node type array (1 for fixed, 0 for movable)
    const nodeTypes = Array(numNodes).fill(0);
    fixedNodes.forEach(node => {
        nodeTypes[node] = 1;
    });
    
    // Verify that the motor connects to at least one ground node
    const motorToGround = fixedNodes.includes(motorNodes[0]) || fixedNodes.includes(motorNodes[1]);
    if (!motorToGround) {
        console.warn("Motor should connect to at least one ground node for reliable simulation");
    }
    
    // Initialize output array for all positions
    const result = Array(numThetas).fill().map(() => 
        Array(numNodes).fill().map(() => [0, 0])
    );
    
    // Track locking status for each frame
    const lockingStatus = Array(numThetas).fill(false);
    
    // Calculate distances between nodes
    const distances = calculateDistances(positions);
    
    // For each theta value
    for (let t = 0; t < numThetas; t++) {
        const theta = thetas[t];
        let frameHasLocking = false;
        
        // Set fixed node positions
        for (let i = 0; i < numNodes; i++) {
            if (nodeTypes[i] === 1) {
                result[t][i] = [...positions[i]];
            }
        }
        
        // Set motor node position (node 1 is motor end moving around node 0)
        const motorDistance = Math.sqrt(
            Math.pow(positions[1][0] - positions[0][0], 2) + 
            Math.pow(positions[1][1] - positions[0][1], 2)
        );
        
        result[t][1] = [
            positions[0][0] + motorDistance * Math.cos(theta),
            positions[0][1] + motorDistance * Math.sin(theta)
        ];
        
        // Solve for remaining nodes in order
        for (let k = fixedNodes.length + 1; k < numNodes; k++) {
            // Find two connections to this node from previous nodes
            const connections = [];
            for (let j = 0; j < k; j++) {
                if (adjacencyMatrix[k][j] === 1) {
                    connections.push(j);
                }
            }
            
            // We need exactly two connections to solve
            if (connections.length !== 2) {
                console.warn(`Node ${k} doesn't have exactly 2 connections to previous nodes`);
                result[t][k] = [NaN, NaN];
                frameHasLocking = true;
                continue;
            }
            
            const [i, j] = connections;
            
            // Get positions of connected nodes for this theta
            const xi = result[t][i];
            const xj = result[t][j];
            
            // Skip if any connected node is already in a locked position
            if (isNaN(xi[0]) || isNaN(xi[1]) || isNaN(xj[0]) || isNaN(xj[1])) {
                result[t][k] = [NaN, NaN];
                frameHasLocking = true;
                continue;
            }
            
            // Get distances to connected nodes from initial positions
            const dik = distances[i][k];
            const djk = distances[j][k];
            
            // Calculate position using triangulation
            result[t][k] = findThirdPoint(xi, xj, dik, djk, positions[i], positions[j], positions[k]);
            
            // Check if locking occurred
            if (isNaN(result[t][k][0]) || isNaN(result[t][k][1])) {
                frameHasLocking = true;
            }
        }
        
        lockingStatus[t] = frameHasLocking;
    }
    
    return {
        positions: result,
        lockingFrames: lockingStatus,
        hasLocking: lockingStatus.some(locked => locked)
    };
}

/**
 * Calculate distances between all node pairs
 * @param {Array} positions - Node positions
 * @returns {Array} - Distance matrix
 */
function calculateDistances(positions) {
    const n = positions.length;
    const distances = Array(n).fill().map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = positions[i][0] - positions[j][0];
            const dy = positions[i][1] - positions[j][1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            distances[i][j] = distance;
            distances[j][i] = distance;
        }
    }
    
    return distances;
}

/**
 * Find the position of a point given distances to two known points
 * @param {Array} p1 - First known point [x, y]
 * @param {Array} p2 - Second known point [x, y]
 * @param {Number} d1 - Distance from p1 to target
 * @param {Number} d2 - Distance from p2 to target
 * @param {Array} initial_p1 - Initial position of p1
 * @param {Array} initial_p2 - Initial position of p2
 * @param {Array} initial_p3 - Initial position of target
 * @returns {Array} - Position of target point [x, y] or [NaN, NaN] if locked
 */
function findThirdPoint(p1, p2, d1, d2, initial_p1, initial_p2, initial_p3) {
    // Calculate distance between known points
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const d = Math.sqrt(dx * dx + dy * dy);
    
    // Check if this is geometrically possible
    const EPSILON = 1e-10; // Small tolerance for numerical stability
    if (d > d1 + d2 + EPSILON || d < Math.abs(d1 - d2) - EPSILON) {
        // Mechanism is in a locked configuration
        return [NaN, NaN];
    }
    
    // Handle near-locking case (almost fully extended or retracted)
    if (Math.abs(d - (d1 + d2)) < EPSILON) {
        // Almost fully extended, place point along the line
        const ratio = d1 / (d1 + d2);
        return [
            p1[0] + ratio * (p2[0] - p1[0]),
            p1[1] + ratio * (p2[1] - p1[1])
        ];
    }
    
    if (Math.abs(d - Math.abs(d1 - d2)) < EPSILON) {
        // Almost fully retracted, place point along the line
        const ratio = d1 / Math.abs(d1 - d2);
        return [
            p1[0] + ratio * (p2[0] - p1[0]),
            p1[1] + ratio * (p2[1] - p1[1])
        ];
    }
    
    // Calculate intersection points
    const a = (d1 * d1 - d2 * d2 + d * d) / (2 * d);
    
    // Check for potential numerical issues
    if (d1 * d1 - a * a < 0) {
        // This shouldn't happen with our earlier checks, but just in case
        return [NaN, NaN];
    }
    
    const h = Math.sqrt(Math.max(0, d1 * d1 - a * a)); // Use max to avoid negative under square root
    
    // Calculate base point
    const x0 = p1[0] + a * (p2[0] - p1[0]) / d;
    const y0 = p1[1] + a * (p2[1] - p1[1]) / d;
    
    // Two possible solutions
    const solutions = [
        [
            x0 + h * (p2[1] - p1[1]) / d,
            y0 - h * (p2[0] - p1[0]) / d
        ],
        [
            x0 - h * (p2[1] - p1[1]) / d,
            y0 + h * (p2[0] - p1[0]) / d
        ]
    ];
    
    // Determine which solution is correct based on initial configuration
    // Calculate cross product to determine which side the point was originally on
    const initialDx1 = initial_p2[0] - initial_p1[0];
    const initialDy1 = initial_p2[1] - initial_p1[1];
    const initialDx2 = initial_p3[0] - initial_p1[0];
    const initialDy2 = initial_p3[1] - initial_p1[1];
    
    const crossProduct = initialDx1 * initialDy2 - initialDy1 * initialDx2;
    
    // Check which solution preserves the orientation
    const dx1 = p2[0] - p1[0];
    const dy1 = p2[1] - p1[1];
    
    const dx2a = solutions[0][0] - p1[0];
    const dy2a = solutions[0][1] - p1[1];
    const cp1 = dx1 * dy2a - dy1 * dx2a;
    
    const dx2b = solutions[1][0] - p1[0];
    const dy2b = solutions[1][1] - p1[1];
    const cp2 = dx1 * dy2b - dy1 * dx2b;
    
    // Choose the solution that maintains the same sign as the original
    if ((crossProduct >= 0 && cp1 >= 0) || (crossProduct < 0 && cp1 < 0)) {
        return solutions[0];
    } else {
        return solutions[1];
    }
}

/**
 * Reorder the results to match original node ordering
 * @param {Array} positions - Positions array from solver (theta, node, xy)
 * @param {Array} order - Node ordering used in solver
 * @returns {Array} - Reordered positions
 */
function reorderResults(positions, order) {
    const numThetas = positions.length;
    const numNodes = order.length;
    
    // Create reverse mapping
    const reverseOrder = Array(numNodes).fill(0);
    for (let i = 0; i < numNodes; i++) {
        reverseOrder[order[i]] = i;
    }
    
    // Reorder results
    const reordered = Array(numThetas).fill().map(() => 
        Array(numNodes).fill().map(() => [0, 0])
    );
    
    for (let t = 0; t < numThetas; t++) {
        for (let i = 0; i < numNodes; i++) {
            reordered[t][i] = positions[t][reverseOrder[i]];
        }
    }
    
    return reordered;
}

/**
 * Helper function to easily test the solver from the browser console
 */
function testCurrentMechanism() {
    // Access the global getMechanismState function if it exists
    if (typeof window.getMechanismState !== 'function') {
        console.error("getMechanismState function not found. Make sure it's exposed globally.");
        return null;
    }
    
    try {
        const state = window.getMechanismState();
        console.log("Current mechanism state:", state);
        
        const result = simulateMechanism(state, 200);
        console.log("Simulation result:", result);
        
        // If valid, log more details
        if (result.isValid) {
            console.log(`Simulated ${result.positions.length} frames`);
            
            if (result.hasLocking) {
                console.log(`WARNING: Mechanism has locking in ${result.lockingFrames.filter(Boolean).length} frames`);
                
                // Find a frame that has locking and show it
                const lockingFrameIndex = result.lockingFrames.findIndex(locked => locked);
                if (lockingFrameIndex >= 0) {
                    console.log(`Example locking at frame ${lockingFrameIndex}:`, result.positions[lockingFrameIndex]);
                }
                
                // Find a frame that doesn't have locking and show it
                const nonLockingFrameIndex = result.lockingFrames.findIndex(locked => !locked);
                if (nonLockingFrameIndex >= 0) {
                    console.log(`Example working frame ${nonLockingFrameIndex}:`, result.positions[nonLockingFrameIndex]);
                }
            } else {
                console.log("No locking detected, mechanism works through the full range of motion");
                console.log("First frame positions:", result.positions[0]);
                console.log("Middle frame positions:", result.positions[Math.floor(result.positions.length / 2)]);
                console.log("Last frame positions:", result.positions[result.positions.length - 1]);
            }
        }
        
        return result;
    } catch (error) {
        console.error("Error testing mechanism:", error);
        return { isValid: false, errorMessage: error.message, status: "error" };
    }
}

// Make test function globally available if in browser
if (typeof window !== 'undefined') {
    window.testMechanismSolver = testCurrentMechanism;
}

// Export the module
export {
    simulateMechanism,
    findPath,
    sortMechanism,
    solveMechanism,
    testCurrentMechanism
};