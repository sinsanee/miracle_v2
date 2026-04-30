const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { get } = require('../../models/query');
const { cardGenFromCropped } = require('../../models/cardGen');
const { resolveImageBuffer } = require('../../models/imageResolver');
const { getCardBorder } = require('../../models/cardBorder');

module.exports = {
    callback: async (client, interaction) => {
        await interaction.deferReply();
        
        const id     = interaction.options.getString('id');
        const userId = interaction.user.id;

        try {
            let ownedCard;

            if (!id) {
                ownedCard = await get('SELECT * FROM owned_cards WHERE owner = ? ORDER BY ROWID DESC LIMIT 1', [userId]);
                if (!ownedCard) return interaction.editReply({ content: "You don't own any cards yet!", ephemeral: true });
            } else {
                ownedCard = await get('SELECT * FROM owned_cards WHERE id = ?', [id.toUpperCase()]);
                if (!ownedCard) return interaction.editReply({ content: `Card with ID "${id}" not found.`, ephemeral: true });
            }

            const card    = await get('SELECT * FROM cards WHERE id = ?', [ownedCard.card]);
            if (!card) return interaction.editReply({ content: 'Card data not found in database.', ephemeral: true });

            const setData = await get('SELECT name, border FROM sets WHERE id = ?', [card.set_id]);
            const owner   = await client.users.fetch(ownedCard.owner);

            const croppedImageBuffer = await resolveImageBuffer(`${process.env.IMAGE_BASE_URL}/${card.image}`);
            const borderBuffer       = await getCardBorder(ownedCard, setData);

            const generatedCard = await cardGenFromCropped(
                croppedImageBuffer,
                { name: card.name, subtitle: ownedCard.id, footer: `${ownedCard.print}` },
                borderBuffer,
                ownedCard.condition ?? 5,
                ownedCard.effect ?? null
            );

            const embed = new EmbedBuilder()
                .setTitle(card.name)
                .setDescription(`**Set:** ${setData?.name ?? 'Unknown'}\n**Owner:** ${owner.username}`)
                .setImage('attachment://card.png')
                .setColor('#5865F2');

            await interaction.editReply({
                embeds: [embed],
                files: [new AttachmentBuilder(generatedCard, { name: 'card.png' })]
            });

        } catch (error) {
            console.error('Error in view command:', error);
            await interaction.editReply({ content: 'An error occurred while viewing the card.', ephemeral: true }).catch(console.error);
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
