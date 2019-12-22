const fs = require("mz/fs");
const path = require("path");
const jsonr = require("@airportyh/jsonr");

async function main() {
    const [windowWidth, windowHeight] = process.stdout.getWindowSize();
    const topOffset = 1;
    const stackFrameWidth = 40;
    clearScreen();
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
        if (String(data) === 'q') {
            process.stdin.setRawMode(false);
            clearScreen();
            console.log("Goodbye!");
            process.exit(0);
        }
        if (isUpArrow(data)) {
            stepBackward();
        } else if (isDownArrow(data)) {
            stepForward();
        }
    });
    const filePath = process.argv[2];
    if (!filePath) {
        console.log("Please provide a file name.");
        return;
    }

    const code = (await fs.readFile(filePath)).toString();

    const codeLines = code.split("\n");
    const maxLineNumberLength = String(codeLines.length).length;
    renderCodeLines(codeLines, maxLineNumberLength);

    const codeWidth = codeLines.reduce((longestWidth, line) =>
        line.length > longestWidth ? line.length : longestWidth, 0);
    const dividerColumn = codeWidth + maxLineNumberLength + 5;
    drawDivider(dividerColumn);
    drawDivider(dividerColumn + stackFrameWidth);

    const historyFilePath = path.join(
        path.dirname(filePath),
        path.basename(filePath, ".fun") + ".history"
    );

    const history = jsonr.parse((await fs.readFile(historyFilePath)).toString());
    let currentHistoryIdx = 0;

    renderProgramCounter();
    renderStackFrame(dividerColumn + 1);
    updateHistoryDisplay();

    // ========// UI/Stateful Helper functions ==============

    function updateHistoryDisplay() {
        const lastStepDisplay = `Step ${history.length} of ${history.length}`;
        const display = `Step ${currentHistoryIdx + 1} of ${history.length}`.padEnd(lastStepDisplay.length, ' ');
        printAt(1, windowHeight, display);
        park();
    }

    function eraseStackFrame() {
        const column = dividerColumn + 1;
        const histEntry = history[currentHistoryIdx];
        const stack = histEntry.stack;
        let lineOffset = 1;
        for (let i = stack.length - 1; i >= 0; i--) {
            lineOffset = eraseFrame(stack[i], column, lineOffset);
        }
    }

    function eraseFrame(frame, column, lineOffset) {
        const paramList = Object.keys(frame.parameters)
            .map(key => `${key}=${frame.parameters[key]}`)
            .join(", ");
        const funDisplay = `${frame.funName}(${paramList})`.substring(0, stackFrameWidth - 1);
        printAt(column, lineOffset, ''.padEnd(funDisplay.length, ' '));
        lineOffset++;
        for (let varName in frame.variables) {
            const line = `  ${varName} = ${frame.variables[varName]}`.substring(0, stackFrameWidth - 1);;
            printAt(column, lineOffset, ''.padEnd(line.length, ' '));
            lineOffset++;
        }
        return lineOffset;
    }

    function renderStackFrame() {
        const column = dividerColumn + 1;
        const histEntry = history[currentHistoryIdx];
        const stack = histEntry.stack;
        let lineOffset = 1;
        for (let i = stack.length - 1; i >= 0; i--) {
            lineOffset = renderFrame(stack[i], column, lineOffset);
        }
    }

    function displayValue(value) {
        if (typeof value === "string") {
            return quote(value);
        } else {
            return String(value);
        }
    }

    function quote(str) {
        return '"' + str.replace(/\"/g, '\\"') + '"';
    }

    function renderFrame(frame, column, lineOffset) {
        const paramList = Object.keys(frame.parameters)
            .map(key => `${key}=${displayValue(frame.parameters[key])}`)
            .join(", ");
        const funDisplay = `${frame.funName}(${paramList})`.substring(0, stackFrameWidth - 1);
        printAt(column, lineOffset, funDisplay);
        lineOffset++;
        for (let varName in frame.variables) {
            printAt(column, lineOffset, `  ${varName} = ${displayValue(frame.variables[varName])}`.substring(0, stackFrameWidth - 1));
            lineOffset++;
        }
        return lineOffset;
    }

    function stepForward() {
        if (currentHistoryIdx + 1 >= history.length) {
            return;
        }

        eraseProgramCounter();
        eraseStackFrame();
        currentHistoryIdx++;
        renderProgramCounter();
        renderStackFrame();
        updateHistoryDisplay();
        renderHeap();
    }

    function stepBackward() {
        if (currentHistoryIdx - 1 < 0) {
            return;
        }

        eraseProgramCounter();
        eraseStackFrame();
        currentHistoryIdx--;
        renderProgramCounter();
        renderStackFrame();
        updateHistoryDisplay();
        renderHeap();
    }

    function eraseProgramCounter() {
        const histEntry = history[currentHistoryIdx];
        const line = histEntry.line;
        printAt(1, line + topOffset - 1, " ");
    }

    function renderProgramCounter() {
        const histEntry = history[currentHistoryIdx];
        const line = histEntry.line;
        printAt(1, line + topOffset - 1, "→");
        park();
    }

    function renderHeap() {
        const column = dividerColumn + stackFrameWidth + 1;
        const histEntry = history[currentHistoryIdx];
        const heap = histEntry.heap;
        let offsetTop = 1;
        for (let key in heap) {
            const object = heap[key];
            if (Array.isArray(object)) {
                printAt(column, offsetTop++, "&" + key + "┌" + Array(object.length).join("─┬") + "─┐");
                printAt(column, offsetTop++, "  │" + object.join("│") + "│");
                printAt(column, offsetTop++, "  └" + Array(object.length).join("─┴") + "─┘");
            } else {
                // dictionary
                const entries = [];
                for (let key in object) {
                    entries.push([displayValue(key), displayValue(object[key])]);
                }
                const column1Width = entries.reduce((width, entry) =>
                    entry[0].length > width ? entry[0].length : width, 1);
                const column2Width = entries.reduce((width, entry) =>
                    entry[1].length > width ? entry[1].length : width, 1);
                const line1 = "&" + key + "┌" + Array(column1Width + 1).join("─") + "┬" + Array(column2Width).join("─") + "─┐";
                const lineLast = "  └" + Array(column1Width + 1).join("─") + "┴" + Array(column2Width).join("─") + "─┘";
                printAt(column, offsetTop++, line1.padEnd(windowWidth - column, " "));
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    printAt(column, offsetTop++,
                        ("  │" + entry[0].padEnd(column1Width, " ") + "│" + entry[1].padEnd(column2Width, " ") + "│")
                        .padEnd(windowWidth - column, " ")
                    );
                    if (i < entries.length - 1) {
                        printAt(column, offsetTop++,
                            ("  ├" + "".padEnd(column1Width, "─") + "┼" + "".padEnd(column2Width, "─") + "┤")
                            .padEnd(windowWidth - column, " ")
                        );
                    } else {
                        printAt(column, offsetTop++, lineLast.padEnd(windowWidth - column, " "));
                    }
                }
                if (entries.length === 0) {
                    printAt(column, offsetTop++, lineLast.padEnd(windowWidth - column, " "));
                }
            }
        }
        while (offsetTop < windowHeight) {
            printAt(column, offsetTop++, "".padEnd(windowWidth - column, " "));
        }
    }

    function park() {
        printAt(1, windowHeight, "");
    }

    function drawDivider(leftOffset) {
        for (let i = 0; i < windowHeight; i++) {
            printAt(leftOffset, i + topOffset, "║");
        }
    }

    function renderCodeLines(codeLines, maxLineNumberLength) {
        clearScreen();
        for (let i = 0; i < codeLines.length; i++) {
            const line = String(i + 1)
                .padStart(maxLineNumberLength, " ")
                + " " + codeLines[i];
            printAt(3, i + topOffset, line);
        }
    }
}

main().catch((e) => console.log(e.stack));

// ============= Helper functions ================

function clearScreen() {
    process.stdout.write(encode('[0m'));
    process.stdout.write(encode('[2J'));
    process.stdout.write(encode('c'));
}

function printAt(x, y, value) {
    process.stdout.write(encode(`[${y};${x}f`));
    process.stdout.write(value);
}

function isLeftArrow(data) {
    return data.length === 3 &&
        data[0] === 27 &&
        data[1] === 91 &&
        data[2] === 68;
}

function isRightArrow(data) {
    return data.length === 3 &&
        data[0] === 27 &&
        data[1] === 91 &&
        data[2] === 67;
}

function isUpArrow(data) {
    return data.length === 3 &&
        data[0] === 27 &&
        data[1] === 91 &&
        data[2] === 65;
}

function isDownArrow(data) {
    return data.length === 3 &&
        data[0] === 27 &&
        data[1] === 91 &&
        data[2] === 66;
}

// Stolen from charm
function encode (xs) {
    function bytes (s) {
        if (typeof s === 'string') {
            return s.split('').map(ord);
        }
        else if (Array.isArray(s)) {
            return s.reduce(function (acc, c) {
                return acc.concat(bytes(c));
            }, []);
        }
    }

    return Buffer.from([ 0x1b ].concat(bytes(xs)));
};

function ord (c) {
    return c.charCodeAt(0)
};
