class SmartCalculator {
  constructor() {
    this.canvas = document.getElementById("drawingCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.isDrawing = false;
    this.currentColor = "#2c3e50";
    this.currentStroke = 3;
    this.isEraserMode = false;

    // Canvas background. Must match --paper in style.css; used for clear,
    // undo/redo, the eraser and the empty check.
    this.paperColor = "#fffdf8";

    // Use API key from config.js
    this.apiKey = window.GEMINI_API_KEY;

    // History for undo/redo functionality
    this.history = [];
    this.historyStep = -1;
    this.maxHistory = 50;

    // Store last known coordinates for smoother drawing
    this.lastX = 0;
    this.lastY = 0;

    this.initializeCanvas();
    this.setupEventListeners();
    this.setupColorPalette();
    this.setupStrokeControl();
    this.saveState(); // Save initial blank state
  }

  initializeCanvas() {
    const resizeCanvas = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Set the canvas size, adjusting for device pixel ratio
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;

      // Scale the context to ensure crisp drawing on high DPI screens
      this.ctx.scale(dpr, dpr);
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      // Clear and redraw if we have history
      if (this.history.length > 0) {
        this.restoreState();
      } else {
        this.clearCanvas(false);
      }
    };

    // Initial resize
    resizeCanvas();

    // Add resize listener with debounce to prevent performance issues
    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 250);
    });
  }

  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener("mousedown", this.startDrawing.bind(this));
    this.canvas.addEventListener("mousemove", this.draw.bind(this));
    this.canvas.addEventListener("mouseup", this.stopDrawing.bind(this));
    this.canvas.addEventListener("mouseout", this.stopDrawing.bind(this));

    // Touch events with improved handling
    this.canvas.addEventListener(
      "touchstart",
      this.handleTouchStart.bind(this),
      { passive: false }
    );
    this.canvas.addEventListener("touchmove", this.handleTouchMove.bind(this), {
      passive: false,
    });
    this.canvas.addEventListener("touchend", this.stopDrawing.bind(this));
    this.canvas.addEventListener("touchcancel", this.stopDrawing.bind(this));

    // Button events
    document
      .getElementById("resetBtn")
      .addEventListener("click", this.resetAll.bind(this));
    document
      .getElementById("clearBtn")
      .addEventListener("click", this.clearCanvas.bind(this));
    document
      .getElementById("calculateBtn")
      .addEventListener("click", this.calculate.bind(this));
    document
      .getElementById("saveBtn")
      .addEventListener("click", this.saveCanvas.bind(this));
    document
      .getElementById("undoBtn")
      .addEventListener("click", this.undo.bind(this));
    document
      .getElementById("redoBtn")
      .addEventListener("click", this.redo.bind(this));
    document
      .getElementById("eraserBtn")
      .addEventListener("click", this.toggleEraser.bind(this));
    document
      .getElementById("eraseToggleBtn")
      .addEventListener("click", this.toggleEraser.bind(this));

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          this.undo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          this.redo();
        }
      } else if (e.key === "Enter") {
        // Let Enter on a focused button activate that button instead
        if (e.target instanceof Element && e.target.closest("button")) return;
        e.preventDefault();
        if (!document.getElementById("calculateBtn").disabled) this.calculate();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        this.toggleEraser();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.clearCanvas();
      }
    });
  }

  // Setup color palette
  setupColorPalette() {
    const colorButtons = document.querySelectorAll(".color-btn");
    colorButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        colorButtons.forEach((b) => b.classList.remove("active"));
        document.getElementById("eraserBtn").classList.remove("active");
        btn.classList.add("active");
        this.currentColor = btn.dataset.color;
        this.isEraserMode = false;
        this.updateCanvasCursor();
        this.updateEraseButton();
      });
    });
  }

  // Setup stroke control
  setupStrokeControl() {
    const strokeSlider = document.getElementById("strokeWidth");
    const strokeDisplay = document.getElementById("strokeDisplay");

    strokeSlider.addEventListener("input", (e) => {
      this.currentStroke = parseInt(e.target.value);
      strokeDisplay.textContent = `${e.target.value}px`;
    });
  }

  // Toggle eraser mode
  toggleEraser() {
    this.isEraserMode = !this.isEraserMode;

    const colorButtons = document.querySelectorAll(".color-btn");
    const eraserBtn = document.getElementById("eraserBtn");

    if (this.isEraserMode) {
      colorButtons.forEach((btn) => btn.classList.remove("active"));
      eraserBtn.classList.add("active");
    } else {
      eraserBtn.classList.remove("active");
      document.querySelector(".color-btn.black").classList.add("active");
      this.currentColor = "#2c3e50";
    }

    this.updateCanvasCursor();
    this.updateEraseButton();
  }

  // Update canvas cursor
  updateCanvasCursor() {
    if (this.isEraserMode) {
      this.canvas.classList.add("eraser-mode");
    } else {
      this.canvas.classList.remove("eraser-mode");
    }
  }

  // Update erase button
  updateEraseButton() {
    const eraseToggleBtn = document.getElementById("eraseToggleBtn");
    eraseToggleBtn.classList.toggle("is-active", this.isEraserMode);
  }

  // Save canvas state
  saveState() {
    // Only save state if something has changed
    if (
      this.historyStep >= 0 &&
      this.history[this.historyStep] === this.canvas.toDataURL()
    ) {
      return;
    }

    this.historyStep++;
    if (this.historyStep < this.history.length) {
      this.history.length = this.historyStep;
    }
    this.history.push(this.canvas.toDataURL());

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
      this.historyStep = this.maxHistory - 1;
    }

    this.updateUndoRedoButtons();
  }

  // Undo last action
  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.restoreState();
    }
  }

  // Redo last action
  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this.restoreState();
    }
  }

  // Restore canvas state
  restoreState() {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = this.paperColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
      this.updateUndoRedoButtons();
    };
    img.src = this.history[this.historyStep];
  }

  // Update undo/redo buttons
  updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    undoBtn.disabled = this.historyStep <= 0;
    redoBtn.disabled = this.historyStep >= this.history.length - 1;
  }

  // Get mouse/touch coordinates
  getCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.type.includes("touch")) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x:
        ((clientX - rect.left) * (this.canvas.width / rect.width)) /
        (window.devicePixelRatio || 1),
      y:
        ((clientY - rect.top) * (this.canvas.height / rect.height)) /
        (window.devicePixelRatio || 1),
    };
  }

  // Start drawing
  startDrawing(e) {
    this.isDrawing = true;
    const coords = this.getCoordinates(e);
    this.lastX = coords.x;
    this.lastY = coords.y;

    // Begin a new path for this stroke
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
  }

  // Draw on canvas
  draw(e) {
    if (!this.isDrawing) return;

    e.preventDefault(); // Prevent scrolling on touch devices

    const coords = this.getCoordinates(e);

    // Erase by painting the background color. "destination-out" would leave
    // transparent pixels (breaking isCanvasEmpty and the PNG sent to Gemini)
    // and its composite mode leaked into clear/undo, wiping the whole canvas.
    this.ctx.globalCompositeOperation = "source-over";
    if (this.isEraserMode) {
      this.ctx.strokeStyle = this.paperColor;
      this.ctx.lineWidth = this.currentStroke * 2;
    } else {
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.currentStroke;
    }

    this.ctx.lineTo(coords.x, coords.y);
    this.ctx.stroke();

    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  // Stop drawing
  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.ctx.closePath();
      this.saveState();
    }
  }

  // Handle touch start event
  handleTouchStart(e) {
    // Prevent default to avoid scrolling and other touch actions
    if (e.touches.length === 1) {
      e.preventDefault();
      this.startDrawing(e);
    }
  }

  // Handle touch move event
  handleTouchMove(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      this.draw(e);
    }
  }

  // Clear canvas
  clearCanvas(saveState = true) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.paperColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.showPlaceholder();

    if (saveState) {
      this.saveState();
    }
  }

  // Reset all settings
  resetAll() {
    this.clearCanvas(false);
    document
      .querySelectorAll(".color-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document.getElementById("eraserBtn").classList.remove("active");
    document.querySelector(".color-btn.black").classList.add("active");
    this.currentColor = "#2c3e50";
    this.isEraserMode = false;
    document.getElementById("strokeWidth").value = 3;
    document.getElementById("strokeDisplay").textContent = "3px";
    this.currentStroke = 3;

    // Reset history
    this.history = [];
    this.historyStep = -1;
    this.saveState();

    this.updateCanvasCursor();
    this.updateEraseButton();
  }

  // Save canvas as image
  saveCanvas() {
    const link = document.createElement("a");
    link.download = `smart-calculator-${Date.now()}.png`;
    link.href = this.canvas.toDataURL();
    link.click();
  }

  // Check if canvas is empty
  isCanvasEmpty() {
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const data = imageData.data;
    const hex = parseInt(this.paperColor.slice(1), 16);
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const tolerance = 8;

    // Empty = every pixel is the paper color (within a small threshold)
    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.abs(data[i] - r) > tolerance ||
        Math.abs(data[i + 1] - g) > tolerance ||
        Math.abs(data[i + 2] - b) > tolerance ||
        data[i + 3] < 250
      ) {
        return false;
      }
    }
    return true;
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Turn the model's "Expression: / Step N: / Final Answer:" text into lines
  formatSolution(content) {
    const text = content
      .trim()
      .replace(/^"([\s\S]*)"$/, "$1") // the prompt's example is wrapped in quotes
      .replace(/\$\$([\s\S]*?)\$\$/g, (m) => m.replace(/\n/g, " ")); // keep $$…$$ on one line

    const labelRe =
      /^[#>*\-\s]*(?:\*\*)?\s*(Expression|Step\s*\d+|Final\s+Answer|Answer)\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/i;
    const inline = (s) =>
      this.escapeHtml(s).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    const items = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(labelRe);
      if (m) {
        const label = m[1].replace(/\s+/g, " ");
        items.push({ label, body: [m[2]], final: /answer/i.test(label) });
      } else if (items.length && items[items.length - 1].label) {
        items[items.length - 1].body.push(line);
      } else {
        items.push({ label: null, body: [line], final: false });
      }
    }

    const lines = items
      .map((item) => {
        const body = item.body.filter(Boolean).map(inline).join("<br>");
        if (!item.label) {
          return `<li class="line line-note"><div class="line-body">${body}</div></li>`;
        }
        return `
          <li class="line${item.final ? " final" : ""}">
            <span class="line-label">${this.escapeHtml(item.label)}</span>
            <div class="line-body">${body}</div>
          </li>`;
      })
      .join("");

    return `<ol class="working-lines">${lines}</ol>`;
  }

  // Show placeholder content
  showPlaceholder() {
    const resultContent = document.getElementById("resultContent");
    const statusDot = document.getElementById("statusDot");

    resultContent.innerHTML = `
      <div class="placeholder-text">
        <p class="placeholder-eq">x<sup>2</sup> &minus; 5x + 6 = 0</p>
        <p>Your step-by-step working will appear here.</p>
      </div>
    `;
    statusDot.className = "status-dot";
  }

  // Show loading animation
  showLoading() {
    const resultContent = document.getElementById("resultContent");
    const statusDot = document.getElementById("statusDot");
    const calculateBtn = document.getElementById("calculateBtn");

    resultContent.innerHTML = `
      <div class="loading-animation" style="display: flex;">
        <div class="spinner"></div>
        <p>Reading your sheet&hellip;</p>
      </div>
    `;
    statusDot.className = "status-dot processing";
    calculateBtn.disabled = true;
  }

  // Show result
  showResult(content, isError = false) {
    const resultContent = document.getElementById("resultContent");
    const statusDot = document.getElementById("statusDot");
    const calculateBtn = document.getElementById("calculateBtn");

    if (isError) {
      resultContent.innerHTML = `<div class="error-message">${this.escapeHtml(content)}</div>`;
      statusDot.className = "status-dot error-message";
    } else {
      resultContent.innerHTML = `
        <div class="solution-text">${this.formatSolution(content)}</div>
      `;
      statusDot.className = "status-dot active";
      
      // Trigger mathjax to render the new content
      if(window.MathJax){
        window.MathJax.typesetPromise([resultContent]).catch((err) => console.error(err));
      }
    }

    calculateBtn.disabled = false;
  }

  // Calculate result
  async calculate() {
    if (this.isCanvasEmpty()) {
      this.showResult(
        "The sheet is empty. Write an expression first, then press Solve.",
        true
      );
      return;
    }

    this.showLoading();

    try {
      // Check if API key is set
      if (!this.apiKey) {
        throw new Error(
          "API key not configured. Please set your Gemini API key in config.js"
        );
      }

      // Convert canvas to base64
      const imageDataURL = this.canvas.toDataURL("image/png");
      const base64Data = imageDataURL.split(",")[1];

      // Prepare API request
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `You are a math tutor.
                1. Transcribe the handwritten expression accurately.
                2. Solve it step-by-step.
                3. Use LaTeX formatting enclosed in double dollar signs ($$ ... $$) for all math expressions.
                4. Do NOT use bold (**text**) inside LaTeX equations.
                5. Format the output clearly like this:
                "Expression: $$ [latex code] $$
                Step 1: $$ [latex code] $$
                Step 2: $$ [latex code] $$
                Final Answer: $$ [latex code] $$"`,
              },

              {
                inline_data: {
                  mime_type: "image/png",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 32,
          topP: 1,
          maxOutputTokens: 2048,
        },
      };

      // Make API call
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = "API request failed. ";

        if (response.status === 400) {
          errorMessage += "Bad request - please check your input.";
        } else if (response.status === 402) {
          errorMessage += "The Gemini API project is out of credits - billing needs to be topped up.";
        } else if (response.status === 403) {
          errorMessage += "Access denied - please check your API key.";
        } else if (response.status === 429) {
          errorMessage += "Rate limit exceeded - please try again later.";
        } else if (response.status >= 500) {
          errorMessage += "Server error - please try again later.";
        } else {
          errorMessage += `HTTP ${response.status}: ${
            errorData.error?.message || "Unknown error"
          }`;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (
        !data.candidates ||
        !data.candidates[0] ||
        !data.candidates[0].content ||
        !data.candidates[0].content.parts ||
        !data.candidates[0].content.parts[0] ||
        !data.candidates[0].content.parts[0].text
      ) {
        throw new Error(
          "No solution received from AI. The handwriting might be unclear or the image too complex."
        );
      }

      const solution = data.candidates[0].content.parts[0].text;
      this.showResult(solution);
    } catch (error) {
      console.error("Calculate Error:", error);
      this.showResult(error.message, true);
    }
  }
}

// Initialize the Smart Calculator when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new SmartCalculator();
});
