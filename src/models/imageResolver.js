const FETCH_TIMEOUT = 5_000;
const MAX_FILE_SIZE = 8_000_000;

async function resolveImageBuffer(interaction) {
    let imageUrl;

    // Attachment
    const attachment = interaction.options.getAttachment("image");
    if (attachment) {
        if (attachment.size > MAX_FILE_SIZE) {
            throw new Error("Image exceeds 8MB size limit");
        }
        imageUrl = attachment.url;
    }

    // URL
    if (!imageUrl) {
        const url = interaction.options.getString("url");
        if (url) imageUrl = url;
    }

    if (!imageUrl) {
        throw new Error("No image provided");
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let res;
    try {
        res = await fetch(imageUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }

    if (!res || !res.ok) {
        throw new Error("Failed to download image");
    }

    const contentType = res.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
        throw new Error("Provided URL is not an image");
    }

    return Buffer.from(await res.arrayBuffer());
}

module.exports = {
    resolveImageBuffer
};