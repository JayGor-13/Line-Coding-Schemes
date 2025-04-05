document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const dataInput = document.getElementById('dataInput');
    const schemeSelect = document.getElementById('schemeSelect');
    const simulateButton = document.getElementById('simulateButton');
    const waveformSvg = document.getElementById('waveform');
    const errorMessageDiv = document.getElementById('errorMessages');
    const schemeDescriptionP = document.getElementById('schemeDescription');
    const waveformContainer = document.getElementById('waveformContainer');

    // --- SVG Constants ---
    const SVG_NS = "http://www.w3.org/2000/svg";
    const PADDING = 40;
    const BIT_HEIGHT = 50; // Vertical distance for +V to 0 or -V to 0
    const BIT_WIDTH = 60;  // Horizontal width per bit

    // --- Explanations ---
    const explanations = {
        nrzl: "<b>NRZ-L (Non-Return-to-Zero Level):</b> Voltage level represents the bit value. Typically, High voltage = 1, Low voltage = 0 (or vice-versa). Level doesn't return to zero during the bit interval.",
        nrzi: "<b>NRZ-I (Non-Return-to-Zero Inverted):</b> A transition (inversion) at the beginning of the bit interval represents a '1'. No transition represents a '0'. Useful for detecting signal presence.",
        rz: "<b>RZ (Return-to-Zero):</b> A '1' is represented by a signal pulse (e.g., High then Zero) within the bit interval. A '0' is represented by no pulse (or Low). Returns to zero level mid-bit, requiring more bandwidth.",
        manchester: "<b>Manchester:</b> Combines data and clock. A '1' is a Low-to-High transition in the middle of the bit interval. A '0' is a High-to-Low transition. Always has a mid-bit transition.",
        diff_manchester: "<b>Differential Manchester:</b> Combines data and clock. Always a transition in the middle. A '0' causes an *additional* transition at the *start* of the bit interval. A '1' has no transition at the start. Depends on the previous level."
    };

    // --- Event Listener ---
    simulateButton.addEventListener('click', handleSimulation);
    // Optionally simulate on input change too (can be intensive)
    // dataInput.addEventListener('input', handleSimulation);
    // schemeSelect.addEventListener('change', handleSimulation);

    function handleSimulation() {
        const dataBits = dataInput.value.trim();
        const selectedScheme = schemeSelect.value;

        // --- Input Validation ---
        errorMessageDiv.textContent = ''; // Clear previous errors
        if (!dataBits) {
            errorMessageDiv.textContent = 'Error: Data bits cannot be empty.';
            clearWaveform();
            updateExplanation(selectedScheme); // Still show explanation
            return;
        }
        if (!/^[01]+$/.test(dataBits)) {
            errorMessageDiv.textContent = 'Error: Input must contain only 0s and 1s.';
            clearWaveform();
             updateExplanation(selectedScheme);
            return;
        }

        // --- Generate Waveform Data ---
        let waveformPoints = [];
        try {
             waveformPoints = generateWaveform(dataBits, selectedScheme);
        } catch (error) {
            errorMessageDiv.textContent = `Error generating waveform: ${error.message}`;
            clearWaveform();
            updateExplanation(selectedScheme);
            return;
        }


        // --- Draw Waveform ---
        drawWaveform(dataBits, waveformPoints, selectedScheme);

        // --- Update Explanation ---
        updateExplanation(selectedScheme);
    }

    // --- Waveform Generation Logic ---
    function generateWaveform(bits, scheme) {
        let points = [];
        let currentLevel = 1; // Start high for NRZ-I/Diff Man. (Common convention)

        // Y-coordinates mapping: +1 -> HIGH_Y, 0 -> ZERO_Y, -1 -> LOW_Y
        const HIGH_Y = PADDING;
        const ZERO_Y = PADDING + BIT_HEIGHT;
        const LOW_Y = PADDING + 2 * BIT_HEIGHT;

        // Helper to add points
        const addPoint = (bitIndex, timeFraction, level) => {
            const x = PADDING + bitIndex * BIT_WIDTH + timeFraction * BIT_WIDTH;
            let y;
            if (level === 1) y = HIGH_Y;
            else if (level === 0) y = ZERO_Y;
            else if (level === -1) y = LOW_Y;
            else y = ZERO_Y; // Default safe value

            // Avoid duplicate consecutive points at the same y-level unless necessary (like start/end)
            if (points.length > 0) {
                 const lastPoint = points[points.length - 1];
                 // Only add if x is different OR y is different
                 if (x > lastPoint.x || y !== lastPoint.y) {
                     points.push({ x, y });
                 } else if (x === lastPoint.x && y !== lastPoint.y) {
                     // If x is same but y changed (vertical line needed), update last point's y instead of adding new
                     // This simplifies polyline but might hide vertical segments needed for strict RZ viz
                     // Let's add it for clarity in RZ/Manchester
                      points.push({ x, y });
                 }
            } else {
                points.push({ x, y }); // Always add the first point
            }
        };

         // Add starting point for continuity
         let initialY;
         if (scheme === 'nrzi' || scheme === 'diff_manchester') {
              initialY = currentLevel === 1 ? HIGH_Y : LOW_Y; // Start based on initial level assumption
         } else if (bits[0] === '1' && (scheme === 'nrzl' || scheme === 'rz' || scheme === 'manchester')) {
            initialY = HIGH_Y;
         } else if (bits[0] === '0' && (scheme === 'nrzl')) {
             initialY = LOW_Y;
         }
         else { // RZ 0, Manchester 0 start High before dropping
            initialY = (scheme === 'manchester' && bits[0] === '0') || (scheme === 'rz' && bits[0] === '1') ? HIGH_Y : LOW_Y;
            if(scheme === 'rz' && bits[0] === '0') initialY = LOW_Y; // RZ 0 starts and stays low
             if(scheme === 'nrzl' && bits[0] === '0') initialY = LOW_Y;
         }

         // Adjust for RZ which starts at 0 if the first bit pulse goes there
         if (scheme === 'rz' && bits[0] === '1') {
             // It will go high, then zero. Start visualization from zero level axis perhaps?
             // Or start High. Let's assume signal starts at the first bit's representation.
             initialY = HIGH_Y;
         } else if (scheme === 'rz' && bits[0] === '0') {
             initialY = LOW_Y; // RZ 0 is Low
         }


        // Add an initial point slightly before the first bit for visual clarity
        if (points.length === 0) {
            let startY = ZERO_Y; // Default start at zero axis visually
             if (scheme === 'nrzi' || scheme === 'diff_manchester') {
                 startY = currentLevel > 0 ? HIGH_Y : LOW_Y;
             } else if (scheme === 'nrzl') {
                 startY = bits[0] === '1' ? HIGH_Y : LOW_Y;
             } else if (scheme === 'manchester') {
                 // Manchester starts High for 0, Low for 1, before the mid-bit transition
                 startY = bits[0] === '0' ? HIGH_Y : LOW_Y;
             } else if (scheme === 'rz') {
                 // RZ starts High for 1, Low for 0
                 startY = bits[0] === '1' ? HIGH_Y : LOW_Y;
             }
             addPoint(0, 0, mapYToLevel(startY, HIGH_Y, LOW_Y)); // Add the very first point at t=0
        }


        // --- Scheme Logic ---
        for (let i = 0; i < bits.length; i++) {
            const bit = parseInt(bits[i]);

            switch (scheme) {
                case 'nrzl':
                    currentLevel = (bit === 1) ? 1 : -1;
                    addPoint(i, 0, currentLevel); // Level at the start of the bit
                    addPoint(i, 1, currentLevel); // Level maintained to the end
                    break;

                case 'nrzi':
                    if (bit === 1) {
                        currentLevel *= -1; // Invert level for '1'
                    }
                    // No change for '0'
                    addPoint(i, 0, currentLevel); // Level at the start
                    addPoint(i, 1, currentLevel); // Level maintained
                    break;

                case 'rz':
                    if (bit === 1) {
                        addPoint(i, 0, 1);    // Go High at start
                        addPoint(i, 0.5, 1);  // Stay High until mid
                        addPoint(i, 0.5, 0);  // Return to Zero at mid
                        addPoint(i, 1, 0);    // Stay Zero until end
                    } else { // bit === 0
                        addPoint(i, 0, -1);   // Go Low at start (or stay 0 depending on convention - let's use negative)
                        addPoint(i, 1, -1);   // Stay Low until end (RZ 0 = low level for duration)
                         // Or Use 0 level for '0' bit? Let's stick to -1 for clear visual distinction
                         // addPoint(i, 0, 0);
                         // addPoint(i, 1, 0);
                    }
                    currentLevel = 0; // RZ always ends at zero conceptually for the next bit decision, though signal might be low
                    break;

                case 'manchester':
                    if (bit === 1) { // 1: Low to High transition
                        addPoint(i, 0, -1);   // Start Low
                        addPoint(i, 0.5, -1); // Stay Low until mid
                        addPoint(i, 0.5, 1);  // Transition High at mid
                        addPoint(i, 1, 1);    // Stay High until end
                        currentLevel = 1; // Ends high
                    } else { // 0: High to Low transition
                        addPoint(i, 0, 1);    // Start High
                        addPoint(i, 0.5, 1);  // Stay High until mid
                        addPoint(i, 0.5, -1); // Transition Low at mid
                        addPoint(i, 1, -1);   // Stay Low until end
                        currentLevel = -1; // Ends low
                    }
                    break;

                case 'diff_manchester':
                    // Mid-bit transition always happens, mirrors previous level's end state
                    let midTransitionLevel = currentLevel * -1;

                    if (bit === 0) {
                        // Invert level at the START of the bit for '0'
                        currentLevel *= -1;
                    }
                    // No inversion at start for '1'

                    // Draw first half (maintaining level or inverted level for '0')
                    addPoint(i, 0, currentLevel);
                    addPoint(i, 0.5, currentLevel);

                    // Draw second half (always transition mid-bit)
                    currentLevel *= -1; // The mid-bit transition
                    addPoint(i, 0.5, currentLevel);
                    addPoint(i, 1, currentLevel);
                    break;

                default:
                    console.error("Unknown scheme:", scheme);
                    throw new Error(`Encoding scheme "${scheme}" not implemented.`);

            }
        }
        return points;
    }

      // Helper to map Y coordinate back to logical level (approximate)
    function mapYToLevel(y, highY, lowY) {
        const zeroY = (highY + lowY) / 2; // Calculate zero midpoint dynamically
        if (Math.abs(y - highY) < Math.abs(y - zeroY)) return 1;
        if (Math.abs(y - lowY) < Math.abs(y - zeroY)) return -1;
        return 0;
    }

    // --- Drawing Function ---
    function drawWaveform(bits, points, scheme) {
        clearWaveform();

        const numBits = bits.length;
        const totalWidth = PADDING * 2 + numBits * BIT_WIDTH;
        const totalHeight = PADDING * 2 + 2 * BIT_HEIGHT; // Height accommodates High (+V) to Low (-V)

        // Set SVG viewBox for responsiveness
        waveformSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
        waveformSvg.setAttribute('preserveAspectRatio', 'xMinYMid meet'); // Keep aspect ratio, align left-middle
        // waveformSvg.style.minWidth = `${totalWidth}px`; // Ensure container respects minimum drawing width

        const HIGH_Y = PADDING;
        const ZERO_Y = PADDING + BIT_HEIGHT;
        const LOW_Y = PADDING + 2 * BIT_HEIGHT;

        // --- Draw Grid & Axes ---
        // Horizontal Lines (Levels)
        createLine(PADDING, HIGH_Y, totalWidth - PADDING, HIGH_Y, 'grid-line');
        createLine(PADDING, ZERO_Y, totalWidth - PADDING, ZERO_Y, 'grid-line');
        createLine(PADDING, LOW_Y, totalWidth - PADDING, LOW_Y, 'grid-line');

        // Level Labels
        createText('+V', PADDING - 5, HIGH_Y + 4, 'level-label'); // Offset slightly for clarity
        createText(' 0', PADDING - 5, ZERO_Y + 4, 'level-label');
        createText('-V', PADDING - 5, LOW_Y + 4, 'level-label');

        // Vertical Lines (Bit Boundaries & Mid-points for relevant schemes)
        for (let i = 0; i <= numBits; i++) {
            const x = PADDING + i * BIT_WIDTH;
            createLine(x, PADDING, x, totalHeight - PADDING, 'axis-line'); // Bit boundaries solid

            // Dashed mid-bit lines for RZ, Manchester, Diff Manchester
            if (i < numBits && ['rz', 'manchester', 'diff_manchester'].includes(scheme)) {
                 const midX = x + BIT_WIDTH / 2;
                 createLine(midX, PADDING, midX, totalHeight - PADDING, 'grid-line');
            }
        }


        // --- Draw Data Bit Labels ---
        for (let i = 0; i < numBits; i++) {
            const x = PADDING + i * BIT_WIDTH + BIT_WIDTH / 2; // Center label in the bit interval
            const y = PADDING - 10; // Position above the grid
            createText(bits[i], x, y, 'data-bit-label');
        }


        // --- Draw the Signal Waveform ---
        if (points && points.length > 1) {
            let pathData = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                 // Check for vertical line: same x, different y
                 if (points[i].x === points[i-1].x && points[i].y !== points[i-1].y) {
                    pathData += ` V ${points[i].y}`; // Use V for vertical line segment
                 }
                 // Check for horizontal line: different x, same y
                 else if (points[i].x !== points[i-1].x && points[i].y === points[i-1].y) {
                    pathData += ` H ${points[i].x}`; // Use H for horizontal line segment
                 }
                 // Diagonal or other cases: use L
                 else {
                    pathData += ` L ${points[i].x} ${points[i].y}`;
                 }
                // Standard Polyline approach (simpler):
                // pathData += ` L ${points[i].x} ${points[i].y}`;
            }

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', pathData);
            path.setAttribute('class', 'signal-line');
            // Optional: Add drawing animation class if defined in CSS
            // path.style.animation = 'drawLine 2s linear forwards';
            waveformSvg.appendChild(path);
        }
    }

    // --- Helper Functions for SVG Creation ---
    function createLine(x1, y1, x2, y2, className) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', className);
        waveformSvg.appendChild(line);
        return line;
    }

    function createText(content, x, y, className) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', className);
        text.textContent = content;
        waveformSvg.appendChild(text);
        return text;
    }

    function clearWaveform() {
        waveformSvg.innerHTML = ''; // Clear previous drawing
    }

    function updateExplanation(scheme) {
        schemeDescriptionP.innerHTML = explanations[scheme] || 'Select a scheme to see its description.';
    }

     // --- Initial State ---
     updateExplanation(schemeSelect.value); // Show explanation for default selected scheme

}); // End DOMContentLoaded