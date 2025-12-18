const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { cardGenFromCropped } = require('../../models/cardGen');
const { userExists } = require('../../models/users');
const { all, get, run } = require('../../models/query');
const { resolveImageBuffer } = require("../../models/imageResolver");
const fs = require("fs");
const path = require("path");

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();
        
        // Variables
        const name = interaction.options.get('name').value
        const border = interaction.options.getAttachment('border')
        const rarity = interaction.options.get('rarity').value
        const author = interaction.user.id

        // User registered check
        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are not registered.',
                ephemeral: true
            });
        }

        // Creates a map for currently active sets
        const activeSets = new Map();

        // Resolve border image buffer
        const borderBuffer = await resolveImageBuffer(border);

        // Get a random card image from database
        const randomCard = await get('SELECT bordered_image FROM cards ORDER BY RANDOM() LIMIT 1');
        
        if (!randomCard) {
            return interaction.editReply({
                content: 'No cards found in database. Please create at least one card first.',
                ephemeral: true
            });
        }

        // Read the random card's cropped image
        const cardImagePath = randomCard.bordered_image.replace('card_', 'card_').replace('.png', '_image.png');
        let croppedImageBuffer;
        
        try {
            croppedImageBuffer = fs.readFileSync(cardImagePath);
        } catch (err) {
            console.error('Failed to read card image:', err);
            return interaction.editReply({
                content: 'Failed to load preview card image.',
                ephemeral: true
            });
        }

        // Generate preview card with the new border
        const previewCard = await cardGenFromCropped(
            croppedImageBuffer,
            { name: "Preview", subtitle: "", footer: "" },
            borderBuffer
        );

        // Setting the buttons
        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("randomize_preview")
                .setLabel("🎲 Randomize Preview")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("confirm_set")
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("cancel_set")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger)
        );

        const attachment = new AttachmentBuilder(previewCard, {
            name: "set_preview.png"
        });

        // Send the message
        const message = await interaction.editReply({
            content: `🎨 **Set Preview: ${name}**\nRarity: ${rarity}`,
            files: [attachment],
            components: [actionButtons]
        });

        // Store the active set state
        activeSets.set(message.id, {
            name,
            rarity,
            borderBuffer,
            author: interaction.user.id
        });

        // Randomize preview button logic
        client.on("interactionCreate", async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId !== "randomize_preview") return;

            const state = activeSets.get(interaction.message.id);
            if (!state) return;

            // Check if it's actually your set
            if (interaction.user.id !== state.author) {
                return interaction.reply({
                    content: "❌ This is not your set.",
                    ephemeral: true
                });
            }

            // Get another random card
            const randomCard = await get('SELECT bordered_image FROM cards ORDER BY RANDOM() LIMIT 1');
            
            if (!randomCard) {
                return interaction.reply({
                    content: 'No cards found in database.',
                    ephemeral: true
                });
            }

            const cardImagePath = randomCard.bordered_image.replace('card_', 'card_').replace('.png', '_image.png');
            let croppedImageBuffer;
            
            try {
                croppedImageBuffer = fs.readFileSync(cardImagePath);
            } catch (err) {
                console.error('Failed to read card image:', err);
                return interaction.reply({
                    content: 'Failed to load preview card image.',
                    ephemeral: true
                });
            }

            // Generate new preview
            const previewCard = await cardGenFromCropped(
                croppedImageBuffer,
                { name: "Preview", subtitle: "", footer: "" },
                state.borderBuffer
            );

            const attachment = new AttachmentBuilder(previewCard, {
                name: "set_preview.png"
            });

            await interaction.update({
                content: `🎨 **Set Preview: ${state.name}**\nRarity: ${state.rarity}`,
                files: [attachment],
                components: interaction.message.components
            });
        });

        // Confirm button logic
        client.on("interactionCreate", async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId !== "confirm_set") return;

            const state = activeSets.get(interaction.message.id);
            if (!state) return;

            if (interaction.user.id !== state.author) {
                return interaction.reply({
                    content: "❌ This is not your set.",
                    ephemeral: true
                });
            }

            const { name, rarity, borderBuffer } = state;

            // Get the next ID from database
            const maxIdRow = await get('SELECT MAX(id) as maxId FROM sets');
            const nextId = Number(maxIdRow?.maxId || 0) + 1;

            // Save border image
            const basePath = path.join(__dirname, "../../img/borders");
            const borderFilePath = `.\\src\\img\\borders\\${name}.png`;

            // Ensure borders directory exists
            if (!fs.existsSync(basePath)) {
                fs.mkdirSync(basePath, { recursive: true });
            }

            fs.writeFileSync(path.join(basePath, `${name}.png`), borderBuffer);

            // Save to database
            try {
                await run(
                    'INSERT INTO sets (id, name, border, rarity, creator) VALUES (?, ?, ?, ?, ?)',
                    [nextId, name, borderFilePath, rarity, state.author]
                );
                console.log(`Set saved to database with ID: ${nextId}`);
            } catch (err) {
                console.error('Failed to save set to database:', err);
                await interaction.update({
                    content: "❌ Set saved to file but failed to save to database. Check console for errors.",
                    components: [],
                    files: interaction.message.attachments.map(a => a)
                });
                return;
            }

            // Cleanup state
            activeSets.delete(interaction.message.id);

            await interaction.update({
                content: `✅ Set "${name}" confirmed and saved! (ID: ${nextId})`,
                components: [],
                files: interaction.message.attachments.map(a => a)
            });
        });

        // Cancel button logic
        client.on("interactionCreate", async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId !== "cancel_set") return;

            const state = activeSets.get(interaction.message.id);
            if (!state) return;

            if (interaction.user.id !== state.author) {
                return interaction.reply({
                    content: "❌ This is not your set.",
                    ephemeral: true
                });
            }

            // Cleanup state
            activeSets.delete(interaction.message.id);

            await interaction.update({
                content: "❌ Set creation canceled.",
                components: [],
                files: interaction.message.attachments.map(a => a)
            });
        });
    },
    name: 'add-set',
    description: 'Add a set (admin only)',
    devOnly: true,
    options: [
        {
            name: 'name',
            description: 'The name of the set',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'border',
            description: 'The border of the set (look at the handbook for more info).',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        },
        {
            name: 'rarity',
            description: 'The rarity of the set (explained in admin handbook)',
            type: ApplicationCommandOptionType.Integer,
            required: true
        },
    ]
}