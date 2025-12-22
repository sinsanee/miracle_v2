const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get } = require('../../models/query');
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
        const name = interaction.options.get('name').value;
        const set = interaction.options.get('set')?.value;
        const sort = interaction.options.get('sort')?.value || 'name ASC';
        const edition = interaction.options.get('edition')?.value;

        try {
            // Build the SQL query
            let query = 'SELECT * FROM cards WHERE name LIKE ?';
            const params = [`%${name}%`];

            if (set) {
                query += ' AND `set` = ?';
                params.push(set);
            }

            if (edition) {
                query += ' AND edition = ?';
                params.push(edition);
            }

            query += ` AND dropping = 1 ORDER BY ${sort}`;

            // Execute the search
            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: 'No cards found matching your search.',
                    ephemeral: true
                });
            }

            // If only one result, show info page directly
            if (results.length === 1) {
                const card = results[0];
                let currentView = 'info'; // 'info' or 'image'
                const infoData = await createCardInfoEmbed(card);
                
                // Create view image button
                const viewImageButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`view_image_single_${interaction.id}`)
                        .setLabel('🖼️ View Full Image')
                        .setStyle(ButtonStyle.Primary)
                );

                // Create back button for image view
                const backToInfoButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`back_to_info_single_${interaction.id}`)
                        .setLabel('⬅️ Back to Info')
                        .setStyle(ButtonStyle.Secondary)
                );

                const message = await interaction.editReply({
                    embeds: [infoData.embed],
                    files: infoData.files,
                    components: [viewImageButton]
                });

                // Setup collector for view image button
                const collector = message.createMessageComponentCollector({
                    idle: 30000 // 30 seconds of inactivity
                });

                collector.on('collect', async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({
                            content: `Only **${interaction.user.username}** can use this button`,
                            ephemeral: true
                        }).catch(console.error);
                    }

                    try {
                        if (i.customId === `view_image_single_${interaction.id}`) {
                            currentView = 'image';
                            const imagePath = card.bordered_image.replace('.\\src\\', './src/');
                            if (fs.existsSync(imagePath)) {
                                const imageBuffer = fs.readFileSync(imagePath);
                                const fullImageAttachment = new AttachmentBuilder(imageBuffer, { name: 'full_card.png' });
                                
                                const imageEmbed = new EmbedBuilder()
                                    .setTitle(card.name)
                                    .setImage('attachment://full_card.png')
                                    .setColor('#5865F2');

                                await i.update({
                                    embeds: [imageEmbed],
                                    files: [fullImageAttachment],
                                    components: [backToInfoButton]
                                }).catch(console.error);

                                collector.resetTimer();
                            }
                        } else if (i.customId === `back_to_info_single_${interaction.id}`) {
                            currentView = 'info';
                            const infoData = await createCardInfoEmbed(card);
                            
                            await i.update({
                                embeds: [infoData.embed],
                                files: infoData.files,
                                components: [viewImageButton]
                            }).catch(console.error);

                            collector.resetTimer();
                        }
                    } catch (error) {
                        console.error('Error handling single result interaction:', error);
                    }
                });

                collector.on('end', async () => {
                    if (currentView === 'info') {
                        await message.edit({
                            embeds: [infoData.embed],
                            files: infoData.files,
                            components: []
                        }).catch(console.error);
                    } else if (currentView === 'image') {
                        try {
                            const imagePath = card.bordered_image.replace('.\\src\\', './src/');
                            if (fs.existsSync(imagePath)) {
                                const imageBuffer = fs.readFileSync(imagePath);
                                const fullImageAttachment = new AttachmentBuilder(imageBuffer, { name: 'full_card.png' });
                                
                                const imageEmbed = new EmbedBuilder()
                                    .setTitle(card.name)
                                    .setImage('attachment://full_card.png')
                                    .setColor('#5865F2');

                                await message.edit({
                                    embeds: [imageEmbed],
                                    files: [fullImageAttachment],
                                    components: []
                                }).catch(console.error);
                            }
                        } catch (error) {
                            console.error('Error in single result collector end:', error);
                        }
                    }
                });

                return;
            }

            // Multiple results - create pagination
            const cardsPerPage = 10;
            const pages = [];

            for (let i = 0; i < results.length; i += cardsPerPage) {
                const pageCards = results.slice(i, i + cardsPerPage);
                pages.push(pageCards);
            }

            // Create embeds for pagination
            const embeds = await Promise.all(pages.map(async (pageCards, pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Search Results for "${name}"`)
                    .setDescription(`Found ${results.length} card${results.length !== 1 ? 's' : ''}`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                for (const [index, card] of pageCards.entries()) {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    // Get set name
                    const setResult = await get('SELECT name FROM sets WHERE id = ?', [card.set]);
                    const setName = setResult ? setResult.name : 'Unknown';
                    
                    embed.addFields({
                        name: `${globalIndex}. ${card.name}`,
                        value: `Set: ${setName}`,
                        inline: false
                    });
                }

                return embed;
            }));

            let currentPage = 0;
            let currentView = 'list'; // 'list', 'info', or 'image'
            let currentCard = null;

            // Create dropdown for current page
            async function createDropdown(pageIndex) {
                const pageCards = pages[pageIndex];
                const options = await Promise.all(pageCards.map(async (card, index) => {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    // Get set name
                    const setResult = await get('SELECT name FROM sets WHERE id = ?', [card.set]);
                    const setName = setResult ? setResult.name : 'Unknown';
                    
                    return {
                        label: `${globalIndex}. ${card.name}`.substring(0, 100),
                        description: `Set: ${setName}`.substring(0, 100),
                        value: `card_${card.id}`
                    };
                }));

                return new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`card_select_${interaction.id}`)
                        .setPlaceholder('Select a card to view details')
                        .addOptions(options)
                );
            }

            // Create pagination buttons
            function createPaginationButtons(index) {
                const first = new ButtonBuilder()
                    .setCustomId(`pagefirst_${interaction.id}`)
                    .setEmoji('⏪')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === 0);

                const prev = new ButtonBuilder()
                    .setCustomId(`pageprev_${interaction.id}`)
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === 0);

                const pageCount = new ButtonBuilder()
                    .setCustomId(`pagecount_${interaction.id}`)
                    .setLabel(`${index + 1}/${embeds.length}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const next = new ButtonBuilder()
                    .setCustomId(`pagenext_${interaction.id}`)
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === embeds.length - 1);

                const last = new ButtonBuilder()
                    .setCustomId(`pagelast_${interaction.id}`)
                    .setEmoji('⏩')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === embeds.length - 1);

                return new ActionRowBuilder().addComponents([first, prev, pageCount, next, last]);
            }

            // Create info view buttons
            function createInfoButtons(cardId) {
                const backButton = new ButtonBuilder()
                    .setCustomId(`back_to_list_${interaction.id}`)
                    .setLabel('⬅️ Back to List')
                    .setStyle(ButtonStyle.Secondary);

                const viewImageButton = new ButtonBuilder()
                    .setCustomId(`view_image_${interaction.id}_${cardId}`)
                    .setLabel('🖼️ View Full Image')
                    .setStyle(ButtonStyle.Primary);

                return new ActionRowBuilder().addComponents([backButton, viewImageButton]);
            }

            // Create image view buttons
            function createImageButtons() {
                const backButton = new ButtonBuilder()
                    .setCustomId(`back_to_info_${interaction.id}`)
                    .setLabel('⬅️ Back to Info')
                    .setStyle(ButtonStyle.Secondary);

                return new ActionRowBuilder().addComponents([backButton]);
            }

            const message = await interaction.editReply({
                embeds: [embeds[currentPage]],
                components: [await createDropdown(currentPage), createPaginationButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                idle: 30000 // 30 seconds of inactivity
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use these buttons`,
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    // Handle card selection
                    if (i.isStringSelectMenu() && i.customId === `card_select_${interaction.id}`) {
                        const cardId = parseInt(i.values[0].replace('card_', ''));
                        const card = results.find(c => c.id === cardId);

                        if (card) {
                            currentCard = card;
                            currentView = 'info';
                            const infoData = await createCardInfoEmbed(card);
                            
                            await i.update({
                                embeds: [infoData.embed],
                                files: infoData.files,
                                components: [createInfoButtons(card.id)]
                            }).catch(console.error);

                            collector.resetTimer();
                        }
                    }
                    // Handle back to list button
                    else if (i.isButton() && i.customId === `back_to_list_${interaction.id}`) {
                        currentView = 'list';
                        currentCard = null;

                        await i.update({
                            embeds: [embeds[currentPage]],
                            files: [],
                            components: [await createDropdown(currentPage), createPaginationButtons(currentPage)]
                        }).catch(console.error);

                        collector.resetTimer();
                    }
                    // Handle back to info button
                    else if (i.isButton() && i.customId === `back_to_info_${interaction.id}`) {
                        if (currentCard) {
                            currentView = 'info';
                            const infoData = await createCardInfoEmbed(currentCard);
                            
                            await i.update({
                                embeds: [infoData.embed],
                                files: infoData.files,
                                components: [createInfoButtons(currentCard.id)]
                            }).catch(console.error);

                            collector.resetTimer();
                        }
                    }
                    // Handle view full image button
                    else if (i.isButton() && i.customId.startsWith(`view_image_${interaction.id}_`)) {
                        const cardId = parseInt(i.customId.split('_').pop());
                        const card = results.find(c => c.id === cardId);

                        if (card) {
                            currentView = 'image';
                            try {
                                const imagePath = card.bordered_image.replace('.\\src\\', './src/');
                                if (fs.existsSync(imagePath)) {
                                    const imageBuffer = fs.readFileSync(imagePath);
                                    const fullImageAttachment = new AttachmentBuilder(imageBuffer, { name: 'full_card.png' });
                                    
                                    const imageEmbed = new EmbedBuilder()
                                        .setTitle(card.name)
                                        .setImage('attachment://full_card.png')
                                        .setColor('#5865F2');

                                    await i.update({
                                        embeds: [imageEmbed],
                                        files: [fullImageAttachment],
                                        components: [createImageButtons()]
                                    }).catch(console.error);

                                    collector.resetTimer();
                                }
                            } catch (error) {
                                console.error('Error showing full image:', error);
                            }
                        }
                    }
                    // Handle pagination
                    else if (i.isButton()) {
                        await i.deferUpdate();

                        if (i.customId === `pagefirst_${interaction.id}`) {
                            currentPage = 0;
                        } else if (i.customId === `pageprev_${interaction.id}`) {
                            if (currentPage > 0) currentPage--;
                        } else if (i.customId === `pagenext_${interaction.id}`) {
                            if (currentPage < embeds.length - 1) currentPage++;
                        } else if (i.customId === `pagelast_${interaction.id}`) {
                            currentPage = embeds.length - 1;
                        }

                        await message.edit({
                            embeds: [embeds[currentPage]],
                            components: [await createDropdown(currentPage), createPaginationButtons(currentPage)]
                        }).catch(console.error);

                        collector.resetTimer();
                    }
                } catch (error) {
                    console.error('Error handling interaction:', error);
                }
            });

            collector.on('end', async () => {
                if (currentView === 'list') {
                    await message.edit({
                        embeds: [embeds[currentPage]],
                        components: []
                    }).catch(console.error);
                } else if (currentView === 'info' && currentCard) {
                    const infoData = await createCardInfoEmbed(currentCard);
                    await message.edit({
                        embeds: [infoData.embed],
                        files: infoData.files,
                        components: []
                    }).catch(console.error);
                } else if (currentView === 'image' && currentCard) {
                    try {
                        const imagePath = currentCard.bordered_image.replace('.\\src\\', './src/');
                        if (fs.existsSync(imagePath)) {
                            const imageBuffer = fs.readFileSync(imagePath);
                            const fullImageAttachment = new AttachmentBuilder(imageBuffer, { name: 'full_card.png' });
                            
                            const imageEmbed = new EmbedBuilder()
                                .setTitle(currentCard.name)
                                .setImage('attachment://full_card.png')
                                .setColor('#5865F2');

                            await message.edit({
                                embeds: [imageEmbed],
                                files: [fullImageAttachment],
                                components: []
                            }).catch(console.error);
                        }
                    } catch (error) {
                        console.error('Error in collector end:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Error in search command:', error);
            await interaction.editReply({
                content: 'An error occurred while searching for cards.',
                ephemeral: true
            }).catch(console.error);
        }

        /**
         * Create card info embed with details
         */
        async function createCardInfoEmbed(card) {
            // Get circulation count
            const circulationResult = await get(
                'SELECT COUNT(*) as count FROM owned_cards WHERE card = ?',
                [card.id]
            );
            const circulation = circulationResult ? circulationResult.count : 0;

            // Get set name
            const setResult = await get('SELECT name FROM sets WHERE id = ?', [card.set]);
            const setName = setResult ? setResult.name : 'Unknown';

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(card.name)
                .setColor('#5865F2')
                .addFields(
                    { name: '🎨 Set', value: setName, inline: false },
                    { name: '🏷️ Edition', value: card.edition.toString(), inline: false },
                    { name: '📊 Circulation', value: circulation.toString(), inline: false },
                    { name: '📤 Dropped', value: card.dropped.toString(), inline: false },
                    { name: '✅ Grabbed', value: card.grabbed.toString(), inline: false },
                    { name: '🆔 Card ID', value: card.id.toString(), inline: false }
                )
                .setTimestamp();

            // Attach the raw card image
            const files = [];
            try {
                const imagePath = card.image.replace('.\\src\\', './src/');
                if (fs.existsSync(imagePath)) {
                    const imageBuffer = fs.readFileSync(imagePath);
                    files.push(new AttachmentBuilder(imageBuffer, { name: 'card_image.png' }));
                    embed.setThumbnail('attachment://card_image.png');
                }
            } catch (error) {
                console.error('Error reading card image:', error);
            }

            return { embed, files };
        }
    },
    name: 'search',
    description: 'Search for cards in the database',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'The name of the card',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'set',
            description: 'The set of this card',
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
                }
            ]
        },
        {
            name: 'sort',
            description: 'The way you wanna sort your search',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Name A-Z',
                    value: 'name ASC'
                },
                {
                    name: 'Name Z-A',
                    value: 'name DESC'
                },
                {
                    name: 'Dropped',
                    value: 'dropped ASC'
                },
                {
                    name: 'Grabbed',
                    value: 'grabbed ASC'
                },
                {
                    name: 'Set A-Z',
                    value: 'set ASC'
                },
                {
                    name: 'Set Z-A',
                    value: 'set DESC'
                },
                {
                    name: 'Newest',
                    value: 'id DESC'
                },
                {
                    name: 'Oldest',
                    value: 'id ASC'
                }
            ]
        },
        {
            name: 'edition',
            description: 'Which edition is this card?',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
    ]
}