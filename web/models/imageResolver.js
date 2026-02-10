const FETCH_TIMEOUT = 5_000;
const MAX_FILE_SIZE = 8_000_000;

/**
 * @param {import("discord.js").Attachment | string} imageOption
 * @returns {Promise<Buffer>}
 */
async function resolveImageBuffer(imageOption) {
    let imageUrl;

    // Attachment
    if (typeof imageOption === "object" && imageOption?.url) {
        if (imageOption.size > MAX_FILE_SIZE) {
            throw new Error("Image exceeds 8MB size limit");
        }
        imageUrl = imageOption.url;
    }

    // URL
    if (typeof imageOption === "string") {
        imageUrl = imageOption;
    }

    if (!imageUrl) {
        throw new Error("No image provided");
    }

    // Fetch image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let res;
    try {
        res = await fetch(imageUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }

    if (!res?.ok) {
        throw new Error("Failed to download image");
    }

    const contentType = res.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
        throw new Error("Provided input is not an image");
    }

    return Buffer.from(await res.arrayBuffer());
}

module.exports = {
    resolveImageBuffer
};