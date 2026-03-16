const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder , ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { all, get, run } = require('../../models/query');
const { cardGenFromCropped } = require('../../models/cardGen');
const { resolveImageBuffer } = require('../../models/imageResolver'); // Import the image resolver

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply();
        
        // Variables
        const id = interaction.options.getString('id');
        const userId = interaction.user.id;

        try {
            let ownedCard;

            // If no ID provided, get most recent card for this user
            if (!id) {
                ownedCard = await get(
                    'SELECT * FROM owned_cards WHERE owner = ? ORDER BY ROWID DESC LIMIT 1',
                    [userId]
                );

                if (!ownedCard) {
                    return interaction.editReply({
                        content: "You don't own any cards yet!",
                        ephemeral: true
                    });
                }
            } else {
                // Get specific card by ID (anyone can view it)
                ownedCard = await get(
                    'SELECT * FROM owned_cards WHERE id = ?',
                    [id.toUpperCase()]
                );

                if (!ownedCard) {
                    return interaction.editReply({
                        content: `Card with ID "${id}" not found.`,
                        ephemeral: true
                    });
                }
            }

            // Get the card details from cards table
            const card = await get(
                'SELECT * FROM cards WHERE id = ?',
                [ownedCard.card]
            );

            if (!card) {
                return interaction.editReply({
                    content: 'Card data not found in database.',
                    ephemeral: true
                });
            }

            // Get set name
            const setData = await get('SELECT name, border FROM sets WHERE id = ?', [card.set_id]);
            const setName = setData ? setData.name : 'Unknown';

            // Get owner username
            const owner = await client.users.fetch(ownedCard.owner);

            // FIXED: Download card image from web server instead of reading from disk
            const imageUrl = `${process.env.IMAGE_BASE_URL}/${card.image}`;
            const croppedImageBuffer = await resolveImageBuffer(imageUrl);

            // FIXED: Download border from web server
            const borderUrl = `${process.env.BORDER_BASE_URL}/${setData.border}`;
            const borderBuffer = await resolveImageBuffer(borderUrl);

            // Generate the card with ID as subtitle and print as footer
            const generatedCard = await cardGenFromCropped(
                croppedImageBuffer,
                {
                    name: card.name,
                    subtitle: ownedCard.id,
                    footer: `${ownedCard.print}`
                },
                borderBuffer,
                ownedCard.condition ?? 5
            );

            // Create attachment
            const attachment = new AttachmentBuilder(generatedCard, {
                name: 'card.png'
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(card.name)
                .setDescription(`**Set:** ${setName}\n**Owner:** ${owner.username}`)
                .setImage('attachment://card.png')
                .setColor('#5865F2');

            await interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('Error in view command:', error);
            await interaction.editReply({
                content: 'An error occurred while viewing the card.',
                ephemeral: true
            }).catch(console.error);
        }
    },
    name: 'view',
    description: 'View an existing card',
    devOnly: false,
    options: [
        {
            name: 'id',
            description: 'The id of the card (leave empty to view your most recent card)',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ]
}
