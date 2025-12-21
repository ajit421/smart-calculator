class SmartCalculator {
  constructor() {
    this.canvas = document.getElementById("drawingCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.isDrawing = false;
    this.currentColor = "#2c3e50";
    this.currentStroke = 3;
    this.isEraserMode = false;

    // Use API key from config
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
    if (this.isEraserMode) {
      eraseToggleBtn.textContent = "🖊️ Draw Mode";
      eraseToggleBtn.style.background =
        "linear-gradient(135deg, #74b9ff, #0984e3)";
    } else {
      eraseToggleBtn.textContent = "🧹 Toggle Erase";
      eraseToggleBtn.style.background =
        "linear-gradient(135deg, #a29bfe, #6c5ce7)";
    }
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
      this.ctx.fillStyle = "#fafafa";
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

    if (this.isEraserMode) {
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.strokeStyle = "rgba(0,0,0,1)"; // Eraser needs a color to work
      this.ctx.lineWidth = this.currentStroke * 2;
    } else {
      this.ctx.globalCompositeOperation = "source-over";
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
    this.ctx.fillStyle = "#fafafa";
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
    const pixelBuffer = new Uint32Array(imageData.data.buffer);

    // Check if all pixels are the background color (within a small threshold)
    return pixelBuffer.every((pixel) => {
      // Compare with background color (#fafafa ≈ 0xFFFAFAFA in ARGB)
      return Math.abs(pixel - 0xfffafafa) < 0x000f0f0f;
    });
  }

  // Show placeholder content
  showPlaceholder() {
    const resultContent = document.getElementById("resultContent");
    const statusDot = document.getElementById("statusDot");

    resultContent.innerHTML = `
      <div class="placeholder-text">
        <p>Draw your mathematical expression on the canvas</p>
        <p>Then click <strong>Calculate</strong> to get AI-powered solutions!</p>
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
        <p>🤖 AI is analyzing your handwritten expression...</p>
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
      resultContent.innerHTML = `<div class="error-message">${content}</div>`;
      statusDot.className = "status-dot error-message";
    } else {
      // Simple sanitization and formatting
      const formattedContent = content
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");

      resultContent.innerHTML = `
        <div class="solution-text">
          <h4>Solution:</h4>
          <div class="step">${formattedContent}</div>
        </div>
      `;
      statusDot.className = "status-dot active";
    }

    calculateBtn.disabled = false;
  }

  // Calculate result
  async calculate() {
    if (this.isCanvasEmpty()) {
      this.showResult(
        "📝 Please draw a mathematical expression on the canvas first!",
        true
      );
      return;
    }

    this.showLoading();

    try {
      // Check if API key is set
      if (!this.apiKey) {
        throw new Error(
          "API key not configured. Please set your Gemini API key in config.js."
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
                text: 
                `You are given a handwritten mathematical expression as an image.
                1. First, transcribe the handwritten expression into clear mathematical notation.
                2. Then solve it step by step, showing only the essential calculations.
                3. Finally, provide the final numeric answer in a separate line prefixed with "Final Answer:".
                Do not add explanations, context, or commentary. Only output math steps and the final result.`,
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
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

  // Add some interactive animations
  const buttons = document.querySelectorAll(".btn");
  buttons.forEach((btn) => {
    btn.addEventListener("mouseenter", () => {
      if (!btn.disabled) {
        btn.style.transform = "translateY(-3px) scale(1.02)";
      }
    });

    btn.addEventListener("mouseleave", () => {
      if (!btn.disabled) {
        btn.style.transform = "translateY(0) scale(1)";
      }
    });
  });
});
