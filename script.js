// Modern Linkage Designer JavaScript
import { simulateMechanism } from './mechanismSolver.js';
import { curves, solutions } from './curves.js';
// Global variables
let nodeCount = 0;
let currentNodeId = 0;
let edges = [];
let edgeDrawing = false;
let activeEdgeStartNode = null;
let motorEdge = null;
let targetNode = null;
let adjacencyMatrix = [];
let nodePositions = [];
let nodeIds = [];
let mobilityDOF = 0;
let operationHistory = [];
let currentHistoryIndex = -1;
let activeTool = null;
let simulationMode = false;
let simulationPlaying = false;
let simulationSpeed = 25;
let simulationPosition = 0;
let simulationMaxPosition = 360; // Full 360 degree rotation
let animationFrameId = null;
let lastTimestamp = 0;
let animationSpeed = 0.2; // Degrees per millisecond (can be adjusted)
let animation_inverted = false;
let moveSimulationTimeout = null;
let isCurrentlyMoving = false;
let previewmode = false;
let quickSimMode = false;
let quickSimStartAngle = 0;
let quickSimAnimationId = null;
let quickSimCompleted = false;
let savedTool = null;

let isPanelOpen = true;

// DOM Elements
const canvas = document.getElementById('linkage-canvas');
const nodesContainer = document.getElementById('nodes-container');
const dofValue = document.getElementById('dof-value');
const statusMessage = document.getElementById('status-message');
const coordinatesDisplay = document.getElementById('coordinates');
const fileInput = document.getElementById('file-input');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalOkBtn = document.getElementById('modal-ok');
const modalCancelBtn = document.getElementById('modal-cancel');
const closeModal = document.querySelector('.close-modal');

function setViewportHeight() {
    // Get the actual viewport height
    const vh = window.innerHeight;
    
    // Apply it directly to the app container
    document.querySelector('.app-container').style.height = `${vh}px`;
    
    // Also set a CSS variable that can be used throughout your CSS
    document.documentElement.style.setProperty('--real-vh', `${vh}px`);
  }

function createInitialFourBar() {
    console.log("Creating initial four-bar mechanism...");
    
    // Clear any existing elements first
    clearCanvas(false);
    
    // Get canvas dimensions to center the mechanism
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    console.log(`Canvas dimensions: ${canvasWidth}x${canvasHeight}`);
    
    // Calculate center point of canvas
    const centerX = Math.floor(canvasWidth / 2);
    const centerY = Math.floor(canvasHeight / 2);
    
    // Size of the mechanism (adjust based on canvas size)
    const size = Math.min(canvasWidth, canvasHeight) * 0.3; // 30% of smaller dimension
    
    console.log(`Mechanism size: ${size}, Center: (${centerX}, ${centerY})`);
    
    // Add ground nodes (two fixed points)
    const ground1X = centerX - size / 2;
    const ground1Y = centerY + size / 4;
    
    // Save active tool and set to ground node tool
    const savedTool = activeTool;
    activeTool = 'add-ground';
    addGroundNode(ground1X, ground1Y);
    
    const ground2X = centerX + size / 2;
    const ground2Y = centerY + size / 4;
    addGroundNode(ground2X, ground2Y);
    
    // Add movable nodes
    activeTool = 'add-node';
    const node1X = centerX - size / 2;
    const node1Y = centerY - size / 6;
    addSimpleNode(node1X, node1Y);
    
    const node2X = centerX + size / 2;
    const node2Y = centerY - size / 3;
    addSimpleNode(node2X, node2Y);

    const node3X = centerX + size / 8;
    const node3Y = centerY - size / 1.5;
    addSimpleNode(node3X, node3Y);
    
    // Restore original tool
    activeTool = savedTool;
    
    console.log("Nodes created, now creating links...");
    
    // Now create links between them using a short delay to ensure nodes are created
    setTimeout(() => {
        try {
            // Get all nodes 
            const nodes = document.querySelectorAll('.node');
            
            if (nodes.length < 4) {
                console.error("Not enough nodes to create four-bar mechanism");
                return;
            }
            
            // Create links (using the nodes in order they were created)
            const ground1 = nodes[0];
            const ground2 = nodes[1];
            const node1 = nodes[2];
            const node2 = nodes[3];
            const node3 = nodes[4];
            
            // Link ground1 to node1
            activeTool = 'add-link';
            edgeDrawing = true;
            activeEdgeStartNode = ground1;
            endEdgeDrawing(node1);
            
            // Link node1 to node2
            edgeDrawing = true;
            activeEdgeStartNode = node1;
            endEdgeDrawing(node2);
            
            // Link node2 to ground2
            edgeDrawing = true;
            activeEdgeStartNode = node2;
            endEdgeDrawing(ground2);

            // Link node2 to node3
            edgeDrawing = true;
            activeEdgeStartNode = node2;
            endEdgeDrawing(node3);

            // Link node3 to node1
            edgeDrawing = true;
            activeEdgeStartNode = node3;
            endEdgeDrawing(node1);
            
            // Set the first link as motor (ground1 to node1)
            const links = document.querySelectorAll('.link');
            if (links.length > 0) {
                const firstLink = links[0];
                activeTool = 'select-motor';
                handleEdgeClick(firstLink);
            }
            
            // Set the last movable node as target
            if (node2) {
                activeTool = 'select-target';
                setTargetNode(node3);
            }
            
            // Restore active tool
            activeTool = null;
            
            // Add to history and update DOF
            addToHistory();
            updateDOF();
            updateStatusMessage('Four-bar mechanism created. Ready to simulate or modify.');
            console.log("Four-bar mechanism creation complete");
        } catch (error) {
            console.error("Error creating four-bar mechanism:", error);
        }
    }, 100); // Slightly longer delay to ensure nodes are created and registered
}

// Initialize the application
function init() {
    bindToolButtons();
    bindKeyboardShortcuts();
    setupCanvasEvents();
    setupModalEvents();
    setupMobileControls();
    setupSimulationControls();
    setViewportHeight();
    setupMobileToggle();
    QuickSimSetup();
    initChallenge();
    document.getElementById('toggle-preview').addEventListener('click', togglePreviewMode);
    // Add first operation to history (empty canvas)
    addToHistory();
    // Create initial four-bar mechanism
    createInitialFourBar();
    
    
    updateStatusMessage('Ready to design! Select a tool to start.');
}

function setupMobileToggle() {
    const toggleBtn = document.getElementById('mobile-controls-toggle');
    const mobileControls = document.querySelector('.mobile-controls');
    const mobileControlsContainer = document.querySelector('.mobile-toggle');
    const simControls = document.getElementById('simulation-controls');

    // Check if there's a saved state in localStorage
    const isMobileControlsCollapsed = false;
    
    // Initialize state based on saved preference
    if (isMobileControlsCollapsed) {
        mobileControls.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
        mobileControlsContainer.classList.add('collapsed');
        simControls.classList.add('collapsed');
    }
    
    toggleBtn.addEventListener('click', () => {
        // Toggle collapsed state
        mobileControls.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');
        mobileControlsContainer.classList.toggle('collapsed');
        simControls.classList.toggle('collapsed');
        
        // Save state to localStorage
        localStorage.setItem(
            'mobileControlsCollapsed', 
            mobileControls.classList.contains('collapsed')
        );
    });

    const previewBtn = document.querySelector('.mobile-btn[data-tool="toggle-preview"]');
    if (previewBtn) {
        previewBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent tool selection behavior
            togglePreviewMode();
        });
    }
}

// Update the animation loop to skip locking frames
function animationLoop(timestamp) {
    // Skip first frame for accurate timing
    if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
        animationFrameId = requestAnimationFrame(animationLoop);
        return;
    }
    
    // Calculate time delta and update position based on speed
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    
    // Calculate new position
    const degreesPerFrame = (deltaTime * animationSpeed * simulationSpeed / 50);
    let newPosition = (simulationPosition + degreesPerFrame * (animation_inverted ? -1 : 1)) % simulationMaxPosition;
    
    if (newPosition < 0) {
        newPosition += simulationMaxPosition;
    }
    if (newPosition >= simulationMaxPosition) {
        newPosition -= simulationMaxPosition;
    }

    // Check if the next position would enter a locking region
    const nextFrameIndex = Math.round((newPosition / 360) * (window.currentSimulation.positions.length - 1));
    
    // If moving to a locking frame, find the next valid frame
    if (window.currentSimulation.lockingFrames[nextFrameIndex]) {
        animation_inverted = !animation_inverted;
        newPosition = (simulationPosition + degreesPerFrame * (animation_inverted ? -1 : 1)) % simulationMaxPosition;
        if (newPosition < 0) {
            newPosition += simulationMaxPosition;
        }
        if (newPosition >= simulationMaxPosition) {
            newPosition -= simulationMaxPosition;
        }
        // Search forward for a non-locking frame
        // let validFrameIndex = findNextValidFrame(nextFrameIndex);
        
        // // If no valid frame forward, try backward
        // if (validFrameIndex === -1) {
        //     validFrameIndex = findPreviousValidFrame(nextFrameIndex);
        // }
        
        // // If we found a valid frame, jump to it
        // if (validFrameIndex !== -1) {
        //     newPosition = (validFrameIndex / (window.currentSimulation.positions.length - 1)) * 360;
        // } else {
        //     // If no valid frames available, pause simulation
        //     toggleSimulationPlayPause();
        //     return;
        // }
    }
    
    simulationPosition = newPosition;
    
    // Update slider and display
    const sliderValue = Math.round(simulationPosition);
    document.getElementById('sim-position').value = sliderValue;
    document.getElementById('sim-position-display').textContent = `${Math.round(simulationPosition)}°`;
    
    // Update mechanism positions
    updateMechanismPositions(simulationPosition);
    
    // Continue animation loop
    animationFrameId = requestAnimationFrame(animationLoop);
}


// Make sure the exit simulation button works correctly
function setupSimulationControls() {
    // Simulation mode toggle
    document.getElementById('toggle-simulation').addEventListener('click', toggleSimulationMode);
    
    // Simulation control buttons
    document.getElementById('sim-play-pause').addEventListener('click', toggleSimulationPlayPause);
    document.getElementById('sim-step-forward').addEventListener('click', stepSimulationForward);
    document.getElementById('sim-step-back').addEventListener('click', stepSimulationBackward);
    
    // Exit simulation button
    document.getElementById('exit-simulation').addEventListener('click', function() {
        simulationMode = true; // Set to true so toggling will turn it off
        exitSimulationMode();
    });
    
    // Simulation speed slider
    document.getElementById('sim-speed').addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value);
        updateStatusMessage(`Simulation speed: ${simulationSpeed}%`);
    });
    
    // Simulation position slider (seek)
    document.getElementById('sim-position').addEventListener('input', (e) => {
        const newPosition = parseInt(e.target.value);
        seekToPosition(newPosition);
    });
}

function seekToPosition(position) {
    if (!window.currentSimulation || !window.currentSimulation.isValid) return;
    
    // Convert slider value (0-360) to angle (0-360)
    const angle = position;
    
    // Convert angle to frame index
    const frameIndex = Math.round((angle / 360) * (window.currentSimulation.positions.length - 1));
    
    // Check if this is a locking frame
    if (window.currentSimulation.lockingFrames[frameIndex]) {
        // Find the nearest non-locking frame
        const nextValid = findNextValidFrame(frameIndex);
        const prevValid = findPreviousValidFrame(frameIndex);
        
        let validFrameIndex;
        
        // Choose the closest valid frame
        if (nextValid !== -1 && prevValid !== -1) {
            const nextDist = Math.min(
                (nextValid - frameIndex + window.currentSimulation.positions.length) % window.currentSimulation.positions.length,
                (frameIndex - nextValid + window.currentSimulation.positions.length) % window.currentSimulation.positions.length
            );
            
            const prevDist = Math.min(
                (prevValid - frameIndex + window.currentSimulation.positions.length) % window.currentSimulation.positions.length,
                (frameIndex - prevValid + window.currentSimulation.positions.length) % window.currentSimulation.positions.length
            );
            
            validFrameIndex = (nextDist <= prevDist) ? nextValid : prevValid;
        } else {
            validFrameIndex = (nextValid !== -1) ? nextValid : prevValid;
        }
        
        // If we found a valid frame, use it
        if (validFrameIndex !== -1) {
            const validAngle = (validFrameIndex / (window.currentSimulation.positions.length - 1)) * 360;
            position = validAngle;
        } else {
            // If no valid frames, just return
            return;
        }
    }
    
    simulationPosition = position;
    
    // Update the position display
    document.getElementById('sim-position').value = Math.round(position);
    document.getElementById('sim-position-display').textContent = `${Math.round(position)}°`;
    
    // If playing, pause the simulation when manually seeking
    if (simulationPlaying) {
        toggleSimulationPlayPause();
    }
    
    // Update mechanism
    updateMechanismForPosition(position);
    
    updateStatusMessage(`Simulation position: ${Math.round(position)}°`);
}

// Replace the existing updateMechanismForPosition function with this one
function updateMechanismForPosition(angle) {
    if (!window.currentSimulation || !window.currentSimulation.isValid) return;
    
    // Convert angle (0-360) to frame index (0 to numSteps-1)
    const frameIndex = Math.round((angle / 360) * (window.currentSimulation.positions.length - 1));
    
    // Update mechanism positions
    updateMechanismPositions(angle, frameIndex);
}

// Add this function to update position markers on paths
function updatePositionMarkers(frameIndex) {
    // Remove any existing markers
    const existingMarkers = document.querySelectorAll('.current-position-marker');
    existingMarkers.forEach(marker => marker.remove());
    
    // Get all nodes
    const nodes = Array.from(document.querySelectorAll('.node'));
    
    // Get the paths group
    const pathsGroup = document.getElementById('simulation-paths');
    if (!pathsGroup) return;
    
    // Create a marker for each node that has a path
    nodes.forEach((node, index) => {
        // Skip ground nodes
        if (node.classList.contains('ground')) return;
        
        // Get simulated position for this node
        const position = window.currentSimulation.positions[frameIndex][index];
        
        // Skip if position is invalid
        if (!position || isNaN(position[0]) || isNaN(position[1])) return;
        
        // Create a marker
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.classList.add('current-position-marker');
        
        // Add target class if this is the target node
        if (node.classList.contains('target')) {
            marker.classList.add('target');
        }
        
        marker.setAttribute('cx', position[0]);
        marker.setAttribute('cy', position[1]);
        marker.setAttribute('r', node.classList.contains('target') ? 5 : 3);
        
        // Add to canvas
        canvas.appendChild(marker);
    });
}

// Add this function to update node positions based on simulation data
function updateMechanismPositions(angle, frameIndex) {
    if (!window.currentSimulation || !window.currentSimulation.isValid) return;
    
    // If frameIndex is not provided, calculate it
    if (frameIndex === undefined) {
        frameIndex = Math.round((angle / 360) * (window.currentSimulation.positions.length - 1));
    }
    
    // Get the frame data
    const frame = window.currentSimulation.positions[frameIndex];
    
    // Get all nodes
    const nodes = Array.from(document.querySelectorAll('.node'));
    
    // Update node positions based on simulation
    nodes.forEach((node, index) => {
        // Skip if this frame has locking at this position
        if (window.currentSimulation.lockingFrames[frameIndex]) {
            // Add visual indicator for locking
            node.classList.add('locked');
            return;
        } else {
            node.classList.remove('locked');
        }
        
        // Skip ground nodes
        if (node.classList.contains('ground')) return;
        
        // Get simulated position for this node
        const position = frame[index];
        
        // Skip if position is invalid (NaN)
        if (!position || isNaN(position[0]) || isNaN(position[1])) return;
        
        // Update node position
        node.style.left = `${position[0]}px`;
        node.style.top = `${position[1]}px`;
    });
    
    // Update connected edges
    nodes.forEach(node => {
        updateConnectedEdges(node);
    });
    
    // Add or update position marker on path
    updatePositionMarkers(frameIndex);
}


// Toggle simulation mode
function toggleSimulationMode() {
    simulationMode = !simulationMode;
    
    if (simulationMode) {
        enterSimulationMode();
    } else {
        exitSimulationMode();
    }
}

// Update enterSimulationMode to use the return value from prepareSimulation
function enterSimulationMode() {
    // Check if there's a valid mechanism to simulate
    if (edges.length === 0) {
        showModal('Simulation Error', 'Cannot simulate: No mechanism defined. Please add nodes and links first.');
        simulationMode = false;
        return;
    }
    
    if (motorEdge === null) {
        showModal('Simulation Warning', 'No motor edge defined. Please select a motor edge (connected to ground) to drive the mechanism.');
        simulationMode = false;
        return;
    }
    
    // Visual transition effect
    document.getElementById('canvas-container').classList.add('simulation-transition');
    setTimeout(() => {
        document.getElementById('canvas-container').classList.remove('simulation-transition');
    }, 500);
    
    // Prepare simulation and exit if preparation fails
    if (!prepareSimulation()) {
        return;
    }
    
    // Update UI for simulation mode
    document.body.classList.add('simulation-mode');
    document.getElementById('simulation-controls').classList.add('active');
    
    // Disable all design tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        if (btn.id !== 'toggle-simulation') {
            btn.classList.add('disabled');
        }
    });
    
    // Update the simulation button icon and text
    const simButton = document.getElementById('toggle-simulation');
    simButton.classList.add('active');
    simButton.querySelector('i').classList.remove('fa-play-circle');
    simButton.querySelector('i').classList.add('fa-stop-circle');
    simButton.querySelector('span').textContent = 'Stop Simulation';
    
    // Update mobile UI if applicable
    const mobileBtn = document.querySelector('.mobile-btn[data-tool="toggle-simulation"]');
    if (mobileBtn) {
        mobileBtn.classList.add('active');
        mobileBtn.querySelector('i').classList.remove('fa-play-circle');
        mobileBtn.querySelector('i').classList.add('fa-stop-circle');
        document.querySelector('.tool-name-display').textContent = 'Stop Simulation';
    }
    
    // Set proper tool state
    activeTool = null;
    
    updateStatusMessage('Simulation mode active. Use controls to animate the mechanism.');
    
    // Set initial simulation state
    simulationPlaying = false;

    // Find angle of motor edge
    const state = getMechanismState();
    const startNode = motorEdge.getAttribute('data-start');
    const endNode = motorEdge.getAttribute('data-end');
    let startNodeId = parseInt(startNode.substring(4));
    let endNodeId = parseInt(endNode.substring(4));

    // swap so that ground node is always start node
    if (!state.nodes[startNodeId].isGround) {
        const temp = startNodeId;
        startNodeId = endNodeId;
        endNodeId = temp;
    }

    const dx = state.nodes[endNodeId].x - state.nodes[startNodeId].x;
    const dy = state.nodes[endNodeId].y - state.nodes[startNodeId].y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) {
        angle += 360;
    }
    // set the simulation position to the angle of the motor edge
    seekToPosition(angle);

    // set slider to the angle of the motor edge
    document.getElementById('sim-position').value = angle;
    document.getElementById('sim-position-display').textContent = `${Math.round(angle)}°`;
}

// Update exitSimulationMode to cancel animation
function exitSimulationMode() {
    // Stop animation loop if running
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Reset playing state
    simulationPlaying = false;
    
    // Clear simulation paths
    clearSimulationPaths();
    
    // Hide locking indicator if visible
    const lockingIndicator = document.getElementById('locking-indicator');
    if (lockingIndicator) {
        lockingIndicator.classList.remove('visible');
    }
    
    // Remove any position markers
    const markers = document.querySelectorAll('.current-position-marker');
    markers.forEach(marker => marker.remove());
    
    // Remove locked class from nodes
    document.querySelectorAll('.node.locked').forEach(node => {
        node.classList.remove('locked');
    });
    
    // Delete the current simulation data
    delete window.currentSimulation;
    
    // Update UI to exit simulation mode
    document.body.classList.remove('simulation-mode');
    document.body.classList.remove('simulation-playing');
    document.getElementById('simulation-controls').classList.remove('active');
    
    // Re-enable all design tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('disabled');
    });
    
    // Update the simulation button icon and text
    const simButton = document.getElementById('toggle-simulation');
    simButton.classList.remove('active');
    simButton.querySelector('i').classList.remove('fa-stop-circle');
    simButton.querySelector('i').classList.add('fa-play-circle');
    simButton.querySelector('span').textContent = 'Simulate';
    
    // Update mobile UI if applicable
    const mobileBtn = document.querySelector('.mobile-btn[data-tool="toggle-simulation"]');
    if (mobileBtn) {
        mobileBtn.classList.remove('active');
        mobileBtn.querySelector('i').classList.remove('fa-stop-circle');
        mobileBtn.querySelector('i').classList.add('fa-play-circle');
        document.querySelector('.tool-name-display').textContent = 'Simulate';
    }
    
    simulationMode = false;
    
    // Reset play/pause button to play state
    const playPauseBtn = document.getElementById('sim-play-pause');
    if (playPauseBtn) {
        playPauseBtn.classList.remove('playing');
        playPauseBtn.querySelector('i').classList.remove('fa-pause');
        playPauseBtn.querySelector('i').classList.add('fa-play');
    }
    
    // Reset nodes to their original positions
    resetNodePositions();
    
    updateStatusMessage('Returned to design mode.');
}

// Add this function to reset nodes to their original positions
function resetNodePositions() {
    // Get all nodes
    const nodes = document.querySelectorAll('.node');
    
    // If we don't have a mechanism state, we can't reset positions
    if (!operationHistory[currentHistoryIndex]) return;
    
    const state = operationHistory[currentHistoryIndex];
    
    // Reset positions based on history
    nodes.forEach(node => {
        const nodeId = parseInt(node.id.substring(4));
        const stateNode = state.nodes.find(n => n.id === nodeId);
        
        if (stateNode) {
            node.style.left = `${stateNode.x}px`;
            node.style.top = `${stateNode.y}px`;
        }
    });
    
    // Update connected edges
    nodes.forEach(node => {
        updateConnectedEdges(node);
    });
}

// Helper function to find the next valid frame after a locking frame
function findNextValidFrame(currentFrameIndex) {
    if (!window.currentSimulation || !window.currentSimulation.lockingFrames) return -1;
    
    const numFrames = window.currentSimulation.lockingFrames.length;
    let frameIndex = (currentFrameIndex + 1) % numFrames;
    
    // Search for a non-locking frame, but avoid infinite loop
    const startIndex = frameIndex;
    do {
        if (!window.currentSimulation.lockingFrames[frameIndex]) {
            return frameIndex;
        }
        frameIndex = (frameIndex + 1) % numFrames;
    } while (frameIndex !== startIndex);
    
    return -1; // No valid frame found
}

// Helper function to find the previous valid frame before a locking frame
function findPreviousValidFrame(currentFrameIndex) {
    if (!window.currentSimulation || !window.currentSimulation.lockingFrames) return -1;
    
    const numFrames = window.currentSimulation.lockingFrames.length;
    let frameIndex = (currentFrameIndex - 1 + numFrames) % numFrames;
    
    // Search for a non-locking frame, but avoid infinite loop
    const startIndex = frameIndex;
    do {
        if (!window.currentSimulation.lockingFrames[frameIndex]) {
            return frameIndex;
        }
        frameIndex = (frameIndex - 1 + numFrames) % numFrames;
    } while (frameIndex !== startIndex);
    
    return -1; // No valid frame found
}

// Update the toggleSimulationPlayPause function
function toggleSimulationPlayPause() {
    simulationPlaying = !simulationPlaying;
    
    const playPauseBtn = document.getElementById('sim-play-pause');
    
    if (simulationPlaying) {
        // Change to pause icon
        playPauseBtn.querySelector('i').classList.remove('fa-play');
        playPauseBtn.querySelector('i').classList.add('fa-pause');
        playPauseBtn.classList.add('playing');
        updateStatusMessage('Simulation running');
        
        // Start animation loop
        lastTimestamp = 0; // Reset timestamp
        animationFrameId = requestAnimationFrame(animationLoop);
        
        // Update UI to indicate playing
        document.body.classList.add('simulation-playing');
    } else {
        // Change to play icon
        playPauseBtn.querySelector('i').classList.remove('fa-pause');
        playPauseBtn.querySelector('i').classList.add('fa-play');
        playPauseBtn.classList.remove('playing');
        updateStatusMessage('Simulation paused');
        
        // Stop animation loop
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        // Update UI to indicate paused
        document.body.classList.remove('simulation-playing');
    }
}

function stepSimulationForward() {
    if (!simulationMode) return;
    
    // If playing, pause first
    if (simulationPlaying) {
        toggleSimulationPlayPause();
    }
    
    // Advance by 1 degree
    let newPosition = (simulationPosition + 1) % simulationMaxPosition;
    const nextFrameIndex = Math.round((newPosition / 360) * (window.currentSimulation.positions.length - 1));
    
    // If next frame is locking, find a valid frame
    if (window.currentSimulation && window.currentSimulation.lockingFrames && 
        window.currentSimulation.lockingFrames[nextFrameIndex]) {
        const validFrameIndex = findNextValidFrame(nextFrameIndex);
        if (validFrameIndex !== -1) {
            newPosition = (validFrameIndex / (window.currentSimulation.positions.length - 1)) * 360;
        }
    }
    
    simulationPosition = newPosition;
    
    // Update slider and display
    document.getElementById('sim-position').value = Math.round(simulationPosition);
    document.getElementById('sim-position-display').textContent = `${Math.round(simulationPosition)}°`;
    
    // Update mechanism
    updateMechanismForPosition(simulationPosition);
    
    updateStatusMessage(`Step forward: ${Math.round(simulationPosition)}°`);
}

// Update step backward function to skip locking frames
function stepSimulationBackward() {
    if (!simulationMode) return;
    
    // If playing, pause first
    if (simulationPlaying) {
        toggleSimulationPlayPause();
    }
    
    // Step back by 1 degree
    let newPosition = (simulationPosition - 1 + simulationMaxPosition) % simulationMaxPosition;
    const prevFrameIndex = Math.round((newPosition / 360) * (window.currentSimulation.positions.length - 1));
    
    // If previous frame is locking, find a valid frame
    if (window.currentSimulation && window.currentSimulation.lockingFrames && 
        window.currentSimulation.lockingFrames[prevFrameIndex]) {
        const validFrameIndex = findPreviousValidFrame(prevFrameIndex);
        if (validFrameIndex !== -1) {
            newPosition = (validFrameIndex / (window.currentSimulation.positions.length - 1)) * 360;
        }
    }
    
    simulationPosition = newPosition;
    
    // Update slider and display
    document.getElementById('sim-position').value = Math.round(simulationPosition);
    document.getElementById('sim-position-display').textContent = `${Math.round(simulationPosition)}°`;
    
    // Update mechanism
    updateMechanismForPosition(simulationPosition);
    
    updateStatusMessage(`Step backward: ${Math.round(simulationPosition)}°`);
}

function prepareSimulation() {
    // Reset position
    simulationPosition = 0;
    document.getElementById('sim-position').value = 0;
    document.getElementById('sim-position-display').textContent = "0°";
    
    // Get current mechanism state
    const state = getMechanismState();
    
    // Check minimum requirements for simulation
    if (state.nodes.length < 2 || state.edges.length < 1) {
        showModal('Simulation Error', 'Cannot simulate: Mechanism needs at least 2 nodes and 1 edge.');
        exitSimulationMode();
        return false;
    }
    
    // Check for motor edge
    if (!motorEdge) {
        showModal('Simulation Error', 'Motor edge must be defined. Please select a motor edge connected to a ground node.');
        exitSimulationMode();
        return false;
    }
    
    // Add a locking indicator to the UI if it doesn't exist
    if (!document.getElementById('locking-indicator')) {
        const lockingIndicator = document.createElement('div');
        lockingIndicator.id = 'locking-indicator';
        lockingIndicator.className = 'locking-indicator';
        lockingIndicator.textContent = 'Mechanism is locking/has branch defect!';
        document.getElementById('canvas-container').appendChild(lockingIndicator);
    }
    
    // Run simulation with 360 steps (one per degree)
    const simulation = simulateMechanism(state, 360);
    
    // Check simulation validity
    if (!simulation.isValid) {
        showModal('Simulation Error', 'Cannot simulate: Mechanism is not valid for simulation. Mechanisms must have 1 DOF and be dyadic.', false);
        exitSimulationMode();
        return false;
    }
    
    // Show warning if mechanism has locking
    if (simulation.hasLocking) {
        const lockingIndicator = document.getElementById('locking-indicator');
        if (lockingIndicator) {
            lockingIndicator.classList.add('visible');
            setTimeout(() => lockingIndicator.classList.remove('visible'), 5000); // Auto-hide after 5 seconds
        }
        updateStatusMessage('Warning: Mechanism locks at certain positions');
    }
    
    // Draw simulated paths (appened first frame to end to create loop)
    drawSimulationPaths(simulation.positions.concat([simulation.positions[0]]), simulation.lockingFrames.concat([simulation.lockingFrames[0]]));
    
    // Store simulation data for later use
    window.currentSimulation = simulation;
    
    // Log simulation info
    console.log('Simulation prepared:', simulation);
    console.log('Motor edge:', motorEdge ? `Edge between ${motorEdge.getAttribute('data-start')} and ${motorEdge.getAttribute('data-end')}` : 'None');

    return true;
}

// Function to draw the simulated paths for each node
function drawSimulationPaths(positions, locking) {
    // Clear any existing paths
    clearSimulationPaths();
    
    // Create a group for the path elements
    const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pathsGroup.id = 'simulation-paths';
    canvas.appendChild(pathsGroup);
    
    // Get all nodes in the mechanism
    const nodes = Array.from(document.querySelectorAll('.node'));
    
    // Identify motor nodes
    let motorNodes = [];
    if (motorEdge) {
        const startNodeId = motorEdge.getAttribute('data-start');
        const endNodeId = motorEdge.getAttribute('data-end');
        motorNodes = [startNodeId, endNodeId];
    }
    
    // Draw path for each non-ground node
    nodes.forEach((node, index) => {
        // Skip ground nodes
        if (node.classList.contains('ground')) return;
        
        // Create path for this node
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Generate the SVG path data
        let pathData = "";
        let validPoints = 0;
        
        let currentPath = "";
        // Check if we have valid position data for this node
        positions.forEach((frame, frameIndex) => {
            const point = frame[index];
            const isValidPoint = point && !isNaN(point[0]) && !isNaN(point[1]);
            
            if (isValidPoint && !locking[frameIndex]) {
                // Start new path if we don't have one
                if (currentPath === "") {
                    currentPath = `M${point[0]},${point[1]} `;
                } else {
                    currentPath += `L${point[0]},${point[1]} `;
                }
                validPoints++;
            } else if (currentPath !== "") {
                // End current path segment and add to total path
                pathData += currentPath;
                currentPath = "";
            }
        });
        
        // Add final path segment if exists
        if (currentPath !== "") {
            pathData += currentPath;
        }
        
        // Only add path if it has valid points
        if (validPoints > 0) {
            // Get node's ID
            const nodeId = node.id;
            
            // Set properties on the path
            pathElement.setAttribute('d', pathData);
            pathElement.classList.add('simulation-path');
            pathElement.setAttribute('data-node-id', nodeId);
            
            // Check if this is a motor node or target node
            if (motorNodes.includes(nodeId)) {
                pathElement.classList.add('motor-path');
            }
            
            if (targetNode && nodeId === targetNode.id) {
                pathElement.classList.add('target-path');
                // Make sure we don't override the CSS class with inline styles
                // Remove any inline styles that might be overriding colors
                pathElement.style.removeProperty('stroke');
                pathElement.style.removeProperty('stroke-opacity');
            }
            
            // Add to the group
            pathsGroup.appendChild(pathElement);
        }
    });
}

// Clear all simulation paths
function clearSimulationPaths() {
    const pathsGroup = document.getElementById('simulation-paths');
    if (pathsGroup) {
        pathsGroup.remove();
    }
}

function setupMobileControls() {
    const mobileButtons = document.querySelectorAll('.mobile-btn');
    const toolNameDisplay = document.querySelector('.tool-name-display');
    
    mobileButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.getAttribute('data-tool');
            
            // Special handling for simulation toggle
            if (tool === 'toggle-simulation') {
                toggleSimulationMode();
                return;
            }
            
            // Skip if in simulation mode
            if (simulationMode) {
                updateStatusMessage('Exit simulation mode first to use design tools.');
                return;
            }
            
            // Remove active class from all buttons
            mobileButtons.forEach(b => b.classList.remove('active'));
            
            // Toggle tool state
            if (activeTool === tool) {
                activeTool = null;
                toolNameDisplay.textContent = 'Tool deselected';
            } else {
                activeTool = tool;
                btn.classList.add('active');
                
                // Update tool name display
                switch(tool) {
                  case 'add-ground':
                    toolNameDisplay.textContent = 'Ground Node';
                    break;
                  case 'add-node':
                    toolNameDisplay.textContent = 'Simple Node';
                    break;
                  case 'add-link':
                    toolNameDisplay.textContent = 'Linkage';
                    break;
                  case 'move':
                    toolNameDisplay.textContent = 'Move';
                    break;
                  case 'delete':
                    toolNameDisplay.textContent = 'Delete';
                    break;
                  case 'select-motor':
                    toolNameDisplay.textContent = 'Select Motor';
                    break;
                  case 'select-target':
                    toolNameDisplay.textContent = 'Select Target';
                    break;
                  default:
                    toolNameDisplay.textContent = 'Select a tool';
                }
            }
            
            // Update body classes and state
            document.body.classList.remove(
                'add-ground', 'add-node', 'add-link', 
                'move-tool', 'delete-tool', 'select-motor', 'select-target'
            );
            
            if (activeTool) {
                document.body.classList.add(
                  activeTool === 'move' ? 'move-tool' : activeTool
                );
            }
            
            // Cancel any ongoing edge drawing
            if (edgeDrawing) {
                cancelEdgeDrawing();
            }
            
            // Update status message
            updateToolStatusMessage();
        });
    });

    // Add event listeners for mobile file buttons
    const mobileFileButtons = document.querySelectorAll('.mobile-file-btn');
    
    mobileFileButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            
            // Skip if in simulation mode
            if (simulationMode) {
                updateStatusMessage('Exit simulation mode first to use file operations.');
                return;
            }
            
            // Handle file actions
            switch(action) {
                case 'save':
                    saveMechanism();
                    toolNameDisplay.textContent = 'Mechanism saved';
                    break;
                case 'load':
                    fileInput.click(); // Trigger the hidden file input
                    toolNameDisplay.textContent = 'Loading file...';
                    break;
                case 'reset':
                    showModal('Confirm Reset', 'Are you sure you want to reset the canvas? All unsaved changes will be lost.', true);
                    modalOkBtn.onclick = () => {
                        clearCanvas();
                        modal.style.display = 'none';
                        toolNameDisplay.textContent = 'Canvas reset';
                    };
                    break;
            }
        });
    });
}

// Set up event listeners for tool buttons
function bindToolButtons() {
    // Add elements tools
    document.getElementById('add-ground').addEventListener('click', () => setActiveTool('add-ground'));
    document.getElementById('add-node').addEventListener('click', () => setActiveTool('add-node'));
    document.getElementById('add-link').addEventListener('click', () => setActiveTool('add-link'));
    
    // Manipulate tools
    document.getElementById('move').addEventListener('click', () => setActiveTool('move'));
    document.getElementById('select-motor').addEventListener('click', () => setActiveTool('select-motor'));
    document.getElementById('select-target').addEventListener('click', () => setActiveTool('select-target'));
    
    // Edit tools
    document.getElementById('delete').addEventListener('click', () => setActiveTool('delete'));
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('redo').addEventListener('click', redo);
    
    // File tools
    document.getElementById('save').addEventListener('click', saveMechanism);
    document.getElementById('load').addEventListener('click', () => fileInput.click());
    document.getElementById('reset').addEventListener('click', resetCanvas);
    
    // File input change event
    fileInput.addEventListener('change', handleFileSelect);
}

// Set the active tool and update UI
function setActiveTool(tool) {
    if (simulationMode && tool !== null && tool !== 'toggle-simulation') {
        updateStatusMessage('Exit simulation mode first to use design tools.');
        return;
    }

    // clearTempSimulationPath();
    // Remove active class from all tools
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mobile-btn').forEach(btn => btn.classList.remove('active'));
    
    // Remove all tool-related body classes
    document.body.classList.remove(
        'add-ground', 'add-node', 'add-link', 
        'move-tool', 'delete-tool', 'select-motor', 'select-target'
    );
    
    // If clicking the active tool, deactivate it
    if (activeTool === tool) {
        activeTool = null;
        updateStatusMessage('Ready');
        // Update mobile tool display
        document.querySelector('.tool-name-display').textContent = 'Tool deselected';
        return;
    }
    
    // Set new active tool
    activeTool = tool;
    
    // Add active class to the selected tool in sidebar
    if (tool) {
        const sidebarBtn = document.getElementById(tool);
        if (sidebarBtn) sidebarBtn.classList.add('active');
        
        // Add active class to matching mobile button
        const mobileBtn = document.querySelector(`.mobile-btn[data-tool="${tool}"]`);
        if (mobileBtn) mobileBtn.classList.add('active');
        
        // Update mobile tool name display
        const toolNameDisplay = document.querySelector('.tool-name-display');
        if (toolNameDisplay) {
            switch(tool) {
                case 'add-ground':
                    toolNameDisplay.textContent = 'Ground Node';
                    break;
                case 'add-node':
                    toolNameDisplay.textContent = 'Simple Node';
                    break;
                case 'add-link':
                    toolNameDisplay.textContent = 'Linkage';
                    break;
                case 'move':
                    toolNameDisplay.textContent = 'Move';
                    break;
                case 'delete':
                    toolNameDisplay.textContent = 'Delete';
                    break;
                case 'select-motor':
                    toolNameDisplay.textContent = 'Select Motor';
                    break;
                case 'select-target':
                    toolNameDisplay.textContent = 'Select Target';
                    break;
                default:
                    toolNameDisplay.textContent = 'Select a tool';
            }
        }
        
        document.body.classList.add(tool === 'move' ? 'move-tool' : tool);
    }
    
    // Cancel any ongoing edge drawing
    if (edgeDrawing) {
        cancelEdgeDrawing();
    }
    
    // Update status message based on active tool
    updateToolStatusMessage();
}

function updateToolStatusMessage() {
    switch (activeTool) {
        case 'add-ground':
            updateStatusMessage('Click on the canvas to add a ground node.');
            break;
        case 'add-node':
            updateStatusMessage('Click on the canvas to add a simple node.');
            break;
        case 'add-link':
            updateStatusMessage('Click on two nodes to create a linkage between them.');
            break;
        case 'move':
            updateStatusMessage('Drag nodes to move them.');
            break;
        case 'select-motor':
            updateStatusMessage('Click on a linkage connected to a ground node to set it as the motor.');
            break;
        case 'select-target':
            updateStatusMessage('Click on a non-ground node to set it as the target output.');
            break;
        case 'delete':
            updateStatusMessage('Click on a node or linkage to delete it.');
            break;
        default:
            updateStatusMessage('Ready');
    }
}

// Set up keyboard shortcuts
function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape key to cancel current tool
        if (e.key === 'Escape') {
            setActiveTool(null);
            return;
        }
        
        // Prevent shortcut when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Tool shortcuts
        if (!e.ctrlKey && !e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'g': setActiveTool('add-ground'); break;
                case 'n': setActiveTool('add-node'); break;
                case 'l': setActiveTool('add-link'); break;
                case 'm': setActiveTool('move'); break;
                case 't': setActiveTool('select-target'); break;
                case 'delete': case 'backspace': setActiveTool('delete'); break;
                case 's': toggleSimulationMode(); break;
                case 'p': togglePreviewMode(); break;
            }
        }
        
        // Ctrl+key shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    undo();
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
                case 's':
                    e.preventDefault();
                    saveMechanism();
                    break;
                case 'o':
                    e.preventDefault();
                    fileInput.click();
                    break;
                case 'm':
                    e.preventDefault();
                    setActiveTool('select-motor');
                    break;
            }
        }
    });
}

// Set up canvas event handlers
function setupCanvasEvents() {
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}

// Modal event handlers
function setupModalEvents() {
    closeModal.addEventListener('click', () => modal.style.display = 'none');
    modalOkBtn.addEventListener('click', () => modal.style.display = 'none');
    modalCancelBtn.addEventListener('click', () => modal.style.display = 'none');
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Show modal with message
function showModal(title, message, showCancel = false) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalCancelBtn.style.display = showCancel ? 'block' : 'none';
    modal.style.display = 'block';
}

// Handle canvas click event
function handleCanvasClick(e) {
    // Get canvas-relative coordinates
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    switch (activeTool) {
        case 'add-ground':
            addGroundNode(x, y);
            break;
        case 'add-node':
            addSimpleNode(x, y);
            break;
    }
}

// Handle canvas mouse move
function handleCanvasMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    
    // Update coordinates display
    coordinatesDisplay.textContent = `X: ${x}, Y: ${y}`;
    
    // Handle temporary edge drawing when creating a link
    if (edgeDrawing && activeTool === 'add-link') {
        updateTempEdge(x, y);
    }
}

// Add a ground node at the specified position
function addGroundNode(x, y) {
    if (activeTool !== 'add-ground') return;
    
    currentNodeId = getNextNodeId();
    nodeCount++;
    
    // Create node element
    const node = document.createElement('div');
    node.id = `Node${currentNodeId}`;
    node.className = 'node ground';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.innerHTML = `<i class="fas fa-anchor"></i>`;
    
    // Add event listeners
    setupNodeEventListeners(node);
    
    // Add to container
    nodesContainer.appendChild(node);
    addToHistory();

    // Update DOF
    updateDOF();
    updateStatusMessage(`Ground node ${currentNodeId} added.`);
}

// Add a simple node at the specified position
function addSimpleNode(x, y) {
    if (activeTool !== 'add-node') return;
    
    currentNodeId = getNextNodeId();
    nodeCount++;
    
    // Create node element
    const node = document.createElement('div');
    node.id = `Node${currentNodeId}`;
    node.className = 'node';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.innerHTML = `<span>${currentNodeId}</span>`;
    
    // Add event listeners
    setupNodeEventListeners(node);
    
    // Add to container
    nodesContainer.appendChild(node);
    addToHistory();

    // Update DOF
    updateDOF();
    updateStatusMessage(`Node ${currentNodeId} added.`);
}

function setupNodeEventListeners(node) {
    // Node click/touch handler
    const handleNodeAction = (e) => {
        e.stopPropagation();
        
        switch (activeTool) {
            case 'add-link':
                handleNodeClickForLinking(node);
                break;
            case 'delete':
                deleteNode(node);
                break;
            case 'select-target':
                if (!node.classList.contains('ground')) {
                    setTargetNode(node);
                }
                break;
        }
    };
    
    // Add both click and touch events
    node.addEventListener('click', handleNodeAction);
    node.addEventListener('touchend', (e) => {
        // Prevent default only if it's not move mode
        if (activeTool !== 'move') {
            e.preventDefault();
            handleNodeAction(e);
        }
    });
    
    // Make node draggable
    makeDraggable(node);
}

// Handle node click when in add-link mode
function handleNodeClickForLinking(node) {
    if (!edgeDrawing) {
        // Start drawing edge from this node
        startEdgeDrawing(node);
    } else {
        // Complete edge to this node
        endEdgeDrawing(node);
    }
}

// Start drawing an edge from a node
function startEdgeDrawing(node) {
    edgeDrawing = true;
    activeEdgeStartNode = node;
    
    // Create temporary SVG line
    const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempLine.id = 'temp-edge';
    tempLine.setAttribute('stroke', 'var(--accent-primary)');
    tempLine.setAttribute('stroke-width', '3');
    tempLine.setAttribute('stroke-dasharray', '5,3');
    
    // Get node position (center)
    const nodeRect = node.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x1 = nodeRect.left + nodeRect.width / 2 - canvasRect.left;
    const y1 = nodeRect.top + nodeRect.height / 2 - canvasRect.top;
    
    tempLine.setAttribute('x1', x1);
    tempLine.setAttribute('y1', y1);
    tempLine.setAttribute('x2', x1);
    tempLine.setAttribute('y2', y1);
    
    canvas.appendChild(tempLine);
    
    updateStatusMessage('Click on another node to complete the link.');
}

// Update temporary edge while drawing
function updateTempEdge(x, y) {
    const tempLine = document.getElementById('temp-edge');
    if (tempLine) {
        tempLine.setAttribute('x2', x);
        tempLine.setAttribute('y2', y);
    }
}

// End edge drawing by connecting to a target node
// End edge drawing by connecting to a target node
function endEdgeDrawing(targetNode) {
    // Check if trying to connect a node to itself
    if (activeEdgeStartNode === targetNode) {
        cancelEdgeDrawing();
        updateStatusMessage('Cannot connect a node to itself.');
        return;
    }
    
    // Get node IDs
    const startNodeId = parseInt(activeEdgeStartNode.id.substring(4));
    const endNodeId = parseInt(targetNode.id.substring(4));
    
    // Check if edge already exists
    if (edgeExists(startNodeId, endNodeId)) {
        cancelEdgeDrawing();
        updateStatusMessage('Edge already exists between these nodes.');
        return;
    }

    // Create edge group to hold visible edge and hitbox
    const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgeGroup.id = `edge_group_${startNodeId}_${endNodeId}`;
    
    // Create visible edge
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    edge.id = `edge_${startNodeId}_${endNodeId}`;
    edge.classList.add('link');
    
    // Create invisible hitbox for easier selection
    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hitbox.classList.add('link-hitbox');
    
    // Get node positions (center)
    const startRect = activeEdgeStartNode.getBoundingClientRect();
    const endRect = targetNode.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const x1 = startRect.left + startRect.width / 2 - canvasRect.left;
    const y1 = startRect.top + startRect.height / 2 - canvasRect.top;
    const x2 = endRect.left + endRect.width / 2 - canvasRect.left;
    const y2 = endRect.top + endRect.height / 2 - canvasRect.top;
    
    // Set attributes for both visible edge and hitbox
    [edge, hitbox].forEach(element => {
        element.setAttribute('x1', x1);
        element.setAttribute('y1', y1);
        element.setAttribute('x2', x2);
        element.setAttribute('y2', y2);
        element.setAttribute('data-start', `Node${startNodeId}`);
        element.setAttribute('data-end', `Node${endNodeId}`);
    });
    
    // Add edge and hitbox to group
    edgeGroup.appendChild(edge);
    edgeGroup.appendChild(hitbox);
    
    // Add group to canvas
    canvas.appendChild(edgeGroup);
    
    // Add edge to edges array
    edges.push([startNodeId, endNodeId]);
    
    // Add event listener for hitbox (easier to click)
    hitbox.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdgeClick(edge);
    });
    
    // Also add event listener to visible edge
    edge.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdgeClick(edge);
    });
    
    // Clean up temp edge
    const tempEdge = document.getElementById('temp-edge');
    if (tempEdge) {
        tempEdge.remove();
    }
    
    edgeDrawing = false;
    activeEdgeStartNode = null;
    addToHistory();

    // Update DOF
    updateDOF();
    updateStatusMessage(`Link created between nodes ${startNodeId} and ${endNodeId}.`);
}

// Add a new function to handle edge clicks
function handleEdgeClick(edge) {
    if (activeTool === 'delete') {
        deleteEdge(edge);
    } else if (activeTool === 'select-motor') {
        setMotorEdge(edge);
    }
}

// Cancel edge drawing
function cancelEdgeDrawing() {
    const tempEdge = document.getElementById('temp-edge');
    if (tempEdge) {
        tempEdge.remove();
    }
    
    edgeDrawing = false;
    activeEdgeStartNode = null;
}

// Check if an edge already exists between two nodes
function edgeExists(nodeId1, nodeId2) {
    return edges.some(edge => 
        (edge[0] === nodeId1 && edge[1] === nodeId2) || 
        (edge[0] === nodeId2 && edge[1] === nodeId1)
    );
}

// Make a node element draggable
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    element.onmousedown = dragMouseDown;
    element.ontouchstart = dragTouchStart;
    
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        
        // Only allow dragging in move mode
        if (activeTool !== 'move') return;
        
        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set flag that we're currently moving
        isCurrentlyMoving = true;
        
        // Clear any existing temp path
        // clearTempSimulationPath();
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function dragTouchStart(e) {
        // Only allow dragging in move mode
        if (activeTool !== 'move') return;
        
        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        
        // Set flag that we're currently moving
        isCurrentlyMoving = true;
        
        // Clear any existing temp path
        // clearTempSimulationPath();
        
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
        
        // Prevent page scrolling while dragging
        e.preventDefault();
    }
    
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        
        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Get current position
        const currentLeft = parseInt(element.style.left) || 0;
        const currentTop = parseInt(element.style.top) || 0;
        
        // Set the element's new position
        const newLeft = currentLeft - pos1;
        const newTop = currentTop - pos2;
        
        // Apply bounds checking
        if (newTop >= 0 && newTop <= canvas.clientHeight - 30) {
            element.style.top = `${newTop}px`;
        }
        
        if (newLeft >= 0 && newLeft <= canvas.clientWidth - 30) {
            element.style.left = `${newLeft}px`;
        }
        
        // Update connected edges
        updateConnectedEdges(element);
        
        // Schedule simulation update (debounced to avoid too many simulations)
        scheduleMoveSim();
    }
    
    function elementTouchDrag(e) {
        const touch = e.touches[0];
        
        // Calculate the new touch position
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        
        // Get current position
        const currentLeft = parseInt(element.style.left) || 0;
        const currentTop = parseInt(element.style.top) || 0;
        
        // Set the element's new position
        const newLeft = currentLeft - pos1;
        const newTop = currentTop - pos2;
        
        // Apply bounds checking
        if (newTop >= 0 && newTop <= canvas.clientHeight - 30) {
            element.style.top = `${newTop}px`;
        }
        
        if (newLeft >= 0 && newLeft <= canvas.clientWidth - 30) {
            element.style.left = `${newLeft}px`;
        }
        
        // Update connected edges
        updateConnectedEdges(element);
        
        // Schedule simulation update (debounced to avoid too many simulations)
        scheduleMoveSim();
        
        // Prevent page scrolling while dragging
        e.preventDefault();
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
        
        // Clear the moving flag
        isCurrentlyMoving = false;
        
        // Clear any simulation timeouts
        if (moveSimulationTimeout) {
            clearTimeout(moveSimulationTimeout);
            moveSimulationTimeout = null;
        }
        
        // Run a final simulation with more steps for better accuracy
        runMoveSimulation(200);
        
        addToHistory();
    }
}

function scheduleMoveSim() {
    if (moveSimulationTimeout) {
        clearTimeout(moveSimulationTimeout);
    }
    
    moveSimulationTimeout = setTimeout(() => {
        // Run simulation with fewer steps during movement for better performance
        runMoveSimulation(200);
    }, 0); // 50ms debounce
}


function runMoveSimulation(numSteps = 200) {
    // Only run if we have a target node
    if (!previewmode) return;
    
    // Get current mechanism state
    const state = getMechanismState();
    
    // Check minimum requirements for simulation
    if (state.nodes.length < 2 || state.edges.length < 1) {
        return;
    }
    
    // Check for motor edge
    if (!motorEdge) {
        return;
    }
    
    // Run simulation with fewer steps for performance
    try {
        const simulation = simulateMechanism(state, numSteps);
        
        // If simulation is valid, draw the target path
        if (simulation.isValid) {
            drawTempTargetPath(simulation.positions, simulation.lockingFrames, targetNode);
        }
    } catch (error) {
        console.log('Move simulation error:', error);
        // Silent fail - don't interrupt the user's movement
    }
}

function drawTempTargetPath(positions, lockingFrames, targetNode) {
    // Clear any existing temp path
    clearTempSimulationPath();
    
    // Create a temporary group for all paths
    const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pathsGroup.id = 'temp-simulation-path';
    
    // Get all non-ground nodes
    const nodes = Array.from(document.querySelectorAll('.node')).filter(node => !node.classList.contains('ground'));
    
    // Get motor nodes
    let motorNodes = [];
    if (motorEdge) {
        const startNodeId = motorEdge.getAttribute('data-start');
        const endNodeId = motorEdge.getAttribute('data-end');
        motorNodes = [startNodeId, endNodeId];
    }
    
    // Draw path for each non-ground node
    nodes.forEach(node => {
        // Create path for this node
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.classList.add('simulation-path'); // Use simulation-path class for all paths
        
        // Get node's numeric ID
        const nodeId = parseInt(node.id.substring(4));
        
        // Generate the SVG path data
        let pathData = "";
        let validPoints = 0;
        let currentPath = "";
        
        // Generate path data points
        positions.forEach((frame, frameIndex) => {
            const point = frame[nodeId];
            const isValidPoint = point && !isNaN(point[0]) && !isNaN(point[1]);
            
            if (isValidPoint && !lockingFrames[frameIndex]) {
                if (currentPath === "") {
                    currentPath = `M${point[0]},${point[1]} `;
                } else {
                    currentPath += `L${point[0]},${point[1]} `;
                }
                validPoints++;
            } else if (currentPath !== "") {
                pathData += currentPath;
                currentPath = "";
            }
        });
        
        // Add final path segment
        if (currentPath !== "") {
            pathData += currentPath;
        }
        
        // Only add path if it has valid points
        if (validPoints > 0) {
            pathElement.setAttribute('d', pathData);
            pathElement.setAttribute('data-node-id', node.id);
            
            // Remove any inline opacity that might override CSS
            pathElement.style.removeProperty('stroke-opacity');
            
            // Add appropriate classes
            if (motorNodes.includes(node.id)) {
                pathElement.classList.add('motor-path');
            }
            if (node === targetNode) {
                pathElement.classList.add('target-path');
                // Make sure we don't override the CSS class with inline styles
                pathElement.style.removeProperty('stroke');
            }
            
            // Add to group
            pathsGroup.appendChild(pathElement);
        }
    });
    
    // Add group to canvas if it has children
    if (pathsGroup.children.length > 0) {
        canvas.appendChild(pathsGroup);
    }
}

function clearTempSimulationPath() {
    const tempPath = document.getElementById('temp-simulation-path');
    if (tempPath) {
        tempPath.remove();
    }
}



// Update the positions of edges connected to a node
function updateConnectedEdges(node) {
    const nodeId = node.id;
    
    // Get node center position relative to canvas
    const nodeLeft = parseInt(node.style.left) || 0;
    const nodeTop = parseInt(node.style.top) || 0;
    const x = nodeLeft; // 15 is half of the node width (30px)
    const y = nodeTop;  // 15 is half of the node height (30px)
    
    // Update all lines (both visible edges and hitboxes) connected to this node
    const updateLine = (element) => {
        if (element.getAttribute('data-start') === nodeId) {
            element.setAttribute('x1', x);
            element.setAttribute('y1', y);
        }
        
        if (element.getAttribute('data-end') === nodeId) {
            element.setAttribute('x2', x);
            element.setAttribute('y2', y);
        }
    };
    
    // Get all lines (both visible edges and hitboxes)
    document.querySelectorAll('.link, .link-hitbox').forEach(updateLine);
}

// Delete a node and all connected edges
function deleteNode(node) {
    if (activeTool !== 'delete') return;
    
    addToHistory();
    
    const nodeId = node.id;
    const numericId = parseInt(nodeId.substring(4));
    
    // Remove all edges connected to this node
    const startEdges = document.querySelectorAll(`[data-start="${nodeId}"]`);
    const endEdges = document.querySelectorAll(`[data-end="${nodeId}"]`);
    
    startEdges.forEach(edge => {
        const endNodeId = parseInt(edge.getAttribute('data-end').substring(4));
        // Remove from edges array
        edges = edges.filter(e => !(e[0] === numericId && e[1] === endNodeId) && !(e[0] === endNodeId && e[1] === numericId));
        edge.remove();
    });
    
    endEdges.forEach(edge => {
        const startNodeId = parseInt(edge.getAttribute('data-start').substring(4));
        // Remove from edges array
        edges = edges.filter(e => !(e[0] === startNodeId && e[1] === numericId) && !(e[0] === numericId && e[1] === startNodeId));
        edge.remove();
    });
    
    // Remove node
    node.remove();
    nodeCount--;
    
    // If this was the target node, clear target
    if (targetNode === node) {
        targetNode = null;
    }
    
    updateDOF();
    updateStatusMessage(`Node ${numericId} deleted.`);
}

// Delete an edge
function deleteEdge(edge) {
    if (activeTool !== 'delete') return;
    
    addToHistory();
    
    const startNodeId = parseInt(edge.getAttribute('data-start').substring(4));
    const endNodeId = parseInt(edge.getAttribute('data-end').substring(4));
    
    // Get position for feedback before removing
    const x = (parseInt(edge.getAttribute('x1')) + parseInt(edge.getAttribute('x2'))) / 2;
    const y = (parseInt(edge.getAttribute('y1')) + parseInt(edge.getAttribute('y2'))) / 2;
    
    // Remove from edges array
    edges = edges.filter(e => !(e[0] === startNodeId && e[1] === endNodeId) && !(e[0] === endNodeId && e[1] === startNodeId));
    
    // Find and remove the edge group
    const edgeGroup = document.getElementById(`edge_group_${startNodeId}_${endNodeId}`) || 
                      document.getElementById(`edge_group_${endNodeId}_${startNodeId}`);
    
    if (edgeGroup) {
        edgeGroup.remove();
    } else {
        // Fallback for older edges without groups
        edge.remove();
    }
    
    // If this was the motor edge, clear motor
    if (motorEdge === edge) {
        motorEdge = null;
    }
    
    // Add feedback
    // addTouchFeedback(x, y, `Link deleted: ${startNodeId}-${endNodeId}`, 'var(--danger)');
    
    updateDOF();
    updateStatusMessage(`Link between nodes ${startNodeId} and ${endNodeId} deleted.`);
}

// Set an edge as the motor
function setMotorEdge(edge) {
    if (activeTool !== 'select-motor') return;
    
    // Check if edge is connected to at least one ground node
    const startNodeId = edge.getAttribute('data-start');
    const endNodeId = edge.getAttribute('data-end');
    
    const startNode = document.getElementById(startNodeId);
    const endNode = document.getElementById(endNodeId);
    
    if (!startNode.classList.contains('ground') && !endNode.classList.contains('ground')) {
        updateStatusMessage('Motor must be connected to at least one ground node.');
        return;
    }
    
    // Remove motor class from current motor edge
    if (motorEdge) {
        motorEdge.classList.remove('motor');
    }
    
    // Set new motor edge
    motorEdge = edge;
    edge.classList.add('motor');
    
    addToHistory();
    updateStatusMessage(`Motor set to link between nodes ${startNodeId.substring(4)} and ${endNodeId.substring(4)}.`);
}

// Replace the addTouchFeedback function with this improved version
function addTouchFeedback(x, y, message, color = 'var(--success)') {
    const feedback = document.createElement('div');
    feedback.className = 'touch-feedback';
    feedback.textContent = message;
    feedback.style.left = `${x - 50}px`; // Center horizontally
    feedback.style.top = `${y - 30}px`;  // Position above the touch point
    feedback.style.backgroundColor = color;
    
    document.body.appendChild(feedback);
    
    // Show feedback and animate
    requestAnimationFrame(() => {
        feedback.classList.add('visible');
        
        // Remove after animation completes
        setTimeout(() => {
            feedback.classList.remove('visible');
            
            // Wait for fade out before removing from DOM
            setTimeout(() => {
                feedback.remove();
            }, 300);
        }, 1500);
    });
    
    return feedback; // Return element for potential future reference
}

// Set a node as the target
function setTargetNode(node) {
    if (activeTool !== 'select-target') return;
    
    if (node.classList.contains('ground')) {
        updateStatusMessage('Cannot set ground node as target.');
        return;
    }
    
    // Remove target class from current target node
    if (targetNode) {
        targetNode.classList.remove('target');
    }
    
    // Set new target node
    targetNode = node;
    node.classList.add('target');
    addToHistory();
    
    updateStatusMessage(`Target set to node ${node.id.substring(4)}.`);
}

// Get the next available node ID
function getNextNodeId() {
    const existingNodes = Array.from(document.querySelectorAll('.node'))
        .map(node => parseInt(node.id.substring(4)));
    
    if (existingNodes.length === 0) return 0;
    
    for (let i = 0; i <= Math.max(...existingNodes) + 1; i++) {
        if (!existingNodes.includes(i)) {
            return i;
        }
    }
    
    return Math.max(...existingNodes) + 1;
}

// Update DOF (Degrees of Freedom) display
function updateDOF() {
    const groundNodes = document.querySelectorAll('.node.ground').length;
    const regularNodes = nodeCount - groundNodes;
    
    mobilityDOF = 3 * (regularNodes) - 2 * edges.length - 3 * groundNodes;
    dofValue.textContent = mobilityDOF;
}

// Update status message
function updateStatusMessage(message) {
    statusMessage.textContent = message;
}

// Add current state to history
function addToHistory(cutoff = true) {
    const state = getMechanismState();

    clearTempSimulationPath();
    runMoveSimulation(200);
    // Add state to history at current position
    currentHistoryIndex++;
    operationHistory[currentHistoryIndex] = state;
    
    // If we're cutting off future history (normal operation)
    if (cutoff) {
        operationHistory.splice(currentHistoryIndex + 1);
    }

    
}

// Undo operation
function undo() {
    if (currentHistoryIndex <= 0) {
        updateStatusMessage('Nothing to undo.');
        return;
    }
    
    currentHistoryIndex--;
    loadMechanismState(operationHistory[currentHistoryIndex]);
    clearTempSimulationPath();
    runMoveSimulation(200);
    updateStatusMessage('Undo successful.');
}

// Redo operation
function redo() {
    if (currentHistoryIndex >= operationHistory.length - 1) {
        updateStatusMessage('Nothing to redo.');
        return;
    }
    
    currentHistoryIndex++;
    loadMechanismState(operationHistory[currentHistoryIndex]);
    clearTempSimulationPath();
    runMoveSimulation(200);
    updateStatusMessage('Redo successful.');
}

// Update the getMechanismState function to properly capture all state
function getMechanismState() {
    // Get node positions
    const nodes = Array.from(document.querySelectorAll('.node')).map(node => {
        return {
            id: parseInt(node.id.substring(4)),
            x: parseInt(node.style.left),
            y: parseInt(node.style.top),
            isGround: node.classList.contains('ground'),
            isTarget: node.classList.contains('target')
        };
    });
    
    // Get edges
    const currentEdges = [...edges].map(edge => {
        // Look for edge element in both possible orders
        const edgeElement = document.getElementById(`edge_${edge[0]}_${edge[1]}`) || 
                            document.getElementById(`edge_${edge[1]}_${edge[0]}`);
        
        return {
            nodeIds: [edge[0], edge[1]],
            isMotor: edgeElement ? edgeElement.classList.contains('motor') : false
        };
    });
    
    return {
        nodes: nodes,
        edges: currentEdges,
        nodeCount: nodeCount
    };
}

// Update the loadMechanismState function to properly restore edges
function loadMechanismState(state) {
    // Clear current canvas
    clearCanvas(false);
    
    // Set node count
    nodeCount = state.nodeCount;
    
    // Add nodes
    state.nodes.forEach(node => {
        if (node.isGround) {
            const groundNode = document.createElement('div');
            groundNode.id = `Node${node.id}`;
            groundNode.className = 'node ground';
            if (node.isTarget) groundNode.classList.add('target');
            groundNode.style.left = `${node.x}px`;
            groundNode.style.top = `${node.y}px`;
            groundNode.innerHTML = `<i class="fas fa-anchor"></i>`;
            
            setupNodeEventListeners(groundNode);
            nodesContainer.appendChild(groundNode);
            
            if (node.isTarget) targetNode = groundNode;
        } else {
            const simpleNode = document.createElement('div');
            simpleNode.id = `Node${node.id}`;
            simpleNode.className = 'node';
            if (node.isTarget) simpleNode.classList.add('target');
            simpleNode.style.left = `${node.x}px`;
            simpleNode.style.top = `${node.y}px`;
            simpleNode.innerHTML = `<span>${node.id}</span>`;
            
            setupNodeEventListeners(simpleNode);
            nodesContainer.appendChild(simpleNode);
            
            if (node.isTarget) targetNode = simpleNode;
        }
    });
    
    // Reset edges array before adding edges from the state
    edges = [];
    
    // Add edges
    state.edges.forEach(edge => {
        const [startId, endId] = edge.nodeIds;
        const startNode = document.getElementById(`Node${startId}`);
        const endNode = document.getElementById(`Node${endId}`);
        
        if (startNode && endNode) {
            // Create edge group
            const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            edgeGroup.id = `edge_group_${startId}_${endId}`;
            
            // Get node positions
            const x1 = parseInt(startNode.style.left) || 0;
            const y1 = parseInt(startNode.style.top) || 0;
            const x2 = parseInt(endNode.style.left) || 0;
            const y2 = parseInt(endNode.style.top) || 0;
            
            // Create visible edge
            const svgEdge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            svgEdge.id = `edge_${startId}_${endId}`;
            svgEdge.classList.add('link');
            
            svgEdge.setAttribute('x1', x1);
            svgEdge.setAttribute('y1', y1);
            svgEdge.setAttribute('x2', x2);
            svgEdge.setAttribute('y2', y2);
            svgEdge.setAttribute('data-start', `Node${startId}`);
            svgEdge.setAttribute('data-end', `Node${endId}`);
            
            // Add to group
            edgeGroup.appendChild(svgEdge);
            
            // If it's a motor, add the class
            if (edge.isMotor) {
                svgEdge.classList.add('motor');
                motorEdge = svgEdge;
            }
            
            // Create hitbox
            const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hitbox.classList.add('link-hitbox');
            
            hitbox.setAttribute('x1', x1);
            hitbox.setAttribute('y1', y1);
            hitbox.setAttribute('x2', x2);
            hitbox.setAttribute('y2', y2);
            hitbox.setAttribute('data-start', `Node${startId}`);
            hitbox.setAttribute('data-end', `Node${endId}`);
            
            // Add to group
            edgeGroup.appendChild(hitbox);
            
            // Add event listeners
            hitbox.addEventListener('click', (e) => {
                e.stopPropagation();
                handleEdgeClick(svgEdge);
            });
            
            svgEdge.addEventListener('click', (e) => {
                e.stopPropagation();
                handleEdgeClick(svgEdge);
            });
            
            // Add touch event listeners for mobile
            hitbox.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleEdgeClick(svgEdge);
                
                // Add touch feedback
                const canvasRect = canvas.getBoundingClientRect();
                const touch = e.changedTouches[0];
                const touchX = touch.clientX - canvasRect.left;
                const touchY = touch.clientY - canvasRect.top;
                // addTouchFeedback(touchX, touchY, 'Link selected');
            });
            
            // Add full group to canvas
            canvas.appendChild(edgeGroup);
            
            // Add to edges array - ensure this happens for proper state tracking
            edges.push([startId, endId]);
        }
    });
    
    // Update the positions of all edges
    document.querySelectorAll('.node').forEach(node => {
        updateConnectedEdges(node);
    });
    
    updateDOF();
}

// Clear the canvas
function clearCanvas(addToHist = true) {
    if (addToHist) {
        addToHistory();
    }
    
    // Remove all nodes
    while (nodesContainer.firstChild) {
        nodesContainer.removeChild(nodesContainer.firstChild);
    }
    
    // Remove all edges (except temp-edge)
    Array.from(canvas.children).forEach(child => {
        if (child.id !== 'temp-edge') {
            canvas.removeChild(child);
        }
    });
    
    // Reset variables
    nodeCount = 0;
    edges = [];
    motorEdge = null;
    targetNode = null;
    
    updateDOF();
    updateStatusMessage('Canvas cleared.');
}

// Reset the canvas
function resetCanvas() {
    showModal('Confirm Reset', 'Are you sure you want to reset the canvas? All unsaved changes will be lost.', true);
    
    modalOkBtn.onclick = () => {
        clearCanvas();
        modal.style.display = 'none';
    };
}

// Save mechanism to JSON file
function saveMechanism() {
    const state = getMechanismState();
    
    // Convert to JSON
    const jsonStr = JSON.stringify(state, null, 2);
    
    // Create download link
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mechanism.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateStatusMessage('Mechanism saved.');
}

// Handle file select for loading
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const state = JSON.parse(e.target.result);
            
            // Validate required structure
            if (!state.nodes || !state.edges || state.nodeCount === undefined) {
                throw new Error('Invalid file format.');
            }
            
            // rescale the mechanism to fit and be centered
            const nodeCount = state.nodes.length;
            const canvasRect = canvas.getBoundingClientRect();
            const centerX = canvasRect.width / 2;
            const centerY = canvasRect.height / 2;
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            state.nodes.forEach(node => {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x);
                maxY = Math.max(maxY, node.y);
            });

            const width = maxX - minX;
            const height = maxY - minY;
            const scale = Math.min(canvasRect.width / width, canvasRect.height / height) * 0.5;
            const offsetX = centerX - (minX + maxX) / 2 * scale;
            const offsetY = centerY - (minY + maxY) / 2 * scale;

            state.nodes.forEach(node => {
                node.x = node.x * scale + offsetX;
                node.y = node.y * scale + offsetY;
            });

            loadMechanismState(state);
            addToHistory();
            updateStatusMessage('Mechanism loaded successfully.');
        } catch (error) {
            showModal('Error', 'Failed to load mechanism: ' + error.message);
        }
    };
    
    reader.readAsText(file);
    
    // Reset file input value so the same file can be loaded again
    fileInput.value = '';
}

// Calculate distance between two points
function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Preview Mode Toggle Function
function togglePreviewMode() {
    previewmode = !previewmode;
    
    // Update UI
    const previewButton = document.getElementById('toggle-preview');
    const mobilePreviewButton = document.querySelector('.mobile-btn[data-tool="toggle-preview"]');
    
    if (previewmode) {
        previewButton.classList.add('preview-active');
        if (mobilePreviewButton) mobilePreviewButton.classList.add('preview-active');
        
        // Show indicator
        // showPreviewModeIndicator();
        
        // Generate initial preview
        runMoveSimulation(200);
        
        updateStatusMessage('Preview mode active. Move elements to see mechanism paths.');
    } else {
        previewButton.classList.remove('preview-active');
        if (mobilePreviewButton) mobilePreviewButton.classList.remove('preview-active');
        
        // Clear temp paths
        clearTempSimulationPath();
        
        // Hide indicator
        // hidePreviewModeIndicator();
        
        updateStatusMessage('Preview mode disabled.');
    }
}

// Function to show preview mode indicator
function showPreviewModeIndicator() {
    // Create indicator if it doesn't exist
    if (!document.getElementById('preview-mode-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'preview-mode-indicator';
        indicator.className = 'preview-mode-indicator';
        indicator.textContent = 'Preview Mode Active';
        document.getElementById('canvas-container').appendChild(indicator);
    }
    
    // Show the indicator
    const indicator = document.getElementById('preview-mode-indicator');
    indicator.classList.add('visible');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 3000);
}

// Function to hide preview mode indicator
function hidePreviewModeIndicator() {
    const indicator = document.getElementById('preview-mode-indicator');
    if (indicator) {
        indicator.classList.remove('visible');
    }
}

function startQuickSim() {
    // If already in simulation mode or quick sim mode, ignore
    if (simulationMode || quickSimMode) return;
    
    // Reset traced path points
    tracedPathPoints = {};
    
    // Clear any existing paths
    clearTempSimulationPath();
    
    // Add quick-sim-mode class to body
    document.body.classList.add('quick-sim-mode');
    
    // Get current mechanism state
    const state = getMechanismState();
    
    // Check minimum requirements for simulation
    if (state.nodes.length < 2 || state.edges.length < 1) {
        showModal('Quick Sim Error', 'Cannot simulate: No mechanism defined. Please add nodes and links first.');
        return;
    }
    
    // Check for motor edge
    if (!motorEdge) {
        showModal('Quick Sim Error', 'No motor edge defined. Please select a motor edge (connected to ground) to drive the mechanism.');
        return;
    }
    
    // Run simulation with fewer steps for performance
    try {
        const simulation = simulateMechanism(state, 360);
        
        // If simulation is valid, store it for later use
        if (simulation.isValid) {
            window.currentSimulation = simulation;
        } else {
            showModal('Quick Sim Error', 'Cannot simulate: Mechanism is not valid for simulation.', false);
            endQuickSim();
            return;
        }
    } catch (error) {
        console.log('Quick sim error:', error);
        endQuickSim();
        return;
    }
    
    // Find current angle of motor edge
    const startNode = motorEdge.getAttribute('data-start');
    const endNode = motorEdge.getAttribute('data-end');
    let startNodeId = parseInt(startNode.substring(4));
    let endNodeId = parseInt(endNode.substring(4));

    // Swap so that ground node is always start node
    if (!state.nodes[startNodeId].isGround) {
        const temp = startNodeId;
        startNodeId = endNodeId;
        endNodeId = temp;
    }

    const dx = state.nodes[endNodeId].x - state.nodes[startNodeId].x;
    const dy = state.nodes[endNodeId].y - state.nodes[startNodeId].y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) {
        angle += 360;
    }
    
    // Store as our start angle - we'll use this to determine when we've completed a cycle
    quickSimStartAngle = angle;
    
    // Set the simulation position to the angle of the motor edge
    simulationPosition = angle;
    
    // Update status message
    updateStatusMessage('Quick simulation running... (Animation will trace paths as it moves)');
    
    // Start the quick sim animation
    quickSimMode = true;
    quickSimCompleted = false;
    animation_inverted = false;  // Start in forward direction
    lastTimestamp = 0;

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.add('disabled');
    });

    document.querySelectorAll('.mobile-btn').forEach(btn => {
        btn.classList.add('disabled');
    });

    document.body.classList.add('controls-disabled');

    savedTool = activeTool;
    activeTool = null;
    
    // Cancel any ongoing animation
    if (quickSimAnimationId) {
        cancelAnimationFrame(quickSimAnimationId);
    }
    
    // Start a new animation
    quickSimAnimationId = requestAnimationFrame(quickSimAnimationLoop);
}

let tracedPathPoints = {};

// 2. Modify quickSimAnimationLoop to build and draw the path as we go
function quickSimAnimationLoop(timestamp) {
    // Skip first frame for accurate timing
    if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
        
        // Initialize traced path points if not already done
        if (Object.keys(tracedPathPoints).length === 0) {
            // Get all non-ground nodes
            const nodes = Array.from(document.querySelectorAll('.node')).filter(node => !node.classList.contains('ground'));
            
            // Initialize empty array for each node
            nodes.forEach(node => {
                const nodeId = parseInt(node.id.substring(4));
                tracedPathPoints[nodeId] = [];
            });
        }
        
        quickSimAnimationId = requestAnimationFrame(quickSimAnimationLoop);
        return;
    }
    
    // Calculate time delta and update position based on speed
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    
    // Use a fixed speed for quick sim
    const quickSimSpeed = 20;
    
    // Calculate new position
    const degreesPerFrame = (deltaTime * animationSpeed * quickSimSpeed / 50);
    let newPosition = (simulationPosition + degreesPerFrame * (animation_inverted ? -1 : 1)) % simulationMaxPosition;
    
    if (newPosition < 0) {
        newPosition += simulationMaxPosition;
    }
    
    // Check if the next position would enter a locking region
    const nextFrameIndex = Math.round((newPosition / 360) * (window.currentSimulation.positions.length - 1));
    
    // If moving to a locking frame, reverse direction
    if (window.currentSimulation.lockingFrames[nextFrameIndex]) {
        animation_inverted = !animation_inverted;
        newPosition = (simulationPosition + degreesPerFrame * (animation_inverted ? -1 : 1)) % simulationMaxPosition;
        
        if (newPosition < 0) {
            newPosition += simulationMaxPosition;
        }
    }
    
    simulationPosition = newPosition;
    
    // Get the current frame from the simulation
    const currentFrameIndex = Math.round((newPosition / 360) * (window.currentSimulation.positions.length - 1));
    const currentFrame = window.currentSimulation.positions[currentFrameIndex];
    
    // Skip if frame is invalid or has locking
    if (!window.currentSimulation.lockingFrames[currentFrameIndex]) {
        // Add current position to traced path for each node
        Object.keys(tracedPathPoints).forEach(nodeId => {
            const position = currentFrame[parseInt(nodeId)];
            if (position && !isNaN(position[0]) && !isNaN(position[1])) {
                // Check if this point is already in our traced path
                const lastPoint = tracedPathPoints[nodeId][tracedPathPoints[nodeId].length - 1];
                if (!lastPoint || 
                    Math.abs(lastPoint[0] - position[0]) > 0.1 || 
                    Math.abs(lastPoint[1] - position[1]) > 0.1) {
                    tracedPathPoints[nodeId].push([position[0], position[1]]);
                }
            }
        });
    }
    
    // Update mechanism positions
    updateMechanismPositions(simulationPosition);
    
    // Draw the traced paths
    drawTracedPaths();
    
    // Check if we've completed a cycle (returned to starting angle in FORWARD direction only)
    if (!animation_inverted && Math.abs(quickSimStartAngle - simulationPosition) < 0.25) {
        // Only complete if we're in forward direction
        endQuickSim();
        return;
    }
    
    // Continue animation loop
    quickSimAnimationId = requestAnimationFrame(quickSimAnimationLoop);
}

// 3. Add a function to draw the traced paths
function drawTracedPaths() {
    // Clear any existing temp path
    clearTempSimulationPath();
    
    // If no traced points, return
    if (Object.keys(tracedPathPoints).length === 0) return;
    
    // Create a temporary group for all paths
    const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pathsGroup.id = 'temp-simulation-path';
    
    // Get all non-ground nodes
    const nodes = Array.from(document.querySelectorAll('.node')).filter(node => !node.classList.contains('ground'));
    
    // Get motor nodes
    let motorNodeIds = [];
    if (motorEdge) {
        const startNodeId = motorEdge.getAttribute('data-start');
        const endNodeId = motorEdge.getAttribute('data-end');
        motorNodeIds = [startNodeId, endNodeId];
    }
    
    // Create paths from the traced points
    nodes.forEach(node => {
        const nodeId = parseInt(node.id.substring(4));
        const points = tracedPathPoints[nodeId];
        
        // Skip if no points for this node
        if (!points || points.length < 2) return;
        
        // Create path element
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.classList.add('simulation-path'); // Use simulation-path class for consistency
        
        // Generate path data
        let pathData = `M${points[0][0]},${points[0][1]} `;
        for (let i = 1; i < points.length; i++) {
            pathData += `L${points[i][0]},${points[i][1]} `;
        }
        
        pathElement.setAttribute('d', pathData);
        pathElement.setAttribute('data-node-id', node.id);
        
        // Add appropriate classes
        if (motorNodeIds.includes(node.id)) {
            pathElement.classList.add('motor-path');
        }
        if (node === targetNode) {
            pathElement.classList.add('target-path');
            // Make sure we don't override the CSS class with inline styles
            pathElement.style.removeProperty('stroke');
            pathElement.style.removeProperty('stroke-opacity');
        }
        
        // Add to group
        pathsGroup.appendChild(pathElement);
    });
    
    // Add group to canvas
    if (pathsGroup.children.length > 0) {
        canvas.appendChild(pathsGroup);
    }
}

function QuickSimSetup() {
    // Add Quick Sim button event listener
    document.getElementById('quick-sim').addEventListener('click', startQuickSim);

    // Add mobile Quick Sim button event listener
    const mobileQuickSimBtn = document.querySelector('.mobile-btn[data-tool="quick-sim"]');
    if (mobileQuickSimBtn) {
        mobileQuickSimBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startQuickSim();
        });
}

// Add keyboard shortcut for Quick Sim
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q' && 
        !e.ctrlKey && 
        !e.metaKey && 
        e.target.tagName !== 'INPUT' && 
        e.target.tagName !== 'TEXTAREA' &&
        !simulationMode &&
        !quickSimMode) {
        startQuickSim();
    }
});
}

function endQuickSim() {
    // Stop the animation
    if (quickSimAnimationId) {
        cancelAnimationFrame(quickSimAnimationId);
        quickSimAnimationId = null;
    }
    
    // End the active animation
    quickSimMode = false;
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('disabled');
    });
    document.querySelectorAll('.mobile-btn').forEach(btn => {
        btn.classList.remove('disabled');
    });
    document.body.classList.remove('controls-disabled');
    activeTool = savedTool;

    // Remove any position markers
    const markers = document.querySelectorAll('.current-position-marker');
    markers.forEach(marker => marker.remove());
    
    // Remove quick-sim-mode class from body
    document.body.classList.remove('quick-sim-mode');
    
    // Restore original node positions
    resetNodePositions();
    
    // We'll keep the traced paths visible until the next simulation or modification
    
    updateStatusMessage('Quick simulation complete. Paths will remain visible until the mechanism is modified.');
}

// Challenge Feature 
function initChallenge() {
    const challengePanel = document.getElementById('challenge-panel');
    const challengeTab = document.getElementById('challenge-tab');
    const challengeLevel = document.getElementById('challenge-level');
    const evaluateBtn = document.getElementById('evaluate-challenge');
    const clearBtn = document.getElementById('clear-attempt');
    const solutionButton = document.getElementById('show-solution');
    
    let isPanelOpen = true;
    
    // Function to toggle panel state
    function toggleChallengePanel() {
        isPanelOpen = !isPanelOpen;
        
        if (isPanelOpen) {
            challengePanel.classList.remove('collapsed');
        } else {
            challengePanel.classList.add('collapsed');
        }
        
        // Save state to localStorage
        localStorage.setItem('challengePanelOpen', isPanelOpen);
    }
    
    // Event listeners
    challengeTab.addEventListener('click', toggleChallengePanel);
    
    // Level change handler
    challengeLevel.addEventListener('change', (e) => {
        updateStatusMessage(`Challenge level selected: ${e.target.options[e.target.selectedIndex].text}`);
        loadChallengeCurve(e.target.value);
    });
    
    // Button click handlers - Using the real evaluation functionality
    evaluateBtn.addEventListener('click', evaluateChallenge);
    
    // Use real clear functionality
    clearBtn.addEventListener('click', clearChallengeAttempt);
    
    // Check local storage for panel state preference
    const savedState = localStorage.getItem('challengePanelOpen');
    if (savedState === 'false') {
        isPanelOpen = false;
        challengePanel.classList.add('collapsed');
    }

    // add options to challenge level from curves
    const challenge_titles = Object.keys(curves);
    challenge_titles.forEach(title => {
        const option = document.createElement('option');
        option.value = title;
        option.textContent = title;
        challengeLevel.appendChild(option);
    });

    challengeLevel.selectedIndex = 0;
    loadChallengeCurve(challenge_titles[0]);

    // Add event listener for solution button
    solutionButton.addEventListener('click', () => {
        const challengeLevel = document.getElementById('challenge-level').value;
        const solutionMechanism = solutions[challengeLevel];

        loadMechanismState(solutionMechanism);
        addToHistory();
    });
    
}

function clearChallenge() {
    const challengeScore = document.getElementById('challenge-score-value');
    challengeScore.textContent = '-';

    const challengeCanvas = document.getElementById('challenge-canvas');
    challengeCanvas.innerHTML = '';
}

function loadChallengeCurve(title) {
    // Clear any existing solution curve
    clearSolutionCurve();
    
    // Clear the score
    document.getElementById('challenge-score-value').textContent = '-';
    
    // Clear and redraw the challenge canvas
    const challengeCanvas = document.getElementById('challenge-canvas');
    challengeCanvas.innerHTML = '';
    
    const curvePoints = curves[title];
    const curvePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curvePath.classList.add('challenge-curve');
    
    const canvasWidth = challengeCanvas.clientWidth;
    const canvasHeight = challengeCanvas.clientHeight;

    // find the scale and offset to fit the curve in the canvas
    const normalizedCurve = normalizeCurveForRendering(curvePoints, canvasWidth, canvasHeight);

    let pathData = `M${normalizedCurve[0][0]},${normalizedCurve[0][1]} `;
    for (let i = 1; i < normalizedCurve.length; i++) {
        pathData += `L${normalizedCurve[i][0]},${normalizedCurve[i][1]} `;
    }

    curvePath.setAttribute('d', pathData);
    curvePath.classList.add('target-curve');
    challengeCanvas.appendChild(curvePath);
}

function normalizeCurveForRendering(curve, canvasWidth, canvasHeight) {
    // Find dimensions of target curve
    const xValues = curve.map(point => point[0]);
    const yValues = curve.map(point => point[1]);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    
    // Find dimensions of canvas
    const xScale = canvasWidth / xRange;
    const yScale = canvasHeight / yRange;
    const scale = Math.min(xScale, yScale) * 0.9;
    const xOffset = (canvasWidth - xRange * scale) / 2;
    const yOffset = (canvasHeight - yRange * scale) / 2;
    
    // Normalize curve points
    return curve.map(point => [(point[0] - xMin) * scale + xOffset, (point[1] - yMin) * scale + yOffset]);
}

function procrustesAnalysis(curve) {
    // Find the centroid of the curve
    const MeanX = curve.reduce((acc, point) => acc + point[0], 0) / curve.length;
    const MeanY = curve.reduce((acc, point) => acc + point[1], 0) / curve.length;

    const RMSRadius = Math.sqrt(curve.reduce((acc, point) => acc + Math.pow(point[0] - MeanX, 2) + Math.pow(point[1] - MeanY, 2), 0) / curve.length);

    return [MeanX, MeanY, RMSRadius];
}

function applyProcrustesAnalysis(curve, TargetMeanX, TargetMeanY, TargetRMSRadius) {
    const [MeanX, MeanY, RMSRadius] = procrustesAnalysis(curve);

    const scaledCurve = curve.map(point => {
        const x = TargetMeanX + (point[0] - MeanX) * (TargetRMSRadius / RMSRadius);
        const y = TargetMeanY + (point[1] - MeanY) * (TargetRMSRadius / RMSRadius);
        return [x, y];
    });

    return scaledCurve;
}

// Challenge evaluation functionality
function evaluateChallenge() {
    // run a quick simulation and wait for it to finish animating
    startQuickSim();
    const time_out_fn = () => {
        if (quickSimMode) { setTimeout(time_out_fn, 100); } else { evaluateChallengeAfterSim(); }};
    
    setTimeout(time_out_fn, 100);
}
function evaluateChallengeAfterSim() {
    // Get current selected challenge
    const challengeLevel = document.getElementById('challenge-level').value;
    const targetCurve = curves[challengeLevel];
    
    if (!targetCurve || !targetNode) {
        showModal('Evaluation Error', 'A target node must be selected to evaluate the challenge.');
        return;
    }
    
    // Clear any existing solution curve
    clearSolutionCurve();
    
    // Run a quick simulation to get the traced path
    const state = getMechanismState();
    
    // Check minimum requirements for simulation
    if (state.nodes.length < 2 || state.edges.length < 1) {
        showModal('Evaluation Error', 'Cannot evaluate: No mechanism defined. Please add nodes and links first.');
        return;
    }
    
    // Check for motor edge
    if (!motorEdge) {
        showModal('Evaluation Error', 'Motor edge must be defined to evaluate the challenge.');
        return;
    }
    
    // Run simulation with 360 steps for high precision
    try {
        const simulation = simulateMechanism(state, 360);
        
        // If simulation is valid, draw target path
        if (simulation.isValid) {
            // Extract target node path
            const targetNodeId = parseInt(targetNode.id.substring(4));
            const targetPath = extractTargetPath(simulation.positions, simulation.lockingFrames, targetNodeId);
            
            // Draw solution on challenge canvas
            const score = drawSolutionCurve(targetPath, targetCurve);
            
            // Calculate and display score
            document.getElementById('challenge-score-value').textContent = `${score}`;
            
            updateStatusMessage(`Challenge evaluated: Score ${score}%`);
        } else {
            showModal('Evaluation Error', 'Mechanism is not valid for evaluation. Ensure it has 1 DOF and is dyadic.');
            return;
        }
    } catch (error) {
        console.error('Challenge evaluation error:', error);
        showModal('Evaluation Error', 'An error occurred during evaluation. Please check the mechanism.');
        return;
    }
}

// Extract target node path from simulation results
function extractTargetPath(positions, lockingFrames, targetNodeId) {
    const path = [];
    
    // Skip frames where mechanism is locking
    positions.forEach((frame, index) => {
        if (!lockingFrames[index]) {
            const position = frame[targetNodeId];
            if (position && !isNaN(position[0]) && !isNaN(position[1])) {
                path.push([position[0], position[1]]);
            }
        }
    });
    
    return path;
}

function findOptimalRotation(curve, targetCurve) {
    let bestAngle = 0;

    const [MeanX, MeanY, RMSRadius] = procrustesAnalysis(targetCurve);
    let offsetedCurve = applyProcrustesAnalysis(curve, 0, 0, RMSRadius);
    let rotatedCurve = null;
    let bestDistance = chamferDistance(curve, targetCurve);
    for (let angle = 0; angle < 360; angle++) {
        rotatedCurve = rotateCurve(offsetedCurve, angle);
        rotatedCurve = applyProcrustesAnalysis(rotatedCurve, MeanX, MeanY, RMSRadius);
        const distance = chamferDistance(rotatedCurve, targetCurve);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestAngle = angle;
        }
    }
    return [applyProcrustesAnalysis(rotateCurve(offsetedCurve, bestAngle), MeanX, MeanY, RMSRadius), bestDistance];
}

function rotateCurve(curve, angle) {
    const angleRad = angle * Math.PI / 180;
    return curve.map(point => {
        const x = point[0] * Math.cos(angleRad) - point[1] * Math.sin(angleRad);
        const y = point[0] * Math.sin(angleRad) + point[1] * Math.cos(angleRad);
        return [x, y];
    });
}

function chamferDistance(curve1, curve2) {
    let d1 = 0;
    let d2 = 0;

    for (let i = 0; i < curve1.length; i++) {
        let minDistance = Number.MAX_VALUE;
        for (let j = 0; j < curve2.length; j++) {
            const distance = Math.sqrt(Math.pow(curve1[i][0] - curve2[j][0], 2) + Math.pow(curve1[i][1] - curve2[j][1], 2));
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        d1 += minDistance;
    }

    for (let i = 0; i < curve2.length; i++) {
        let minDistance = Number.MAX_VALUE;
        for (let j = 0; j < curve1.length; j++) {
            const distance = Math.sqrt(Math.pow(curve2[i][0] - curve1[j][0], 2) + Math.pow(curve2[i][1] - curve1[j][1], 2));
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        d2 += minDistance;
    }

    return (d1 + d2) / (curve1.length + curve2.length);
}

// Draw the solution curve on challenge canvas
function drawSolutionCurve(solutionPath, targetCurve) {
    const challengeCanvas = document.getElementById('challenge-canvas');
    const canvasWidth = challengeCanvas.clientWidth;
    const canvasHeight = challengeCanvas.clientHeight;
    
    // Scale and normalize the solution path to match target curve scale
    const normalizedTarget = normalizeCurveForRendering(targetCurve, canvasWidth, canvasHeight);
    const [targetMeanX, targetMeanY, targetRMSRadius] = procrustesAnalysis(normalizedTarget);
    const NormalizedPath = applyProcrustesAnalysis(solutionPath, targetMeanX, targetMeanY, targetRMSRadius);
    const [scaledPath, score] = findOptimalRotation(NormalizedPath, normalizedTarget);
    
    // Create solution path element
    const solutionElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    solutionElement.id = 'solution-curve';
    solutionElement.classList.add('solution-curve');
    
    // Generate path data
    let pathData = '';
    if (scaledPath.length > 0) {
        pathData = `M${scaledPath[0][0]},${scaledPath[0][1]} `;
        for (let i = 1; i < scaledPath.length; i++) {
            pathData += `L${scaledPath[i][0]},${scaledPath[i][1]} `;
        }
    }
    
    solutionElement.setAttribute('d', pathData);
    challengeCanvas.appendChild(solutionElement);

    return Math.round((0.5-score/targetRMSRadius)**2 * 100 * 4);
}

// Scale path to match target curve dimensions
function scalePath(path, targetCurve, canvasWidth, canvasHeight) {
    if (path.length === 0) return [];
    
    // Find dimensions of target curve
    const targetXValues = targetCurve.map(point => point[0]);
    const targetYValues = targetCurve.map(point => point[1]);
    const targetXMin = Math.min(...targetXValues);
    const targetXMax = Math.max(...targetXValues);
    const targetYMin = Math.min(...targetYValues);
    const targetYMax = Math.max(...targetYValues);
    const targetXMean = targetXValues.reduce((a, b) => a + b) / targetXValues.length;
    const targetYMean = targetYValues.reduce((a, b) => a + b) / targetYValues.length;
    const targetRMS = Math.sqrt((targetXValues.reduce((a,b) => a + Math.pow(b - targetXMean,2)) + targetYValues.reduce((a,b) => a + Math.pow(b - targetYMean,2))) / targetXValues.length);
    const targetXRange = targetXMax - targetXMin;
    const targetYRange = targetYMax - targetYMin;
    
    // Find dimensions of solution path
    const pathXValues = path.map(point => point[0]);
    const pathYValues = path.map(point => point[1]);
    const pathXMin = Math.min(...pathXValues);
    const pathXMax = Math.max(...pathXValues);
    const pathYMin = Math.min(...pathYValues);
    const pathYMax = Math.max(...pathYValues);
    const pathXMean = pathXValues.reduce((a, b) => a + b) / pathXValues.length;
    const pathYMean = pathYValues.reduce((a, b) => a + b) / pathYValues.length;
    const pathRMS = Math.sqrt((pathXValues.reduce((a,b) => a + Math.pow(b - pathXMean,2)) + pathYValues.reduce((a,b) => a + Math.pow(b - pathYMean,2))) / pathXValues.length);
    const pathXRange = pathXMax - pathXMin;
    const pathYRange = pathYMax - pathYMin;
    
    // Calculate scale factor (same scale used when loading the challenge curve)
    const targetScale = Math.min(canvasWidth / targetXRange, canvasHeight / targetYRange) * 0.9;
    const xOffset = (canvasWidth - targetXRange * targetScale) / 2;
    const yOffset = (canvasHeight - targetYRange * targetScale) / 2;
    
    // Scale solution path to match target curve size and position
    return path.map(point => [
        (point[0] + targetXMean - pathXMean - targetXMin) * (targetRMS / pathRMS) * targetScale + xOffset ,
        (point[1] + targetYMean - pathYMean - targetYMin) * (targetRMS / pathRMS) * targetScale + yOffset
    ]);
}

// Calculate score based on similarity between solution and target
function calculateScore(solutionPath, targetCurve) {
    if (solutionPath.length === 0) return 0;
    
    // Normalize both paths to 0-100 range for comparison
    const normalizedSolution = normalizePath(solutionPath);
    const normalizedTarget = normalizePath(targetCurve);
    
    // Resample both paths to have the same number of points
    const numSamples = 100;
    const sampledSolution = resamplePath(normalizedSolution, numSamples);
    const sampledTarget = resamplePath(normalizedTarget, numSamples);
    
    // Calculate average distance between corresponding points
    let totalDistance = 0;
    for (let i = 0; i < numSamples; i++) {
        const distance = getDistance(
            sampledSolution[i][0], sampledSolution[i][1],
            sampledTarget[i][0], sampledTarget[i][1]
        );
        totalDistance += distance;
    }
    
    const avgDistance = totalDistance / numSamples;
    
    // Convert to score (100% means perfect match, 0% means far off)
    // Max possible distance is √(2) in normalized 0-1 space, or ~141.4 in 0-100 space
    const maxDistance = 141.4;
    let score = Math.max(0, 100 - (avgDistance / maxDistance) * 100);
    
    // Add shape similarity penalty
    // Calculate area ratio between the two paths
    const solutionArea = calculatePathArea(sampledSolution);
    const targetArea = calculatePathArea(sampledTarget);
    const areaRatio = Math.min(solutionArea, targetArea) / Math.max(solutionArea, targetArea);
    
    // Apply area penalty
    score = score * (0.7 + 0.3 * areaRatio);
    
    // Return rounded score
    return Math.round(score);
}

// Normalize path to 0-1 range
function normalizePath(path) {
    const xValues = path.map(p => p[0]);
    const yValues = path.map(p => p[1]);
    
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    
    // Scale to 0-100 for better precision
    return path.map(p => [
        ((p[0] - xMin) / xRange) * 100,
        ((p[1] - yMin) / yRange) * 100
    ]);
}

// Resample path to have exactly n points
function resamplePath(path, numSamples) {
    if (path.length <= 1) return path;
    
    // Calculate total path length
    let totalLength = 0;
    const segments = [];
    
    for (let i = 0; i < path.length - 1; i++) {
        const length = getDistance(path[i][0], path[i][1], path[i+1][0], path[i+1][1]);
        totalLength += length;
        segments.push({
            start: i,
            length: length
        });
    }
    
    // Resample at equal intervals
    const sampledPath = [];
    const intervalLength = totalLength / (numSamples - 1);
    
    sampledPath.push([...path[0]]); // First point
    
    let currentLength = 0;
    let segmentIndex = 0;
    let segmentPosition = 0;
    
    for (let i = 1; i < numSamples - 1; i++) {
        const targetLength = i * intervalLength;
        
        // Find the segment containing this sample point
        while (currentLength + segments[segmentIndex].length < targetLength) {
            currentLength += segments[segmentIndex].length;
            segmentIndex++;
            segmentPosition = 0;
        }
        
        // Calculate position within the segment
        const segment = segments[segmentIndex];
        const remainingLength = targetLength - currentLength;
        const t = remainingLength / segment.length;
        
        // Interpolate
        const p1 = path[segment.start];
        const p2 = path[segment.start + 1];
        
        sampledPath.push([
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t
        ]);
    }
    
    sampledPath.push([...path[path.length - 1]]); // Last point
    
    return sampledPath;
}

// Calculate approximate area of a path using Shoelace formula
function calculatePathArea(path) {
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        const j = (i + 1) % path.length;
        area += path[i][0] * path[j][1];
        area -= path[j][0] * path[i][1];
    }
    return Math.abs(area / 2);
}

// Clear the solution curve
function clearSolutionCurve() {
    const solutionCurve = document.getElementById('solution-curve');
    if (solutionCurve) {
        solutionCurve.remove();
    }
    
    document.getElementById('challenge-score-value').textContent = '-';
}

// Function to clear challenge attempt
function clearChallengeAttempt() {
    // Clear score display
    document.getElementById('challenge-score-value').textContent = '-';
    
    // Clear solution curve
    clearSolutionCurve();
    
    updateStatusMessage('Challenge attempt cleared.');
}

// Initialize the application on window load
window.onload = init;

// Update on resize and orientation change
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);

// For iOS Safari, also update when scrolling stops
// (as address bar may show/hide during scroll)
let scrollTimeout;
window.addEventListener('scroll', function() {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(setViewportHeight, 200);
});