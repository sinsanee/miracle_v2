const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();

        const name    = interaction.options.get('name')?.value;
        const set     = interaction.options.get('set')?.value;
        const sort    = interaction.options.get('sort')?.value || 'cards.name ASC';
        const edition = interaction.options.get('edition')?.value;
        const tagName = interaction.options.get('tag')?.value?.trim();
        const userId  = interaction.user.id;

        function conditionToText(condition) {
            const conditions = { 1: 'Poor', 2: 'Played', 3: 'Good', 4: 'Near Mint', 5: 'Mint' };
            return conditions[condition] || 'Unknown';
        }

        try {
            // Resolve optional tag filter
            let tagFilter = null;
            if (tagName) {
                tagFilter = await get(
                    'SELECT id, name, emoji FROM tags WHERE userid = ? AND name = ?',
                    [userId, tagName]
                );
                if (!tagFilter) {
                    return interaction.editReply({
                        content: `❌ You don't have a tag named **${tagName}**.`,
                        ephemeral: true
                    });
                }
            }

            let query = `
                SELECT
                    owned_cards.id    AS owned_id,
                    owned_cards.print,
                    owned_cards.condition,
                    owned_cards.tag_id,
                    cards.*
                FROM owned_cards
                JOIN cards ON owned_cards.card = cards.id
                WHERE owned_cards.owner = ?
            `;
            const params = [userId];

            if (tagFilter) {
                query += ' AND owned_cards.tag_id = ?';
                params.push(tagFilter.id);
            }
            if (name) {
                query += ' AND cards.name LIKE ?';
                params.push(`%${name}%`);
            }
            if (set) {
                query += ' AND cards.set_id = ?';
                params.push(set);
            }
            if (edition) {
                query += ' AND cards.edition = ?';
                params.push(edition);
            }

            query += ` ORDER BY ${sort}`;

            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: tagFilter
                        ? `No cards found with tag **${tagFilter.emoji} ${tagFilter.name}** in your collection.`
                        : name
                            ? 'No cards found matching your search in your collection.'
                            : 'Your collection is empty!',
                    ephemeral: true
                });
            }

            // Pre-fetch all tags for this user so we can resolve tag_id → emoji+name cheaply
            const userTags = await all('SELECT id, name, emoji FROM tags WHERE userid = ?', [userId]);
            const tagById  = Object.fromEntries(userTags.map(t => [t.id, t]));

            // Pagination
            const cardsPerPage = 10;
            const pages = [];
            for (let i = 0; i < results.length; i += cardsPerPage) {
                pages.push(results.slice(i, i + cardsPerPage));
            }

            const titleSuffix = tagFilter ? ` — ${tagFilter.emoji} ${tagFilter.name}` : '';

            const embeds = await Promise.all(pages.map(async (pageCards, pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`📚 ${interaction.user.username}'s Collection${titleSuffix}`)
                    .setDescription(`Total cards: ${results.length}`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                for (const [index, card] of pageCards.entries()) {
                    const globalIndex = (pageIndex * cardsPerPage) + index + 1;
                    const setResult   = await get('SELECT name FROM sets WHERE id = ?', [card.set_id]);
                    const setName     = setResult ? setResult.name : 'Unknown';
                    const condText    = conditionToText(card.condition);
                    const tag         = card.tag_id ? tagById[card.tag_id] : null;
                    const tagLine     = tag ? `\n🏷️ ${tag.emoji} ${tag.name}` : '';

                    embed.addFields({
                        name: `${globalIndex}. ${card.name}`,
                        value: `**ID:** ${card.owned_id} | **Print:** #${card.print} | **Condition:** ${condText}${tagLine}`,
                        inline: false
                    });
                }

                return embed;
            }));

            let currentPage = 0;

            function createPaginationButtons(index) {
                const first = new ButtonBuilder()
                    .setCustomId(`pagefirst_${interaction.id}`).setEmoji('⏪').setStyle(ButtonStyle.Primary).setDisabled(index === 0);
                const prev = new ButtonBuilder()
                    .setCustomId(`pageprev_${interaction.id}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(index === 0);
                const pageCount = new ButtonBuilder()
                    .setCustomId(`pagecount_${interaction.id}`).setLabel(`${index + 1}/${embeds.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
                const next = new ButtonBuilder()
                    .setCustomId(`pagenext_${interaction.id}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(index === embeds.length - 1);
                const last = new ButtonBuilder()
                    .setCustomId(`pagelast_${interaction.id}`).setEmoji('⏩').setStyle(ButtonStyle.Primary).setDisabled(index === embeds.length - 1);
                return new ActionRowBuilder().addComponents([first, prev, pageCount, next, last]);
            }

            if (embeds.length === 1) {
                return interaction.editReply({ embeds: [embeds[0]] });
            }

            const message = await interaction.editReply({
                embeds: [embeds[currentPage]],
                components: [createPaginationButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({ idle: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `Only **${interaction.user.username}** can use these buttons`, ephemeral: true }).catch(console.error);
                }
                try {
                    await i.deferUpdate();
                    if      (i.customId === `pagefirst_${interaction.id}`) currentPage = 0;
                    else if (i.customId === `pageprev_${interaction.id}`)  currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === `pagenext_${interaction.id}`)  currentPage = Math.min(embeds.length - 1, currentPage + 1);
                    else if (i.customId === `pagelast_${interaction.id}`)  currentPage = embeds.length - 1;
                    await message.edit({ embeds: [embeds[currentPage]], components: [createPaginationButtons(currentPage)] }).catch(console.error);
                    collector.resetTimer();
                } catch (error) {
                    console.error('Error handling pagination:', error);
                }
            });

            collector.on('end', async () => {
                await message.edit({ embeds: [embeds[currentPage]], components: [] }).catch(console.error);
            });

        } catch (error) {
            console.error('Error in collection command:', error);
            await interaction.editReply({ content: 'An error occurred while viewing your collection.', ephemeral: true }).catch(console.error);
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
                { name: 'Alpha',     value: 1 },
                { name: 'Christmas', value: 2 }
            ]
        },
        {
            name: 'sort',
            description: 'Sort your collection',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                { name: 'Name A-Z',   value: 'cards.name ASC' },
                { name: 'Name Z-A',   value: 'cards.name DESC' },
                { name: 'Dropped',    value: 'cards.dropped ASC' },
                { name: 'Grabbed',    value: 'cards.grabbed ASC' },
                { name: 'Set A-Z',    value: 'cards.set_id ASC' },
                { name: 'Set Z-A',    value: 'cards.set_id DESC' },
                { name: 'Newest',     value: 'owned_cards.ROWID DESC' },
                { name: 'Oldest',     value: 'owned_cards.ROWID ASC' }
            ]
        },
        {
            name: 'edition',
            description: 'Filter by edition',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
        {
            name: 'tag',
            description: 'Filter by tag name',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ]
};
