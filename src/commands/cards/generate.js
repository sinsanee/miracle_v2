const { Client, Interaction, ApplicationCommandOptionType, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, ComponentType, TimestampStyles,} = require('discord.js');
const { resolveImageBuffer } = require("../../models/imageResolver");
const { userExists } = require('../../models/users');
const { cardGen, cardGenFromCropped } = require('../../models/cardGen');
const { cropImage } = require("../../models/imageCrop");
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
        const set = interaction.options.get('set')?.value || "Alpha"
        const img = interaction.options.getAttachment('image')
        const url = interaction.options.getString('url')
        const edition = interaction.options.get('edition')?.value || 1
        const author = interaction.user.id

        console.log(interaction.options.get("image"));

        if (!(await userExists(interaction.user.id))) {
            return interaction.editReply({
                content: 'You are already registered.',
                ephemeral: true
            });
        }

        const activeCards = new Map();

        const imageOption = img ?? url;

        if (!imageOption) {
            return interaction.reply({
                content: "Please provide an image or image URL.",
                ephemeral: true
            });
        }
        
        await interaction.deferReply();
        const buffer = await resolveImageBuffer(imageOption);

        const output = await cardGen(buffer, {
            name,
            subtitle: "MR25NX",
            footer: "51277"
        });

        const cropSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("crop_select")
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

        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("confirm_card")
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("cancel_card")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger)
        );

        const cropMode = "centre";

        const image = await cardGen(buffer, {
            name,
            subtitle: "",
            footer: ""
        }, cropMode);

        const attachment = new AttachmentBuilder(image, {
            name: "card.png"
        });

        const message = await interaction.editReply({
            content: "🖼️ Card preview",
            files: [attachment],
            components: [cropSelect, actionButtons]
        });

        await interaction.editReply({
            files: [{ attachment: output, name: "card.png" }]
        });

        activeCards.set(message.id, {
            buffer,
            data: { name, subtitle: "", footer: "" },
            cropMode: "centre",
            author: interaction.user.id
        });

        client.on("interactionCreate", async interaction => {
            if (!interaction.isStringSelectMenu()) return;
            if (interaction.customId !== "crop_select") return;

            const state = activeCards.get(interaction.message.id);
            if (!state) return;

            if (interaction.user.id !== state.author) {
                return interaction.reply({
                content: "❌ This is not your card.",
                ephemeral: true
                });
            }

            const cropMode = interaction.values[0];
            state.cropMode = cropMode;

            const newImage = await cardGen(
                state.buffer,
                state.data,
                cropMode
            );

            const attachment = new AttachmentBuilder(newImage, {
                name: "card.png"
            });

            await interaction.update({
                content: "🖼️ Card preview",
                files: [attachment],
                components: interaction.message.components
            });
        });

        client.on("interactionCreate", async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId !== "confirm_card") return;

            const state = activeCards.get(interaction.message.id);
            if (!state) return;

            if (interaction.user.id !== state.author) {
                return interaction.reply({
                content: "❌ This is not your card.",
                ephemeral: true
                });
            }

            const { buffer, data, cropMode } = state;

            // 🔹 1. Generate cropped image (NO border)
            const croppedImage = await cropImage(buffer, cropMode);

            // 🔹 2. Generate full card (WITH border)
            const finalCard = await cardGenFromCropped(croppedImage, data);

            // 🔹 3. Save both
            const basePath = path.join(__dirname, "../../img/cards");
            const cardId = Date.now(); // or DB id

            fs.writeFileSync(
                path.join(basePath, `card_${cardId}.png`),
                finalCard
            );

            fs.writeFileSync(
                path.join(basePath, `card_${cardId}_image.png`),
                croppedImage
            );

            // 🔹 4. Cleanup state
            activeCards.delete(interaction.message.id);

            await interaction.update({
                content: "✅ Card confirmed and saved!",
                components: [],
                files: interaction.message.attachments.map(a => a)
            });
        });

        client.on("interactionCreate", async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId !== "cancel_card") return;

            const state = activeCards.get(interaction.message.id);
            if (!state) return;

            if (interaction.user.id !== state.author) {
                return interaction.reply({
                content: "❌ This is not your card.",
                ephemeral: true
                });
            }

            // 🧹 Cleanup state
            activeCards.delete(interaction.message.id);

            await interaction.update({
                content: "❌ Card generation canceled.",
                components: [],
                files: interaction.message.attachments.map(a => a)
            });
        });
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
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Alpha',
                    value: 'a'
                }
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