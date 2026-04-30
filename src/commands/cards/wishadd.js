const {
    Client, Interaction, ApplicationCommandOptionType, EmbedBuilder,
    StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType
} = require('discord.js');
const { all, get, run } = require('../../models/query');

const MAX_WISHLIST = 10;

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const name    = interaction.options.getString('name');
        const edition = interaction.options.getString('edition') ? parseInt(interaction.options.getString('edition')) : null;
        const userId  = interaction.user.id;

        try {
            // Check wishlist space upfront
            const countRow = await get('SELECT COUNT(*) AS cnt FROM wishlist WHERE user_id = ?', [userId]);
            if (countRow.cnt >= MAX_WISHLIST) {
                return interaction.editReply({
                    content: `❌ Your wishlist is full (${MAX_WISHLIST}/${MAX_WISHLIST}). Remove a card first with \`/wishremove\`.`
                });
            }

            // Search for matching characters (grouped by name + edition, like /search)
            let query = 'SELECT name, edition, COUNT(*) AS set_count FROM cards WHERE name LIKE ? AND dropping = 1';
            const params = [`%${name}%`];
            if (edition) {
                query += ' AND edition = ?';
                params.push(edition);
            }
            query += ' GROUP BY name, edition ORDER BY name ASC, edition ASC';

            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({ content: `No cards found matching **"${name}"**.` });
            }

            // If exactly one character result, skip straight to set selection
            if (results.length === 1) {
                await showSetSelection(interaction, results[0].name, results[0].edition, userId, countRow.cnt);
                return;
            }

            // Multiple characters — show paginated list with dropdown
            const cardsPerPage = 10;
            const pages = [];
            for (let i = 0; i < results.length; i += cardsPerPage) {
                pages.push(results.slice(i, i + cardsPerPage));
            }

            let currentPage = 0;

            const buildEmbed = (pageIndex) => {
                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Search Results for "${name}"`)
                    .setDescription(`Found ${results.length} character${results.length !== 1 ? 's' : ''}. Select one to wishlist.`)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` });

                pages[pageIndex].forEach((char, idx) => {
                    const globalIndex = pageIndex * cardsPerPage + idx + 1;
                    embed.addFields({
                        name: `${globalIndex}. ${char.name}`,
                        value: `Edition: ${char.edition} • ${char.set_count} set${char.set_count !== 1 ? 's' : ''}`,
                        inline: false
                    });
                });
                return embed;
            };

            const buildDropdown = (pageIndex) => new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`wish_char_${interaction.id}`)
                    .setPlaceholder('Select a character')
                    .addOptions(pages[pageIndex].map((char, idx) => ({
                        label: `${pageIndex * cardsPerPage + idx + 1}. ${char.name}`,
                        description: `Edition ${char.edition} • ${char.set_count} set${char.set_count !== 1 ? 's' : ''}`,
                        value: `${char.name}|${char.edition}`
                    })))
            );

            const buildPageBtns = (pageIndex) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`wpfirst_${interaction.id}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
                new ButtonBuilder().setCustomId(`wpprev_${interaction.id}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
                new ButtonBuilder().setCustomId(`wpcount_${interaction.id}`).setLabel(`${pageIndex + 1}/${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`wpnext_${interaction.id}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === pages.length - 1),
                new ButtonBuilder().setCustomId(`wplast_${interaction.id}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === pages.length - 1)
            );

            const components = pages.length > 1
                ? [buildDropdown(currentPage), buildPageBtns(currentPage)]
                : [buildDropdown(currentPage)];

            const message = await interaction.editReply({ embeds: [buildEmbed(currentPage)], components });

            const collector = message.createMessageComponentCollector({ filter: i => i.user.id === userId, idle: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === `wish_char_${interaction.id}`) {
                    const [charName, charEdition] = i.values[0].split('|');
                    collector.stop();
                    await showSetSelection(i, charName, parseInt(charEdition), userId, countRow.cnt);
                    return;
                }
                await i.deferUpdate();
                if      (i.customId === `wpfirst_${interaction.id}`) currentPage = 0;
                else if (i.customId === `wpprev_${interaction.id}`)  currentPage = Math.max(0, currentPage - 1);
                else if (i.customId === `wpnext_${interaction.id}`)  currentPage = Math.min(pages.length - 1, currentPage + 1);
                else if (i.customId === `wplast_${interaction.id}`)  currentPage = pages.length - 1;

                await message.edit({
                    embeds: [buildEmbed(currentPage)],
                    components: pages.length > 1 ? [buildDropdown(currentPage), buildPageBtns(currentPage)] : [buildDropdown(currentPage)]
                }).catch(console.error);
                collector.resetTimer();
            });

            collector.on('end', async (_, reason) => {
                if (reason !== 'stopped') {
                    await message.edit({ components: [] }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in wishadd:', error);
            return interaction.editReply({ content: 'An error occurred while searching.' });
        }

        // ── Set selection (or "all sets" option) ──────────────────────────────
        async function showSetSelection(interactionOrComponent, charName, charEdition, userId, currentCount) {
            const cards = await all(
                `SELECT cards.*, sets.name AS set_name FROM cards
                 LEFT JOIN sets ON cards.set_id = sets.id
                 WHERE cards.name = ? AND cards.edition = ? AND cards.dropping = 1
                 ORDER BY sets.name ASC`,
                [charName, charEdition]
            );

            if (!cards || cards.length === 0) {
                const update = interactionOrComponent.update?.bind(interactionOrComponent) ?? interactionOrComponent.editReply?.bind(interactionOrComponent);
                return update({ content: 'No sets found for this character.', embeds: [], components: [] });
            }

            const remainingSlots = MAX_WISHLIST - currentCount;

            const embed = new EmbedBuilder()
                .setTitle(`✨ ${charName} — Edition ${charEdition}`)
                .setDescription(
                    `How do you want to wishlist this character?\n\n` +
                    `• **All Sets** — wish for this character from any set\n` +
                    `• **Specific Set** — only wish for this card from one set\n\n` +
                    `You have **${remainingSlots}** wishlist slot${remainingSlots !== 1 ? 's' : ''} remaining.`
                )
                .setColor('#F1C40F');

            // Build dropdown options: "All Sets" first, then each individual set
            const options = [
                {
                    label: `⭐ Any Set (${charName} - Ed. ${charEdition})`,
                    description: 'Ping when this character drops from any set',
                    value: `all|${charName}|${charEdition}`
                },
                ...cards.map(card => ({
                    label: `${card.set_name}`,
                    description: `Card ID ${card.id} • Dropped: ${card.dropped}`,
                    value: `specific|${card.id}|${charName}|${charEdition}|${card.set_name}`
                }))
            ];

            const dropdown = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`wish_set_${interaction.id}`)
                    .setPlaceholder('Choose wishlist type')
                    .addOptions(options)
            );

            const update = interactionOrComponent.update?.bind(interactionOrComponent) ?? interactionOrComponent.editReply?.bind(interactionOrComponent);
            const message = await update({ embeds: [embed], components: [dropdown], files: [] });

            const setCollector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.user.id === userId,
                max: 1,
                time: 60000
            });

            setCollector.on('collect', async (i) => {
                const parts = i.values[0].split('|');
                const type  = parts[0]; // 'all' or 'specific'

                // Re-check count in case another wish was added during this flow
                const freshCount = await get('SELECT COUNT(*) AS cnt FROM wishlist WHERE user_id = ?', [userId]);
                if (freshCount.cnt >= MAX_WISHLIST) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription(`❌ Your wishlist is now full (${MAX_WISHLIST}/${MAX_WISHLIST}).`).setColor('#E74C3C')],
                        components: []
                    });
                }

                if (type === 'all') {
                    // Check for duplicate: already wishlisted this name+edition with no card_id
                    const dup = await get(
                        'SELECT id FROM wishlist WHERE user_id = ? AND card_name = ? AND edition = ? AND card_id IS NULL',
                        [userId, charName, charEdition]
                    );
                    if (dup) {
                        return i.update({
                            embeds: [new EmbedBuilder().setDescription(`⚠️ **${charName}** (Ed. ${charEdition}) is already on your wishlist.`).setColor('#E67E22')],
                            components: []
                        });
                    }

                    await run(
                        'INSERT INTO wishlist (user_id, card_name, edition) VALUES (?, ?, ?)',
                        [userId, charName, charEdition]
                    );

                    return i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⭐ Added to Wishlist')
                                .setDescription(`**${charName}** (Ed. ${charEdition}) — any set\nYou'll be pinged when this card drops.`)
                                .setColor('#2ECC71')
                        ],
                        components: []
                    });
                }

                // Specific set
                const cardId   = parseInt(parts[1]);
                const setName  = parts[4];

                const dup = await get(
                    'SELECT id FROM wishlist WHERE user_id = ? AND card_id = ?',
                    [userId, cardId]
                );
                if (dup) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription(`⚠️ **${charName}** from **${setName}** is already on your wishlist.`).setColor('#E67E22')],
                        components: []
                    });
                }

                await run(
                    'INSERT INTO wishlist (user_id, card_id, card_name, edition) VALUES (?, ?, ?, ?)',
                    [userId, cardId, charName, charEdition]
                );

                return i.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⭐ Added to Wishlist')
                            .setDescription(`**${charName}** (Ed. ${charEdition}) from **${setName}**\nYou'll be pinged when this specific card drops.`)
                            .setColor('#2ECC71')
                    ],
                    components: []
                });
            });

            setCollector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({ components: [] }).catch(console.error);
                }
            });
        }
    },

    name: 'wishadd',
    description: 'Add a card to your wishlist.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Name of the character to search for',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'edition',
            description: 'Filter by edition',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ]
};
