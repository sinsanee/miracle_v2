const { fontCSS } = require("./font");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;

function escapeSVG(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function createTextLayer(text, y, fontSize) {
    return {
        input: Buffer.from(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${CANVAS_WIDTH}"
                height="${CANVAS_HEIGHT}"
                viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"
            >
                <style>
                    ${fontCSS}
                </style>

                <text
                    x="${CANVAS_WIDTH / 2}"
                    y="${y}"
                    text-anchor="middle"
                    font-family="Goldman, serif"
                    font-size="${fontSize}"
                    fill="white"
                >
                    ${escapeSVG(text)}
                </text>
            </svg>
        `)
    };
}

module.exports = {
    createTextLayer
};