const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get } = require('../../models/query');
const { resolveImageBuffer } = require('../../models/imageResolver');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();

        // Variables
        const name = interaction.options.get('name').value;
        const edition = interaction.options.get('edition')?.value;
        const sort = interaction.options.get('sort')?.value || 'name ASC';

        try {
            // Build the SQL query - group by name and edition
            let query = 'SELECT name, edition, COUNT(*) as set_count FROM cards WHERE name LIKE ? AND dropping = 1';
            const params = [`%${name}%`];

            if (edition) {
                query += ' AND edition = ?';
                params.push(edition);
            }

            query += ` GROUP BY name, edition ORDER BY ${sort}`;

            // Execute the search
            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: 'No cards found matching your search.',
                    ephemeral: true
                });
            }

            // If only one result, show set selection directly
            if (results.length === 1) {
                const character = results[0];
                await showSetSelection(interaction, character.name, character.edition);
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
            const embeds = pages.map((pageCards, pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Search Results for "${name}"`)
                    .setDescription(`Found ${results.length} character${results.length !== 1 ? 's' : ''}`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                for (const [index, character] of pageCards.entries()) {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    const setCountText = character.set_count > 1 ? `${character.set_count} sets` : '1 set';
                    
                    embed.addFields({
                        name: `${globalIndex}. ${character.name}`,
                        value: `Edition: ${character.edition} • Available in ${setCountText}`,
                        inline: false
                    });
                }

                return embed;
            });

            // Create dropdown for character selection
            let currentPage = 0;

            const createDropdown = (pageIndex) => {
                const pageCards = pages[pageIndex];
                const options = pageCards.map((character, index) => {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    const setCountText = character.set_count > 1 ? `${character.set_count} sets` : '1 set';
                    return {
                        label: `${globalIndex}. ${character.name}`,
                        description: `Edition ${character.edition} • ${setCountText}`,
                        value: `${character.name}|${character.edition}`
                    };
                });

                return new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`select_character_${interaction.id}`)
                        .setPlaceholder('Select a character to view sets')
                        .addOptions(options)
                );
            };

            // Create pagination buttons
            const createPaginationButtons = (currentPage) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pagefirst_${interaction.id}`)
                        .setLabel('⏮️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId(`pageprev_${interaction.id}`)
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId(`pagenext_${interaction.id}`)
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === embeds.length - 1),
                    new ButtonBuilder()
                        .setCustomId(`pagelast_${interaction.id}`)
                        .setLabel('⏭️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === embeds.length - 1)
                );
            };

            const message = await interaction.editReply({
                embeds: [embeds[currentPage]],
                components: [createDropdown(currentPage), createPaginationButtons(currentPage)]
            });

            // Setup collector
            const collector = message.createMessageComponentCollector({
                idle: 60000 // 60 seconds
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use this button`,
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    if (i.customId === `select_character_${interaction.id}`) {
                        const [characterName, characterEdition] = i.values[0].split('|');
                        collector.stop();
                        await showSetSelection(i, characterName, parseInt(characterEdition));
                    } else if (i.customId.startsWith('page')) {
                        if (i.customId === `pagefirst_${interaction.id}`) {
                            currentPage = 0;
                        } else if (i.customId === `pageprev_${interaction.id}`) {
                            if (currentPage > 0) currentPage--;
                        } else if (i.customId === `pagenext_${interaction.id}`) {
                            if (currentPage < embeds.length - 1) currentPage++;
                        } else if (i.customId === `pagelast_${interaction.id}`) {
                            currentPage = embeds.length - 1;
                        }

                        await i.update({
                            embeds: [embeds[currentPage]],
                            components: [createDropdown(currentPage), createPaginationButtons(currentPage)]
                        }).catch(console.error);

                        collector.resetTimer();
                    }
                } catch (error) {
                    console.error('Error handling interaction:', error);
                }
            });

            collector.on('end', async () => {
                await message.edit({
                    embeds: [embeds[currentPage]],
                    components: []
                }).catch(console.error);
            });

        } catch (error) {
            console.error('Error in search command:', error);
            await interaction.editReply({
                content: 'An error occurred while searching for cards.',
                ephemeral: true
            }).catch(console.error);
        }

        /**
         * Show set selection for a specific character + edition
         */
        async function showSetSelection(interactionOrComponent, characterName, characterEdition) {
            // Get all cards with this name and edition
            const cards = await all(
                'SELECT cards.*, sets.name as set_name FROM cards LEFT JOIN sets ON cards.set_id = sets.id WHERE cards.name = ? AND cards.edition = ? AND cards.dropping = 1 ORDER BY sets.name ASC',
                [characterName, characterEdition]
            );

            if (!cards || cards.length === 0) {
                const updateMethod = interactionOrComponent.update || interactionOrComponent.editReply;
                return updateMethod.call(interactionOrComponent, {
                    content: 'No sets found for this character.',
                    embeds: [],
                    components: []
                });
            }

            // If only one set, show card directly
            if (cards.length === 1) {
                await showCardInfo(interactionOrComponent, cards[0], null);
                return;
            }

            // Multiple sets - show set selection
            const setEmbed = new EmbedBuilder()
                .setTitle(`${characterName} - Edition ${characterEdition}`)
                .setDescription(`This character is available in ${cards.length} different sets. Select a set to view:`)
                .setColor('#5865F2');

            for (const card of cards) {
                // Get circulation for this specific card
                const circulationResult = await get(
                    'SELECT COUNT(*) as count FROM owned_cards WHERE card = ?',
                    [card.id]
                );
                const circulation = circulationResult ? circulationResult.count : 0;

                setEmbed.addFields({
                    name: `🎨 ${card.set_name}`,
                    value: `Circulation: ${circulation} • Dropped: ${card.dropped} • Grabbed: ${card.grabbed}`,
                    inline: false
                });
            }

            // Create set selection dropdown
            const setOptions = cards.map(card => ({
                label: card.set_name,
                description: `Card ID: ${card.id}`,
                value: card.id.toString()
            }));

            const setSelectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`select_set_${interaction.id}`)
                    .setPlaceholder('Select a set')
                    .addOptions(setOptions)
            );

            const updateMethod = interactionOrComponent.update || interactionOrComponent.editReply;
            const message = await updateMethod.call(interactionOrComponent, {
                embeds: [setEmbed],
                components: [setSelectMenu],
                files: []
            });

            // Setup collector for set selection
            const setCollector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000
            });

            setCollector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use this button`,
                        ephemeral: true
                    }).catch(console.error);
                }

                const selectedCardId = parseInt(i.values[0]);
                const selectedCard = cards.find(c => c.id === selectedCardId);
                
                if (selectedCard) {
                    setCollector.stop();
                    await showCardInfo(i, selectedCard, cards);
                }
            });

            setCollector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({
                        components: []
                    }).catch(console.error);
                }
            });
        }

        /**
         * Show card info with image viewing and back button
         */
        async function showCardInfo(interactionOrComponent, card, allSetsCards) {
            let currentView = 'info'; // 'info' or 'image'
            const infoData = await createCardInfoEmbed(card);

            // Create buttons
            const buttons = new ActionRowBuilder();
            
            // Back to sets button (only if there are multiple sets)
            if (allSetsCards && allSetsCards.length > 1) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`back_to_sets_${interaction.id}`)
                        .setLabel('⬅️ Back to Sets')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            // View image button
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`view_image_${interaction.id}`)
                    .setLabel('🖼️ View Full Image')
                    .setStyle(ButtonStyle.Primary)
            );

            const backToInfoButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`back_to_info_${interaction.id}`)
                    .setLabel('⬅️ Back to Info')
                    .setStyle(ButtonStyle.Secondary)
            );

            const updateMethod = interactionOrComponent.update || interactionOrComponent.editReply;
            const message = await updateMethod.call(interactionOrComponent, {
                embeds: [infoData.embed],
                files: infoData.files,
                components: [buttons]
            });

            // Setup collector
            const infoCollector = message.createMessageComponentCollector({
                idle: 60000
            });

            infoCollector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use this button`,
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
                    if (i.customId === `view_image_${interaction.id}`) {
                        currentView = 'image';
                        const borderedImageUrl = `${process.env.IMAGE_BASE_URL}/${card.bordered_image}`;
                        const imageBuffer = await resolveImageBuffer(borderedImageUrl);
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

                        infoCollector.resetTimer();
                    } else if (i.customId === `back_to_info_${interaction.id}`) {
                        currentView = 'info';
                        const infoData = await createCardInfoEmbed(card);
                        
                        await i.update({
                            embeds: [infoData.embed],
                            files: infoData.files,
                            components: [buttons]
                        }).catch(console.error);

                        infoCollector.resetTimer();
                    } else if (i.customId === `back_to_sets_${interaction.id}`) {
                        infoCollector.stop();
                        await showSetSelection(i, card.name, card.edition);
                    }
                } catch (error) {
                    console.error('Error handling card info interaction:', error);
                }
            });

            infoCollector.on('end', async () => {
                if (currentView === 'info') {
                    await message.edit({
                        embeds: [infoData.embed],
                        files: infoData.files,
                        components: []
                    }).catch(console.error);
                } else if (currentView === 'image') {
                    try {
                        const borderedImageUrl = `${process.env.IMAGE_BASE_URL}/${card.bordered_image}`;
                        const imageBuffer = await resolveImageBuffer(borderedImageUrl);
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
                    } catch (error) {
                        console.error('Error in info collector end:', error);
                    }
                }
            });
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
            const setResult = await get('SELECT name FROM sets WHERE id = ?', [card.set_id]);
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
                const imageUrl = `${process.env.IMAGE_BASE_URL}/${card.image}`;
                const imageBuffer = await resolveImageBuffer(imageUrl);
                files.push(new AttachmentBuilder(imageBuffer, { name: 'card_image.png' }));
                embed.setThumbnail('attachment://card_image.png');
            } catch (error) {
                console.error('Error reading card image:', error);
            }

            return { embed, files };
        }
    },
    name: 'search',
    description: 'Search for cards by character name and edition',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'The name of the character',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'edition',
            description: 'Which edition of this character?',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
        {
            name: 'sort',
            description: 'How to sort your search',
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
                    name: 'Edition Low-High',
                    value: 'edition ASC'
                },
                {
                    name: 'Edition High-Low',
                    value: 'edition DESC'
                }
            ]
        }
    ]
}
