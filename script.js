document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const htmlEditorEl = document.getElementById('html-code');
    const cssEditorEl = document.getElementById('css-code');
    const jsEditorEl = document.getElementById('js-code');
    const previewIframe = document.getElementById('preview-iframe');
    const consoleOutputEl = document.getElementById('console-output');
    const runBtn = document.getElementById('run-btn');
    const shareBtn = document.getElementById('share-btn');
    const shareMessageEl = document.getElementById('share-message');
    const clearConsoleBtn = document.getElementById('clear-console-btn');

    // --- CodeMirror Initialization ---
    const editorOptions = {
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: true,
        theme: 'dracula', // Match CSS theme
        matchBrackets: true // Optional addon
    };

    const cmHTML = CodeMirror.fromTextArea(htmlEditorEl, {
        mode: 'htmlmixed',
        ...editorOptions
    });

    const cmCSS = CodeMirror.fromTextArea(cssEditorEl, {
        mode: 'css',
        ...editorOptions
    });

    const cmJS = CodeMirror.fromTextArea(jsEditorEl, {
        mode: 'javascript',
        ...editorOptions
    });

    // --- Core Functionality ---

    // Function to render the code in the iframe
    const runCode = () => {
        const htmlCode = cmHTML.getValue();
        const cssCode = cmCSS.getValue();
        const jsCode = cmJS.getValue();

        // Get iframe's document and window
        const iframeDoc = previewIframe.contentDocument || previewIframe.contentWindow.document;
        const iframeWindow = previewIframe.contentWindow;

        // Clear previous content and errors
        iframeDoc.open();
        iframeDoc.write(''); // Clear existing content
        iframeDoc.close();
        consoleOutputEl.innerHTML = ''; // Clear console output in parent

        // Build the full HTML content
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Preview</title>
                <style>
                    ${cssCode}
                </style>
            </head>
            <body>
                ${htmlCode}
                <script>
                    // --- Console Capture inside iframe ---
                    // Store original console methods
                    const originalConsole = {
                        log: console.log,
                        warn: console.warn,
                        error: console.error,
                        info: console.info,
                        debug: console.debug,
                    };

                    // Override console methods
                    for (const method in originalConsole) {
                        if (typeof originalConsole[method] === 'function') {
                             console[method] = function(...args) {
                                // Send message to parent window
                                try {
                                    window.parent.postMessage({
                                        type: 'console',
                                        method: method,
                                        args: args.map(arg => {
                                            // Simple serialization for common types
                                            if (typeof arg === 'object' && arg !== null) {
                                                try {
                                                   // Attempt JSON stringify, handle errors/circular refs
                                                    return JSON.stringify(arg, (key, value) => {
                                                        if (typeof value === 'object' && value !== null) {
                                                            // Handle potential circular references by returning a placeholder
                                                            if (cache.includes(value)) return '[Circular]';
                                                            cache.push(value);
                                                        }
                                                        return value;
                                                    });
                                                } catch (e) {
                                                    // Fallback for complex objects, errors etc.
                                                    return String(arg);
                                                } finally {
                                                    cache = []; // Clear the cache after stringification attempt
                                                }
                                            }
                                            return String(arg); // Convert primitives to string
                                        })
                                    }, '*'); // Use '*' for any origin (simple example)
                                } catch (e) {
                                    // Fallback if postMessage fails
                                    originalConsole.error('Failed to send console message:', e);
                                }

                                // Optional: call original console method as well (for browser dev tools)
                                // originalConsole[method].apply(originalConsole, args);
                            };
                        }
                    }

                    // Cache for circular reference detection in JSON.stringify
                    let cache = [];

                    // --- Error Handling inside iframe ---
                    window.onerror = function(message, source, lineno, colno, error) {
                         window.parent.postMessage({
                             type: 'error',
                             message: message,
                             source: source,
                             lineno: lineno,
                             colno: colno,
                             stack: error ? error.stack : 'N/A'
                         }, '*');
                         return true; // Prevent default browser error handling
                    };

                    // Execute user's JavaScript
                    try {
                        ${jsCode}
                    } catch (e) {
                         // Catch syntax errors or errors not caught by window.onerror
                         window.parent.postMessage({
                             type: 'error',
                             message: e.message,
                             source: 'User Code',
                             lineno: e.lineno || 'N/A',
                             colno: e.colno || 'N/A',
                             stack: e.stack || 'N/A'
                         }, '*');
                    }

                </script>
            </body>
            </html>
        `;

        // Write the content to the iframe
        iframeDoc.open();
        iframeDoc.write(fullHtml);
        iframeDoc.close();
    };

    // Handle messages from the iframe (console logs and errors)
    window.addEventListener('message', (event) => {
        // In a production app, you should verify event.origin for security
        // if (event.origin !== 'your-expected-origin') return;

        const data = event.data;

        if (data.type === 'console') {
            const method = data.method;
            const args = data.args; // These are already serialized strings

            const logElement = document.createElement('div');
            logElement.classList.add(`console-${method}`);
            logElement.textContent = args.join(' '); // Join arguments into a single string

            consoleOutputEl.appendChild(logElement);
             // Auto-scroll to the bottom
             consoleOutputEl.scrollTop = consoleOutputEl.scrollHeight;

        } else if (data.type === 'error') {
             const errorElement = document.createElement('div');
             errorElement.classList.add('console-error');
             errorElement.textContent = `Error: ${data.message} at ${data.source}:${data.lineno}:${data.colno}`;

             // Add stack trace if available (optional)
             if (data.stack && data.stack !== 'N/A') {
                 const stackEl = document.createElement('div');
                 stackEl.style.fontSize = '0.8em';
                 stackEl.style.whiteSpace = 'pre-wrap';
                 stackEl.textContent = data.stack;
                 errorElement.appendChild(stackEl);
             }

             consoleOutputEl.appendChild(errorElement);
             // Auto-scroll to the bottom
             consoleOutputEl.scrollTop = consoleOutputEl.scrollHeight;
        }
    });

    // --- Auto-save ---
    const saveCode = () => {
        const htmlCode = cmHTML.getValue();
        const cssCode = cmCSS.getValue();
        const jsCode = cmJS.getValue();
        localStorage.setItem('htmlCode', htmlCode);
        localStorage.setItem('cssCode', cssCode);
        localStorage.setItem('jsCode', jsCode);
         // Clear share message
        shareMessageEl.textContent = '';
    };

    // Debounce the save function
    let saveTimer;
    const autoSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCode, 500); // Save 500ms after last change
    };

    cmHTML.on('change', autoSave);
    cmCSS.on('change', autoSave);
    cmJS.on('change', autoSave);

    // --- Load Code ---
    const loadCode = () => {
        const hash = window.location.hash.substring(1); // Get hash without '#'

        if (hash) {
            // Load from URL hash
            try {
                const decoded = atob(hash); // Decode Base64
                const parts = decoded.split('|||'); // Split by delimiter
                if (parts.length === 3) {
                    cmHTML.setValue(parts[0]);
                    cmCSS.setValue(parts[1]);
                    cmJS.setValue(parts[2]);
                     console.log("Code loaded from URL.");
                } else {
                    console.error("Invalid hash format.");
                    loadFromLocalStorage(); // Fallback to localStorage if hash is bad
                }
            } catch (e) {
                console.error("Failed to decode hash:", e);
                loadFromLocalStorage(); // Fallback if decoding fails
            }
        } else {
            // Load from localStorage
            loadFromLocalStorage();
        }

         // Initial run after loading
         runCode();
    };

    const loadFromLocalStorage = () => {
         const htmlCode = localStorage.getItem('htmlCode');
         const cssCode = localStorage.getItem('cssCode');
         const jsCode = localStorage.getItem('jsCode');

         cmHTML.setValue(htmlCode || '<!-- Write your HTML here -->\n<h1>Hello, Vanilla IDE!</h1>');
         cmCSS.setValue(cssCode || '/* Write your CSS here */\nbody { font-family: sans-serif; background-color: #f0f0f0; padding: 20px; } h1 { color: #333; }');
         cmJS.setValue(jsCode || '// Write your JS here\nconsole.log("Hello from the console!");\n\ndocument.body.style.border = "5px dashed purple";');
         console.log("Code loaded from localStorage or defaults.");
    };


    // --- Share Functionality ---
    const shareCode = () => {
        const htmlCode = cmHTML.getValue();
        const cssCode = cmCSS.getValue();
        const jsCode = cmJS.getValue();

        const combined = `${htmlCode}|||${cssCode}|||${jsCode}`; // Use a unique delimiter
        const encoded = btoa(combined); // Base64 encode

        const shareUrl = `${window.location.origin}${window.location.pathname}#${encoded}`;

        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            shareMessageEl.textContent = 'Link copied!';
            setTimeout(() => shareMessageEl.textContent = '', 3000); // Clear message after 3s
        }).catch(err => {
             console.error('Failed to copy share link:', err);
            shareMessageEl.textContent = 'Copy failed!';
             shareMessageEl.style.color = 'red';
             setTimeout(() => { shareMessageEl.textContent = ''; shareMessageEl.style.color = 'green'; }, 3000);
        });
    };

    // --- Clear Console ---
    const clearConsole = () => {
        consoleOutputEl.innerHTML = '';
    };

    // --- Event Listeners ---
    runBtn.addEventListener('click', runCode);
    shareBtn.addEventListener('click', shareCode);
    clearConsoleBtn.addEventListener('click', clearConsole);

    // --- Initial Load and Run ---
    loadCode(); // Load code from hash or storage on page load
});