// --- Simple FFT Implementation (Adapted from various sources) ---
// NOTE: This is a basic implementation for demonstration.
// For production, a more robust library might be preferable.

function Complex(re, im) {
    this.re = re;
    this.im = im;
}

Complex.prototype.add = function(other) {
    return new Complex(this.re + other.re, this.im + other.im);
}

Complex.prototype.sub = function(other) {
    return new Complex(this.re - other.re, this.im - other.im);
}

Complex.prototype.mul = function(other) {
    return new Complex(this.re * other.re - this.im * other.im,
                       this.re * other.im + this.im * other.re);
}

Complex.prototype.magnitude = function() {
    return Math.sqrt(this.re * this.re + this.im * this.im);
}

function fft(signal) {
    const N = signal.length;
    if (N <= 1) return signal.map(val => new Complex(val, 0));

    // Check if N is a power of 2 (required for basic Cooley-Tukey)
    if ((N & (N - 1)) !== 0) {
         console.warn("FFT input size is not a power of 2. Padding with zeros.");
         // Find the next power of 2
         let nextPow2 = 1;
         while (nextPow2 < N) {
             nextPow2 <<= 1;
         }
         // Pad the signal with zeros
         const paddedSignal = [...signal];
         while (paddedSignal.length < nextPow2) {
             paddedSignal.push(0);
         }
         return fft(paddedSignal); // Recursive call with padded signal
    }


    // Cooley-Tukey FFT Algorithm
    const even = [];
    const odd = [];
    for (let i = 0; i < N / 2; i++) {
        even.push(signal[2 * i]);
        odd.push(signal[2 * i + 1]);
    }

    const fftEven = fft(even);
    const fftOdd = fft(odd);

    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
        const angle = -2 * Math.PI * k / N;
        const twiddle = new Complex(Math.cos(angle), Math.sin(angle));
        const term = twiddle.mul(fftOdd[k]);
        result[k] = fftEven[k].add(term);
        result[k + N / 2] = fftEven[k].sub(term);
    }
    return result;
}

function fftshift(complexArray) {
    const N = complexArray.length;
    const halfN = Math.ceil(N / 2); // Use ceil for odd lengths too
    const shifted = new Array(N);
    for (let i = 0; i < halfN; i++) {
        shifted[i] = complexArray[i + Math.floor(N/2)];
    }
     for (let i = 0; i < Math.floor(N/2); i++) {
        shifted[i + halfN] = complexArray[i];
    }
    return shifted;
}

// --- Plotting Logic ---

const carrierAmpInput = document.getElementById('carrierAmp');
const carrierFreqInput = document.getElementById('carrierFreq');
const bitDurationInput = document.getElementById('bitDuration');
const binaryDataInput = document.getElementById('binaryData');
const samplingFreqInput = document.getElementById('samplingFreq');
const freqDeviationInput = document.getElementById('freqDeviation');
const dataErrorSpan = document.getElementById('data-error');
const plotTitle = document.getElementById('plot-title');


function validateInputs() {
    const binaryData = binaryDataInput.value;
    const isValid = /^[01]+$/.test(binaryData);
    if (!isValid && binaryData.length > 0) {
        dataErrorSpan.textContent = "Only '0' and '1' allowed.";
        return false;
    } else if (binaryData.length === 0) {
         dataErrorSpan.textContent = "Binary data cannot be empty.";
         return false;
    } else {
        dataErrorSpan.textContent = ""; // Clear error
        return true;
    }
}

binaryDataInput.addEventListener('input', validateInputs);


function generatePlots(modulationType) {
    if (!validateInputs()) {
        alert("Please fix the errors in the input fields.");
        return;
    }

    plotTitle.textContent = `${modulationType} Modulation Plots`;
    document.body.classList.toggle('fsk-mode', modulationType === 'FSK');


    // Get input values
    const vc = parseFloat(carrierAmpInput.value);
    const fc = parseFloat(carrierFreqInput.value);
    const bitDuration = parseFloat(bitDurationInput.value);
    const bitDataString = binaryDataInput.value;
    const bitData = bitDataString.split('').map(Number);
    const fs = parseFloat(samplingFreqInput.value);
    const fd = parseFloat(freqDeviationInput.value); // Frequency deviation for FSK

    // --- Basic Parameter Validation ---
    if (isNaN(vc) || isNaN(fc) || isNaN(bitDuration) || isNaN(fs) || (modulationType === 'FSK' && isNaN(fd))) {
        alert("Please ensure all numeric fields have valid numbers.");
        return;
    }
     if (fc <= 0 || bitDuration <= 0 || fs <= 0 || (modulationType === 'FSK' && fd < 0) ) {
        alert("Frequencies, amplitude, and duration must be positive (Fd can be 0).");
        return;
    }

    const maxFreq = modulationType === 'FSK' ? fc + fd : fc;
    if (fs <= 2 * maxFreq) {
        alert(`Sampling frequency (Fs=${fs}Hz) should be significantly greater than 2 * max signal frequency (~${maxFreq}Hz) to avoid aliasing. Increase Fs.`);
        // return; // Allow plotting but warn the user
    }


    // Time vector
    const totalDuration = bitData.length * bitDuration;
    const dt = 1 / fs;
    const t = [];
    for (let time = 0; time < totalDuration; time += dt) {
        t.push(time);
    }
    const n = t.length; // Number of samples

    // --- 1. Carrier Signal ---
    const v_c = t.map(time => vc * Math.sin(2 * Math.PI * fc * time));

    // Plot Carrier
    Plotly.newPlot('carrierPlot', [{
        x: t,
        y: v_c,
        type: 'scatter',
        mode: 'lines',
        name: 'Carrier'
    }], {
        title: 'Carrier Signal (v_c)',
        xaxis: { title: 'Time (s)' },
        yaxis: { title: 'Amplitude (V)' },
        margin: { l: 50, r: 30, t: 50, b: 40 } // Adjust margins
    });

    // --- 2. Modulating Signal (NRZ) ---
    let sqSignal = [];
    let modulatingSignalType = '';

    if (modulationType === 'ASK') {
        // Unipolar NRZ (0 or 1)
        modulatingSignalType = 'Unipolar NRZ';
        sqSignal = t.map(time => {
            const bitIndex = Math.min(Math.floor(time / bitDuration), bitData.length - 1);
            return bitData[bitIndex]; // 0 or 1
        });
    } else { // FSK or PSK
        // Bipolar NRZ (-1 or 1)
        modulatingSignalType = 'Bipolar NRZ';
        sqSignal = t.map(time => {
            const bitIndex = Math.min(Math.floor(time / bitDuration), bitData.length - 1);
            return bitData[bitIndex] === 1 ? 1 : -1; // 1 or -1
        });
    }

     // Plot Modulating Signal
     Plotly.newPlot('modulatingPlot', [{
         x: t,
         y: sqSignal,
         type: 'scatter',
         mode: 'lines',
         line: { shape: 'hv' }, // Step-like plot
         name: 'Modulating'
     }], {
         title: `Modulating Signal (${modulatingSignalType}: ${bitDataString})`,
         xaxis: { title: 'Time (s)' },
         yaxis: { title: 'Amplitude (V)', range: modulationType === 'ASK' ? [-0.2, 1.2] : [-1.2, 1.2] }, // Adjust y-axis range
         margin: { l: 50, r: 30, t: 50, b: 40 }
     });


    // --- 3. Modulated Signal ---
    let v_modulated = [];
    let modulatedSignalName = '';

    switch (modulationType) {
        case 'ASK':
            modulatedSignalName = 'ASK Signal (v_a)';
            // Use the unipolar sqSignal generated above
            v_modulated = v_c.map((carrierVal, index) => carrierVal * sqSignal[index]);
            break;
        case 'FSK':
            modulatedSignalName = 'FSK Signal (v_f)';
             // Use the bipolar sqSignal generated above
            v_modulated = t.map((time, index) =>
                vc * Math.sin(2 * Math.PI * (fc + sqSignal[index] * fd) * time)
            );
            break;
        case 'PSK': // BPSK (Binary Phase Shift Keying)
            modulatedSignalName = 'PSK Signal (v_p)';
             // Use the bipolar sqSignal generated above
            v_modulated = v_c.map((carrierVal, index) => carrierVal * sqSignal[index]);
            // This works because multiplying by -1 is equivalent to a 180-degree phase shift:
            // A*sin(wt) * (-1) = A*sin(wt + pi)
            break;
        default:
            console.error("Unknown modulation type");
            return;
    }

     // Plot Modulated Signal
    const modulatedTrace = {
        x: t,
        y: v_modulated,
        type: 'scatter',
        mode: 'lines',
        name: modulationType
    };
    // Optional: Overlay modulating signal for context (like Python code)
     const modulatingOverlayTrace = {
        x: t,
        y: sqSignal.map(v => v * vc * (modulationType === 'ASK' ? 0.5 : 0.8) + (modulationType === 'ASK' ? vc*0.1 : 0)), // Scale/offset for visibility
        type: 'scatter',
        mode: 'lines',
        line: { dash: 'dot', color: 'red', shape: 'hv'},
        name: 'Modulating (scaled)'
     };

    Plotly.newPlot('modulatedPlot', [modulatedTrace, modulatingOverlayTrace], {
        title: modulatedSignalName,
        xaxis: { title: 'Time (s)' },
        yaxis: { title: 'Amplitude (V)' },
        margin: { l: 50, r: 30, t: 50, b: 40 },
        legend: { y: 0.95 }
    });


    // --- 4. Spectrum of Modulated Signal ---
    // Ensure the signal length is suitable for FFT (pad if needed by the fft function)
    const padded_v_modulated = [...v_modulated]; // Start with original
    let final_n = n;
    if ((n & (n - 1)) !== 0) {
         let nextPow2 = 1;
         while (nextPow2 < n) nextPow2 <<= 1;
         final_n = nextPow2;
         while (padded_v_modulated.length < final_n) padded_v_modulated.push(0);
         console.log(`Padding signal from ${n} to ${final_n} samples for FFT.`);
    }


    const v_mod_spec_complex = fftshift(fft(padded_v_modulated));
    const v_mod_spec_mag = v_mod_spec_complex.map(c => c.magnitude() / final_n); // Normalize

    // Frequency axis
    const df = fs / final_n;
    const f = [];
    for (let i = 0; i < final_n; i++) {
        f.push(-fs / 2 + i * df);
    }

    // Determine a sensible frequency range for plotting the spectrum
    let freqRange = [-fc * 3, fc * 3]; // Default range
     if (modulationType === 'FSK') {
        freqRange = [-(fc + fd) * 2, (fc + fd) * 2];
     }
     // Ensure range covers the main lobes, prevent excessively wide range
     const maxVisibleFreq = Math.max(fc + fd + 5*(1/bitDuration), fc + 5*(1/bitDuration)); // Heuristic
     freqRange = [-Math.min(Math.abs(freqRange[0]), maxVisibleFreq*1.5) , Math.min(freqRange[1], maxVisibleFreq*1.5)];
     // Ensure range is not zero
     if (freqRange[0] === 0 && freqRange[1] === 0) freqRange = [-fs/4, fs/4];
     if (freqRange[0] >= freqRange[1]) freqRange = [-fs/4, fs/4];


     // Plot Spectrum
     Plotly.newPlot('spectrumPlot', [{
         x: f,
         y: v_mod_spec_mag,
         type: 'scatter',
         mode: 'lines',
         name: 'Spectrum'
     }], {
         title: `Spectrum of ${modulationType} Signal`,
         xaxis: { title: 'Frequency (Hz)', range: freqRange }, // Set dynamic range
         yaxis: { title: 'Magnitude', type: 'linear' }, // Can change to 'log' if needed
         margin: { l: 50, r: 30, t: 50, b: 40 }
     });

}

// --- Initial Plot on Load ---
// Optional: Generate a default plot when the page loads
window.onload = () => {
    generatePlots('ASK'); // Default to ASK
};