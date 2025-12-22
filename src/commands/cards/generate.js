const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { resolveImageBuffer } = require("../../models/imageResolver");
const { userExists } = require('../../models/users');
const { cardGen, cardGenFromCropped } = require('../../models/cardGen');
const { cropImage } = require("../../models/imageCrop");
const { getBorder } = require("../../models/getBorder");
const { all, get, run } = require('../../models/query');
const fs = require("fs");
const path = require("path");
const sharp = require("sharp")

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        // Variables
        const name = interaction.options.get('name').value
        const set = interaction.options.get('set')?.value || 1
        const img = interaction.options.getAttachment('image')
        const url = interaction.options.getString('url')
        const edition = interaction.options.get('edition')?.value || 1
        const author = interaction.user.id

        const border = await getBorder(set)

        // User registered check
        if (!(await userExists(interaction.user.id))) {
            return interaction.reply({
                content: 'You are not registered.',
                ephemeral: true
            });
        }

        // Chooses which images option is chosen, or null
        const imageOption = img ?? url;

        // If there is no image
        if (!imageOption) {
            return interaction.reply({
                content: "Please provide an image or image URL.",
                ephemeral: true
            });
        }
        
        try {
            // Create the image
            await interaction.deferReply();
            const buffer = await resolveImageBuffer(imageOption);

            // Default crop mode (important)
            let cropMode = "centre";

            const image = await cardGen(buffer, {
                name,
                subtitle: "",
                footer: "",
            }, cropMode, border);

            // Cropping selection menu
            const cropSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`crop_select_${interaction.id}`)
                    .setPlaceholder("Choose crop mode")
                    .addOptions([
                        { label: "Center", value: "centre" },
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" },
                        { label: "Top", value: "top" },
                        { label: "Bottom", value: "bottom" },
                        { label: "Stretch", value: "stretch" }
                    ])
            );

            // Setting the buttons
            const actionButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_card_${interaction.id}`)
                    .setLabel("Confirm")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`cancel_card_${interaction.id}`)
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger)
            );

            const attachment = new AttachmentBuilder(image, {
                name: "card.png"
            });

            // Send the message
            const message = await interaction.editReply({
                content: "🖼️ Card preview",
                files: [attachment],
                components: [cropSelect, actionButtons]
            });

            // Store card state
            const cardState = {
                buffer,
                data: { name, subtitle: "", footer: "" },
                cropMode: "centre",
                author: interaction.user.id,
                edition,
                set,
                border
            };

            // Create collector
            const collector = message.createMessageComponentCollector({
                idle: 300000 // 5 minutes of inactivity
            });

            collector.on('collect', async (i) => {
                // Check if it's actually the author's card
                if (i.user.id !== cardState.author) {
                    return i.reply({
                        content: "❌ This is not your card.",
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    // Handle crop selection
                    if (i.isStringSelectMenu() && i.customId === `crop_select_${interaction.id}`) {
                        const newCropMode = i.values[0];
                        cardState.cropMode = newCropMode;

                        const newImage = await cardGen(
                            cardState.buffer,
                            cardState.data,
                            newCropMode,
                            border
                        );

                        const attachment = new AttachmentBuilder(newImage, {
                            name: "card.png"
                        });

                        await i.update({
                            content: "🖼️ Card preview",
                            files: [attachment],
                            components: i.message.components
                        }).catch(console.error);

                        collector.resetTimer();
                    }
                    // Handle confirm button
                    else if (i.isButton() && i.customId === `confirm_card_${interaction.id}`) {
                        const { buffer, data, cropMode, edition, set } = cardState;

                        // Generate cropped image (NO border)
                        const croppedImage = await cropImage(buffer, cropMode);

                        // Generate full card (WITH border)
                        const finalCard = await cardGenFromCropped(croppedImage, data, border);

                        // Get the next ID from database
                        const maxIdRow = await get('SELECT MAX(id) as maxId FROM cards');
                        const nextId = Number(maxIdRow?.maxId || 0) + 1;

                        // Save both
                        const basePath = path.join(__dirname, "../../img/cards");
                        const cardId = Date.now();

                        const borderedImagePath = `.\\src\\img\\cards\\card_${cardId}.png`;
                        const croppedImagePath = `.\\src\\img\\cards\\card_${cardId}_image.png`;

                        fs.writeFileSync(path.join(basePath, `card_${cardId}.png`), finalCard);
                        fs.writeFileSync(path.join(basePath, `card_${cardId}_image.png`), croppedImage);

                        // Save to database
                        try {
                            await run(
                                'INSERT INTO cards (id, edition, name, `set`, image, bordered_image, creator) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                [nextId, edition, data.name, set, croppedImagePath, borderedImagePath, cardState.author]
                            );
                            console.log(`Card saved to database with ID: ${nextId}`);
                        } catch (err) {
                            console.error('Failed to save card to database:', err);
                            await i.update({
                                content: "❌ Card saved to files but failed to save to database. Check console for errors.",
                                components: [],
                                files: i.message.attachments.map(a => a)
                            }).catch(console.error);
                            collector.stop();
                            return;
                        }

                        // Stop collector
                        collector.stop();

                        await i.update({
                            content: `✅ Card confirmed and saved! (ID: ${nextId})`,
                            components: [],
                            files: i.message.attachments.map(a => a)
                        }).catch(console.error);
                    }
                    // Handle cancel button
                    else if (i.isButton() && i.customId === `cancel_card_${interaction.id}`) {
                        collector.stop();

                        await i.update({
                            content: "❌ Card generation canceled.",
                            components: [],
                            files: i.message.attachments.map(a => a)
                        }).catch(console.error);
                    }
                } catch (error) {
                    console.error('Error handling card generation interaction:', error);
                    try {
                        await i.reply({
                            content: '❌ An error occurred. Please try again.',
                            ephemeral: true
                        });
                    } catch (e) {
                        console.error('Failed to send error message:', e);
                    }
                }
            });

            collector.on('end', () => {
                console.log('Card generation collector ended');
            });

        } catch (error) {
            console.error('Error in generate command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: '❌ An error occurred while generating the card.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ An error occurred while generating the card.',
                        ephemeral: true
                    });
                }
            } catch (e) {
                console.error('Failed to send error reply:', e);
            }
        }
    },
    name: 'generate',
    description: 'Generate a card (admin only)',
    devOnly: true,
    options: [
        {
            name: 'name',
            description: 'The name of the card',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'image',
            description: 'The image you want to use for this card (aspect ratio of 1:1)',
            type: ApplicationCommandOptionType.Attachment,
            required: false
        },
        {
            name: 'url',
            description: 'Incase you want to use an image url instead of an attachment (aspect ratio of 1:1)',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'set',
            description: 'The set of this card (Default = Current Set)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
            choices: [
                {
                    name: 'Alpha',
                    value: 1
                },
                {
                    name: 'Christmas',
                    value: 2
                },
                {
                    name: 'Gingerbread',
                    value: 3
                },
                {
                    name: 'Legends',
                    value: 4
                },
            ]
        },
        {
            name: 'edition',
            description: 'Which edition is this card? (Default 1)',
            type: ApplicationCommandOptionType.String,
            required: false
        },
    ]
}