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
        const name = interaction.options.get('name')?.value;
        const set = interaction.options.get('set')?.value;
        const sort = interaction.options.get('sort')?.value || 'cards.name ASC';
        const edition = interaction.options.get('edition')?.value;
        const userId = interaction.user.id;

        /**
         * Convert condition number to text
         */
        function conditionToText(condition) {
            const conditions = {
                1: 'Poor',
                2: 'Played',
                3: 'Good',
                4: 'Near Mint',
                5: 'Mint'
            };
            return conditions[condition] || 'Unknown';
        }

        try {
            // Build the SQL query - join owned_cards with cards table
            let query = `
                SELECT 
                    owned_cards.id as owned_id,
                    owned_cards.print,
                    owned_cards.condition,
                    cards.*
                FROM owned_cards
                JOIN cards ON owned_cards.card = cards.id
                WHERE owned_cards.owner = ?
            `;
            const params = [userId];

            if (name) {
                query += ' AND cards.name LIKE ?';
                params.push(`%${name}%`);
            }

            if (set) {
                query += ' AND cards.set = ?';
                params.push(set);
            }

            if (edition) {
                query += ' AND cards.edition = ?';
                params.push(edition);
            }

            query += ` ORDER BY ${sort}`;

            // Execute the search
            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: name 
                        ? 'No cards found matching your search in your collection.'
                        : 'Your collection is empty!',
                    ephemeral: true
                });
            }

            // Pagination setup
            const cardsPerPage = 10;
            const pages = [];

            for (let i = 0; i < results.length; i += cardsPerPage) {
                const pageCards = results.slice(i, i + cardsPerPage);
                pages.push(pageCards);
            }

            // Create embeds for pagination
            const embeds = await Promise.all(pages.map(async (pageCards, pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`📚 ${interaction.user.username}'s Collection`)
                    .setDescription(`Total cards: ${results.length}`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                for (const [index, card] of pageCards.entries()) {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    
                    // Get set name
                    const setResult = await get('SELECT name FROM sets WHERE id = ?', [card.set]);
                    const setName = setResult ? setResult.name : 'Unknown';
                    
                    const conditionText = conditionToText(card.condition);
                    
                    embed.addFields({
                        name: `${globalIndex}. ${card.name}`,
                        value: `**ID:** ${card.owned_id} | **Print:** #${card.print} | **Condition:** ${conditionText}`,
                        inline: false
                    });
                }

                return embed;
            }));

            let currentPage = 0;

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

            // If only one page, no need for pagination buttons
            if (embeds.length === 1) {
                return interaction.editReply({
                    embeds: [embeds[0]]
                });
            }

            const message = await interaction.editReply({
                embeds: [embeds[currentPage]],
                components: [createPaginationButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                idle: 60000 // 60 seconds of inactivity
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use these buttons`,
                        ephemeral: true
                    }).catch(console.error);
                }

                try {
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
                        components: [createPaginationButtons(currentPage)]
                    }).catch(console.error);

                    collector.resetTimer();
                } catch (error) {
                    console.error('Error handling pagination:', error);
                }
            });

            collector.on('end', async () => {
                await message.edit({
                    embeds: [embeds[currentPage]],
                    components: []
                }).catch(console.error);
            });

        } catch (error) {
            console.error('Error in collection command:', error);
            await interaction.editReply({
                content: 'An error occurred while viewing your collection.',
                ephemeral: true
            }).catch(console.error);
        }
    },
    name: 'collection',
    description: 'View your collection of cards.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Filter by card name',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'set',
            description: 'Filter by set',
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
            description: 'Sort your collection',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Name A-Z',
                    value: 'cards.name ASC'
                },
                {
                    name: 'Name Z-A',
                    value: 'cards.name DESC'
                },
                {
                    name: 'Dropped',
                    value: 'cards.dropped ASC'
                },
                {
                    name: 'Grabbed',
                    value: 'cards.grabbed ASC'
                },
                {
                    name: 'Set A-Z',
                    value: 'cards.set ASC'
                },
                {
                    name: 'Set Z-A',
                    value: 'cards.set DESC'
                },
                {
                    name: 'Newest',
                    value: 'owned_cards.ROWID DESC'
                },
                {
                    name: 'Oldest',
                    value: 'owned_cards.ROWID ASC'
                }
            ]
        },
        {
            name: 'edition',
            description: 'Filter by edition',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
    ]
}