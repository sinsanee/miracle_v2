const {
    Client,
    Interaction,
    ApplicationCommandOptionType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} = require('discord.js');
const { all } = require('../../models/query');

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();

        const name = interaction.options.get('name')?.value;
        const sort = interaction.options.get('sort')?.value || 'items.name ASC';

        try {
            let query = `SELECT id, name, description, shopprice FROM items WHERE shopprice IS NOT NULL AND shopprice > 0`;
            const params = [];

            if (name) {
                query += ' AND name LIKE ?';
                params.push(`%${name}%`);
            }

            query += ` ORDER BY ${sort}`;

            const results = await all(query, params);

            if (!results || results.length === 0) {
                return interaction.editReply({
                    content: name
                        ? `No items found in the shop matching **"${name}"**.`
                        : 'The shop is currently empty.',
                    ephemeral: true
                });
            }

            // Pagination setup
            const itemsPerPage = 8;
            const pages = [];
            for (let i = 0; i < results.length; i += itemsPerPage) {
                pages.push(results.slice(i, i + itemsPerPage));
            }

            const buildEmbed = (pageIndex) => {
                const pageItems = pages[pageIndex];
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop')
                    .setColor('#F1C40F')
                    .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} • ${results.length} item${results.length !== 1 ? 's' : ''} available` });

                if (name) {
                    embed.setDescription(`Showing results for **"${name}"**`);
                } else {
                    embed.setDescription('Browse available items below. Use `/buy <item id>` to purchase!');
                }

                for (const item of pageItems) {
                    embed.addFields({
                        name: `${item.name}  •  🪙 ${item.shopprice} gold`,
                        value: `${item.description || '*No description.*'}\n\`ID: ${item.id}\``,
                        inline: false
                    });
                }

                return embed;
            };

            let currentPage = 0;

            const createButtons = (index) => {
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
                    .setLabel(`${index + 1}/${pages.length}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const next = new ButtonBuilder()
                    .setCustomId(`pagenext_${interaction.id}`)
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === pages.length - 1);

                const last = new ButtonBuilder()
                    .setCustomId(`pagelast_${interaction.id}`)
                    .setEmoji('⏩')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(index === pages.length - 1);

                return new ActionRowBuilder().addComponents([first, prev, pageCount, next, last]);
            };

            // Single page — no pagination buttons needed
            if (pages.length === 1) {
                return interaction.editReply({ embeds: [buildEmbed(0)] });
            }

            const message = await interaction.editReply({
                embeds: [buildEmbed(currentPage)],
                components: [createButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({ idle: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: `Only **${interaction.user.username}** can use these buttons.`,
                        ephemeral: true
                    }).catch(console.error);
                }

                await i.deferUpdate();

                if (i.customId === `pagefirst_${interaction.id}`) {
                    currentPage = 0;
                } else if (i.customId === `pageprev_${interaction.id}`) {
                    if (currentPage > 0) currentPage--;
                } else if (i.customId === `pagenext_${interaction.id}`) {
                    if (currentPage < pages.length - 1) currentPage++;
                } else if (i.customId === `pagelast_${interaction.id}`) {
                    currentPage = pages.length - 1;
                }

                await message.edit({
                    embeds: [buildEmbed(currentPage)],
                    components: [createButtons(currentPage)]
                }).catch(console.error);

                collector.resetTimer();
            });

            collector.on('end', async () => {
                await message.edit({
                    embeds: [buildEmbed(currentPage)],
                    components: []
                }).catch(console.error);
            });

        } catch (error) {
            console.error('Error in shop command:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the shop.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    name: 'shop',
    description: 'Browse items available for purchase in the shop.',
    devOnly: false,
    options: [
        {
            name: 'name',
            description: 'Search for a specific item by name',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'sort',
            description: 'Sort the shop items',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                { name: 'Name A-Z', value: 'items.name ASC' },
                { name: 'Name Z-A', value: 'items.name DESC' },
                { name: 'Price: Low to High', value: 'items.shopprice ASC' },
                { name: 'Price: High to Low', value: 'items.shopprice DESC' }
            ]
        }
    ]
};
