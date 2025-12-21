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

        try {
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
                    .setCustomId(`randomize_preview_${interaction.id}`)
                    .setLabel("🎲 Randomize Preview")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(`confirm_set_${interaction.id}`)
                    .setLabel("Confirm")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`cancel_set_${interaction.id}`)
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

            // Use collector instead of client.on to avoid memory leaks
            const collector = message.createMessageComponentCollector({
                time: 300000 // 5 minutes
            });

            const setData = {
                name,
                rarity,
                borderBuffer,
                author: interaction.user.id
            };

            collector.on('collect', async (buttonInteraction) => {
                // Check if it's actually the author's set
                if (buttonInteraction.user.id !== setData.author) {
                    return buttonInteraction.reply({
                        content: "❌ This is not your set.",
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    if (buttonInteraction.customId === `randomize_preview_${interaction.id}`) {
                        // Get another random card
                        const randomCard = await get('SELECT bordered_image FROM cards ORDER BY RANDOM() LIMIT 1');
                        
                        if (!randomCard) {
                            return buttonInteraction.reply({
                                content: 'No cards found in database.',
                                ephemeral: true
                            }).catch(console.error);
                        }

                        const cardImagePath = randomCard.bordered_image.replace('card_', 'card_').replace('.png', '_image.png');
                        let croppedImageBuffer;
                        
                        try {
                            croppedImageBuffer = fs.readFileSync(cardImagePath);
                        } catch (err) {
                            console.error('Failed to read card image:', err);
                            return buttonInteraction.reply({
                                content: 'Failed to load preview card image.',
                                ephemeral: true
                            }).catch(console.error);
                        }

                        // Generate new preview
                        const previewCard = await cardGenFromCropped(
                            croppedImageBuffer,
                            { name: "Preview", subtitle: "", footer: "" },
                            setData.borderBuffer
                        );

                        const attachment = new AttachmentBuilder(previewCard, {
                            name: "set_preview.png"
                        });

                        await buttonInteraction.update({
                            content: `🎨 **Set Preview: ${setData.name}**\nRarity: ${setData.rarity}`,
                            files: [attachment],
                            components: buttonInteraction.message.components
                        }).catch(console.error);
                    }
                    else if (buttonInteraction.customId === `confirm_set_${interaction.id}`) {
                        const { name, rarity, borderBuffer } = setData;

                        // Get the next ID from database
                        const maxIdRow = await get('SELECT MAX(id) as maxId FROM sets');
                        const nextId = (maxIdRow?.maxId || 0) + 1;

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
                                [nextId, name, borderFilePath, rarity, setData.author]
                            );
                            console.log(`Set saved to database with ID: ${nextId}`);
                        } catch (err) {
                            console.error('Failed to save set to database:', err);
                            await buttonInteraction.update({
                                content: "❌ Set saved to file but failed to save to database. Check console for errors.",
                                components: [],
                                files: buttonInteraction.message.attachments.map(a => a)
                            }).catch(console.error);
                            collector.stop();
                            return;
                        }

                        // Stop collector
                        collector.stop();

                        await buttonInteraction.update({
                            content: `✅ Set "${name}" confirmed and saved! (ID: ${nextId})`,
                            components: [],
                            files: buttonInteraction.message.attachments.map(a => a)
                        }).catch(console.error);
                    }
                    else if (buttonInteraction.customId === `cancel_set_${interaction.id}`) {
                        // Stop collector
                        collector.stop();

                        await buttonInteraction.update({
                            content: "❌ Set creation canceled.",
                            components: [],
                            files: buttonInteraction.message.attachments.map(a => a)
                        }).catch(console.error);
                    }
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    try {
                        await buttonInteraction.reply({
                            content: '❌ An error occurred. Please try again.',
                            ephemeral: true
                        });
                    } catch (e) {
                        console.error('Failed to send error message:', e);
                    }
                }
            });

            collector.on('end', () => {
                console.log('Set creation collector ended');
            });

        } catch (error) {
            console.error('Error in addSet command:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while creating the set preview.',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Failed to send error reply:', e);
            }
        }
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